// Web Push without a payload: the push service only needs a VAPID-signed request, so no
// message encryption (and no package) is required. The service worker (public/sw.js)
// shows a fixed, friendly notification and opens Today when tapped.
// Keys live in Convex env: VAPID_PUBLIC_KEY (base64url, uncompressed P-256 point) and
// VAPID_PRIVATE_JWK (the private key as JSON); optional VAPID_SUBJECT (mailto: or https:).

const encoder = new TextEncoder();
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function pushKeys() {
  const publicKey = process.env.VAPID_PUBLIC_KEY, jwk = process.env.VAPID_PRIVATE_JWK;
  if (!publicKey || !jwk) return null;
  const site = process.env.SITE_URL ?? "";
  return { publicKey, privateJwk: JSON.parse(jwk) as JsonWebKey, subject: process.env.VAPID_SUBJECT || (site.startsWith("https://") ? site : "mailto:reminders@localhost") };
}

/** The Authorization header a push service expects (RFC 8292). */
export async function vapidHeader(endpoint: string, keys: NonNullable<ReturnType<typeof pushKeys>>, now = Date.now()) {
  const header = base64url(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = base64url(encoder.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: keys.subject })));
  const key = await crypto.subtle.importKey("jwk", { ...keys.privateJwk, key_ops: ["sign"] }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${base64url(signature)}, k=${keys.publicKey}`;
}

/** Sends one empty push. Returns the push service's status: 201 sent, 404/410 gone. */
export async function sendPush(endpoint: string, keys: NonNullable<ReturnType<typeof pushKeys>>) {
  const response = await fetch(endpoint, { method: "POST", headers: { Authorization: await vapidHeader(endpoint, keys), TTL: "21600", Urgency: "normal" } });
  return response.status;
}
