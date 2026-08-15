/*
 * Valor Odds service worker.
 *
 * Receives Web Push events and displays a persistent notification in the
 * phone's pull-down shade. For pinned games the payload carries a live box
 * score plus a "big plays" feed, which we render as the notification body.
 *
 * `requireInteraction: true` keeps the notification on screen until the user
 * dismisses it (Android), which is what makes a pinned score "stick" in the
 * shade. Tapping the notification opens the game's box-score page.
 */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch (e) {
    payload = { title: 'Valor Odds', body: event.data.text() };
  }

  const title = payload.title || 'Valor Odds';
  const data = payload.data || {};

  // Build a rich body: score line first, then big plays underneath.
  let body = payload.body || '';
  if (Array.isArray(data.bigPlays) && data.bigPlays.length > 0) {
    const lines = data.bigPlays
      .slice(0, 5)
      .map((p) => `• ${p.kind ? p.kind + ': ' : ''}${p.text}`)
      .join('\n');
    body = body ? `${body}\n${lines}` : lines;
  }

  const options = {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag || (data.gameId ? `game-${data.gameId}` : 'valorodds'),
    // Re-notify so a fresh big play buzzes even if a notification for this
    // game is already showing.
    renotify: true,
    // Keep pinned-score notifications in the shade until dismissed.
    requireInteraction: Boolean(data.pinned),
    data: { url: payload.url || data.url || '/', gameId: data.gameId || null },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        // Focus an existing tab on the same URL if one is open.
        for (const client of clients) {
          if (client.url.includes(url) && 'focus' in client) return client.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow(url);
        return undefined;
      }),
  );
});

// The push service may rotate a subscription; re-subscribe transparently.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true })
      .then((sub) =>
        fetch('/api/notifications/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub.toJSON()),
        }),
      )
      .catch(() => {}),
  );
});
