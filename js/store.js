/* global Dexie, browser */
const store = {
  db: null,

  // These are the IndexedDB fields/indexes we want to use:
  indexes: [
    'hostname',
    'firstRequestTime',
    'lastRequestTime',
    'isVisible',
    'firstParty'
  ],

  async init() {
    this.makeNewDatabase();
    await this.isFirstRun();
    browser.runtime.onMessage.addListener((m) => this.messageHandler(m));
  },

  makeNewDatabase() {
    // Create (or open) a Dexie DB called “websites_database”
    this.db = new Dexie('websites_database');
    this.db.version(1).stores({
      // “websites” table, indexed by the fields in this.indexes
      websites: this.indexes.join(', ')
    });
    this.db.open();
  },

  async isFirstRun() {
    // If there is no key “isFirstRun” in local storage, this is first run
    const result = await browser.storage.local.get('isFirstRun');
    const value = !('isFirstRun' in result);
    await browser.storage.local.set({ isFirstRun: false });
    return value;
  },

  async setFirstParty(hostname, data) {
    if (!hostname) return;

    // Try to pull an existing record from the DB; if none exists, start with {}
    const website = (await this.getWebsite(hostname)) || {};
    website.hostname = hostname;
    website.firstParty = true;
    website.isVisible = true;
    website.firstRequestTime ??= data.requestTime;
    website.lastRequestTime = data.requestTime;
    website.faviconUrl = data.faviconUrl || website.faviconUrl;

    await this._write(website);
  },

  async setThirdParty(origin, target, data) {
    if (!origin || !target) return;

    // Get or create the “first‐party” record
    const firstParty = (await this.getWebsite(origin)) || { hostname: origin };
    // Get or create the “third‐party” record
    const thirdParty = (await this.getWebsite(target)) || { hostname: target };

    // For the third‐party, keep a list of all first‐party hostnames that have loaded it
    thirdParty.firstPartyHostnames ??= [];
    if (!thirdParty.firstPartyHostnames.includes(origin)) {
      thirdParty.firstPartyHostnames.push(origin);
    }

    thirdParty.isVisible = true;
    thirdParty.lastRequestTime = data.requestTime;
    thirdParty.firstRequestTime ??= data.requestTime;

    // Ensure the first‐party record also has isVisible = true
    firstParty.isVisible = true;
    firstParty.lastRequestTime = data.requestTime;
    firstParty.firstRequestTime ??= data.requestTime;

    // Write both sides
    await this._write(firstParty);
    await this._write(thirdParty);
  },

  async getWebsite(hostname) {
    return await this.db.websites.get(hostname);
  },

  async _write(website) {
    // Convert booleans to numeric flags where appropriate
    for (const key in website) {
      website[key] = this.mungeDataInbound(key, website[key]);
    }
    await this.db.websites.put(website);

    // Notify any listening UI that something changed
    browser.runtime.sendMessage({ type: 'storeChildCall', args: [] }); // ← added
  },

  mungeDataInbound(key, value) {
    if (this.indexes.includes(key)) {
      if (value === true) return 1;
      if (value === false) return 0;
    }
    return value;
  },

  async getAllVisible() {
    // Return an object mapping hostname → { favicon, thirdParties, firstParty }
    const websites = await this.db.websites
      .filter(w => w.isVisible || w.firstParty)
      .toArray();

    const out = {};
    for (const w of websites) {
      out[w.hostname] = {
        favicon: w.faviconUrl || '',
        thirdParties: w.firstPartyHostnames || [],
        firstParty: !!w.firstParty
      };
    }
    return out;
  },

  messageHandler(msg) {
    if (msg.type !== 'storeCall') return;
    const exposed = {
      getAllVisible: () => this.getAllVisible(),           // ← changed: invoke getAllVisible()
      reset: async () => {
        await this.db.websites.clear();
        // Tell UI that the DB has been cleared
        browser.runtime.sendMessage({ type: 'storeChildCall', args: [] }); // ← added
      }
    };
    const fn = exposed[msg.method];
    if (fn) {
      return fn(...(msg.args || []));
    }
  }
};

// Immediately initialize the store
store.init(); // ← added
window.store = store;
