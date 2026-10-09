// Account emails (verify your address, reset your password), sent through Resend's HTTP
// API. Better Auth calls these from Convex's HTTP actions, where fetch is available.
// Without RESEND_API_KEY on a local deployment, the link is written to the Convex logs
// instead, so sign-up still works while developing; anywhere else it refuses to pretend.

export type Message = { subject: string; text: string; html: string };

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const first = (name: string) => name.trim().split(/\s+/)[0] ?? "";

function layout(heading: string, body: string, action: string, url: string, footer: string) {
  return `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#0D0B0A;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#F4EDE6">
<div style="max-width:480px;margin:0 auto;padding:28px;border-radius:24px;background:#171110;border:1px solid rgba(255,235,215,.09)">
<div style="width:28px;height:28px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#FFC08F,#F06A2A 60%,#7A2E0E)"></div>
<h1 style="font-size:26px;line-height:1.15;font-weight:500;margin:18px 0 10px">${heading}</h1>
<p style="font-size:15px;line-height:1.5;color:#C9BDB2;margin:0 0 22px">${body}</p>
<a href="${escape(url)}" style="display:inline-block;padding:14px 22px;border-radius:99px;background:#F47A36;color:#1A0E08;font-weight:600;font-size:15px;text-decoration:none">${action}</a>
<p style="font-size:12.5px;line-height:1.5;color:#A99D93;margin:22px 0 0">${footer}<br>If the button doesn't work, paste this link into your browser:<br><span style="color:#E9DFD6;word-break:break-all">${escape(url)}</span></p>
</div></body></html>`;
}

/** "Confirm your email" after sign-up, or on signing in before confirming. */
export function verificationMessage(name: string, url: string): Message {
  const hello = first(name) ? `Hi ${escape(first(name))}, one` : "One";
  return {
    subject: "Confirm your email for Becoming",
    text: `${first(name) ? `Hi ${first(name)}, one` : "One"} step left: confirm this is your email.\n\n${url}\n\nThe link works for one hour. If you didn't create a Becoming account, you can ignore this email.`,
    html: layout("Confirm your email", `${hello} step left: confirm this is your email, and your first evening is ready.`, "Confirm my email", url, "The link works for one hour. If you didn't create a Becoming account, you can ignore this email."),
  };
}

/** "Reset your password" from "Forgot password?". */
export function resetMessage(name: string, url: string): Message {
  return {
    subject: "Reset your Becoming password",
    text: `${first(name) ? `Hi ${first(name)}, someone` : "Someone"} asked to reset the password for your Becoming account.\n\n${url}\n\nThe link works for one hour. If it wasn't you, ignore this email and your password stays the same.`,
    html: layout("Reset your password", `${first(name) ? `Hi ${escape(first(name))}, someone` : "Someone"} asked to reset the password for your Becoming account.`, "Choose a new password", url, "The link works for one hour. If it wasn't you, ignore this email and your password stays the same."),
  };
}

/** The evening reminder: tonight's suggested step, or a plain nudge when nothing fits. */
export function reminderMessage(name: string, focus: { title: string; minutes: number } | null, siteUrl: string): Message {
  const hello = first(name) ? `Hi ${first(name)}. ` : "";
  const line = focus ? `Tonight's next step: ${focus.title} (${focus.minutes} min).` : "Your evening is ready when you are.";
  const today = `${siteUrl.replace(/\/$/, "")}/today`;
  return {
    subject: focus ? `Tonight: ${focus.title}` : "Your evening is ready",
    text: `${hello}${line} Even 15 minutes counts.\n\n${today}\n\nYou get this because evening reminders are on. Turn them off in Becoming → Settings.`,
    html: layout(focus ? "Tonight's next step" : "Your evening is ready", `${escape(hello)}${escape(line)} Even 15 minutes counts.`, "Open Today", today, "You get this because evening reminders are on. Turn them off in Becoming → Settings."),
  };
}

/** Email confirmation is on, except on a local deployment with SKIP_EMAIL_VERIFICATION=true (throwaway test accounts). */
export function emailVerificationRequired(env: Record<string, string | undefined> = process.env) {
  return !(env.SKIP_EMAIL_VERIFICATION === "true" && isLocalSite(env.SITE_URL));
}

/** True only for an http://localhost or 127.0.0.1 address (any port). */
export function isLocalSite(siteUrl: string | undefined) {
  try {
    const url = new URL(siteUrl ?? "");
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch { return false; }
}

export async function sendEmail(to: string, message: Message) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    // Local development only: the link appears in the Convex logs (npm run backend).
    if (isLocalSite(process.env.SITE_URL)) {
      console.log(`[email not sent: RESEND_API_KEY isn't set] To ${to} · ${message.subject}\n${message.text}`);
      return;
    }
    throw new Error("Email isn't set up on this deployment (RESEND_API_KEY is missing).");
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || "Becoming <onboarding@resend.dev>", to: [to], subject: message.subject, text: message.text, html: message.html }),
  });
  if (!response.ok) throw new Error(`Resend refused the email (${response.status}): ${(await response.text()).slice(0, 300)}`);
}
