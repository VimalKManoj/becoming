import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("cloud Settings motive", () => {
  it("creates one private profile, updates its motive, and keeps other fields", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const asB = t.withIdentity({ subject: "user-b", issuer: "https://auth.example.test" });

    await expect(t.query(api.settings.getProfile, {})).rejects.toThrow("Sign in");
    await expect(t.mutation(api.settings.saveMotive, { motive: "A motive" })).rejects.toThrow("Sign in");
    // A brand-new account has no profile yet, only the offer of onboarding.
    expect(await asA.query(api.settings.getProfile, {})).toMatchObject({ motive: "", needsOnboarding: true });
    expect(await asB.query(api.settings.getProfile, {})).toMatchObject({ motive: "", needsOnboarding: true });
    // Saving nothing before a motive exists is a no-op: no empty profile is invented.
    expect(await asA.mutation(api.settings.saveMotive, { motive: "  " })).toBeNull();
    expect(await t.run(ctx => ctx.db.query("profiles").collect())).toHaveLength(0);
    await expect(asA.mutation(api.settings.saveMotive, { motive: "x".repeat(1001) })).rejects.toThrow("1000 characters or fewer");

    const id = await asA.mutation(api.settings.saveMotive, { motive: "  Build thoughtful work.  " });
    if (!id) throw new Error("A non-empty motive should create a profile.");
    expect(await asA.query(api.settings.getProfile, {})).toMatchObject({ motive: "Build thoughtful work." });
    expect(await asB.query(api.settings.getProfile, {})).toMatchObject({ motive: "", needsOnboarding: true });

    await t.run(ctx => ctx.db.patch(id, { timezone: "Asia/Kolkata", weeklyTarget: 3 }));
    expect(await asA.mutation(api.settings.saveMotive, { motive: "Keep improving." })).toBe(id);
    const stored = await t.run(ctx => ctx.db.get(id));
    expect(stored).toMatchObject({ motive: "Keep improving.", timezone: "Asia/Kolkata", weeklyTarget: 3 });
    await asB.mutation(api.settings.saveMotive, { motive: "Another direction" });
    expect(await asA.query(api.settings.getProfile, {})).toMatchObject({ motive: "Keep improving." });
    expect(await asB.query(api.settings.getProfile, {})).toMatchObject({ motive: "Another direction" });
    expect((await t.run(ctx => ctx.db.query("profiles").collect()))).toHaveLength(2);

    // Clearing keeps the profile (and its other fields) but removes the motive text.
    expect(await asA.mutation(api.settings.saveMotive, { motive: "   " })).toBe(id);
    expect(await asA.query(api.settings.getProfile, {})).toMatchObject({ motive: "" });
    expect(await t.run(ctx => ctx.db.get(id))).toMatchObject({ timezone: "Asia/Kolkata", weeklyTarget: 3 });
  });
});

describe("cloud Settings pinned task", () => {
  it("names only your own open pinned task", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const asB = t.withIdentity({ subject: "user-b", issuer: "https://auth.example.test" });
    const task = { title: "Wire the recap", lane: "Projects" as const, minutes: 30, energy: 2, doneWhen: "It works" };

    await expect(t.query(api.settings.pinnedTask, {})).rejects.toThrow("Sign in");
    expect(await asA.query(api.settings.pinnedTask, {})).toBeNull();
    const taskId = await asA.mutation(api.tasks.create, task);
    await asA.mutation(api.tasks.pin, { taskId });
    expect(await asA.query(api.settings.pinnedTask, {})).toEqual({ taskId, title: "Wire the recap", status: "Ready" });
    expect(await asB.query(api.settings.pinnedTask, {})).toBeNull();

    await asA.mutation(api.tasks.pin, {});
    expect(await asA.query(api.settings.pinnedTask, {})).toBeNull();

    // A pin left on a finished task no longer shapes Today, so Settings doesn't name it.
    await asA.mutation(api.tasks.pin, { taskId });
    await t.run(ctx => ctx.db.patch(taskId, { status: "Done" }));
    expect(await asA.query(api.settings.pinnedTask, {})).toBeNull();
  });
});
