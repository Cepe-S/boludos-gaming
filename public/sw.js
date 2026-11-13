// ==============================================================================
// BOLUDOS GAMING — SERVICE WORKER (PWA & WEB PUSH NOTIFICATIONS)
// ==============================================================================

const CACHE_NAME = 'boludos-gaming-v1';
const STATIC_ASSETS = ['./', './index.html', './icon.svg', './manifest.webmanifest'];

// 1. Install & Activate Lifecycle: Claim clients immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
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
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
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
    (event.notification.data && event.notification.data.url) || './';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If an existing tab is open, focus it
        for (const client of clientList) {
          if ('focus' in client) {
            if (client.url.includes(self.location.origin)) {
              if ('navigate' in client && targetUrl !== './') {
                client.navigate(targetUrl);
              }
              return client.focus();
            }
          }
        }
        // Otherwise, open a new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
