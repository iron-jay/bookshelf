// Opens tabs for the content script, which cannot on every Firefox for
// Android, and answers the toolbar button (on a phone, "Add to bookshelf"
// under Extensions in the menu).

browser.runtime.onMessage.addListener((message) => {
  if (message && message.type === "open" && typeof message.url === "string" && /^https?:\/\//.test(message.url)) {
    return browser.tabs.create({ url: message.url, active: true }).then(() => true);
  }
  if (message && message.type === "options") {
    return browser.runtime.openOptionsPage().then(() => true);
  }
  return undefined;
});

browser.browserAction.onClicked.addListener((tab) => {
  browser.tabs.sendMessage(tab.id, { type: "add" }).catch(() => {
    // No content script answers off Goodreads: say where it works.
    browser.tabs.create({ url: browser.runtime.getURL("options.html#elsewhere"), active: true });
  });
});
