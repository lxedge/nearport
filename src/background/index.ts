// MV3 background service worker. Event-driven, no persistent page:
// Chrome terminates it when idle and restarts it on the next event.

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[NearPort] installed', details.reason)
})
