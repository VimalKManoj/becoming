import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const task = { title: "Task", lane: "Projects" as const, minutes: 30, energy: 2, doneWhen: "It works" };

describe("prerequisites", () => {
  it("lets archived work stop blocking, keeps it on edit, and never adds it new", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const first = await asA.mutation(api.tasks.create, { ...task, title: "First" });
    const second = await asA.mutation(api.tasks.create, { ...task, title: "Second", dependencies: [first] });
    const offered = async () => (await asA.query(api.tasks.todayOverview, { minutes: 60, energy: 3 })).choices.map(choice => choice.taskId);
    expect(await offered()).toEqual([first]);
    await asA.mutation(api.tasks.archive, { taskId: first });
    // Setting the prerequisite aside releases the task instead of hiding it from Today forever.
    expect(await offered()).toEqual([second]);
    // Work's list carries the prerequisite with its status, so the label needs no other list.
    const [listed] = (await asA.query(api.tasks.listPage, { paginationOpts: { numItems: 5, cursor: null } })).page;
    expect(listed.prerequisites).toEqual([{ _id: first, title: "First", status: "Archived" }]);
    // The edit form is offered the archived prerequisite ticked, and saving keeps it.
    expect(await asA.query(api.tasks.prerequisiteOptions, { taskId: second })).toContainEqual({ _id: first, title: "First", status: "Archived" });
    expect(await asA.query(api.tasks.prerequisiteOptions, {})).not.toContainEqual(expect.objectContaining({ _id: first }));
    await asA.mutation(api.tasks.update, { taskId: second, ...task, title: "Second", dependencies: [first] });
    expect(await t.run(ctx => ctx.db.get(second))).toMatchObject({ dependencies: [first] });
    // But archived work can't be newly chosen, and the message names it.
    const third = await asA.mutation(api.tasks.create, { ...task, title: "Third" });
    await expect(asA.mutation(api.tasks.update, { taskId: third, ...task, title: "Third", dependencies: [first] })).rejects.toThrow("“First” is archived");
    // Restoring the prerequisite makes it block again.
    await asA.mutation(api.tasks.restore, { taskId: first });
    expect(await offered()).not.toContain(second);
  });

  it("sets, keeps and replaces what a task waits on, refusing loops and bad links", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const asB = t.withIdentity({ subject: "user-b", issuer: "https://auth.example.test" });
    const a = await asA.mutation(api.tasks.create, { ...task, title: "A" });
    const b = await asA.mutation(api.tasks.create, { ...task, title: "B", dependencies: [a] });
    const c = await asA.mutation(api.tasks.create, { ...task, title: "C", dependencies: [b, b] });
    expect(await t.run(ctx => ctx.db.get(c))).toMatchObject({ dependencies: [b] });
    const foreign = await asB.mutation(api.tasks.create, { ...task, title: "Foreign" });

    await expect(asA.mutation(api.tasks.update, { taskId: a, ...task, title: "A", dependencies: [a] })).rejects.toThrow("wait on itself");
    await expect(asA.mutation(api.tasks.update, { taskId: a, ...task, title: "A", dependencies: [c] })).rejects.toThrow("loop");
    await expect(asA.mutation(api.tasks.update, { taskId: a, ...task, title: "A", dependencies: [foreign] })).rejects.toThrow("Record not found");
    const archived = await asA.mutation(api.tasks.create, { ...task, title: "Old" });
    await asA.mutation(api.tasks.archive, { taskId: archived });
    await expect(asA.mutation(api.tasks.update, { taskId: a, ...task, title: "A", dependencies: [archived] })).rejects.toThrow("archived");
    const many = await Promise.all(Array.from({ length: 11 }, (_, i) => asA.mutation(api.tasks.create, { ...task, title: `Many ${i}` })));
    await expect(asA.mutation(api.tasks.update, { taskId: a, ...task, title: "A", dependencies: many })).rejects.toThrow("up to 10");

    // Editing without a dependencies list keeps the current ones; an empty list clears them.
    await asA.mutation(api.tasks.update, { taskId: c, ...task, title: "C renamed" });
    expect(await t.run(ctx => ctx.db.get(c))).toMatchObject({ title: "C renamed", dependencies: [b] });
    await asA.mutation(api.tasks.update, { taskId: c, ...task, title: "C", dependencies: [] });
    expect(await t.run(ctx => ctx.db.get(c))).toMatchObject({ dependencies: [] });

    const options = await asA.query(api.tasks.prerequisiteOptions, {});
    expect(options.some(option => option.title === "Old" || option.title === "Foreign")).toBe(false);
    // B still waits on A, so Today offers A and C but not B.
    const today = await asA.query(api.tasks.todayOverview, { minutes: 60, energy: 3 });
    expect(today.choices.some(choice => choice.taskId === b)).toBe(false);
  });
});
