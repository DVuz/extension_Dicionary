/**
 * vocab-bridge.js
 * Runs ONLY on https://vocab.vtd26.io.vn/*
 * Reads access_token from localStorage → syncs to chrome.storage.local
 * so the extension can authenticate on any other page.
 */

function isContextValid() {
  try {
    // Accessing chrome.runtime.id throws if context is invalidated
    return !!chrome?.runtime?.id;
  } catch (_) {
    return false;
  }
}

function syncToken() {
  if (!isContextValid()) {
    clearInterval(syncInterval);
    window.removeEventListener('storage', syncToken);
    return;
  }
  const token = localStorage.getItem('access_token');
  try {
    if (token) {
      chrome.storage.local.set({ vocab_token: token, vocab_token_time: Date.now() });
    } else {
      chrome.storage.local.remove(['vocab_token', 'vocab_token_time']);
    }
  } catch (_) { /* context invalidated mid-call */ }
}

syncToken();
window.addEventListener('storage', syncToken);
const syncInterval = setInterval(syncToken, 5000);

try {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'GET_TOKEN') {
      sendResponse({ token: localStorage.getItem('access_token') });
    }
  });
} catch (_) { /* context invalidated */ }
