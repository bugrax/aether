// Token Bridge - runs only on Aether webapp pages
// Reads Firebase auth token from IndexedDB and forwards to the extension service worker
// Content scripts share the same origin storage (IndexedDB, localStorage) as the page

(function () {
  function extractAndSendToken() {
    const request = indexedDB.open('firebaseLocalStorageDb');

    request.onsuccess = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('firebaseLocalStorage')) {
        db.close();
        return;
      }

      const tx = db.transaction('firebaseLocalStorage', 'readonly');
      const store = tx.objectStore('firebaseLocalStorage');
      const getAll = store.getAll();

      getAll.onsuccess = () => {
        const results = getAll.result;
        for (const item of results) {
          if (item?.value?.stsTokenManager?.accessToken) {
            const token = item.value.stsTokenManager.accessToken;
            const expiresAt = item.value.stsTokenManager.expirationTime || (Date.now() + 3600000);

            chrome.runtime.sendMessage({
              type: 'AUTH_TOKEN',
              token: token,
              expiresAt: expiresAt,
            });
            break;
          }
        }
      };

      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    };

    request.onerror = () => {
      // IndexedDB not available - fall back to listening for postMessage
    };
  }

  // Also listen for postMessage from the webapp (if AuthContext changes are deployed)
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type === 'AETHER_AUTH_TOKEN' && event.data?.token) {
      chrome.runtime.sendMessage({
        type: 'AUTH_TOKEN',
        token: event.data.token,
        expiresAt: event.data.expiresAt,
      });
    }
  });

  // Extract token on load and periodically (handles login after page load)
  extractAndSendToken();
  setTimeout(extractAndSendToken, 2000);
  setTimeout(extractAndSendToken, 5000);

  // Re-extract every 45 minutes to refresh before expiry
  setInterval(extractAndSendToken, 45 * 60 * 1000);
})();
