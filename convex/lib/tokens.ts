// Assistant access tokens: "bcm_" plus 32 random bytes. Only the SHA-256 hash is stored,
// so a leaked database never reveals a usable token.

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function newToken() {
  return `bcm_${base64url(crypto.getRandomValues(new Uint8Array(32)))}`;
}

export async function hashToken(token: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}
