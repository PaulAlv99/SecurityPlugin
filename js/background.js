'use strict';

// Handle first run or other background tasks if needed
async function checkFirstRun() {
  // Future logic (optional)
}
checkFirstRun();

// This opens the UI tab when the toolbar icon is clicked
async function runTrackerUI() {
  const tabs = await browser.tabs.query({});
  const uiUrl = browser.runtime.getURL('ui.html');
  const existing = tabs.find(tab => tab.url === uiUrl);

  if (existing) {
    browser.tabs.update(existing.id, { active: true });
  } else {
    browser.tabs.create({ url: uiUrl });
  }
}

// In Manifest V2, use browser.browserAction (not browser.action)
browser.browserAction.onClicked.addListener(runTrackerUI); // ← changed from browser.action
