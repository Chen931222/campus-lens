// Campus Lens: inject the lens into the current tab only when the student clicks the icon.
// Uses activeTab, so the extension cannot read any page the student has not asked it to.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["content.css"] });
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
});
