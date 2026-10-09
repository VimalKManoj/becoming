import { convexTest, type TestConvex, type TestConvexForDataModel } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const task = { title: "Design a component", lane: "Showcases" as const, minutes: 30, energy: 2, doneWhen: "A demo exists" };

describe("cloud Proof gallery", () => {
  it("shows only owned evidence with its owned session story and paginates", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const asB = t.withIdentity({ subject: "user-b", issuer: "https://auth.example.test" });
    const aTask = await asA.mutation(api.tasks.create, task);
    const bTask = await asB.mutation(api.tasks.create, { ...task, title: "Another person's work" });

    await expect(t.query(api.proof.listPage, { paginationOpts: { numItems: 10, cursor: null } })).rejects.toThrow("Sign in");
    const cancelled = await asA.mutation(api.tasks.startSession, { taskId: aTask });
    await asA.mutation(api.tasks.cancelSession, { activeSessionId: cancelled });
    expect((await asA.query(api.proof.listPage, { paginationOpts: { numItems: 10, cursor: null } })).page).toEqual([]);

    for (const [index, who, taskId] of [[1, asA, aTask], [2, asB, bTask], [3, asA, aTask]] as const) {
      const activeSessionId = await who.mutation(api.tasks.startSession, { taskId });
      await who.mutation(api.tasks.recordSession, { activeSessionId, outcome: "Made progress", contribution: `Contribution ${index}`, nextStep: "Continue", evidence: `https://example.test/evidence-${index}` });
    }

    const first = await asA.query(api.proof.listPage, { paginationOpts: { numItems: 1, cursor: null } });
    expect(first.page[0]).toMatchObject({ url: "https://example.test/evidence-3", status: "Draft", source: { contribution: "Contribution 3", lane: "Showcases" } });
    expect(first.page[0]).not.toHaveProperty("owner");
    expect(first.isDone).toBe(false);
    const second = await asA.query(api.proof.listPage, { paginationOpts: { numItems: 1, cursor: first.continueCursor } });
    expect(second.page.map(artifact => artifact.url)).toEqual(["https://example.test/evidence-1"]);
    expect(second.isDone).toBe(true);
    const other = await asB.query(api.proof.listPage, { paginationOpts: { numItems: 10, cursor: null } });
    expect(other.page.map(artifact => artifact.url)).toEqual(["https://example.test/evidence-2"]);
  });

  it("does not reveal a foreign session through a malformed owned artifact", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const asB = t.withIdentity({ subject: "user-b", issuer: "https://auth.example.test" });
    const bTask = await asB.mutation(api.tasks.create, task);
    const activeSessionId = await asB.mutation(api.tasks.startSession, { taskId: bTask });
    const foreignSession = await asB.mutation(api.tasks.recordSession, { activeSessionId, outcome: "Made progress", contribution: "Private detail", nextStep: "Continue", evidence: "" });
    await t.run(ctx => ctx.db.insert("artifacts", { owner: "https://auth.example.test|user-a", sessionId: foreignSession, title: "Broken reference", url: "https://example.test/broken", status: "Draft", portfolioCandidate: false }));

    const page = await asA.query(api.proof.listPage, { paginationOpts: { numItems: 10, cursor: null } });
    expect(page.page[0].source).toBeNull();
    expect(JSON.stringify(page.page)).not.toContain("Private detail");
  });
});

