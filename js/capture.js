/* global store, browser */
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
      // Determine the “origin” of the request:
      const originUrl = response.originUrl || response.documentUrl || '';
      const origin = new URL(originUrl).hostname;
      // Determine the “target” (the URL being fetched)
      const target = new URL(response.url).hostname;

      // Figure out what the first-party hostname is (if this is in a tab)
      const tabId = response.tabId;
      const tab = tabId >= 0 ? await this.getTab(tabId) : null;
      const firstParty = tab ? new URL(tab.url).hostname : origin;

      // If it’s truly a third-party (different hostname) & meets our criteria
      if (
        firstParty &&
        target &&
        target !== firstParty &&
        await this.shouldStore(response)
      ) {
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
  }
};

capture.init();
