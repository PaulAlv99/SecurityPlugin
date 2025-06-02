/* global browser */
const storeChild = {
  callbacks: new Set(),

  init() {
    // Listen for “storeChildCall” messages from the background
    browser.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'storeChildCall') {
        // Whenever the background broadcasts “storeChildCall”, invoke all registered callbacks
        this.callbacks.forEach(cb => cb(...(msg.args || [])));
      }
    });
  },

  onUpdate(cb) {
    // The UI will call this to register a “re‐render” callback
    this.callbacks.add(cb);
  },

  async parentMessage(method, ...args) {
    // Forward a message to the background like { type: 'storeCall', method, args }
    return browser.runtime.sendMessage({ type: 'storeCall', method, args });
  },

  // ←–––––––– Explicitly define the two methods the UI wants ––––––––→

  getAllVisible() {
    // This returns a Promise that resolves to the “visible sites” object
    return this.parentMessage('getAllVisible');
  },

  reset() {
    // This clears the entire DB in the background, then the background will broadcast a storeChildCall
    return this.parentMessage('reset');
  }
};

storeChild.init();

// Make it available to ui.js
window.storeChild = storeChild;
