import { describe, expect, it } from "vitest";
import { taskValues, workQuery, workRoute } from "./task-forms";

function form(fields: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) for (const item of [value].flat()) data.append(name, item);
  return data;
}

const base = { title: " Write the intro ", lane: "Writing", minutes: "30", energy: "2", doneWhen: "A first draft" };

describe("reading the task form", () => {
  it("sends the project and milestone links carried by the hidden fields", () => {
    expect(taskValues(form({ ...base, projectId: "p1", milestoneId: "m1" }))).toMatchObject({ title: "Write the intro", projectId: "p1", milestoneId: "m1" });
  });

  it("leaves out empty links, which clears them on save", () => {
    const values = taskValues(form({ ...base, projectId: "", milestoneId: "" }));
    expect(values).not.toHaveProperty("projectId");
    expect(values).not.toHaveProperty("milestoneId");
  });

  it("sends prerequisites only once the checklist has loaded, so a slow load can't clear them", () => {
    expect(taskValues(form({ ...base, dependencies: ["t1"] }))).not.toHaveProperty("dependencies");
    expect(taskValues(form({ ...base, dependenciesShown: "1", dependencies: ["t1", "t2"] }))).toMatchObject({ dependencies: ["t1", "t2"] });
    expect(taskValues(form({ ...base, dependenciesShown: "1" }))).toMatchObject({ dependencies: [] });
  });

  it("reads an optional smaller step only when it is filled in", () => {
    expect(taskValues(form({ ...base, smallerStep: "", smallerDone: "", smallerMinutes: "" }))).not.toHaveProperty("smallerStep");
    expect(taskValues(form({ ...base, smallerStep: "Outline", smallerDone: "Three points", smallerMinutes: "15" }))).toMatchObject({ smallerStep: "Outline", smallerDone: "Three points", smallerMinutes: 15 });
  });

  it("reads planned sessions, and clears them only when the saved value was known", () => {
    expect(taskValues(form({ ...base, plannedSessions: "6" }))).toMatchObject({ plannedSessions: 6 });
    expect(taskValues(form({ ...base, plannedSessions: "", plannedSessionsKnown: "1" }))).toMatchObject({ plannedSessions: 0 });
    expect(taskValues(form({ ...base, plannedSessions: "" }))).not.toHaveProperty("plannedSessions");
  });
});

describe("Work's address", () => {
  const route = (query: string) => workRoute(new URLSearchParams(query));

  it("opens active tasks by default", () => {
    expect(route("")).toEqual({ mode: "tasks", view: "active", project: null, adding: false, visual: false });
  });

  it("reads Today's links: a new task, a task view, projects and one project", () => {
    expect(route("new=task")).toMatchObject({ mode: "tasks", adding: true });
    expect(route("view=blocked")).toMatchObject({ mode: "tasks", view: "blocked" });
    expect(route("view=projects")).toMatchObject({ mode: "projects", project: null });
    expect(route("view=projects&project=p1")).toMatchObject({ mode: "projects", project: "p1" });
    expect(route("project=p1")).toMatchObject({ mode: "projects", project: "p1" });
  });

  it("ignores views it doesn't know, and a new task outside the tasks view", () => {
    expect(route("view=everything")).toMatchObject({ mode: "tasks", view: "active" });
    expect(route("view=projects&new=task")).toMatchObject({ mode: "projects", adding: false });
  });

  it("keeps the task view while you look at projects", () => {
    expect(route("view=projects&tasks=blocked")).toMatchObject({ mode: "projects", view: "blocked" });
    expect(workQuery({ mode: "projects", view: "done", project: null, adding: false, visual: false })).toBe("view=projects&tasks=done");
  });

  it("reads the Visual switch in projects only", () => {
    expect(route("view=projects&visual=1")).toMatchObject({ mode: "projects", project: null, visual: true });
    expect(route("project=p1&visual=1")).toMatchObject({ mode: "projects", project: "p1", visual: true });
    expect(route("view=projects&visual=yes")).toMatchObject({ visual: false });
    expect(route("view=done&visual=1")).toMatchObject({ mode: "tasks", visual: false });
    expect(workQuery({ mode: "tasks", view: "active", project: null, adding: false, visual: true })).toBe("");
    expect(workQuery({ mode: "projects", view: "active", project: "p1", adding: false, visual: true })).toBe("view=projects&project=p1&visual=1");
  });

  it("writes back an address that reads as the same route", () => {
    for (const query of ["", "view=done", "new=task", "view=archived&new=task", "view=projects", "view=projects&project=p1", "view=projects&tasks=blocked", "view=projects&visual=1", "view=projects&project=p1&visual=1&tasks=done"]) {
      expect(route(workQuery(route(query)))).toEqual(route(query));
    }
    expect(workQuery(route("view=active"))).toBe("");
  });
});
