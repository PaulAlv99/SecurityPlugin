let untrustedTlds = {};

(async function loadTldRiskData() {
  try {
    const response = await fetch(browser.runtime.getURL("untrusted_tlds.json"));
    untrustedTlds = await response.json();
    console.log("[TLD Risk] Loaded", Object.keys(untrustedTlds).length, "entries");
  } catch (err) {
    console.warn("Failed to load untrusted_tlds.json:", err);
  }
})();

const capture = {
  queue: [],
  processingQueue: false,
  
  init() {
    this.addListeners();

    // Also listen for tab updates to record first-party page loads:
    browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      this.sendFirstParty(tabId, changeInfo, tab);
    });
  },

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

  async processNextEvent() {
    if (this.processingQueue || this.queue.length === 0) return;
    this.processingQueue = true;
    const event = this.queue.shift();
    await this[event.type](event.data);
    this.processingQueue = false;
    this.processNextEvent();
  },

  async sendThirdParty(response) {
  try {
    const originUrl = response.originUrl || response.documentUrl || '';
    const origin = new URL(originUrl).hostname;
    const target = new URL(response.url).hostname;

    const tabId = response.tabId;
    const tab = tabId >= 0 ? await this.getTab(tabId) : null;
    const firstParty = tab ? new URL(tab.url).hostname : origin;

    if (
      firstParty &&
      target &&
      target !== firstParty &&
      await this.shouldStore(response)
    ) {
      // 🔍 Check if it's likely an ad/tracker
      const adKeywords = ["ads", "adservice", "track", "tracking", "pixel", "beacon", "tag", "quant", "scorecard", "analytics", "ml314", "s-onetag"];
      const isAdDomain = adKeywords.some(keyword => target.toLowerCase().includes(keyword));

      if (isAdDomain) {
        this.notifyAdTracking(target);
        return; // Skip storing in DB if you don't want to track ad domains
      }

      // ✅ Store non-ad trackers
      await store.setThirdParty(firstParty, target, {
        origin,
        target,
        requestTime: response.timeStamp,
        firstParty: false
      });
    }
  } catch {
    // any parsing errors or no tab → ignore
  }
},

  async sendFirstParty(tabId, changeInfo, tab) {
    // Only when the tab is “complete” do we write a first-party record
    if (changeInfo.status !== 'complete') return;
    try {
      const url = tab.url;
      if (url.startsWith("moz-extension://")) {
        return; // Skip internal extension resources
      }
      const hostname = new URL(url).hostname;
      const faviconUrl = tab.favIconUrl || '';
      await store.setFirstParty(hostname, {
        requestTime: Date.now(),
        faviconUrl
      });
    } catch {
      // ignore
    }
  },

  async shouldStore(info) {
    // Don’t store incognito or about: pages or internal pages
    const tabId = info.tabId;
    const tab = await this.getTab(tabId);
    if (!tab || tab.incognito) return false;
    const url = tab.url || info.originUrl || '';
    return url && !url.startsWith('about:') && !url.startsWith('moz-extension:');
  },

  async getTab(tabId) {
    try {
      return await browser.tabs.get(tabId);
    } catch {
      return null;
    }
  },
  notifyAdTracking(domain) {
  browser.notifications.create({
    type: "basic",
    iconUrl: browser.runtime.getURL("icons/icon-48.png"),
    title: "Potential Ad Tracker Detected",
    message: `This website is likely tracking you via ${domain}.`
  });
  }

};

capture.init();
