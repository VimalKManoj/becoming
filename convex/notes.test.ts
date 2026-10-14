import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

// Free notes on projects, milestones and phases: set, read, cleared, owner-only, backed up.

const modules = import.meta.glob("./**/*.ts");
const issuer = "https://auth.example.test";
const step = { title: "First", lane: "Projects" as const, minutes: 30, energy: 2, doneWhen: "" };

describe("notes on projects, milestones and phases", () => {
  it("are saved, shown, cleared and carried by backups", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer });
    const asB = t.withIdentity({ subject: "user-b", issuer });
    const { projectId } = await asA.mutation(api.projects.createWithFirstStep, { title: "P", purpose: "Why", step });
    const milestoneId = await asA.mutation(api.projects.addMilestone, { projectId, title: "M" });
    const phaseId = await asA.mutation(api.constellation.addPhase, { projectId, name: "Phase" });

    await asA.mutation(api.projects.setNotes, { projectId, notes: "  Decided on Convex.\nLink: docs  " });
    await asA.mutation(api.projects.setMilestoneNotes, { milestoneId, notes: "Ship before Friday" });
    await asA.mutation(api.constellation.setPhaseNotes, { phaseId, notes: "Stage one" });
    const map = await asA.query(api.constellation.get, { projectId });
    expect(map!.project.notes).toBe("Decided on Convex.\nLink: docs");
    expect(map!.phases[0].notes).toBe("Stage one");
    expect((await asA.query(api.projects.get, { projectId }))!.milestones[0].notes).toBe("Ship before Friday");

    await expect(asB.mutation(api.projects.setNotes, { projectId, notes: "Mine" })).rejects.toThrow();
    await expect(asA.mutation(api.constellation.setPhaseNotes, { phaseId, notes: "x".repeat(10001) })).rejects.toThrow("10,000");

    const backup = await asA.query(api.data.exportAll, {});
    await asB.mutation(api.data.importBackup, { backup });
    const restored = await asB.query(api.data.exportAll, {});
    expect([restored.projects[0].notes, restored.milestones[0].notes, restored.phases[0].notes]).toEqual(["Decided on Convex.\nLink: docs", "Ship before Friday", "Stage one"]);

    await asA.mutation(api.projects.setNotes, { projectId, notes: "" });
    expect((await t.run(ctx => ctx.db.get(projectId)))!.notes).toBeUndefined();
  });
});
