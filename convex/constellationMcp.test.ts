import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const issuer = "https://auth.example.test";
const day = 86_400_000;

function setup() {
  const t = convexTest(schema, modules);
  return { t, asA: t.withIdentity({ subject: "user-a", issuer }), asB: t.withIdentity({ subject: "user-b", issuer }) };
}
type T = ReturnType<typeof setup>["t"];

async function mcp(t: T, token: string, method: string, params: Record<string, unknown> = {}) {
  const response = await t.fetch("/mcp", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return response.json();
}

async function call(t: T, token: string, name: string, args: Record<string, unknown>) {
  const body = await mcp(t, token, "tools/call", { name, arguments: args });
  return { error: body.result.isError ? body.result.content[0].text as string : null, data: body.result.isError ? null : JSON.parse(body.result.content[0].text) };
}

const planTask = (title: string, extra: Record<string, unknown> = {}) => ({ title, lane: "Projects", minutes: 45, energy: "steady", done_when: `${title} works`, ...extra });

describe("constellation tools (MCP)", () => {
  it("lists the new tools and the sync prompt", async () => {
    const { t, asA } = setup();
    const token = await asA.action(api.assistants.createToken, { name: "Claude Code" });
    const names = (await mcp(t, token, "tools/list")).result.tools.map((tool: { name: string }) => tool.name);
    expect(names).toEqual(expect.arrayContaining(["get_constellation", "get_phase", "add_phase", "add_doc", "update_doc", "add_research", "write_report", "record_decision", "import_plan"]));
    const prompts = (await mcp(t, token, "prompts/list")).result.prompts.map((p: { name: string }) => p.name);
    expect(prompts).toContain("sync_project_from_docs");
    expect((await mcp(t, token, "prompts/get", { name: "sync_project_from_docs" })).result.messages[0].content.text).toContain("import_plan");
    expect((await mcp(t, token, "initialize", {})).result.instructions).toContain("import_plan");
  });

  it("reads one project's map and a phase by number or name, only for the token's owner", async () => {
    const { t, asA, asB } = setup();
    const projectId = await asA.mutation(api.projects.create, { title: "Becoming", purpose: "Practice" });
    await asA.mutation(api.constellation.addPhase, { projectId, name: "Foundations" });
    const phaseId = await asA.mutation(api.constellation.addPhase, { projectId, name: "Reliability", goal: "Use it for real" });
    const milestoneId = await asA.mutation(api.projects.addMilestone, { projectId, title: "Ten evenings" });
    await asA.mutation(api.constellation.setMilestonePhase, { milestoneId, phaseId });
    await asA.mutation(api.tasks.create, { title: "Evening one", lane: "Projects", minutes: 30, energy: 2, doneWhen: "Logged", milestoneId, plannedSessions: 2 });
    await asA.mutation(api.constellation.addDoc, { projectId, code: "QA", title: "QA plan", link: "documents/QA_PLAN.md", phaseIds: [phaseId] });
    await asB.mutation(api.projects.create, { title: "B's secret", purpose: "Private" });
    const token = await asA.action(api.assistants.createToken, { name: "Claude Code" });

    const map = (await call(t, token, "get_constellation", { project: "becoming" })).data;
    expect(map.project).toMatchObject({ id: projectId, title: "Becoming" });
    expect(map.phases.map((p: { num: string; name: string }) => `${p.num} ${p.name}`)).toEqual(["00 Foundations", "01 Reliability"]);
    expect(map.phases[1].milestones[0]).toMatchObject({ code: "1A", title: "Ten evenings", tasks: [expect.objectContaining({ code: "1A·1", title: "Evening one", state: "ready" })] });
    expect(map.docs).toEqual([expect.objectContaining({ code: "QA", link: "documents/QA_PLAN.md", written: true, feeds: ["01"], tasksInformed: 1 })]);
    expect(map.stats).toMatchObject({ tasks: "0/1 (0%)", phases: 2, docs: 1 });

    for (const ref of ["01", "1", "Phase 01", "reliab"]) {
      const phase = (await call(t, token, "get_phase", { project: projectId, phase: ref })).data;
      expect(phase).toMatchObject({ num: "01", name: "Reliability", goal: "Use it for real", builtFrom: [{ code: "QA", title: "QA plan", link: "documents/QA_PLAN.md" }] });
      expect(phase.milestones[0].tasks[0]).toMatchObject({ code: "1A·1", status: "Ready", sessions: "0 of 2", energy: "steady" });
    }
    expect((await call(t, token, "get_phase", { project: projectId, phase: "07" })).error).toContain("No phase matches");
    expect((await call(t, token, "get_constellation", { project: "B's secret" })).error).toContain("No active project");
  });

  it("proposes phases and docs, and approval applies them with the assistant as source", async () => {
    const { t, asA, asB } = setup();
    const projectId = await asA.mutation(api.projects.create, { title: "Becoming", purpose: "Practice" });
    const first = await asA.mutation(api.constellation.addPhase, { projectId, name: "Foundations" });
    const token = await asA.action(api.assistants.createToken, { name: "Claude Code" });

    expect((await call(t, token, "add_phase", { project: "Becoming", name: "foundations" })).error).toContain("already has a phase");
    expect((await call(t, token, "add_phase", { project: "Becoming", name: "Reliability", goal: "Real use", next_step: "Log an evening" })).data.summary).toContain('Phase 01 "Reliability"');
    expect((await call(t, token, "add_doc", { project: "Becoming", code: "PR D", title: "x" })).error).toContain("1 to 4 letters");
    expect((await call(t, token, "add_doc", { project: "Becoming", code: "PRD", title: "x", link: "javascript:alert(1)" })).error).toContain("HTTP or HTTPS");
    expect((await call(t, token, "add_doc", { project: "Becoming", code: "PRD", title: "x", feeds: ["Nowhere"] })).error).toContain("No phase matches");
    await call(t, token, "add_doc", { project: "Becoming", code: "prd", title: "Product requirements", summary: "What and why", sections: 8, link: "documents/PRD.md", feeds: ["00"], next_edit: "Add the constellation" });

    // Nothing exists until it's approved.
    expect((await asA.query(api.constellation.get, { projectId }))!.phases).toHaveLength(1);
    const inbox = await asA.query(api.inbox.list, {});
    expect(inbox.map(item => [item.kind, item.title])).toEqual([["doc", "PRD · Product requirements"], ["phase", "Reliability"]]);
    expect(inbox[0]).toMatchObject({ details: ["Becoming", "Feeds 1 phase", "Written"], body: "What and why", next: "Add the constellation", link: "documents/PRD.md", plan: null });
    expect(inbox[1]).toMatchObject({ next: "Log an evening", body: "Goal: Real use" });
    await expect(asB.mutation(api.inbox.approve, { itemId: inbox[0]._id })).rejects.toThrow();
    for (const item of [...inbox].reverse()) await asA.mutation(api.inbox.approve, { itemId: item._id });

    let map = (await asA.query(api.constellation.get, { projectId }))!;
    expect(map.phases.map(p => [p.name, p.nextStep])).toEqual([["Foundations", ""], ["Reliability", "Log an evening"]]);
    expect(map.docs[0]).toMatchObject({ code: "PRD", sections: 8, link: "documents/PRD.md", phaseIds: [String(first)], source: "Claude Code", nextEdit: "Add the constellation" });

    // update_doc changes only what's given; "" clears a field, feeds replaces.
    expect((await call(t, token, "add_doc", { project: "Becoming", code: "PRD", title: "Again" })).error).toContain("Use update_doc");
    expect((await call(t, token, "update_doc", { project: "Becoming", code: "SYS" })).error).toContain("no doc coded");
    expect((await call(t, token, "update_doc", { project: "Becoming", code: "PRD" })).error).toContain("at least one field");
    await call(t, token, "update_doc", { project: "Becoming", code: "PRD", summary: "Now with phases", next_edit: "", feeds: ["Foundations", "01"], sections: 9 });
    const [update] = await asA.query(api.inbox.list, {});
    expect(update).toMatchObject({ kind: "docUpdate", title: "PRD · Product requirements", details: ["Becoming", "Changes: summary, sections, feeds, next edit"] });
    await asA.mutation(api.inbox.approve, { itemId: update._id });
    map = (await asA.query(api.constellation.get, { projectId }))!;
    expect(map.docs[0]).toMatchObject({ title: "Product requirements", summary: "Now with phases", sections: 9, link: "documents/PRD.md", nextEdit: "", feeds: ["00", "01"] });
  });

  it("proposes research, a report and a decision for the idea a project grew from", async () => {
    const { t, asA } = setup();
    const ideaId = await asA.mutation(api.ideas.create, { title: "A calmer tracker", lane: "Projects", notes: "" });
    const projectId = await asA.mutation(api.projects.create, { title: "Becoming", purpose: "Practice", ideaId });
    await asA.mutation(api.projects.create, { title: "No idea behind it", purpose: "x" });
    const token = await asA.action(api.assistants.createToken, { name: "Claude Code" });

    expect((await call(t, token, "add_research", { project: "No idea behind it", title: "x", sources: [] })).error).toContain("didn't grow from an idea");
    expect((await call(t, token, "add_research", { idea: "calmer", title: "x", sources: [{ title: "y", kind: "rumour" }] })).error).toContain("read, interview, tried or brief");
    expect((await call(t, token, "add_research", { idea: "calmer", title: "x", sources: [{ title: "y", kind: "read", url: "ftp://x" }] })).error).toContain("HTTP or HTTPS");
    await call(t, token, "add_research", { project: "Becoming", title: "Do evenings work?", summary: "Yes, briefly", sources: [{ title: "Deep Work", kind: "read", url: "https://example.test/dw" }, { title: "Five posts, summarised", kind: "brief" }] });
    await call(t, token, "write_report", { idea: ideaId, title: "Evenings are enough", findings: [{ text: "Short sessions stick", basis: "Deep Work" }] });
    await call(t, token, "record_decision", { idea: "A calmer tracker", verdict: "Build it", kept: ["Timer"], dropped: ["Teams"], rule: "Evenings only" });

    const inbox = await asA.query(api.inbox.list, {});
    expect(inbox.map(item => [item.kind, item.title, item.details])).toEqual([
      ["decision", "Build it", ["A calmer tracker", "1 kept", "1 dropped"]],
      ["report", "Evenings are enough", ["A calmer tracker", "1 finding"]],
      ["research", "Do evenings work?", ["A calmer tracker", "2 sources", "1 brief"]],
    ]);
    for (const item of [...inbox].reverse()) await asA.mutation(api.inbox.approve, { itemId: item._id });
    // More sources for the same thread join it.
    await call(t, token, "add_research", { project: "Becoming", title: "do evenings work?", sources: [{ title: "An interview", kind: "interview" }] });
    await asA.mutation(api.inbox.approve, { itemId: (await asA.query(api.inbox.list, {}))[0]._id });

    const { genesis } = (await asA.query(api.constellation.get, { projectId }))!;
    expect(genesis.research).toHaveLength(1);
    expect(genesis.research[0]).toMatchObject({ title: "Do evenings work?", summary: "Yes, briefly", source: "Claude Code" });
    expect(genesis.research[0].sources.map(s => [s.title, s.kind, s.by])).toEqual([["Deep Work", "read", "Claude Code"], ["Five posts, summarised", "brief", "Claude Code"], ["An interview", "interview", "Claude Code"]]);
    expect(genesis.report).toMatchObject({ title: "Evenings are enough", source: "Claude Code", findings: [{ text: "Short sessions stick", basis: "Deep Work" }] });
    expect(genesis.decision).toMatchObject({ verdict: "Build it", rule: "Evenings only", kept: ["Timer"], dropped: ["Teams"] });
  });
});

describe("import_plan", () => {
  it("sends a whole plan as one Inbox item and applies it atomically on approval, with real history", async () => {
    const { t, asA, asB } = setup();
    const token = await asA.action(api.assistants.createToken, { name: "Claude Code" });
    const started = new Date(Date.now() - 9 * day).toISOString();
    const finished = new Date(Date.now() - 7 * day).toISOString();
    const result = await call(t, token, "import_plan", {
      new_project: { title: "Becoming", purpose: "An evening work tracker" },
      phases: [
        { name: "Foundations", goal: "Solid ground", milestones: [
          { title: "Schema", tasks: [planTask("Tables", { status: "done", started_at: started, completed_at: finished, note: "All tables in" }), planTask("Indexes", { status: "done", completed_at: finished })] },
          { title: "Auth", tasks: [planTask("Sign in", { status: "in progress", started_at: started, planned_sessions: 3 })] },
        ] },
        { name: "Reliability", next_step: "Log an evening", milestones: [{ title: "Ten evenings", tasks: [planTask("Evening one", { status: "blocked", note: "Needs a real evening" }), planTask("Evening two")] }] },
      ],
      docs: [
        { code: "prd", title: "Product requirements", link: "documents/PRD.md", sections: 8, feeds: [0, "Reliability"] },
        { code: "UI", title: "UI flow", written: false, feeds: [1] },
      ],
    });
    expect(result.data.summary).toBe("Plan for Becoming: 2 phases, 3 milestones, 5 tasks, 2 docs.");
    expect(await t.run(ctx => ctx.db.query("projects").collect())).toEqual([]);

    const [item] = await asA.query(api.inbox.list, {});
    expect(item).toMatchObject({
      kind: "plan", title: "Plan for Becoming: 2 phases, 3 milestones, 5 tasks, 2 docs", details: ["New project"], body: "An evening work tracker",
      plan: { phases: [{ name: "Foundations", milestones: 2, tasks: 3, done: 2, existing: false }, { name: "Reliability", milestones: 1, tasks: 2, done: 0, existing: false }], docs: ["PRD", "UI"] },
    });
    await expect(asB.mutation(api.inbox.approve, { itemId: item._id })).rejects.toThrow();
    expect(await asA.mutation(api.inbox.approve, { itemId: item._id })).toBe("plan");

    const [project] = await t.run(ctx => ctx.db.query("projects").collect());
    const map = (await asA.query(api.constellation.get, { projectId: project._id }))!;
    expect(map.phases.map(p => [p.num, p.name, p.goal, p.nextStep, p.done, p.total])).toEqual([["00", "Foundations", "Solid ground", "", 2, 3], ["01", "Reliability", "", "Log an evening", 0, 2]]);
    expect(map.phases[0].milestones.map(m => [m.code, m.title, m.tasks.map(x => [x.code, x.title, x.state])])).toEqual([
      ["0A", "Schema", [["0A·1", "Tables", "done"], ["0A·2", "Indexes", "done"]]],
      ["0B", "Auth", [["0B·1", "Sign in", "doing"]]],
    ]);
    const tables = map.phases[0].milestones[0].tasks[0];
    expect(tables).toMatchObject({ startedAt: Date.parse(started), completedAt: Date.parse(finished) });
    expect(map.phases[0].milestones[0].tasks[1]).toMatchObject({ startedAt: Date.parse(finished), completedAt: Date.parse(finished) });
    expect(map.phases[0].milestones[0].completedAt).toBe(Date.parse(finished));
    // Replay starts at the imported history, not at the day the plan was approved.
    expect(map.timeline.start).toBe(Date.parse(started));
    expect(map.phases[0].milestones[1].tasks[0]).toMatchObject({ plannedSessions: 3, startedAt: Date.parse(started) });
    expect(map.phases[1].milestones[0].tasks[0]).toMatchObject({ state: "blocked", nextStep: "Needs a real evening" });
    expect(map.docs.map(d => [d.code, d.feeds, d.writtenAt === null, d.source])).toEqual([["PRD", ["00", "01"], false, "Claude Code"], ["UI", ["01"], true, "Claude Code"]]);

    const story = await asA.query(api.constellation.taskStory, { taskId: tables.id as Id<"tasks"> });
    expect(story!.map(e => [e.kind, e.source, e.note])).toEqual([["started", "Claude Code", null], ["done", "Claude Code", "All tables in"], ["created", "Claude Code", null]]);
    expect(story!.find(e => e.kind === "done")!.at).toBe(Date.parse(finished));
    expect(await asA.query(api.inbox.list, {})).toEqual([]);
  });

  it("adds to an existing project without repeating phases, milestones, tasks or docs", async () => {
    const { t, asA } = setup();
    const projectId = await asA.mutation(api.projects.create, { title: "Becoming", purpose: "Practice" });
    const phaseId = await asA.mutation(api.constellation.addPhase, { projectId, name: "Foundations" });
    const milestoneId = await asA.mutation(api.projects.addMilestone, { projectId, title: "Schema" });
    await asA.mutation(api.constellation.setMilestonePhase, { milestoneId, phaseId });
    await asA.mutation(api.tasks.create, { title: "Tables", lane: "Projects", minutes: 30, energy: 2, doneWhen: "In", milestoneId });
    await asA.mutation(api.constellation.addDoc, { projectId, code: "PRD", title: "Product", summary: "Old summary", phaseIds: [phaseId] });
    const token = await asA.action(api.assistants.createToken, { name: "Claude Code" });

    await call(t, token, "import_plan", {
      project: "Becoming",
      phases: [
        { name: "foundations", milestones: [{ title: "schema", tasks: [planTask("tables"), planTask("Indexes")] }, { title: "Auth", tasks: [planTask("Sign in")] }] },
        { name: "Reliability", milestones: [] },
      ],
      docs: [{ code: "PRD", title: "Product requirements", feeds: ["Reliability"] }, { code: "SYS", title: "System design", feeds: ["Foundations"] }],
    });
    const [item] = await asA.query(api.inbox.list, {});
    expect(item.details).toEqual(["Adds to Becoming"]);
    expect(item.plan!.phases.map(p => [p.name, p.existing])).toEqual([["foundations", true], ["Reliability", false]]);
    await asA.mutation(api.inbox.approve, { itemId: item._id });

    const map = (await asA.query(api.constellation.get, { projectId }))!;
    expect(map.phases.map(p => p.name)).toEqual(["Foundations", "Reliability"]);
    expect(map.phases[0].milestones.map(m => [m.title, m.tasks.map(x => x.title)])).toEqual([["Schema", ["Tables", "Indexes"]], ["Auth", ["Sign in"]]]);
    expect(map.docs.map(d => [d.code, d.title, d.summary, d.feeds])).toEqual([["PRD", "Product requirements", "Old summary", ["00", "01"]], ["SYS", "System design", "", ["00"]]]);
    expect(await t.run(ctx => ctx.db.query("phases").collect())).toHaveLength(2);
  });

  it("refuses a broken plan early, and an approval the app would refuse leaves nothing behind", async () => {
    const { t, asA } = setup();
    const projectId = await asA.mutation(api.projects.create, { title: "Becoming", purpose: "Practice" });
    const token = await asA.action(api.assistants.createToken, { name: "Claude Code" });
    const one = (tasks: unknown[]) => [{ name: "P", milestones: [{ title: "M", tasks }] }];
    const refused = async (args: Record<string, unknown>, message: string) => expect((await call(t, token, "import_plan", args)).error).toContain(message);

    await refused({ phases: one([]) }, 'Give either "project"');
    await refused({ project: "Becoming", new_project: { title: "X", purpose: "Y" }, phases: one([]) }, 'Give either "project"');
    await refused({ project: "Becoming", phases: [] }, "at least one phase");
    await refused({ project: "Becoming", phases: [{ name: "P", milestones: [] }, { name: "p", milestones: [] }] }, "same name");
    await refused({ project: "Becoming", phases: one([planTask("A", { status: "done", completed_at: new Date(Date.now() + 2 * day).toISOString() })]) }, "can't be in the future");
    await refused({ project: "Becoming", phases: one([planTask("A", { status: "done", started_at: new Date(Date.now() - day).toISOString(), completed_at: new Date(Date.now() - 2 * day).toISOString() })]) }, "finishes before it starts");
    await refused({ project: "Becoming", phases: one([planTask("A", { status: "ready", completed_at: new Date(Date.now() - day).toISOString() })]) }, "isn't done");
    await refused({ project: "Becoming", phases: one([planTask("A", { status: "blocked" })]) }, "what's blocking it");
    await refused({ project: "Becoming", phases: one([planTask("A", { status: "someday" })]) }, "ready, in progress, blocked or done");
    await refused({ project: "Becoming", phases: one([planTask("A", { minutes: 500 })]) }, "5 to 240");
    await refused({ project: "Becoming", phases: one([]), docs: [{ code: "PRD", title: "x", feeds: [3] }] }, "plan's phases are 0 to 0");
    await refused({ project: "Becoming", phases: one([]), docs: [{ code: "PRD", title: "x", feeds: ["Nowhere"] }] }, "isn't a phase");
    const many = Array.from({ length: 5 }, (_, p) => ({ name: `P${p}`, milestones: Array.from({ length: 2 }, (_, m) => ({ title: `M${m}`, tasks: Array.from({ length: 21 }, (_, k) => planTask(`T${k}`)) })) }));
    await refused({ project: "Becoming", phases: many }, "up to 200 tasks");
    expect(await asA.query(api.inbox.list, {})).toEqual([]);

    await call(t, token, "import_plan", { project: "Becoming", phases: [{ name: "Foundations", milestones: [{ title: "Schema", tasks: [planTask("Tables")] }] }] });
    const [item] = await asA.query(api.inbox.list, {});
    await asA.mutation(api.projects.setStatus, { projectId, status: "Archived" });
    await expect(asA.mutation(api.inbox.approve, { itemId: item._id })).rejects.toThrow("isn't active");
    expect(await t.run(ctx => ctx.db.query("phases").collect())).toEqual([]);
    expect(await t.run(ctx => ctx.db.query("tasks").collect())).toEqual([]);
    expect(await asA.query(api.inbox.list, {})).toHaveLength(1);
  });
});
