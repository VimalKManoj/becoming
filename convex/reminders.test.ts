import betterAuthTest from "@convex-dev/better-auth/test";
import { convexTest } from "convex-test";
import { generateKeyPairSync, verify } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { isDue, localClock } from "./reminders";
import { weekKey } from "./lib/time";
import { vapidHeader } from "./lib/webpush";

const modules = import.meta.glob("./**/*.ts");
const issuer = "https://auth.example.test";
// Thursday 8 October 2026, 20:35 in Kolkata (UTC+5:30) is 15:05 UTC.
const thursdayEvening = Date.UTC(2026, 9, 8, 15, 5);

describe("evening reminders", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reads the local clock and is due only inside the chosen 15 minutes, on chosen days", () => {
    const clock = localClock(thursdayEvening, "Asia/Kolkata");
    expect(clock).toEqual({ day: "2026-10-08", minutes: 20 * 60 + 35, weekday: 4 });
    expect(isDue(clock, "20:30", "weekdays")).toBe(true);
    expect(isDue(clock, "19:30", "weekdays")).toBe(false);
    expect(isDue({ ...clock, minutes: 20 * 60 + 45 }, "20:30", "weekdays")).toBe(false);
    expect(isDue({ ...clock, weekday: 6 }, "20:30", "weekdays")).toBe(false);
    expect(isDue({ ...clock, weekday: 6 }, "20:30", "everyday")).toBe(true);
  });

  it("signs the push request the way push services verify it (ES256 VAPID)", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const jwk = privateKey.export({ format: "jwk" });
    const raw = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, "base64url"), Buffer.from(jwk.y!, "base64url")]).toString("base64url");
    const header = await vapidHeader("https://fcm.googleapis.com/fcm/send/abc", { publicKey: raw, privateJwk: jwk, subject: "https://becoming.example.test" }, thursdayEvening);
    const [, token, key] = header.match(/^vapid t=([^,]+), k=(.+)$/)!;
    expect(key).toBe(raw);
    const [head, body, signature] = token.split(".");
    expect(JSON.parse(Buffer.from(body, "base64url").toString())).toEqual({ aud: "https://fcm.googleapis.com", exp: Math.floor(thursdayEvening / 1000) + 43200, sub: "https://becoming.example.test" });
    const ok = verify("sha256", Buffer.from(`${head}.${body}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url"));
    expect(ok).toBe(true);
  });

  it("is due once, not after a session today, and not during a planned pause", async () => {
    const t = convexTest(schema, modules);
    betterAuthTest.register(t);
    const asA = t.withIdentity({ subject: "user-a", issuer });
    const asB = t.withIdentity({ subject: "user-b", issuer });
    vi.useFakeTimers({ now: thursdayEvening, toFake: ["Date"] });
    try {
      const week = weekKey(thursdayEvening, "Asia/Kolkata");
      for (const as of [asA, asB]) {
        await as.mutation(api.rhythm.setRhythm, { timezone: "Asia/Kolkata", weeklyTarget: 3, currentWeek: week });
        await as.mutation(api.settings.savePreferences, { reminderOn: true, reminderTime: "20:30", reminderDays: "weekdays" });
        await as.mutation(api.push.subscribe, { endpoint: `https://push.example.test/${as === asA ? "a" : "b"}`, p256dh: "key", auth: "secret" });
      }
      // B already worked tonight.
      const taskId = await asB.mutation(api.tasks.create, { title: "Task", lane: "Projects", minutes: 30, energy: 2, doneWhen: "Done" });
      const active = await asB.mutation(api.tasks.startSession, { taskId });
      await asB.mutation(api.tasks.recordSession, { activeSessionId: active, outcome: "Made progress", contribution: "Did it.", nextStep: "More.", evidence: "" });

      const due = await t.query(internal.reminders.due, { now: thursdayEvening });
      expect(due.map(person => person.owner)).toEqual([`${issuer}|user-a`]);
      expect(due[0].devices.map(device => device.endpoint)).toEqual(["https://push.example.test/a"]);
      // No verified email in the test auth component, so only the device gets it.
      expect(due[0].email).toBeNull();

      await t.mutation(internal.reminders.markSent, { profileId: due[0].profileId, day: due[0].day });
      expect(await t.query(internal.reminders.due, { now: thursdayEvening + 60_000 })).toEqual([]);

      // Next evening: B hasn't worked yet, so B is due; A's planned pause keeps A quiet.
      await asA.mutation(api.rhythm.setPause, { currentWeek: week, week, paused: true });
      expect((await t.query(internal.reminders.due, { now: thursdayEvening + 86_400_000 })).map(person => person.owner)).toEqual([`${issuer}|user-b`]);
    } finally { vi.useRealTimers(); }
  });

  it("keeps each person's devices to themselves", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer });
    const asB = t.withIdentity({ subject: "user-b", issuer });
    await asA.mutation(api.push.subscribe, { endpoint: "https://push.example.test/a", p256dh: "key", auth: "secret" });
    expect((await asA.query(api.push.config, {})).devices).toEqual(["https://push.example.test/a"]);
    expect((await asB.query(api.push.config, {})).devices).toEqual([]);
    await asB.mutation(api.push.unsubscribe, { endpoint: "https://push.example.test/a" });
    expect((await asA.query(api.push.config, {})).devices).toHaveLength(1);
    await expect(asA.mutation(api.push.subscribe, { endpoint: "http://insecure.example.test", p256dh: "k", auth: "s" })).rejects.toThrow();
  });
});