describe("Proof publishing workflow", () => {
  async function evidenceFor(t: TestConvex<typeof schema>, subject: string) {
    const who = t.withIdentity({ subject, issuer: "https://auth.example.test" });
    const taskId = await who.mutation(api.tasks.create, task);
    const activeSessionId = await who.mutation(api.tasks.startSession, { taskId });
    const sessionId = await who.mutation(api.tasks.recordSession, { activeSessionId, outcome: "Finished", contribution: "Built the demo", nextStep: "", evidence: "https://example.test/demo" });
    const [artifact] = await t.run(ctx => ctx.db.query("artifacts").withIndex("by_session", q => q.eq("sessionId", sessionId)).collect());
    return { who, sessionId, artifactId: artifact._id };
  }
  const view = (who: TestConvexForDataModel<DataModel>, name: "all" | "Draft" | "Ready to share" | "Published" | "candidates") =>
    who.query(api.proof.listPage, { view: name, paginationOpts: { numItems: 10, cursor: null } }).then(result => result.page);

  it("gets one owned piece of evidence by id, and null for anything else", async () => {
    const t = convexTest(schema, modules);
    const { who, artifactId } = await evidenceFor(t, "user-a");
    const stranger = t.withIdentity({ subject: "user-b", issuer: "https://auth.example.test" });
    await expect(t.query(api.proof.get, { artifactId })).rejects.toThrow("Sign in");
    expect(await who.query(api.proof.get, { artifactId })).toMatchObject({ _id: artifactId, url: "https://example.test/demo", status: "Draft", notes: "", skills: [], imageUrl: null, source: { contribution: "Built the demo", outcome: "Finished" } });
    expect(await who.query(api.proof.get, { artifactId })).not.toHaveProperty("owner");
    expect(await stranger.query(api.proof.get, { artifactId })).toBeNull();
    expect(await who.query(api.proof.get, { artifactId: "not-an-id" })).toBeNull();
    await who.mutation(api.proof.remove, { artifactId });
    expect(await who.query(api.proof.get, { artifactId })).toBeNull();
  });

  it("edits details and validates them", async () => {
    const t = convexTest(schema, modules);
    const { who, artifactId } = await evidenceFor(t, "user-a");
    const stranger = t.withIdentity({ subject: "user-b", issuer: "https://auth.example.test" });
    const details = { artifactId, title: "Card demo", url: "https://example.test/v2", notes: "Shows the empty state decision.", skills: ["React", " react ", "Accessibility", "React"] };
    await expect(stranger.mutation(api.proof.update, details)).rejects.toThrow("Record not found");
    await expect(who.mutation(api.proof.update, { ...details, url: "javascript:alert(1)" })).rejects.toThrow("valid HTTP or HTTPS");
    await expect(who.mutation(api.proof.update, { ...details, skills: Array.from({ length: 11 }, (_, i) => `Skill ${i}`) })).rejects.toThrow("up to 10");
    await who.mutation(api.proof.update, details);
    expect((await view(who, "all"))[0]).toMatchObject({ title: "Card demo", url: "https://example.test/v2", notes: "Shows the empty state decision.", skills: ["React", "react", "Accessibility"] });
  });

  it("publishes only with a real link and date, and clears them when moved back", async () => {
    const t = convexTest(schema, modules);
    const { who, artifactId } = await evidenceFor(t, "user-a");
    await who.mutation(api.proof.setStatus, { artifactId, status: "Ready to share" });
    expect((await view(who, "Ready to share")).map(item => item._id)).toEqual([artifactId]);
    await expect(who.mutation(api.proof.setStatus, { artifactId, status: "Published" })).rejects.toThrow("link where this was published");
    await expect(who.mutation(api.proof.setStatus, { artifactId, status: "Published", publishedUrl: "https://example.test/post", publishedOn: "2026-02-30" })).rejects.toThrow("date it was published");
    await expect(who.mutation(api.proof.setStatus, { artifactId, status: "Published", publishedUrl: "https://example.test/post", publishedOn: "2999-01-01" })).rejects.toThrow("future");
    await who.mutation(api.proof.setStatus, { artifactId, status: "Published", publishedUrl: "https://example.test/post", publishedOn: "2026-09-30" });
    expect((await view(who, "Published"))[0]).toMatchObject({ status: "Published", publishedUrl: "https://example.test/post", publishedOn: "2026-09-30" });
    expect(await view(who, "Ready to share")).toEqual([]);
    await who.mutation(api.proof.setStatus, { artifactId, status: "Draft" });
    const draft = await t.run(ctx => ctx.db.get(artifactId));
    expect(draft).toMatchObject({ status: "Draft" });
    expect(draft).not.toHaveProperty("publishedUrl");
    expect(draft).not.toHaveProperty("publishedOn");
  });

  it("flags portfolio candidates and adds evidence to a past owned session only", async () => {
    const t = convexTest(schema, modules);
    const { who, sessionId, artifactId } = await evidenceFor(t, "user-a");
    const other = await evidenceFor(t, "user-b");
    await who.mutation(api.proof.setCandidate, { artifactId, portfolioCandidate: true });
    expect((await view(who, "candidates")).map(item => item._id)).toEqual([artifactId]);
    await expect(who.mutation(api.proof.addToSession, { sessionId: other.sessionId, url: "https://example.test/x" })).rejects.toThrow("Record not found");
    await expect(who.mutation(api.proof.addToSession, { sessionId, url: "ftp://example.test/x" })).rejects.toThrow("valid HTTP or HTTPS");
    const long = await who.mutation(api.proof.addToSession, { sessionId, url: "https://example.test/long", title: "t".repeat(1000) });
    expect(await t.run(ctx => ctx.db.get(long))).toMatchObject({ title: "t".repeat(1000) });
    await who.mutation(api.proof.remove, { artifactId: long });
    const added = await who.mutation(api.proof.addToSession, { sessionId, url: "https://example.test/clip" });
    expect(await t.run(ctx => ctx.db.get(added))).toMatchObject({ title: "Design a component", status: "Draft", portfolioCandidate: false, sessionId });
    const history = await who.query(api.journey.listPage, { paginationOpts: { numItems: 5, cursor: null } });
    expect(history.page[0].artifacts.map(item => item.url).sort()).toEqual(["https://example.test/clip", "https://example.test/demo"]);
  });

  it("accepts only owned image uploads within type and size limits", async () => {
    const t = convexTest(schema, modules);
    const { who, artifactId } = await evidenceFor(t, "user-a");
    const other = await evidenceFor(t, "user-b");
    await expect(t.mutation(api.proof.generateUploadUrl, {})).rejects.toThrow("Sign in");
    expect(await who.mutation(api.proof.generateUploadUrl, {})).toMatch(/^https:\/\//);
    // The real upload endpoint records the file's content type; convex-test does not, so these tests add it.
    const stored = (blob: Blob) => t.run(async ctx => {
      const id = await ctx.storage.store(blob);
      await (ctx.db as unknown as { patch: (id: unknown, value: unknown) => Promise<void> }).patch(id, { contentType: blob.type });
      return id;
    });
    const text = await stored(new Blob(["hello"], { type: "text/plain" }));
    expect(await who.mutation(api.proof.attachImage, { artifactId, storageId: text })).toEqual({ attached: false, message: expect.stringContaining("PNG, JPEG, WebP or GIF") });
    expect(await t.run(ctx => ctx.db.system.get(text))).toBeNull();
    const huge = await stored(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "image/png" }));
    expect(await who.mutation(api.proof.attachImage, { artifactId, storageId: huge })).toMatchObject({ attached: false });
    expect(await t.run(ctx => ctx.db.system.get(huge))).toBeNull();

    const first = await stored(new Blob(["png"], { type: "image/png" }));
    expect(await who.mutation(api.proof.attachImage, { artifactId, storageId: first })).toEqual({ attached: true, message: "" });
    expect((await view(who, "all"))[0].imageUrl).toMatch(/^https:\/\//);
    await expect(other.who.mutation(api.proof.attachImage, { artifactId: other.artifactId, storageId: first })).rejects.toThrow("already in use");
    const second = await stored(new Blob(["webp"], { type: "image/webp" }));
    await who.mutation(api.proof.attachImage, { artifactId, storageId: second });
    expect(await t.run(ctx => ctx.db.system.get(first))).toBeNull();
    await who.mutation(api.proof.remove, { artifactId });
    expect(await t.run(ctx => ctx.db.system.get(second))).toBeNull();
    expect(await t.run(ctx => ctx.db.get(artifactId))).toBeNull();
  });
});
