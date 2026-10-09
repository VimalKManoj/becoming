"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { radioKeys } from "@/components/ritual/radio-keys";
import { useRitual } from "@/components/ritual/ritual-context";
import { Bone, Skeleton } from "@/components/skeleton";
import { readableError } from "@/lib/errors";
import { formatDay, plural } from "@/lib/format";
import { useNow } from "@/lib/use-rhythm";

// Ideas, as the owner's Ritual design: "Capture isn't commitment." A notebook of cards;
// one idea's brainstorm (/ideas?idea=…); "Make active →" asks for the first ready step and
// creates one linked Ready task in Work. Stages come from saved records; nothing is invented.

type Idea = FunctionReturnType<typeof api.ideas.listPage>["page"][number];
type ProjectOption = FunctionReturnType<typeof api.projects.options>[number];
type Lane = Idea["lane"];
type Stage = Idea["stage"];
type StageFilter = "all" | Exclude<Stage, "Archived">;
type View = "notebook" | "archived";
type Step = "brain" | "edit" | "activate" | "added";

const lanes: Lane[] = ["Projects", "Showcases", "Writing"];
const filters: StageFilter[] = ["all", "Captured", "Brainstorming", "Active"];
const estimates = [15, 20, 30, 45];
const energyNames = ["Low", "Steady", "High"];
const statusClass: Record<Stage, string> = { Captured: "s-captured", Brainstorming: "s-brainstorming", Active: "s-active", Archived: "s-archived" };

const field = (data: FormData, name: string) => String(data.get(name) || "").trim();
const list = (value: string) => value.split(/[\n,]/).map(item => item.trim()).filter(Boolean);
// Moves focus to a view's heading when it appears, so a screen reader hears the change.
const focusHeading = (element: HTMLElement | null) => element?.focus({ preventScroll: true });
const hasBrainstorm = (idea: Idea) => Object.values(idea.brainstorm).some(value => Array.isArray(value) ? value.length > 0 : Boolean(value));

