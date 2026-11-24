// ==============================================================================
// BOLUDOS GAMING — SERVICE WORKER (PWA, ASSET/CDN CACHING & WEB PUSH)
// ==============================================================================

const APP_CACHE_NAME = 'boludos-gaming-app-v2';
const CDN_CACHE_NAME = 'boludos-gaming-cdn-v1';
const VALID_CACHES = [APP_CACHE_NAME, CDN_CACHE_NAME];
const STATIC_ASSETS = ['./', './index.html', './icon.svg', './manifest.webmanifest'];
const MAX_CDN_CACHE_ENTRIES = 260;

const IMMUTABLE_CDN_HOSTS = [
  'ddragon.leagueoflegends.com',
  'shared.akamai.steamstatic.com',
  'shared.fastly.steamstatic.com',
  'cdn.cloudflare.steamstatic.com',
  'images.igdb.com',
];

function isCacheableCdnAsset(url) {
  if (!IMMUTABLE_CDN_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    return false;
  }
  // Never cache the mutable versions.json file as immutable
  if (url.hostname === 'ddragon.leagueoflegends.com' && url.pathname.includes('/api/versions.json')) {
    return false;
  }
  return true;
}

function isSupabaseRequest(url) {
  return (
    url.hostname.includes('supabase.co') ||
    url.pathname.includes('/functions/v1/') ||
    url.pathname.includes('/rest/v1/') ||
    url.pathname.includes('/auth/v1/') ||
    url.pathname.includes('/realtime/v1/')
  );
}

async function trimCache(cacheName, maxEntries) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length <= maxEntries) return;
    const excess = keys.length - maxEntries;
    await Promise.all(keys.slice(0, excess).map((req) => cache.delete(req)));
  } catch {
    // Ignore quota / cache maintenance errors
  }
}

// 1. Install & Activate Lifecycle: Claim clients immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Cache failures should not prevent Service Worker installation
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (!VALID_CACHES.includes(key)) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 1b. Smart Fetch Caching (Hashed Vite chunks + Game/LoL CDN Images)
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (isSupabaseRequest(url)) return;

  // A. Same-origin hashed Vite assets (/assets/*) -> Cache-First (immutable content hash)
  if (url.origin === self.location.origin && url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.open(APP_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response && response.ok && response.type === 'basic') {
          cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      })
    );
    return;
  }

  // B. Immutable game cover / Data Dragon icons -> Cache-First with background eviction
  if (isCacheableCdnAsset(url)) {
    event.respondWith(
      caches.open(CDN_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response && (response.ok || response.type === 'opaque')) {
            cache.put(request, response.clone()).catch(() => {});
            trimCache(CDN_CACHE_NAME, MAX_CDN_CACHE_ENTRIES);
          }
          return response;
        } catch {
          return cached || Response.error();
        }
      })
    );
    return;
  }

  // C. Same-origin document / manifest / icon -> Network-First with fast cache fallback
  if (url.origin === self.location.origin && (request.mode === 'navigate' || url.pathname.endsWith('index.html') || url.pathname.endsWith('icon.svg') || url.pathname.endsWith('manifest.webmanifest'))) {
    event.respondWith(
      caches.open(APP_CACHE_NAME).then(async (cache) => {
        try {
          const fresh = await fetch(request);
          if (fresh && fresh.ok && fresh.type === 'basic') {
            cache.put(request, fresh.clone()).catch(() => {});
          }
          return fresh;
        } catch {
          const fallback = await cache.match(request);
          return fallback || cache.match('./index.html') || Response.error();
        }
      })
    );
  }
});

// 2. Push Notification Event Listener (RFC 8291 / 8292 from VAPID Edge Function)
self.addEventListener('push', (event) => {
  let payload = {
    title: 'Boludos Gaming 🎮',
    body: '¡Hay novedades en el grupo de vicio!',
    icon: './icon.svg',
    badge: './icon.svg',
    tag: 'bg-push-alert',
    url: './',
  };

  if (event.data) {
    try {
      const data = event.data.json();
      payload = { ...payload, ...data };
    } catch {
      payload.body = event.data.text() || payload.body;
    }
  }

  const notificationOptions = {
    body: payload.body,
    icon: payload.icon || './icon.svg',
    badge: payload.badge || './icon.svg',
    vibrate: [200, 100, 200],
    tag: payload.tag || `bg-notification-${Date.now()}`,
    renotify: true,
    data: {
      url: payload.url || (payload.data && payload.data.url) || './',
      timestamp: Date.now(),
    },
    actions: [
      { action: 'open', title: '🎮 Entrar al Vicio' },
      { action: 'close', title: 'Cerrar' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, notificationOptions)
  );
});

// 3. Message Event Listener (Triggered directly by React web app for local push)
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  // Handle in-app SHOW_NOTIFICATION or TRIGGER_LOCAL_PUSH
  if (
    event.data.type === 'SHOW_NOTIFICATION' ||
    event.data.type === 'TRIGGER_LOCAL_PUSH'
  ) {
    const payload = event.data.payload || event.data;
    const title = payload.title || 'Boludos Gaming 🎮';
    const notificationOptions = {
      body: payload.body || '¡Hay movimiento en la sala de espera!',
      icon: payload.icon || './icon.svg',
      badge: payload.badge || './icon.svg',
      vibrate: [200, 100, 200],
      tag: payload.tag || `bg-local-notification-${Date.now()}`,
      renotify: true,
      data: {
        url: payload.url || './',
        timestamp: Date.now(),
      },
      actions: [
        { action: 'open', title: '🎮 Entrar al Vicio' },
        { action: 'close', title: 'Cerrar' },
      ],
    };

    event.waitUntil(
      self.registration.showNotification(title, notificationOptions)
    );
  }
});

// 4. Notification Click Listener: Focus app or open URL
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const targetUrl =
    (event.notification.data && event.notification.data.url) || './#/sessions';
  const resolvedUrl = new URL(targetUrl, self.registration.scope).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If an existing tab is open, focus it and navigate to the target route
        for (const client of clientList) {
          if ('focus' in client) {
            if (client.url.includes(self.location.origin)) {
              if ('navigate' in client && targetUrl !== './') {
                return client.navigate(resolvedUrl).then(() => client.focus());
              }
              return client.focus();
            }
          }
        }
        // Otherwise, open a new window at the target route
        if (self.clients.openWindow) {
          return self.clients.openWindow(resolvedUrl);
        }
      })
  );
});
