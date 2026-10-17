// The evening reminder's words for a push notification (PLAN-one-tap-and-daily-loop, Phase 5).
// Pushes carry no payload, so the service worker (public/sw.js) posts its own push endpoint
// here and gets back the latest reminder's line from Convex (convex/reminders.ts pushLine).

export async function POST(request: Request) {
  const site = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (!site) return Response.json({ body: null });
  try {
    const response = await fetch(`${site.replace(/\/$/, "")}/reminder-line`, { method: "POST", headers: { "Content-Type": "application/json" }, body: await request.text(), cache: "no-store" });
    const data = await response.json() as { body?: unknown };
    return Response.json({ body: typeof data.body === "string" ? data.body : null });
  } catch {
    return Response.json({ body: null });
  }
}
