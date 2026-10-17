// Becoming's service worker: shows the evening reminder and opens Today when tapped.
// Pushes carry no message (convex/lib/webpush.ts), so on a push it asks the app for tonight's
// words by this device's push endpoint (/api/reminder-line, Phase 5), falling back to a
// gentle default when it can't.

const fallback = "Tonight’s next step is ready when you are. Even 15 minutes counts.";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

async function tonightsLine() {
  try {
    const subscription = await self.registration.pushManager.getSubscription();
    if (!subscription) return fallback;
    const response = await fetch("/api/reminder-line", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
    const data = await response.json();
    return typeof data?.body === "string" && data.body ? data.body : fallback;
  } catch {
    return fallback;
  }
}

self.addEventListener("push", event => {
  event.waitUntil(tonightsLine().then(body => self.registration.showNotification("Becoming", {
    body,
    icon: "/pwa-icon?size=192",
    badge: "/pwa-icon?size=96",
    tag: "evening-reminder",
    data: { url: "/today" },
  })));
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