/** "just now", "5 min ago", "2 days ago". Takes `now` so render never reads the clock. */
export function ago(time: number, now: number) {
  const minutes = Math.max(0, Math.floor((now - time) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${plural(hours, "hour")} ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${plural(days, "day")} ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${plural(Math.floor(days / 30), "month")} ago`;
  return `${plural(Math.floor(days / 365), "year")} ago`;
}

// "⌘ K" on a Mac, "Ctrl K" elsewhere; read after hydration, never during the server render.
const noSubscribe = () => () => {};
function useShortcutLabel() {
  return useSyncExternalStore(noSubscribe, () => /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ K" : "Ctrl K", () => "⌘ K");
}

export function CloudIdeasScreen() {
  return <Suspense fallback={<IdeasSkeleton />}><Ideas /></Suspense>;
}

function Ideas() {
  const ideaId = useSearchParams().get("idea");
  // A new idea id starts its flow afresh at the brainstorm.
  return ideaId ? <IdeaFlow key={ideaId} ideaId={ideaId} /> : <IdeaList />;
}

// ---------- The notebook ----------

function IdeaList() {
  const { openCapture } = useRitual();
  const shortcut = useShortcutLabel();
  const now = useNow();
  const [view, setView] = useState<View>("notebook");
  const [filter, setFilter] = useState<StageFilter>("all");
  const { results, status, loadMore } = usePaginatedQuery(api.ideas.listPage, { view }, { initialNumItems: 12 });

  // The capture pill's shortcut works while the notebook is open.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openCapture("idea"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openCapture]);

  // Counts cover the ideas loaded so far, and only show once every page is in.
  const complete = status === "Exhausted";
  const counts: Record<StageFilter, number> = { all: results.length, Captured: 0, Brainstorming: 0, Active: 0 };
  for (const idea of results) if (idea.stage !== "Archived") counts[idea.stage] += 1;
  const shown = view === "notebook" && filter !== "all" ? results.filter(idea => idea.stage === filter) : results;

  return <div className="r-wide r-rise-6 i-list">
    <div>
      <div className="r-eyebrow">Ideas</div>
      <h1 className="r-title">Capture isn&apos;t <em className="lilac">commitment.</em></h1>
    </div>
    <div className="r-row i-capture-row">
      <button type="button" className="i-capture" aria-keyshortcuts="Meta+K Control+K" onClick={() => openCapture("idea")}>
        Catch an idea. A title is enough.<kbd className="i-kbd" aria-hidden="true">{shortcut}</kbd>
      </button>
      <button type="button" className="i-paste" onClick={() => openCapture("assignment")}>Paste a ChatGPT assignment</button>
    </div>
    <div className="r-row r-between i-toolbar">
      {view === "notebook" && results.length > 0 ? <div className="r-row i-chips" role="group" aria-label="Filter by stage">
        {filters.map(item => <button key={item} type="button" className="r-chip round h34" aria-pressed={filter === item} onClick={() => setFilter(item)}>
          {item === "all" ? "All" : item}{complete && <span className="i-count">{counts[item]}</span>}
        </button>)}
      </div> : <span />}
      <div className="r-row i-chips" role="group" aria-label="Show ideas">
        {(["notebook", "archived"] as const).map(item => <button key={item} type="button" className="r-chip round h34" aria-pressed={view === item} onClick={() => { setView(item); setFilter("all"); }}>
          {item === "notebook" ? "Notebook" : "Archived"}
        </button>)}
      </div>
    </div>
    {status === "LoadingFirstPage" ? <GridSkeleton />
      : results.length === 0 ? <EmptyIdeas view={view} onCapture={() => openCapture("idea")} />
        : shown.length === 0 ? <div className="r-card i-empty-filter" role="status">
          <p className="r-body" style={{ color: "var(--r-text)" }}>{filter === "Active" ? "Nothing active" : `No ${filter.toLowerCase()} ideas`}{complete ? "." : " among the ideas loaded so far."}</p>
          <button type="button" className="r-link" onClick={() => setFilter("all")}>Show every idea</button>
        </div>
          : <>
            {filter !== "all" && !complete && <p className="r-small">Filtering the {plural(results.length, "idea")} loaded so far. Load more to include older ones.</p>}
            <div className="i-grid">{shown.map(idea => <IdeaCard key={idea._id} idea={idea} now={now} />)}</div>
          </>}
    {(status === "CanLoadMore" || status === "LoadingMore") && <button type="button" className="r-ghost sm i-more-button" disabled={status === "LoadingMore"} onClick={() => loadMore(12)}>{status === "LoadingMore" ? "Loading more…" : "Load more ideas"}</button>}
  </div>;
}

/** The card's second line: where it came from, or what it became. */
function metaLine(idea: Idea, now: number | null) {
  if (idea.stage === "Archived") return `Archived${now !== null && idea.archivedAt ? ` ${ago(idea.archivedAt, now)}` : ""}`;
  if (idea.stage === "Active") return `${idea.lane} task in Work${idea.task ? ` · ${idea.task.status}` : ""}`;
  return `${idea.lane}${now !== null ? ` · ${ago(idea._creationTime, now)}` : ""}`;
}

function IdeaCard({ idea, now }: { idea: Idea; now: number | null }) {
  return <Link href={`/ideas?idea=${idea._id}`} className="i-card">
    <span className={`r-status ${statusClass[idea.stage]}`}>{idea.stage}</span>
    <span><span className="i-card-title">{idea.title}</span><span className="i-card-meta">{metaLine(idea, now)}</span></span>
  </Link>;
}

function EmptyIdeas({ view, onCapture }: { view: View; onCapture: () => void }) {
  if (view === "archived") return <section className="r-card i-empty">
    <span className="i-empty-mark dashed" aria-hidden="true" />
    <h2 className="i-empty-title">Nothing archived.</h2>
    <p className="r-lede">Archiving moves an idea out of the notebook and keeps its notes. You can restore it whenever you like.</p>
  </section>;
  return <section className="r-card i-empty">
    <span className="i-empty-mark" aria-hidden="true" />
    <h2 className="i-empty-title">Nothing caught <em>yet.</em></h2>
    <p className="r-lede">A title is enough. Ideas wait here, out of Today, until you brainstorm one or make it active. Paste an assignment to keep its brief with it.</p>
    <button type="button" className="r-ghost sm lilac" onClick={onCapture}>Catch an idea</button>
  </section>;
}

// ---------- One idea: brainstorm → make active → added ----------

function IdeaFlow({ ideaId }: { ideaId: string }) {
  const router = useRouter();
  const { showToast } = useRitual();
  const idea = useQuery(api.ideas.get, { ideaId });
  const [step, setStep] = useState<Step>("brain");
  const [newProject, setNewProject] = useState<string | null>(null);

  if (idea === undefined) return <IdeaSkeleton />;
  if (idea === null) return <div className="r-col r-rise-6 i-flow">
    <Link className="r-back" href="/ideas">‹ Ideas</Link>
    <section className="r-card i-empty">
      <h1 className="i-empty-title" ref={focusHeading} tabIndex={-1}>This idea isn&apos;t here.</h1>
      <p className="r-lede">It may have been deleted, or the link is from another account.</p>
    </section>
  </div>;

  const toList = (text?: string) => { if (text) showToast(text); router.push("/ideas"); };

  if (step === "added") return <Added projectTitle={newProject} onToday={() => router.push("/today")} onWork={() => router.push("/work")} />;
  if (step === "activate") return <Activate idea={idea} onBack={() => setStep("brain")}
    onAdded={project => { setNewProject(project ? idea.title : null); setStep("added"); }} />;
  return <Brainstorm idea={idea} editing={step === "edit"} onEdit={editing => setStep(editing ? "edit" : "brain")}
    onActivate={() => setStep("activate")} onList={toList} />;
}

function Brainstorm({ idea, editing, onEdit, onActivate, onList }: { idea: Idea; editing: boolean; onEdit: (editing: boolean) => void; onActivate: () => void; onList: (toast?: string) => void }) {
  const { showToast } = useRitual();
  const archive = useMutation(api.ideas.archive);
  const restore = useMutation(api.ideas.restore);
  const deactivate = useMutation(api.ideas.deactivate);
  const [busy, setBusy] = useState(false);
  const [confirmBack, setConfirmBack] = useState(false);

  async function run(action: () => Promise<unknown>, done: () => void) {
    setBusy(true);
    try { await action(); done(); }
    catch (caught) { showToast(readableError(caught, "Could not save. Please try again."), "alert"); }
    finally { setBusy(false); }
  }

  const b = idea.brainstorm;
  const workHref = idea.task?.status === "Done" ? "/work?view=done" : idea.task?.status === "Blocked" ? "/work?view=blocked" : "/work";
  return <div className="r-wide r-rise-6 i-flow">
    <Link className="r-back" href="/ideas">‹ Ideas</Link>
    <div>
      <div className="r-eyebrow lilac">{idea.stage} · {idea.lane}</div>
      <h1 className="i-title" ref={focusHeading} tabIndex={-1}>{idea.title}</h1>
    </div>
    {editing ? <BrainstormForm idea={idea} onDone={() => onEdit(false)} /> : <div className="i-brain">
      <Notes notes={idea.notes} onAdd={() => onEdit(true)} />
      <div className="i-facts">
        {hasBrainstorm(idea) ? <>
          {b.problem && <Fact label="Problem it solves" value={b.problem} />}
          {b.audience && <Fact label="Who it's for" value={b.audience} />}
          {b.hook && <Fact label="The hook · what makes it yours" value={b.hook} tone="lilac" />}
          {b.smallestBuild && <Fact label="Smallest build" value={b.smallestBuild} tone="dashed" />}
          {b.openQuestions && <Fact label="Open questions" value={b.openQuestions} />}
          {b.decisions && <Fact label="Decisions so far" value={b.decisions} />}
          {b.skills?.length ? <div className="r-row i-skills"><span className="i-fact-label" style={{ marginRight: 4 }}>Skills</span>{b.skills.map(skill => <span key={skill} className="i-skill">{skill}</span>)}</div> : null}
          {b.references?.length ? <div className="i-fact"><div className="i-fact-label">References</div><ul className="i-refs">{b.references.map(url => <li key={url}><a href={url} target="_blank" rel="noreferrer">{url.replace(/^https?:\/\//, "").slice(0, 60)} ↗</a></li>)}</ul></div> : null}
        </> : <div className="i-fact dashed">
          <div className="i-fact-label">Not brainstormed yet</div>
          <div className="i-fact-value">What problem does it solve, what&apos;s the hook, and what&apos;s the smallest build? Every answer is optional.</div>
          <button type="button" className="r-link" style={{ marginTop: 10 }} onClick={() => onEdit(true)}>Brainstorm it →</button>
        </div>}
      </div>
    </div>}
    {!editing && <>
      {idea.stage === "Archived" ? <div className="r-row i-actions">
        <button type="button" className="r-btn sm" disabled={busy} onClick={() => void run(() => restore({ ideaId: idea._id }), () => showToast("Restored to your notebook."))}>Restore to notebook</button>
        <span className="r-small">Archived ideas keep their notes{idea.taskId ? " and their linked task" : ""}.</span>
      </div>
        : idea.stage === "Active" ? confirmBack ? <div className="r-card i-confirm" role="group" aria-labelledby="idea-back-title">
          <p id="idea-back-title" className="r-body" ref={focusHeading} tabIndex={-1}>Move this idea back to your notebook? Its open task leaves Today and is archived; sessions and notes are kept, and you can make it active again later.</p>
          <div className="r-row" style={{ gap: 8 }}>
            <button type="button" className="r-ghost sm" disabled={busy} onClick={() => void run(() => deactivate({ ideaId: idea._id }), () => { setConfirmBack(false); showToast(`“${idea.title}” is back in your notebook.`); })}>{busy ? "Moving…" : "Move back to Ideas"}</button>
            <button type="button" className="r-link" onClick={() => setConfirmBack(false)}>Keep it active</button>
          </div>
        </div> : <div className="r-row i-actions">
          <Link className="r-ghost" href={workHref} style={{ height: 52 }}>Open in Work →</Link>
          <span className="r-small">{idea.task ? <>Became “{idea.task.title}” · {idea.task.status}</> : "Linked to a task in Work."}</span>
        </div>
          : <div className="r-row i-actions">
            <button type="button" className="r-ghost lilac-outline" style={{ padding: "0 22px" }} onClick={onActivate}>Make active →</button>
            <button type="button" className="r-ghost" style={{ height: 52 }} onClick={() => onList("Kept in Ideas. No work was added to Today.")}>Keep as an idea</button>
            <span className="r-small">Nothing reaches Today until you make it active.</span>
          </div>}
      <div className="r-row i-tools">
        {idea.stage !== "Archived" && <button type="button" className="r-ghost xs" disabled={busy} onClick={() => onEdit(true)}>{hasBrainstorm(idea) || idea.notes ? "Edit brainstorm and notes" : "Brainstorm it"}</button>}
        {idea.stage === "Active" && !confirmBack && <button type="button" className="r-ghost xs" disabled={busy} onClick={() => setConfirmBack(true)}>Move back to Ideas</button>}
        {idea.stage !== "Archived" && <button type="button" className="r-ghost xs" disabled={busy} onClick={() => void run(() => archive({ ideaId: idea._id }), () => onList(`Archived “${idea.title}”. Its notes are kept; find it under Archived.`))}>Archive</button>}
      </div>
      <Genesis ideaId={idea._id} />
    </>}
  </div>;
}

/** The idea's notes, often a pasted assignment, kept exactly as saved. Long ones start clamped. */
function Notes({ notes, onAdd }: { notes: string; onAdd: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const long = notes.length > 700 || notes.split("\n").length > 12;
  return <div className="i-notes">
    <div className="r-eyebrow-sm" style={{ marginBottom: 10 }}>Notes · as saved</div>
    {notes ? <>
      <p id="idea-notes" className={`i-notes-text${long && !expanded ? " clamp" : ""}`}>{notes}</p>
      {long && <button type="button" className="r-link" style={{ marginTop: 8 }} aria-expanded={expanded} aria-controls="idea-notes" onClick={() => setExpanded(!expanded)}>{expanded ? "Show less" : "Show all notes"}</button>}
    </> : <>
      <p className="i-notes-text" style={{ color: "var(--r-muted)" }}>No notes yet.</p>
      <button type="button" className="r-link" style={{ marginTop: 8 }} onClick={onAdd}>Add notes →</button>
    </>}
  </div>;
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: "lilac" | "dashed" }) {
  return <div className={`i-fact${tone ? ` ${tone}` : ""}`}><div className="i-fact-label">{label}</div><div className="i-fact-value">{value}</div></div>;
}

/** Every field is optional; brainstorming never adds work to Today. */
function BrainstormForm({ idea, onDone }: { idea: Idea; onDone: () => void }) {
  const { showToast } = useRitual();
  const update = useMutation(api.ideas.update);
  const [lane, setLane] = useState<Lane>(idea.lane);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const b = idea.brainstorm;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      await update({
        ideaId: idea._id, title: field(data, "title"), lane, notes: field(data, "notes"),
        brainstorm: {
          problem: field(data, "problem"), audience: field(data, "audience"), hook: field(data, "hook"), smallestBuild: field(data, "smallestBuild"),
          skills: list(field(data, "skills")), references: field(data, "references").split("\n").map(item => item.trim()).filter(Boolean),
          openQuestions: field(data, "openQuestions"), decisions: field(data, "decisions"),
        },
      });
      showToast("Brainstorm saved. Nothing was added to Today.");
      onDone();
    } catch (caught) { setError(readableError(caught, "Could not save the brainstorm. Please try again.")); }
    finally { setBusy(false); }
  }

  return <form className="r-card i-form" onSubmit={event => void submit(event)} aria-busy={busy} aria-label={`Brainstorm ${idea.title}`}>
    <p className="r-lede">Every field is optional. Fill in what helps you decide. Brainstorming never adds work to Today.</p>
    <fieldset className="i-fields" disabled={busy}><legend className="sr-only">Brainstorm</legend>
      <label className="r-field">Idea title<input className="r-input" name="title" required maxLength={160} defaultValue={idea.title} /></label>
      <div><div className="r-label" id="brain-lane" style={{ marginBottom: 8 }}>Lane</div>
        <div className="r-row i-chips" role="radiogroup" aria-labelledby="brain-lane" onKeyDown={radioKeys}>{lanes.map(item => <button key={item} type="button" role="radio" aria-checked={lane === item} className={`r-chip round h40 lane-${item}`} onClick={() => setLane(item)}><span className="r-dot" aria-hidden="true" />{item}</button>)}</div>
      </div>
      <label className="r-field">Notes and pasted assignment<textarea className="r-textarea" name="notes" rows={6} defaultValue={idea.notes} maxLength={10000} /></label>
      <label className="r-field">Problem it solves<textarea className="r-textarea" name="problem" rows={2} defaultValue={b.problem} maxLength={2000} /></label>
      <div className="i-pair">
        <label className="r-field">Who it&apos;s for<input className="r-input" name="audience" defaultValue={b.audience} maxLength={1000} /></label>
        <label className="r-field">The hook · what makes it yours<input className="r-input" name="hook" defaultValue={b.hook} maxLength={1000} /></label>
      </div>
      <label className="r-field">Smallest build<input className="r-input" name="smallestBuild" defaultValue={b.smallestBuild} maxLength={1000} /></label>
      <label className="r-field">Skills it would practise · comma-separated<input className="r-input" name="skills" defaultValue={b.skills?.join(", ")} maxLength={500} /></label>
      <label className="r-field">References · one link per line<textarea className="r-textarea" name="references" rows={2} defaultValue={b.references?.join("\n")} maxLength={20000} /></label>
      <div className="i-pair">
        <label className="r-field">Open questions<textarea className="r-textarea" name="openQuestions" rows={3} defaultValue={b.openQuestions} maxLength={2000} /></label>
        <label className="r-field">Decisions so far<textarea className="r-textarea" name="decisions" rows={3} defaultValue={b.decisions} maxLength={2000} /></label>
      </div>
      {error && <p role="alert" className="r-small" style={{ color: "var(--r-red-pale)" }}>{error}</p>}
      <div className="r-row" style={{ gap: 8 }}>
        <button type="submit" className="r-btn sm">{busy ? "Saving…" : "Save brainstorm"}</button>
        <button type="button" className="r-ghost sm" onClick={onDone}>Cancel</button>
      </div>
    </fieldset>
  </form>;
}

// ---------- Genesis: research, report and decision ----------
// What came before a project: research threads with their sources, the report they produced,
// and the decision to build. The project's constellation draws these as its first column.
// Anything an assistant added through MCP carries a small lilac "MCP" badge.

type GenesisData = NonNullable<FunctionReturnType<typeof api.genesis.forIdea>>;
type Thread = GenesisData["research"][number];
type Source = Thread["sources"][number];
type Report = NonNullable<GenesisData["report"]>;
type Decision = NonNullable<Report["decision"]>;
type SourceKind = Source["kind"];

const sourceKinds: { value: SourceKind; label: string; hint: string }[] = [
  { value: "read", label: "Read", hint: "an article, paper or page" },
  { value: "interview", label: "Interview", hint: "a conversation with someone" },
  { value: "tried", label: "Tried", hint: "something you used or tested" },
  { value: "brief", label: "Brief", hint: "a summary written for you" },
];
const lines = (value: string) => value.split("\n").map(item => item.trim()).filter(Boolean);

/** Saves with a busy flag and the result as a toast. */
function useSave() {
  const { showToast } = useRitual();
  const [busy, setBusy] = useState(false);
  async function save(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try { await action(); showToast(success); return true; }
    catch (caught) { showToast(readableError(caught), "alert"); return false; }
    finally { setBusy(false); }
  }
  return { busy, save };
}

/** Marks a record an assistant added through MCP; "app" means you added it here. */
function McpBadge({ by }: { by: string }) {
  if (by === "app") return null;
  return <span className="i-mcp" title={`Added by ${by} through MCP`}><span aria-hidden="true">MCP</span><span className="sr-only">added by {by} through MCP</span></span>;
}

function Genesis({ ideaId }: { ideaId: Id<"ideas"> }) {
  const genesis = useQuery(api.genesis.forIdea, { ideaId });
  if (genesis === undefined) return <Skeleton label="Loading research, report and decision…" className="i-genesis">
    {[0, 1, 2].map(n => <div key={n} className="r-card skel-full"><Bone w={90} h={10} i={n} /><Bone w="54%" h={22} i={n + 1} className="bone-title" /><Bone w="80%" h={12} i={n + 2} /></div>)}
  </Skeleton>;
  if (genesis === null) return null;
  return <div className="i-genesis">
    <Research ideaId={ideaId} threads={genesis.research} />
    <ReportSection ideaId={ideaId} report={genesis.report} />
    <DecisionSection ideaId={ideaId} decision={genesis.report?.decision ?? null} />
  </div>;
}

// ---------- Research ----------

function Research({ ideaId, threads }: { ideaId: Id<"ideas">; threads: Thread[] }) {
  const addResearch = useMutation(api.genesis.addResearch);
  const { busy, save } = useSave();
  const [adding, setAdding] = useState(false);
  const sources = threads.reduce((n, thread) => n + thread.sources.length, 0);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = field(data, "title");
    if (await save(() => addResearch({ ideaId, title, summary: field(data, "summary") }), `Research thread “${title}” added.`)) setAdding(false);
  }

  return <section className="r-card lilac i-section" aria-labelledby="research-heading">
    <div className="r-row r-between i-section-head">
      <div><div className="r-eyebrow lilac">Research</div><h2 id="research-heading" className="i-section-title">What you <em className="lilac">looked into.</em></h2></div>
      {threads.length > 0 && <span className="i-section-count">{plural(threads.length, "thread")} · {plural(sources, "source")}</span>}
    </div>
    {threads.length === 0 && !adding && <p className="r-body i-muted">No research yet. A thread is one question you looked into, with the sources behind it: what you read, who you asked, what you tried.</p>}
    {threads.length > 0 && <ul className="i-threads">{threads.map(thread => <li key={thread.id}><ResearchThread thread={thread} /></li>)}</ul>}
    {adding ? <form className="i-form i-inline" onSubmit={event => void add(event)} aria-label="Add a research thread">
      <fieldset className="i-fields" disabled={busy}><legend className="sr-only">New research thread</legend>
        <label className="r-field">Thread<input ref={focusHeading} className="r-input" name="title" required maxLength={120} placeholder="Why do evening plans fail?" /></label>
        <label className="r-field">Summary · optional<textarea className="r-textarea" name="summary" rows={2} maxLength={2000} /></label>
        <div className="r-row" style={{ gap: 8 }}>
          <button type="submit" className="r-btn sm">{busy ? "Adding…" : "Add thread"}</button>
          <button type="button" className="r-ghost sm" onClick={() => setAdding(false)}>Cancel</button>
        </div>
      </fieldset>
    </form> : <button type="button" className="r-ghost xs lilac i-add" onClick={() => setAdding(true)}>+ Add a research thread</button>}
  </section>;
}

function ResearchThread({ thread }: { thread: Thread }) {
  const updateResearch = useMutation(api.genesis.updateResearch);
  const removeResearch = useMutation(api.genesis.removeResearch);
  const addSource = useMutation(api.genesis.addSource);
  const removeSource = useMutation(api.genesis.removeSource);
  const { busy, save } = useSave();
  const [mode, setMode] = useState<"view" | "rename" | "remove" | "source">("view");
  const [kind, setKind] = useState<SourceKind>("read");

  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (await save(() => updateResearch({ researchId: thread.id, title: field(data, "title"), summary: field(data, "summary") }), "Thread saved.")) setMode("view");
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const url = field(data, "url");
    if (await save(() => addSource({ researchId: thread.id, title: field(data, "title"), kind, ...(url ? { url } : {}) }), "Source added.")) { setMode("view"); setKind("read"); }
  }

  return <article className="i-thread" aria-labelledby={`thread-${thread.id}`}>
    {mode === "rename" ? <form className="i-form" onSubmit={event => void rename(event)} aria-label={`Rename ${thread.title}`}>
      <fieldset className="i-fields" disabled={busy}><legend className="sr-only">Rename the thread</legend>
        <label className="r-field">Thread<input ref={focusHeading} className="r-input" name="title" required maxLength={120} defaultValue={thread.title} /></label>
        <label className="r-field">Summary · optional<textarea className="r-textarea" name="summary" rows={2} maxLength={2000} defaultValue={thread.summary} /></label>
        <div className="r-row" style={{ gap: 8 }}>
          <button type="submit" className="r-btn sm">{busy ? "Saving…" : "Save thread"}</button>
          <button type="button" className="r-ghost sm" onClick={() => setMode("view")}>Cancel</button>
        </div>
      </fieldset>
    </form> : <div>
      <h3 id={`thread-${thread.id}`} className="i-thread-title">{thread.title}<McpBadge by={thread.source} /></h3>
      {thread.summary && <p className="i-thread-summary">{thread.summary}</p>}
    </div>}
    {thread.sources.length > 0 ? <ul className="i-sources" aria-label={`Sources for ${thread.title}`}>{thread.sources.map((source, index) => <li key={`${source.at}-${index}`} className="i-source">
      <span className={`i-kind k-${source.kind}`}>{source.kind}</span>
      <span className="i-source-title">{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a> : source.title}<McpBadge by={source.by} /></span>
      <button type="button" className="i-x" disabled={busy} aria-label={`Remove source “${source.title}”`} title="Remove source"
        onClick={() => void save(() => removeSource({ researchId: thread.id, index }), `Removed “${source.title}”.`)}>×</button>
    </li>)}</ul> : <p className="r-small">No sources yet.</p>}
    {mode === "source" && <form className="i-form i-inline" onSubmit={event => void add(event)} aria-label={`Add a source to ${thread.title}`}>
      <fieldset className="i-fields" disabled={busy}><legend className="sr-only">New source</legend>
        <label className="r-field">Source<input ref={focusHeading} className="r-input" name="title" required maxLength={200} placeholder="What it is, in a few words" /></label>
        <label className="r-field">Link · optional<input className="r-input" name="url" type="url" inputMode="url" maxLength={2000} placeholder="https://…" /></label>
        <div><div className="r-label" id={`kind-${thread.id}`} style={{ marginBottom: 8 }}>Kind</div>
          <div className="r-row i-chips" role="radiogroup" aria-labelledby={`kind-${thread.id}`} onKeyDown={radioKeys}>{sourceKinds.map(item => <button key={item.value} type="button" role="radio" aria-checked={kind === item.value} tabIndex={kind === item.value ? 0 : -1} title={item.hint} className="r-chip round h34" onClick={() => setKind(item.value)}>{item.label}</button>)}</div>
          <p className="r-small" style={{ marginTop: 6 }}>{sourceKinds.find(item => item.value === kind)?.label}: {sourceKinds.find(item => item.value === kind)?.hint}.</p>
        </div>
        <div className="r-row" style={{ gap: 8 }}>
          <button type="submit" className="r-btn sm">{busy ? "Adding…" : "Add source"}</button>
          <button type="button" className="r-ghost sm" onClick={() => setMode("view")}>Cancel</button>
        </div>
      </fieldset>
    </form>}
    {mode === "remove" ? <div className="r-inset i-confirm" role="group" aria-label={`Confirm removing ${thread.title}`}>
      <p className="r-body">Remove this thread and its {plural(thread.sources.length, "source")}? This can’t be undone.</p>
      <div className="r-row" style={{ gap: 8 }}>
        <button type="button" className="r-ghost red" disabled={busy} onClick={() => void save(() => removeResearch({ researchId: thread.id }), `Removed the thread “${thread.title}”.`)}>Remove</button>
        <button type="button" className="r-ghost xs" ref={focusHeading} onClick={() => setMode("view")}>Keep it</button>
      </div>
    </div> : mode === "view" && <div className="r-row i-tools" role="group" aria-label={`Actions for ${thread.title}`}>
      <button type="button" className="r-ghost xs" onClick={() => setMode("source")}>+ Add source</button>
      <button type="button" className="r-ghost xs" onClick={() => setMode("rename")}>Rename</button>
      <button type="button" className="r-ghost xs" onClick={() => setMode("remove")}>Remove thread</button>
    </div>}
  </article>;
}

// ---------- Report ----------

type FindingRow = { key: string; text: string; basis: string };

function ReportSection({ ideaId, report }: { ideaId: Id<"ideas">; report: Report | null }) {
  const removeReport = useMutation(api.genesis.removeReport);
  const { busy, save } = useSave();
  const [mode, setMode] = useState<"view" | "edit" | "remove">("view");

  return <section className="r-card i-section" aria-labelledby="report-heading">
    <div className="r-row r-between i-section-head">
      <div><div className="r-eyebrow lilac">Report</div><h2 id="report-heading" className="i-section-title">What it <em className="lilac">found.</em></h2></div>
      {report && <span className="i-section-count">Written {formatDay(report.writtenAt)}<McpBadge by={report.source} /></span>}
    </div>
    {mode === "edit" ? <ReportForm ideaId={ideaId} report={report} onDone={() => setMode("view")} />
      : report ? <>
        <div>
          <h3 className="i-report-title">{report.title}</h3>
          {report.summary && <p className="i-thread-summary">{report.summary}</p>}
        </div>
        {report.findings.length > 0 ? <ol className="i-findings">{report.findings.map((finding, index) => <li key={index}>
          <span className="i-finding-text">{finding.text}</span>
          {finding.basis && <span className="r-small">Based on {finding.basis}</span>}
        </li>)}</ol> : <p className="r-small">No findings written yet.</p>}
        {mode === "remove" ? <div className="r-inset i-confirm" role="group" aria-label="Confirm removing the report">
          <p className="r-body">Remove the report? Its findings{report.decision ? " and the decision saved with it" : ""} go too. This can’t be undone.</p>
          <div className="r-row" style={{ gap: 8 }}>
            <button type="button" className="r-ghost red" disabled={busy} onClick={() => void save(() => removeReport({ reportId: report.id }), "Report removed.").then(ok => { if (ok) setMode("view"); })}>Remove</button>
            <button type="button" className="r-ghost xs" ref={focusHeading} onClick={() => setMode("view")}>Keep it</button>
          </div>
        </div> : <div className="r-row i-tools">
          <button type="button" className="r-ghost xs" onClick={() => setMode("edit")}>Edit report</button>
          <button type="button" className="r-ghost xs" onClick={() => setMode("remove")}>Remove report</button>
        </div>}
      </> : <>
        <p className="r-body i-muted">No report yet. When the research settles, write down what it found, and what each finding rests on.</p>
        <button type="button" className="r-ghost xs lilac i-add" onClick={() => setMode("edit")}>Write the report</button>
      </>}
  </section>;
}

function ReportForm({ ideaId, report, onDone }: { ideaId: Id<"ideas">; report: Report | null; onDone: () => void }) {
  const saveReport = useMutation(api.genesis.saveReport);
  const { busy, save } = useSave();
  const [rows, setRows] = useState<FindingRow[]>(() => {
    const start = report?.findings.length ? report.findings : [{ text: "", basis: "" }];
    return start.map((finding, index) => ({ key: `f${index}`, text: finding.text, basis: finding.basis ?? "" }));
  });
  const [nextKey, setNextKey] = useState(rows.length);
  const change = (key: string, patch: Partial<FindingRow>) => setRows(current => current.map(row => row.key === key ? { ...row, ...patch } : row));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const findings = rows.filter(row => row.text.trim()).map(row => ({ text: row.text.trim(), ...(row.basis.trim() ? { basis: row.basis.trim() } : {}) }));
    if (await save(() => saveReport({ ideaId, title: field(data, "title"), summary: field(data, "summary"), findings }), "Report saved.")) onDone();
  }

  return <form className="i-form" onSubmit={event => void submit(event)} aria-label="The report">
    <fieldset className="i-fields" disabled={busy}><legend className="sr-only">Report</legend>
      <label className="r-field">Report title<input ref={focusHeading} className="r-input" name="title" required maxLength={160} defaultValue={report?.title} placeholder="Why evenings fail" /></label>
      <label className="r-field">Summary · optional<textarea className="r-textarea" name="summary" rows={3} maxLength={4000} defaultValue={report?.summary} /></label>
      <fieldset className="i-group"><legend className="r-label">Findings · up to 20, empty ones are skipped</legend>
        <ol className="i-finding-rows">{rows.map((row, index) => <li key={row.key} className="i-finding-row">
          <label className="r-field">Finding {index + 1}<input className="r-input" value={row.text} maxLength={600} onChange={event => change(row.key, { text: event.target.value })} /></label>
          <label className="r-field">Based on · optional<input className="r-input" value={row.basis} maxLength={200} placeholder="Which source or thread" onChange={event => change(row.key, { basis: event.target.value })} /></label>
          <button type="button" className="i-x" aria-label={`Remove finding ${index + 1}`} title="Remove finding" onClick={() => setRows(current => current.filter(item => item.key !== row.key))}>×</button>
        </li>)}</ol>
        <button type="button" className="r-link" style={{ marginTop: 8 }} disabled={rows.length >= 20} onClick={() => { setRows(current => [...current, { key: `f${nextKey}`, text: "", basis: "" }]); setNextKey(nextKey + 1); }}>+ Add a finding</button>
      </fieldset>
      <div className="r-row" style={{ gap: 8 }}>
        <button type="submit" className="r-btn sm">{busy ? "Saving…" : "Save report"}</button>
        <button type="button" className="r-ghost sm" onClick={onDone}>Cancel</button>
      </div>
    </fieldset>
  </form>;
}

// ---------- Decision ----------

function DecisionSection({ ideaId, decision }: { ideaId: Id<"ideas">; decision: Decision | null }) {
  const setDecision = useMutation(api.genesis.setDecision);
  const { busy, save } = useSave();
  const [editing, setEditing] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const values = { ideaId, verdict: field(data, "verdict"), rule: field(data, "rule"), kept: lines(field(data, "kept")), dropped: lines(field(data, "dropped")) };
    if (await save(() => setDecision(values), "Decision saved.")) setEditing(false);
  }

  return <section className="r-card mint i-section" aria-labelledby="decision-heading">
    <div className="r-row r-between i-section-head">
      <div><div className="r-eyebrow mint">Decision</div><h2 id="decision-heading" className="i-section-title">What you <em className="mint">decided.</em></h2></div>
      {decision && <span className="i-section-count">Decided {formatDay(decision.at)}</span>}
    </div>
    {editing ? <form className="i-form" onSubmit={event => void submit(event)} aria-label="The decision">
      <fieldset className="i-fields" disabled={busy}><legend className="sr-only">Decision</legend>
        <label className="r-field">Verdict<input ref={focusHeading} className="r-input" name="verdict" required maxLength={200} defaultValue={decision?.verdict} placeholder="Build it, with one rule" /></label>
        <label className="r-field">The rule · optional<textarea className="r-textarea" name="rule" rows={2} maxLength={600} defaultValue={decision?.rule} placeholder="The one thing it must always do" /></label>
        <div className="i-pair">
          <label className="r-field">Kept · one per line<textarea className="r-textarea" name="kept" rows={4} defaultValue={decision?.kept.join("\n")} /></label>
          <label className="r-field">Dropped · one per line<textarea className="r-textarea" name="dropped" rows={4} defaultValue={decision?.dropped.join("\n")} /></label>
        </div>
        <p className="r-small">Up to 12 short items in each list.{decision ? "" : " Without a report yet, saving starts one named after the verdict."}</p>
        <div className="r-row" style={{ gap: 8 }}>
          <button type="submit" className="r-btn sm mint">{busy ? "Saving…" : "Save decision"}</button>
          <button type="button" className="r-ghost sm" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </fieldset>
    </form> : decision ? <>
      <p className="i-verdict">{decision.verdict}</p>
      {decision.rule && <div className="r-inset"><div className="r-eyebrow-sm">The rule</div><div className="r-body" style={{ marginTop: 4 }}>{decision.rule}</div></div>}
      {(decision.kept.length > 0 || decision.dropped.length > 0) && <div className="i-pair">
        <div><div className="r-eyebrow-sm i-kept-label">Kept</div>{decision.kept.length ? <ul className="i-keep">{decision.kept.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="r-small">Nothing listed.</p>}</div>
        <div><div className="r-eyebrow-sm">Dropped</div>{decision.dropped.length ? <ul className="i-keep dropped">{decision.dropped.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="r-small">Nothing listed.</p>}</div>
      </div>}
      <div className="r-row i-tools"><button type="button" className="r-ghost xs" onClick={() => setEditing(true)}>Edit decision</button></div>
    </> : <>
      <p className="r-body i-muted">No decision yet. When the research and report point one way, record the verdict, the rule it comes with, and what you kept and dropped.</p>
      <button type="button" className="r-ghost xs i-add" onClick={() => setEditing(true)}>Record the decision</button>
    </>}
  </section>;
}

/** "What's the first ready step?" One Ready task in Work, linked to the idea. */
function Activate({ idea, onBack, onAdded }: { idea: Idea; onBack: () => void; onAdded: (newProject: boolean) => void }) {
  const activate = useMutation(api.ideas.activate);
  const projects = useQuery(api.projects.options, {});
  const [lane, setLane] = useState<Lane>(idea.lane);
  const [minutes, setMinutes] = useState(20);
  const [energy, setEnergy] = useState(2);
  const [project, setProject] = useState("");
  const [milestone, setMilestone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const chosen = projects?.find(item => item._id === project);
  const step = chosen?.milestones.find(item => item._id === milestone);
  const destination = project === "new" ? `A new project, “${idea.title}”, starts in Work with this task inside it.`
    : chosen ? `It joins ${chosen.title}${step ? ` · ${step.title}` : ""} in Work.` : "It goes to Work on its own, without a project.";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const smallerStep = field(data, "smallerStep"), smallerDone = field(data, "smallerDone"), smallerMinutes = field(data, "smallerMinutes");
    setBusy(true); setError("");
    try {
      await activate({
        ideaId: idea._id, title: field(data, "title"), minutes, energy, doneWhen: field(data, "doneWhen"), lane,
        ...(smallerStep ? { smallerStep } : {}), ...(smallerDone ? { smallerDone } : {}), ...(smallerMinutes ? { smallerMinutes: Number(smallerMinutes) } : {}),
        ...(project === "new" ? { newProject: true } : chosen ? { projectId: chosen._id, ...(milestone ? { milestoneId: milestone as Id<"milestones"> } : {}) } : {}),
      });
      onAdded(project === "new");
    } catch (caught) { setError(readableError(caught, "Could not add it to Work. Please try again.")); setBusy(false); }
  }

  return <form className="r-col r-rise-6 i-flow" onSubmit={event => void submit(event)} aria-busy={busy} aria-labelledby="activate-title">
    <button type="button" className="r-back" onClick={onBack}>‹ Brainstorm</button>
    <div>
      <div className="r-eyebrow lilac">Make active · {idea.title}</div>
      <h1 id="activate-title" className="i-title" ref={focusHeading} tabIndex={-1}>What&apos;s the first <em>ready</em> step?</h1>
    </div>
    <fieldset className="i-fields" disabled={busy}><legend className="sr-only">First task</legend>
      <div><div className="r-label" id="activate-lane" style={{ marginBottom: 8 }}>Lane</div>
        <div className="r-row i-chips" role="radiogroup" aria-labelledby="activate-lane" onKeyDown={radioKeys}>{lanes.map(item => <button key={item} type="button" role="radio" aria-checked={lane === item} className={`r-chip round h40 lane-${item}`} onClick={() => setLane(item)}><span className="r-dot" aria-hidden="true" />{item}</button>)}</div>
      </div>
      <label className="r-field">First task<input className="r-input" name="title" required maxLength={160} defaultValue={(idea.brainstorm.smallestBuild || `Explore ${idea.title}`).slice(0, 160)} /></label>
      <div><div className="r-label" id="activate-estimate" style={{ marginBottom: 8 }}>Estimate</div>
        <div className="r-row i-chips" role="radiogroup" aria-labelledby="activate-estimate" onKeyDown={radioKeys}>{estimates.map(value => <button key={value} type="button" role="radio" aria-checked={minutes === value} className="r-chip h40 mono" onClick={() => setMinutes(value)}>{value} min</button>)}</div>
      </div>
      <label className="r-field">Done when<input className="r-input" style={{ fontSize: 14 }} name="doneWhen" required maxLength={1000} placeholder="What does finished look like?" /></label>
      <details className="i-more">
        <summary>Project, energy and a smaller step · optional</summary>
        <div className="i-fields" style={{ paddingTop: 12 }}>
          <div><div className="r-label" id="activate-energy" style={{ marginBottom: 8 }}>Energy it needs</div>
            <div className="r-row i-chips" role="radiogroup" aria-labelledby="activate-energy" onKeyDown={radioKeys}>{energyNames.map((name, i) => <button key={name} type="button" role="radio" aria-checked={energy === i + 1} className="r-chip h40" onClick={() => setEnergy(i + 1)}>{name}</button>)}</div>
          </div>
          <div className="i-pair">
            <label className="r-field">Project<select className="r-input i-select" value={project} onChange={event => { setProject(event.target.value); setMilestone(""); }}>
              <option value="">No project</option>
              <option value="new">Start a new project from this idea</option>
              {projects?.filter(item => item.status === "Active").map((item: ProjectOption) => <option key={item._id} value={item._id}>{item.title}</option>)}
            </select></label>
            <label className="r-field">Milestone<select className="r-input i-select" value={milestone} onChange={event => setMilestone(event.target.value)} disabled={!chosen?.milestones.length}>
              <option value="">{chosen?.milestones.length ? "No milestone" : "No milestones to choose"}</option>
              {chosen?.milestones.map(item => <option key={item._id} value={item._id}>{item.title}</option>)}
            </select></label>
          </div>
          <p className="r-inset r-small" aria-live="polite" style={{ color: "var(--r-text)" }}><span className="r-eyebrow-sm" style={{ display: "block", marginBottom: 3 }}>Where it goes</span>{projects === undefined ? <><span className="sr-only">Loading your projects…</span><Bone w={180} h={10} className="bone-inline" /></> : destination}</p>
          <p className="r-small">A smaller step is a short version for low-energy evenings. Define all three, or leave them empty.</p>
          <label className="r-field">Smaller action<input className="r-input" name="smallerStep" maxLength={1000} /></label>
          <div className="i-pair">
            <label className="r-field">Smaller minutes<input className="r-input mono" name="smallerMinutes" type="number" min="5" max="240" step="1" /></label>
            <label className="r-field">Smaller step done when<input className="r-input" name="smallerDone" maxLength={1000} /></label>
          </div>
        </div>
      </details>
      {error && <p role="alert" className="r-small" style={{ color: "var(--r-red-pale)" }}>{error}</p>}
      <button type="submit" className="r-btn block" style={{ marginTop: 4 }}>{busy ? "Adding…" : "Add to Work as Ready"}</button>
    </fieldset>
  </form>;
}

function Added({ projectTitle, onToday, onWork }: { projectTitle: string | null; onToday: () => void; onWork: () => void }) {
  return <div className="r-rise-6 i-added">
    <span className="i-medallion" aria-hidden="true"><span /></span>
    <h1 className="i-added-title" ref={focusHeading} tabIndex={-1}>It&apos;s in Work, <em>ready.</em></h1>
    <p className="i-added-text">{projectTitle ? `It starts a new project, “${projectTitle}”. ` : ""}Today can suggest it when it fits your time and energy. Nothing is due, and the brainstorm stays linked.</p>
    <div className="r-row i-added-actions">
      <button type="button" className="r-btn md" style={{ boxShadow: "none" }} onClick={onToday}>Back to Today</button>
      <button type="button" className="r-ghost" onClick={onWork}>Open Work</button>
    </div>
  </div>;
}

// ---------- Skeletons: the same shapes as the real layout ----------

function GridSkeleton() {
  return <Skeleton label="Loading your ideas…" className="i-grid"><GridBones /></Skeleton>;
}

function GridBones() {
  return <>
    {Array.from({ length: 4 }, (_, n) => <div key={n} className="i-card i-card-bones" aria-hidden="true">
      <Bone w={78} h={24} shape="pill" i={n * 2} />
      <span className="skel-full"><Bone w="78%" h={22} i={n * 2 + 1} className="bone-title" /><Bone w="48%" h={10} i={n * 2 + 2} /></span>
    </div>)}
  </>;
}

function IdeasSkeleton() {
  return <Skeleton label="Loading your ideas…" className="r-wide i-list">
    <span className="skel-full" aria-hidden="true"><Bone w={56} h={11} /><Bone w="52%" h={46} i={1} className="bone-title" /></span>
    <span className="r-row i-capture-row" aria-hidden="true"><Bone w="100%" h={54} shape="pill" i={2} className="i-bone-grow" /><Bone w={230} h={54} shape="pill" i={3} /></span>
    <div className="i-grid"><GridBones /></div>
  </Skeleton>;
}

function IdeaSkeleton() {
  return <Skeleton label="Opening the idea…" className="r-wide i-flow">
    <Bone w={78} h={36} shape="pill" />
    <span className="skel-full"><Bone w={220} h={11} i={1} /><Bone w="58%" h={44} i={2} className="bone-title" /></span>
    <div className="i-brain">
      <div className="i-notes skel-full"><Bone w={130} h={10} i={3} /><Bone i={4} /><Bone i={5} /><Bone w="70%" i={6} /></div>
      <div className="i-facts">{[0, 1, 2].map(n => <div key={n} className={`i-fact skel-full${n === 2 ? " dashed" : ""}`}><Bone w={120} h={11} i={4 + n} /><Bone w="86%" h={13} i={5 + n} /></div>)}</div>
    </div>
    <span className="r-row i-actions"><Bone w={150} h={52} shape="pill" i={7} /><Bone w={150} h={52} shape="pill" i={8} /></span>
  </Skeleton>;
}
