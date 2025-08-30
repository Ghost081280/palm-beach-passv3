// Palm Beach Pass Service Worker
// Version 1.0.0

const CACHE_NAME = 'palm-beach-pass-v1.0.0';
const CACHE_VERSION = '1.0.0';

// Assets to cache for offline functionality
const urlsToCache = [
  '/',
  '/index.html',
  '/my-passes.html',
  '/attractions.html',
  '/checkout.html',
  '/account.html',
  '/manifest.json',
  // Add any CSS/JS files if external
];

// Assets to cache dynamically (user data, API responses)
const dynamicCache = 'palm-beach-pass-dynamic-v1.0.0';

// Install event - cache essential assets
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        // Skip waiting to activate immediately
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Cache installation failed:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Delete old caches
          if (cacheName !== CACHE_NAME && cacheName !== dynamicCache) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Take control of all pages immediately
      return self.clients.claim();
    })
  );
});

// Fetch event - implement caching strategy
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Skip chrome-extension and other non-http(s) requests
  if (!requestUrl.protocol.startsWith('http')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version if available
        if (response) {
          console.log('Serving from cache:', event.request.url);
          return response;
        }

        // Clone the request because it can only be consumed once
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest)
          .then((response) => {
            // Check if response is valid
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone the response because it can only be consumed once
            const responseToCache = response.clone();

            // Cache dynamic content (API responses, images, etc.)
            if (shouldCacheDynamically(event.request)) {
              caches.open(dynamicCache)
                .then((cache) => {
                  cache.put(event.request, responseToCache);
                });
            }

            return response;
          })
          .catch(() => {
            // Return offline fallback for HTML pages
            if (event.request.headers.get('accept').includes('text/html')) {
              return caches.match('/offline.html').then((offlineResponse) => {
                return offlineResponse || new Response(
                  createOfflinePage(),
                  {
                    headers: { 'Content-Type': 'text/html' }
                  }
                );
              });
            }
            
            // Return offline fallback for images
            if (event.request.headers.get('accept').includes('image')) {
              return new Response(
                createOfflineImage(),
                {
                  headers: { 'Content-Type': 'image/svg+xml' }
                }
              );
            }
          });
      })
  );
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('Background sync:', event.tag);
  
  if (event.tag === 'background-sync-passes') {
    event.waitUntil(syncPasses());
  } else if (event.tag === 'background-sync-purchases') {
    event.waitUntil(syncPurchases());
  }
});

