"use client";

import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useRitual } from "@/components/ritual/ritual-context";
import { readableError } from "@/lib/errors";

// Where the evening reminder goes: email, and this device (Web Push through public/sw.js).
// On iPhone, a web app can only notify once it's on the Home Screen.

type DeviceState = "checking" | "unsupported" | "needs-install" | "off" | "on" | "blocked";

const keyBytes = (base64url: string) => {
  const raw = atob(base64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64url.length / 4) * 4, "="));
  return Uint8Array.from(raw, char => char.charCodeAt(0));
};

function supportState(): DeviceState {
  if (typeof window === "undefined") return "checking";
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const installed = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return ios && !installed ? "needs-install" : "unsupported";
  if (Notification.permission === "denied") return "blocked";
  return "off";
}

export function ReminderChannels({ emailOn, onEmail }: { emailOn: boolean; onEmail: (on: boolean) => void }) {
  const { showToast } = useRitual();
  const config = useQuery(api.push.config);
  const subscribe = useMutation(api.push.subscribe);
  const unsubscribe = useMutation(api.push.unsubscribe);
  const test = useAction(api.push.test);
  const [device, setDevice] = useState<DeviceState>("checking");
  const [busy, setBusy] = useState(false);

  // Whether this browser already has a subscription; resolved asynchronously.
  useEffect(() => {
    let live = true;
    const base = supportState();
    if (base !== "off") { Promise.resolve().then(() => { if (live) setDevice(base); }); return () => { live = false; }; }
    navigator.serviceWorker.getRegistration("/").then(registration => registration?.pushManager.getSubscription()).then(subscription => {
      if (live) setDevice(subscription && config?.devices.includes(subscription.endpoint) ? "on" : "off");
    }).catch(() => { if (live) setDevice("off"); });
    return () => { live = false; };
  }, [config?.devices]);

  async function turnOn() {
    if (!config?.publicKey) return;
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      if (await Notification.requestPermission() !== "granted") { setDevice("blocked"); return; }
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(config.publicKey) });
      const keys = subscription.toJSON().keys ?? {};
      await subscribe({ endpoint: subscription.endpoint, p256dh: keys.p256dh ?? "", auth: keys.auth ?? "" });
      setDevice("on");
      showToast("Notifications are on for this device.");
    } catch (caught) { showToast(readableError(caught, "Could not turn notifications on here. Please try again."), "alert"); }
    finally { setBusy(false); }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const subscription = await (await navigator.serviceWorker.getRegistration("/"))?.pushManager.getSubscription();
      if (subscription) { await unsubscribe({ endpoint: subscription.endpoint }); await subscription.unsubscribe(); }
      setDevice("off");
      showToast("Notifications are off for this device.");
    } catch (caught) { showToast(readableError(caught, "Could not turn notifications off. Please try again."), "alert"); }
    finally { setBusy(false); }
  }

  async function sendTest() {
    setBusy(true);
    try {
      const result = await test({});
      showToast(result.sent ? `Test sent to ${result.sent} ${result.sent === 1 ? "device" : "devices"}.` : "No device got it. Turn notifications on here first.", result.sent ? "status" : "alert");
    } catch (caught) { showToast(readableError(caught, "Could not send a test. Please try again."), "alert"); }
    finally { setBusy(false); }
  }

  const deviceNote: Record<DeviceState, string> = {
    checking: "Checking this device…",
    unsupported: "This browser can't show notifications.",
    "needs-install": "On iPhone, add Becoming to your Home Screen first (Share → Add to Home Screen), then open it from there and turn this on.",
    blocked: "Notifications are blocked for Becoming in this browser's settings.",
    off: config?.publicKey === null ? "Notifications aren't set up on this deployment yet." : "A notification on this phone or computer at your chosen time.",
    on: "On for this device. Other devices turn it on separately.",
  };
  const canToggle = (device === "on" || device === "off") && Boolean(config?.publicKey);

  return <div className="s-channels">
    <div className="s-switch-row">
      <div className="s-switch-text"><p id="set-remind-email-t" className="s-switch-title">By email</p><p id="set-remind-email-d" className="r-small s-sub">{config?.emailReady === false ? "On, but email isn't set up on this deployment yet, so nothing is sent." : "To your account's address."}</p></div>
      <button type="button" role="switch" aria-checked={emailOn} aria-labelledby="set-remind-email-t" aria-describedby="set-remind-email-d" className="r-toggle" onClick={() => onEmail(!emailOn)} />
    </div>
    <div className="s-switch-row">
      <div className="s-switch-text"><p id="set-remind-push-t" className="s-switch-title">On this device</p><p id="set-remind-push-d" className="r-small s-sub">{deviceNote[device]}</p></div>
      <button type="button" role="switch" aria-checked={device === "on"} aria-labelledby="set-remind-push-t" aria-describedby="set-remind-push-d" className="r-toggle" disabled={!canToggle || busy} onClick={() => void (device === "on" ? turnOff() : turnOn())} />
    </div>
    {(config?.devices.length ?? 0) > 0 && <button type="button" className="r-ghost xs" disabled={busy} onClick={() => void sendTest()}>Send a test notification</button>}
  </div>;
}
