// Becoming's service worker: shows the evening reminder and opens Today when tapped.
// Pushes carry no message (convex/lib/webpush.ts), so the text lives here.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

self.addEventListener("push", event => {
  event.waitUntil(self.registration.showNotification("Becoming", {
    body: "Tonight’s next step is ready when you are. Even 15 minutes counts.",
    icon: "/pwa-icon?size=192",
    badge: "/pwa-icon?size=96",
    tag: "evening-reminder",
    data: { url: "/today" },
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? "/today", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(windows => {
    const open = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (open) return open.navigate(url).then(client => (client ?? open).focus());
    return self.clients.openWindow(url);
  }));
});
