import { describe, expect, it } from "vitest";
import { createWorkspace } from "./seed";
import { finishSession, recommend, weekKey, type Session } from "./workspace";

describe("recommendations", () => {
  it("never squeezes a full task into a smaller duration", () => {
    const choices = recommend(createWorkspace(), 15, 1);
    expect(choices.some(r => r.task.id === "expandable-card")).toBe(false);
    expect(choices.find(r => r.task.id === "focus-card")?.smaller).toBe(true);
  });
  it("excludes blocked work and unsatisfied dependencies", () => {
    const w = createWorkspace();
    w.tasks[0].status = "Blocked";
    w.tasks[1].dependencies = ["missing-task"];
    expect(recommend(w, 90, 3).map(r => r.task.id)).toEqual(["first-breakdown"]);
  });
  it("offers another lane after two sessions in the same lane", () => {
    const w = createWorkspace();
    w.sessions = [1, 2].map(n => ({ id: String(n), taskId: "focus-card", title: "Progress", lane: "Projects", outcome: "Made progress", note: "Built a state", nextStep: "Continue", evidence: "", startedAt: n, endedAt: n, smaller: false }));
    expect(recommend(w, 90, 3)[0].task.lane).not.toBe("Projects");
  });
});
describe("session lifecycle", () => {
  const record: Session = { id: "session", taskId: "focus-card", title: "Sketch", lane: "Projects", outcome: "Finished", note: "Sketched three states", nextStep: "", evidence: "", startedAt: 1, endedAt: 2, smaller: true };
  it("keeps a parent unfinished after its smaller step and awards credit once", () => {
    const w = createWorkspace();
    w.activeSession = { id: "session", taskId: "focus-card", startedAt: 1, smaller: true };
    const next = finishSession(w, record);
    expect(next.tasks[0].status).toBe("In progress");
    expect(next.tasks[0].smallerStep).toBeUndefined();
    expect(finishSession(next, record).sessions).toHaveLength(1);
  });
  it("requires a resumption step for unfinished work", () => {
    const w = createWorkspace();
    w.activeSession = { id: "session", taskId: "focus-card", startedAt: 1, smaller: false };
    expect(() => finishSession(w, { ...record, outcome: "Blocked" })).toThrow("next step");
  });
});
it("uses Monday and the user's timezone at a UTC week boundary", () => {
  const time = Date.parse("2026-09-13T20:00:00Z");
  expect(weekKey(time, "Asia/Kolkata")).toBe("2026-09-14");
  expect(weekKey(time, "America/New_York")).toBe("2026-09-07");
});
