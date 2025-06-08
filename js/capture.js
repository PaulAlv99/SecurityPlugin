let blocklistDescriptions = {};
const notifiedTrackers = new Set();

// Load blocklist descriptions from JSON file
(async function loadBlocklistDescriptions() {
  try {
    const response = await fetch(browser.runtime.getURL("notrack_blocklist.json"));
    const blocklist = await response.json();
    blocklist.forEach(entry => {
      if (entry.domain) {
        blocklistDescriptions[entry.domain.toLowerCase()] = entry.description;
      }
    });
    console.log("[Blocklist] Loaded", Object.keys(blocklistDescriptions).length, "entries");
  } catch (err) {
    console.warn("Failed to load notrack_blocklist.json:", err);
  }
})();

// Get root domain (e.g. example.com)
function toRootDomain(hostname) {
  const parts = hostname.split('.');
  if (parts.length <= 2) return hostname;
  const tld = parts[parts.length - 1].toLowerCase();
  if (['com', 'net', 'org'].includes(tld)) {
    return parts.slice(-2).join('.');
  }
  return hostname;
}

const capture = {
  queue: [],
  processingQueue: false,

  // Start listeners
  init() {
    this.addListeners();

    // Listen for tab updates (like reloads)
    browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      // Remove old notifications for this tab when reloading
      if (changeInfo.status === 'loading') {
        [...notifiedTrackers].forEach(key => {
          if (key.startsWith(`${tabId}:`)) {
            notifiedTrackers.delete(key);
          }
        });
      }

      this.sendFirstParty(tabId, changeInfo, tab);
    });
  },

  // Listen for web requests
  addListeners() {
    browser.webRequest.onResponseStarted.addListener(
      (response) => {
        const eventDetails = { type: 'sendThirdParty', data: response };
        this.queue.push(eventDetails);
        this.processNextEvent();
      },
      { urls: ['<all_urls>'] },
      ['responseHeaders']
    );
  },

  // Process next event in the queue
  async processNextEvent() {
    if (this.processingQueue || this.queue.length === 0) return;
    this.processingQueue = true;
    const event = this.queue.shift();
    await this[event.type](event.data);
    this.processingQueue = false;
    this.processNextEvent();
  },

  // Handle third-party requests
  async sendThirdParty(response) {
    try {
      const originUrl = response.originUrl || response.documentUrl || '';
      const origin = new URL(originUrl).hostname;
      const target = new URL(response.url).hostname;

      const tabId = response.tabId;
      const tab = tabId >= 0 ? await this.getTab(tabId) : null;
      const firstParty = tab ? new URL(tab.url).hostname : origin;

      // Only store if it's a third-party request
      if (
        firstParty &&
        target &&
        target !== firstParty &&
        await this.shouldStore(response)
      ) {
        const rootTarget = toRootDomain(target).toLowerCase();
        const blockDescription = blocklistDescriptions[rootTarget];

        // Notify user if tracker is in blocklist and not already notified
        const notifyKey = `${tabId}:${rootTarget}`;
        if (blockDescription && !notifiedTrackers.has(notifyKey)) {
          this.notifyBlocklistTracking(rootTarget, blockDescription);
          notifiedTrackers.add(notifyKey);
          return;
        }

        // Store third-party request
        await store.setThirdParty(firstParty, target, {
          origin,
          target,
          requestTime: response.timeStamp,
          firstParty: false
        });
      }
    } catch {
      // Ignore errors
    }
  },

  // Handle first-party page loads
  async sendFirstParty(tabId, changeInfo, tab) {
    if (changeInfo.status !== 'complete') return;
    try {
      const url = tab.url;
      if (url.startsWith("moz-extension://")) return;
      const hostname = new URL(url).hostname;
      const faviconUrl = tab.favIconUrl || '';
      await store.setFirstParty(hostname, {
        requestTime: Date.now(),
        faviconUrl
      });
    } catch {
      // Ignore errors
    }
  },

  // Check if we should store this request
  async shouldStore(info) {
    const tabId = info.tabId;
    const tab = await this.getTab(tabId);
    if (!tab || tab.incognito) return false;
    const url = tab.url || info.originUrl || '';
    return url && !url.startsWith('about:') && !url.startsWith('moz-extension:');
  },

  // Get tab info by tabId
  async getTab(tabId) {
    try {
      return await browser.tabs.get(tabId);
    } catch {
      return null;
    }
  },

  // Show notification for blocklist tracker
  notifyBlocklistTracking(domain, description) {
    browser.notifications.create({
      type: "basic",
      iconUrl: browser.runtime.getURL("icons/icon-48.png"),
      title: "Tracker Alert",
      message: `${domain} – ${description}`
    });
  }
};

capture.init();