// Push notifications
self.addEventListener('push', (event) => {
  console.log('Push notification received');
  
  const options = {
    body: event.data ? event.data.text() : 'New update available!',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'View Details',
        icon: '/icons/action-explore.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/icons/action-close.png'
      }
    ],
    tag: 'palm-beach-pass-notification'
  };

  event.waitUntil(
    self.registration.showNotification('Palm Beach Pass', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('Notification click received.');

  event.notification.close();

  if (event.action === 'explore') {
    // Open the app to a specific page
    event.waitUntil(
      clients.openWindow('/attractions.html')
    );
  } else if (event.action === 'close') {
    // Just close the notification
    return;
  } else {
    // Open the main app
    event.waitUntil(
      clients.matchAll().then((clientList) => {
        for (let client of clientList) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
    );
  }
});

// Handle message from main app
self.addEventListener('message', (event) => {
  console.log('SW received message:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_VERSION });
  } else if (event.data && event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(dynamicCache).then((cache) => {
        return cache.addAll(event.data.urls);
      })
    );
  }
});

// Utility functions
function shouldCacheDynamically(request) {
  const url = new URL(request.url);
  
  // Cache API responses
  if (url.pathname.startsWith('/api/')) {
    return true;
  }
  
  // Cache images
  if (request.headers.get('accept').includes('image')) {
    return true;
  }
  
  // Cache fonts
  if (url.pathname.includes('fonts/')) {
    return true;
  }
  
  return false;
}

function createOfflinePage() {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Offline - Palm Beach Pass</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                margin: 0;
                padding: 2rem;
                background: linear-gradient(135deg, #FAF3E3 0%, #FFFFFF 100%);
                min-height: 100vh;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                text-align: center;
                color: #1A1A1A;
            }
            .offline-icon {
                font-size: 4rem;
                margin-bottom: 1rem;
            }
            h1 {
                color: #2D5016;
                margin-bottom: 1rem;
                font-size: 2rem;
                font-weight: 700;
            }
            p {
                color: #666;
                margin-bottom: 2rem;
                font-size: 1.1rem;
                line-height: 1.6;
                max-width: 400px;
            }
            .btn-retry {
                background: #2D5016;
                color: white;
                border: none;
                padding: 1rem 2rem;
                border-radius: 50px;
                font-size: 1rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s;
            }
            .btn-retry:hover {
                background: #006B7D;
                transform: translateY(-2px);
            }
            .cached-content {
                margin-top: 2rem;
                padding: 1rem;
                background: rgba(45,80,22,0.1);
                border-radius: 15px;
                max-width: 500px;
            }
            .cached-link {
                display: block;
                padding: 0.5rem 1rem;
                margin: 0.5rem 0;
                background: white;
                border-radius: 10px;
                text-decoration: none;
                color: #2D5016;
                transition: all 0.3s;
            }
            .cached-link:hover {
                background: #FAF3E3;
                transform: translateX(5px);
            }
        </style>
    </head>
    <body>
        <div class="offline-icon">📱</div>
        <h1>You're Offline</h1>
        <p>Don't worry! Your passes are still accessible and some content is available offline.</p>
        
        <button class="btn-retry" onclick="window.location.reload()">
            Try Again
        </button>
        
        <div class="cached-content">
            <h3 style="color: #2D5016; margin-bottom: 1rem;">Available Offline:</h3>
            <a href="/my-passes.html" class="cached-link">🎫 My Passes</a>
            <a href="/account.html" class="cached-link">👤 Account</a>
            <a href="/index.html" class="cached-link">🏠 Home</a>
        </div>
        
        <script>
            // Auto-retry when back online
            window.addEventListener('online', () => {
                window.location.reload();
            });
            
            // Show online status
            window.addEventListener('load', () => {
                if (navigator.onLine) {
                    document.querySelector('.btn-retry').textContent = 'Refresh Page';
                }
            });
        </script>
    </body>
    </html>
  `;
}

function createOfflineImage() {
  return `
    <svg width="200" height="200" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="200" height="200" fill="#FAF3E3"/>
      <circle cx="100" cy="100" r="50" fill="#2D5016" opacity="0.3"/>
      <text x="100" y="110" text-anchor="middle" fill="#2D5016" font-size="60" font-family="system-ui">📱</text>
      <text x="100" y="140" text-anchor="middle" fill="#666" font-size="12" font-family="system-ui">Offline</text>
    </svg>
  `;
}

// Background sync functions
async function syncPasses() {
  try {
    console.log('Syncing passes...');
    
    // Get stored passes that need syncing
    const passes = await getStoredData('pendingPasses');
    if (!passes || passes.length === 0) {
      return;
    }
    
    // Attempt to sync each pass
    for (const pass of passes) {
      try {
        const response = await fetch('/api/passes/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(pass)
        });
        
        if (response.ok) {
          // Remove from pending list
          await removeFromPendingPasses(pass.id);
          console.log('Pass synced:', pass.id);
        }
      } catch (error) {
        console.error('Failed to sync pass:', pass.id, error);
      }
    }
    
    // Notify clients of sync completion
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_COMPLETE',
        data: { type: 'passes' }
      });
    });
    
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

async function syncPurchases() {
  try {
    console.log('Syncing purchases...');
    
    // Similar logic for purchases
    const purchases = await getStoredData('pendingPurchases');
    if (!purchases || purchases.length === 0) {
      return;
    }
    
    for (const purchase of purchases) {
      try {
        const response = await fetch('/api/purchases', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(purchase)
        });
        
        if (response.ok) {
          await removeFromPendingPurchases(purchase.id);
          console.log('Purchase synced:', purchase.id);
        }
      } catch (error) {
        console.error('Failed to sync purchase:', purchase.id, error);
      }
    }
    
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_COMPLETE',
        data: { type: 'purchases' }
      });
    });
    
  } catch (error) {
    console.error('Purchase sync failed:', error);
  }
}

// IndexedDB helper functions
async function getStoredData(storeName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('PalmBeachPassDB', 1);
    
    request.onerror = () => reject(request.error);
    
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const getRequest = store.getAll();
      
      getRequest.onsuccess = () => resolve(getRequest.result);
      getRequest.onerror = () => reject(getRequest.error);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pendingPasses')) {
        db.createObjectStore('pendingPasses', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('pendingPurchases')) {
        db.createObjectStore('pendingPurchases', { keyPath: 'id' });
      }
    };
  });
}

async function removeFromPendingPasses(id) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('PalmBeachPassDB', 1);
    
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['pendingPasses'], 'readwrite');
      const store = transaction.objectStore('pendingPasses');
      const deleteRequest = store.delete(id);
      
      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => reject(deleteRequest.error);
    };
  });
}

async function removeFromPendingPurchases(id) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('PalmBeachPassDB', 1);
    
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['pendingPurchases'], 'readwrite');
      const store = transaction.objectStore('pendingPurchases');
      const deleteRequest = store.delete(id);
      
      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => reject(deleteRequest.error);
    };
  });
}

// Periodic background sync (if supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-passes') {
    event.waitUntil(updatePassesStatus());
  }
});

async function updatePassesStatus() {
  try {
    const response = await fetch('/api/passes/status');
    if (response.ok) {
      const passesStatus = await response.json();
      
      // Notify clients of updates
      const clients = await self.clients.matchAll();
      clients.forEach(client => {
        client.postMessage({
          type: 'PASSES_STATUS_UPDATE',
          data: passesStatus
        });
      });
    }
  } catch (error) {
    console.error('Failed to update passes status:', error);
  }
}

// Web Share Target API
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  if (url.pathname === '/share-target/' && event.request.method === 'POST') {
    event.respondWith(handleSharedContent(event.request));
  }
});

async function handleSharedContent(request) {
  const formData = await request.formData();
  const title = formData.get('title') || '';
  const text = formData.get('text') || '';
  const url = formData.get('url') || '';
  
  // Store shared content for the app to process
  const sharedData = { title, text, url, timestamp: Date.now() };
  
  // Store in cache for the app to retrieve
  const cache = await caches.open(dynamicCache);
  await cache.put('/shared-content', new Response(JSON.stringify(sharedData)));
  
  // Return response that redirects to the app
  return Response.redirect('/?shared=true', 302);
}

console.log('Palm Beach Pass Service Worker loaded successfully');
