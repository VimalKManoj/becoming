"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type CSSProperties } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { authClient } from "@/lib/auth-client";
import { readableError } from "@/lib/errors";
import { dateLine, daysBetween, greeting, lastWorked, sessionLine } from "@/lib/ritual";
import { useNow } from "@/lib/use-rhythm";
import { useRitual } from "@/components/ritual/ritual-context";
import { radioKeys } from "@/components/ritual/radio-keys";
import { WeekDots, useWeek, type WeekSummary } from "@/components/ritual/week";
import { Bone, Skeleton, TodaySkeleton } from "@/components/skeleton";
import { Onboarding } from "@/components/today/onboarding";
import { DoneForm } from "@/components/task-forms";
import { InboxCard } from "@/components/today/inbox-card";
import { FocusOverlay, RecapOverlay, RewardOverlay, type Saved } from "@/components/today/session";

// Today, as the owner's Ritual design: a greeting and one question, "What's on your mind
// tonight?", a ten-second check-in, then one clear focus. After the session: the recap,
// the bloom growing, and a calm "Tonight is done." Every number comes from your records.

type Overview = FunctionReturnType<typeof api.tasks.todayOverview>;
type Choice = Overview["choices"][number];
type Project = FunctionReturnType<typeof api.projects.list>[number];
type Screen = "open" | "which" | "check" | "plan";
type Intent = "build" | "small" | "write" | "publish" | "resume";
type Capacity = { minutes: number; energy: number };

const minuteChoices = [15, 30, 45, 60, 90];
const energyNames = ["Low", "Steady", "High"];
const intentLabels: Record<Intent, string> = { build: "Build", small: "Small piece", write: "Write", publish: "Publish", resume: "Pick up" };
const questions = ["What would make tonight feel worth it?", "What's one small thing you could finish tonight?", "What did last time teach you?"];
const laneColour = (lane: string) => ({ "--dot": lane === "Showcases" ? "#86E3C3" : lane === "Writing" ? "#C9B8F0" : "#FF8A3D" }) as CSSProperties;

// Tonight's time and energy, and whether tonight is done, live in this tab only.
const capacityKey = "becoming.today.capacity", doneKey = "becoming.today.done";
function readCapacity(): Capacity {
  try {
    const stored = JSON.parse(sessionStorage.getItem(capacityKey) ?? "null") as Partial<Capacity> | null;
    if (stored && minuteChoices.includes(stored.minutes ?? 0) && [1, 2, 3].includes(stored.energy ?? 0)) return { minutes: stored.minutes!, energy: stored.energy! };
  } catch { /* Defaults below. */ }
  return { minutes: 45, energy: 2 };
}
const remember = (key: string, value: string | null) => { try { if (value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, value); } catch { /* Optional. */ } };
const recall = (key: string) => { try { return sessionStorage.getItem(key); } catch { return null; } };

// Convex answers undefined while new arguments load; keep the last answer on screen.
function useSettled<T>(value: T | undefined) {
  const [settled, setSettled] = useState(value);
  if (value !== undefined && value !== settled) setSettled(value);
  return value ?? settled;
}

export function CloudTodayScreen() {
  return <Suspense fallback={<TodaySkeleton />}><Today /></Suspense>;
}

function Today() {
  const router = useRouter();
  const params = useSearchParams();
  const { openCapture, openNewProject, showToast } = useRitual();
  const now = useNow();
  const { data: auth } = authClient.useSession();
  const profile = useQuery(api.settings.getProfile);
  const weekData = useWeek();
  const projects = useQuery(api.projects.list, {});
  const pipeline = useQuery(api.proof.pipeline);
  const startSession = useMutation(api.tasks.startSession);

  const [capacity, setCapacity] = useState(readCapacity);
  const [screen, setScreen] = useState<Screen>("open");
  const [intent, setIntent] = useState<Intent | null>(null);
  const [projectId, setProjectId] = useState<Id<"projects"> | null>(null);
  const [resumeId, setResumeId] = useState<Id<"tasks"> | null>(null);
  const [chosenId, setChosenId] = useState<Id<"tasks"> | null>(null);
  const [recapping, setRecapping] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [doneDay, setDoneDay] = useState(() => recall(doneKey));
  const [prompt, setPrompt] = useState(0);
  const [skipOnboarding, setSkipOnboarding] = useState(false);
  const [busy, setBusy] = useState(false);

  // Links such as /today?intent=build&project=… (from Work or a new project) open the check-in.
  const address = params.toString();
  const [handled, setHandled] = useState("");
  if (address !== handled) {
    setHandled(address);
    const wanted = params.get("intent"), task = params.get("task");
    if (task) { setIntent("resume"); setResumeId(task as Id<"tasks">); setChosenId(null); setScreen("check"); }
    else if (wanted === "build" || wanted === "small" || wanted === "write") {
      setIntent(wanted); setProjectId((params.get("project") as Id<"projects"> | null) ?? null); setChosenId(null); setScreen("check");
    }
  }

  // A project id from a link counts only once it's one of your projects.
  const knownProject = projectId && projects?.some(project => project._id === projectId) ? projectId : null;
  // The scope applies from the moment you pick an intent, so tonight's focus is already
  // loaded (and follows your time and energy) by the time you press "Show my focus".
  const scope = !intent ? {}
    : intent === "build" ? (knownProject ? { projectId: knownProject } : { lane: "Projects" as const })
      : intent === "small" ? { lane: "Showcases" as const }
        : intent === "write" ? { lane: "Writing" as const }
          : intent === "resume" && resumeId ? { taskId: resumeId } : {};
  const currentWeek = weekData?.week.currentWeek;
  const live = useQuery(api.tasks.todayOverview, { ...capacity, ...scope, ...(currentWeek ? { week: currentWeek } : {}) });
  const overview = useSettled(live);
  // While a new answer loads, the plan shows a placeholder rather than the previous card.
  const stale = live === undefined;

  if (overview === undefined || profile === undefined || weekData === undefined || now === null) return <TodaySkeleton />;
  const { rhythm, week } = weekData;

  // ----- Full-screen moments come first -----
  if (saved) return <RewardOverlay saved={saved} rhythm={rhythm} week={week} onProof={() => { setSaved(null); router.push("/journey?tab=proof"); }}
    onDone={() => { setSaved(null); setDoneDay(rhythm.today); remember(doneKey, rhythm.today); setScreen("open"); setIntent(null); }} />;
  if (overview.active) return recapping
    ? <RecapOverlay active={overview.active} onBack={() => setRecapping(false)} onSaved={value => { setRecapping(false); setSaved(value); setChosenId(null); }} />
    : <FocusOverlay active={overview.active} quotesOn={profile?.focusQuotes ?? true} musicOn={profile?.focusMusic ?? true} onFinish={() => setRecapping(true)} />;
  const onboarding = profile?.needsOnboarding && !skipOnboarding ? <Onboarding onClose={() => setSkipOnboarding(true)} /> : null;

  function setCap(next: Partial<Capacity>) {
    const value = { ...capacity, ...next };
    setCapacity(value); remember(capacityKey, JSON.stringify(value));
  }

  function go(next: Intent | "idea" | "reflect") {
    if (next === "idea") return openCapture("idea");
    if (next === "reflect") return router.push("/journey?view=review");
    setIntent(next); setChosenId(null);
    if (next === "build") { setProjectId(null); setScreen("which"); return; }
    setScreen(next === "publish" ? "plan" : "check");
  }

  async function start(choice: Choice) {
    setBusy(true);
    try { await startSession({ taskId: choice.taskId, smaller: choice.smaller, recommended: !chosenId }); }
    catch (caught) { showToast(readableError(caught, "Could not start the session. Please try again."), "alert"); }
    finally { setBusy(false); }
  }

  // ----- Tonight is done -----
  const lastSession = overview.lastSession;
  if (screen === "open" && doneDay === rhythm.today && lastSession && daysBetween(lastSession.endedAt, now) === 0) return <>
    {onboarding}
    <div className="r-col r-rise" style={{ gap: 22, paddingTop: "clamp(8px,6cqi,64px)" }}>
      <div><div className="r-date">{dateLine(now)}</div><h1 className="r-greet">Tonight is <em>done.</em></h1></div>
      <div className="t-done-card"><span className="t-check" aria-hidden="true">✓</span><div style={{ minWidth: 0 }}><div style={{ font: "500 15px/1.3 var(--r-sans)" }}>{lastSession.title}</div><div className="r-small" style={{ marginTop: 3 }}>{lastSession.lane} · {lastSession.outcome} · saved to Journey</div></div></div>
      <div className="r-row" style={{ gap: 12, padding: "0 4px" }}><WeekDots days={week.days} size={24} /><span className="r-body" style={{ fontSize: 13.5, color: "var(--r-text)" }}>{week.line}</span></div>
      <p className="r-body" style={{ fontSize: 15, lineHeight: 1.5, color: "var(--r-text)" }}>Rest well. If something&apos;s still buzzing:</p>
      <div className="r-row" style={{ gap: 8 }}>
        <button type="button" className="r-ghost sm lilac" onClick={() => openCapture("idea")}>Catch an idea</button>
        <button type="button" className="r-ghost sm" onClick={() => { setDoneDay(null); remember(doneKey, null); setCap({ minutes: 15 }); setScreen("open"); }}>15 more minutes</button>
        <Link className="r-ghost sm" href="/journey">See my bloom</Link>
      </div>
    </div>
  </>;

  const name = auth?.user.name ?? null;
  const daysAway = lastSession ? daysBetween(lastSession.endedAt, now) : 0;
  const suggestedProject = projects?.find(project => project._id === overview.choices[0]?.projectId) ?? projects?.[0];

  // ----- Which project -----
  if (screen === "which") return <>{onboarding}<div className="r-col r-top r-rise-6" style={{ gap: 20 }}>
    <button type="button" className="r-back" onClick={() => setScreen("open")}>‹ Build</button>
    <h1 className="r-title-xl">Which project <em>tonight?</em></h1>
    <div className="r-stack" style={{ gap: 10 }}>
      {projects?.length === 0 && <p className="r-lede" style={{ margin: "0 2px 4px" }}>No projects yet. Start one below: a name, why it matters and one first step.</p>}
      {(projects ?? []).map(project => <ProjectChoice key={project._id} project={project} now={now} suggested={project._id === suggestedProject?._id && Boolean(overview.choices[0]?.projectId)}
        onChoose={() => { setProjectId(project._id); setScreen("check"); }} />)}
      <button type="button" className="t-new" onClick={openNewProject}>
        <span className="t-plus" aria-hidden="true">+</span>
        <span><span style={{ display: "block", font: "500 15px var(--r-sans)" }}>Start a new project</span><span className="r-small" style={{ display: "block", marginTop: 3 }}>A name, why it matters, one first step. About a minute.</span></span>
      </button>
      <button type="button" className="r-link" style={{ alignSelf: "flex-start", marginTop: 4 }} onClick={() => { setProjectId(null); setScreen("check"); }}>Or any Projects task →</button>
    </div>
  </div></>;

  // ----- Check-in -----
  if (screen === "check") return <>{onboarding}<div className="r-col r-top r-rise-6" style={{ gap: 24 }}>
    <button type="button" className="r-back" onClick={() => setScreen(intent === "build" ? "which" : "open")}>‹ {intent ? intentLabels[intent] : "Back"}</button>
    <h1 className="r-title-xl">How much do you have <em>tonight?</em></h1>
    <div className="t-mins" role="radiogroup" aria-label="Minutes tonight" onKeyDown={radioKeys}>
      {minuteChoices.map(value => <button key={value} type="button" role="radio" aria-checked={capacity.minutes === value} className="r-chip t-min" onClick={() => setCap({ minutes: value })}><span className="t-min-n">{value}</span><span className="t-min-u">min</span></button>)}
    </div>
    <div><div className="r-label" style={{ font: "500 13px var(--r-sans)", margin: "0 0 10px 2px" }}>And your energy?</div>
      <div className="t-energies" role="radiogroup" aria-label="Your energy" onKeyDown={radioKeys}>{energyNames.map((label, i) => <button key={label} type="button" role="radio" aria-checked={capacity.energy === i + 1} className="r-chip t-energy" onClick={() => setCap({ energy: i + 1 })}><Bars level={i} />{label}</button>)}</div>
    </div>
    <button type="button" className="r-btn lg" onClick={() => { setChosenId(null); setScreen("plan"); }}>Show my focus →</button>
    <p className="r-small" style={{ textAlign: "center" }}>Only shapes tonight&apos;s suggestion. Nothing is saved.</p>
  </div></>;

  // ----- Plan -----
  if (screen === "plan") {
    const pool = [...overview.choices, ...overview.alternatives];
    const chosen = chosenId ? pool.find(choice => choice.taskId === chosenId) : undefined;
    const focus = intent === "publish" ? undefined : chosen ?? overview.choices[0];
    const alternatives = (chosen ? [overview.choices[0], ...overview.alternatives] : overview.alternatives).filter((item): item is Choice => Boolean(item) && item.taskId !== focus?.taskId).slice(0, 2);
    const ready = pipeline?.next?.status === "Ready to share" ? pipeline.next : null;
    return <>{onboarding}
      <div className="r-col r-rise" style={{ marginBottom: 16, paddingTop: "clamp(4px,3cqi,28px)", flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10, animationDuration: ".5s" }}>
        <button type="button" className="r-back" onClick={() => setScreen("open")}>‹ Change</button>
        <span className="r-eyebrow" style={{ letterSpacing: ".1em" }}>{intent ? intentLabels[intent] : "Tonight"} · {capacity.minutes} min · {energyNames[capacity.energy - 1]} energy</span>
      </div>
      <div className="r-col" style={{ gap: 12, marginTop: 16 }}>
        {intent === "build" && (projects?.length ?? 0) > 0 && <div className="r-row r-rise" style={{ gap: 6, animationDuration: ".5s" }}>
          <span className="r-small" style={{ fontWeight: 500, marginRight: 4 }}>Working on</span>
          {projects!.map(project => <button key={project._id} type="button" className="r-chip round h34" style={{ ...laneColour(project.lane ?? "Projects"), fontSize: 12.5 }} aria-pressed={knownProject === project._id} onClick={() => { setProjectId(projectId === project._id ? null : project._id); setChosenId(null); }}><span className="r-dot" style={{ width: 6, height: 6 }} />{project.title}</button>)}
          <button type="button" className="r-chip round h34" style={{ background: "transparent", color: "var(--r-ember-pale)", border: "1px dashed rgba(255,170,110,.45)", fontSize: 12.5 }} onClick={openNewProject}>+ New project</button>
        </div>}
        {intent === "publish"
          ? ready ? <PublishCard title={ready.title} onStart={() => router.push(`/journey?tab=proof&publish=${ready._id}`)} /> : <NothingCard title="Nothing is ready to share yet." text="Evidence from your recaps arrives in Proof as drafts. Mark one ready to share, then publish it here." onBack={() => setScreen("open")} />
          : stale ? <FocusBones />
          : focus ? <FocusCard focus={focus} chosen={Boolean(chosen)} busy={busy || stale} onStart={() => void start(focus)} />
            : <NothingCard title={overview.state === "first-run" ? "Nothing's ready yet." : "Nothing fits tonight."} onBack={() => setScreen("check")} onAdd={() => openCapture("task")}
              text={overview.state === "first-run" ? "I won't invent work for you. Add a first task, or start a project." : intent === "resume" ? "That task isn't open any more, or doesn't fit this time and energy. Try more minutes, or choose something else." : intent === "build" && knownProject ? "This project has nothing ready that fits this time and energy. Try more minutes, or add a smaller step." : "Nothing ready fits this time and energy. Try more minutes, a different energy, or add a task."} />}
        {intent !== "publish" && !stale && alternatives.length > 0 && <>
          <div className="r-eyebrow" style={{ margin: "8px 4px 0" }}>Or, explicitly</div>
          {alternatives.map(choice => <div key={choice.taskId} className="t-alt r-rise">
            <span className="r-dot" style={laneColour(choice.lane)} aria-hidden="true" />
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ font: "500 14.5px/1.3 var(--r-sans)" }}>{choice.title}</div><div className="r-small" style={{ fontSize: 12, marginTop: 3 }}>{choice.lane} · {choice.minutes} min · {energyNames[choice.energy - 1]}</div></div>
            <button type="button" className="r-ghost xs" style={{ background: "rgba(255,240,225,.08)" }} disabled={stale} onClick={() => { setChosenId(choice.taskId); showToast("Switched. You chose this one yourself."); }} aria-label={`Choose ${choice.title}`}>Choose</button>
          </div>)}
        </>}
      </div>
    </>;
  }

  // ----- Open -----
  const note = overview.intention ? { k: "A note from Sunday-you", t: overview.intention } : lastSession?.nextStep ? { k: "A note from last time", t: lastSession.nextStep } : null;
  const prompts = [
    { k: "A question for tonight", t: questions[0] },
    ...(overview.spark ? [{ k: "A spark from your ideas", t: overview.spark }] : []),
    ...(note ? [note] : []),
    { k: "A question for tonight", t: questions[1] }, { k: "A question for tonight", t: questions[2] },
  ];
  const shown = prompts[prompt % prompts.length];
  const intents: { id: Intent | "idea" | "reflect"; label: string; sub: string; colour: string }[] = [
    { id: "build", label: "Build", sub: daysAway >= 3 ? "Pick up where you stopped" : suggestedProject ? `Move ${suggestedProject.title} forward` : "Move a project forward", colour: "#FF8A3D" },
    { id: "small", label: "Small piece", sub: "A component or showcase", colour: "#86E3C3" },
    { id: "write", label: "Write", sub: "Draft a note or a post", colour: "#C9B8F0" },
    ...(overview.readyToShare > 0 ? [{ id: "publish" as const, label: "Publish", sub: `${overview.readyToShare} ${overview.readyToShare === 1 ? "thing is" : "things are"} ready to share`, colour: "#86E3C3" }] : []),
    { id: "idea", label: "Catch an idea", sub: "Get it out of your head", colour: "#C9B8F0" },
    { id: "reflect", label: "Reflect", sub: "Look back at your week", colour: "#E9DFD6" },
  ];
  return <>
    {onboarding}
    <div className="r-col r-top r-rise t-open">
      <div>
        <div className="r-date">{dateLine(now)}</div>
        <h1 className="r-greet">{greeting({ now, name, lastSessionAt: lastSession?.endedAt ?? null })}</h1>
        {profile?.motive && <p className="r-motive">{profile.motive}</p>}
      </div>
      <div className="t-prompt">
        <div className="r-row r-between" style={{ gap: 10 }}><span className="r-eyebrow-sm" style={{ color: "var(--r-lilac-text)" }}>{shown.k}</span><button type="button" className="t-another" onClick={() => setPrompt(prompt + 1)} aria-label="Show another prompt">Another ↻</button></div>
        <p key={prompt} className="t-prompt-text r-rise" aria-live="polite">{shown.t}</p>
      </div>
    </div>
    <InboxCard now={now} />
    {daysAway >= 3 && lastSession && <section className="r-col t-gap" aria-labelledby="gap-title">
      <div className="r-eyebrow-sm" style={{ color: "var(--r-ember-soft)" }}>{daysAway} days since your last session</div>
      <h2 id="gap-title" className="t-gap-title">Nothing piled up. Here&apos;s where you were.</h2>
      <div className="r-stack" style={{ gap: 8, marginTop: 14 }}>
        <div className="r-inset" style={{ fontSize: 14 }}><span className="r-eyebrow-sm" style={{ letterSpacing: ".1em" }}>{sessionLine(lastSession)}</span><div className="r-body" style={{ marginTop: 4 }}>{lastSession.contribution}</div></div>
        {lastSession.nextStep && <div className="r-dashed"><span className="r-eyebrow-sm" style={{ letterSpacing: ".1em" }}>Your next step</span><div className="r-body" style={{ marginTop: 4 }}>{lastSession.nextStep}</div></div>}
      </div>
      <div className="r-row" style={{ gap: 8, marginTop: 14 }}>
        {lastSession.outcome === "Made progress" && <button type="button" className="r-btn sm" onClick={() => { setIntent("resume"); setResumeId(lastSession.taskId); setChosenId(null); setScreen("check"); }}>Pick up here</button>}
        {lastSession.outcome === "Blocked" && <Link className="r-btn sm" href="/work?view=blocked">Unblock it in Work</Link>}
        <span className="r-small" style={{ fontSize: 13, padding: "0 6px" }}>{lastSession.outcome === "Finished" ? "It's finished. Choose what's next below." : "or choose something else below"}</span>
      </div>
    </section>}
    {week.isSunday && week.configured && <SundayCard week={week} />}
    <div className="r-col t-intents-wrap">
      <h2 className="r-label" style={{ font: "500 15px var(--r-sans)", color: "var(--r-ink-2)", margin: "0 0 12px 2px" }}>What&apos;s on your mind tonight?</h2>
      <div className="t-intents">{intents.map(item => <button key={item.id} type="button" className="r-tile t-intent" onClick={() => go(item.id)}>
        <span className="r-dot glow" style={{ "--dot": item.colour } as CSSProperties} aria-hidden="true" />
        <span><span className="t-intent-label">{item.label}</span><span className="t-intent-sub">{item.sub}</span></span>
      </button>)}</div>
      <Link href="/journey" className="t-weekbar"><WeekDots days={week.days} size={20} /><span style={{ font: "400 13px var(--r-sans)" }}>{week.line} →</span></Link>
    </div>
  </>;
}

function Bars({ level }: { level: number }) {
  return <span className="r-bars" aria-hidden="true">{[6, 9, 12].map((height, j) => <span key={height} style={{ height, opacity: j <= level ? 1 : 0.25 }} />)}</span>;
}

function ProjectChoice({ project, now, suggested, onChoose }: { project: Project; now: number; suggested: boolean; onChoose: () => void }) {
  const percent = project.progress.total ? Math.round((project.progress.done / project.progress.total) * 100) : 0;
  return <button type="button" className="t-project" style={laneColour(project.lane ?? "Projects")} onClick={onChoose}>
    <span className="r-row" style={{ gap: 10, width: "100%", flexWrap: "nowrap" }}><span className="r-dot" style={{ width: 9, height: 9 }} aria-hidden="true" /><span className="t-project-name">{project.title}</span>{suggested && <span className="r-badge">Suggested</span>}</span>
    <span style={{ font: "400 13.5px/1.4 var(--r-sans)", color: "var(--r-ink-2)" }}>{project.nextTask ? <>Next: {project.nextTask.title} <span style={{ color: "var(--r-muted)" }}>· {project.nextTask.minutes} min</span></> : <span style={{ color: "var(--r-muted)" }}>No ready step yet. Add one in Work.</span>}</span>
    <span className="r-row" style={{ gap: 12, width: "100%", flexWrap: "nowrap" }}>
      <span className="r-bar thin" style={{ flex: 1 }} role="img" aria-label={`${percent}% of tasks done`}><span style={{ width: `${percent}%` }} /></span>
      <span style={{ font: "500 11.5px var(--r-mono)", color: "var(--r-muted)" }}>{project.progress.done}/{project.progress.total}</span>
      <span className="r-small" style={{ fontSize: 12 }}>{lastWorked(project.lastWorkedAt, now)}</span>
    </span>
  </button>;
}

function FocusCard({ focus, chosen, busy, onStart }: { focus: Choice; chosen: boolean; busy: boolean; onStart: () => void }) {
  const { showToast } = useRitual();
  const setStatus = useMutation(api.tasks.setStatus);
  const [finishing, setFinishing] = useState(false);
  const [moving, setMoving] = useState(false);
  // The timer is optional: a task can also just be started, or marked done, from here.
  async function move(status: "In progress" | "Done", message: string, extra: { note?: string; skills?: string[] } = {}) {
    setMoving(true);
    try { await setStatus({ taskId: focus.taskId, status, ...extra }); showToast(message); setFinishing(false); }
    catch (caught) { showToast(readableError(caught, "Could not update the task. Please try again."), "alert"); }
    finally { setMoving(false); }
  }
  const context = focus.smaller ? `Smaller step of “${focus.taskTitle}”` : focus.linedUp ? "Lined up this week" : focus.milestoneTitle ?? (focus.status === "In progress" ? "Picking up" : "Ready");
  return <section key={focus.taskId} className="r-card ember t-focus" aria-labelledby="focus-title">
    <div className="r-row r-between" style={{ gap: 8 }}>
      <span className="r-eyebrow ember">{chosen ? "Your chosen focus" : "Tonight's focus"}</span>
      <span className="r-tag" style={laneColour(focus.lane)}><span className="r-dot" style={{ width: 7, height: 7 }} aria-hidden="true" />{focus.lane}{focus.projectTitle ? ` · ${focus.projectTitle}` : ""}</span>
    </div>
    <h2 id="focus-title" className="t-focus-title">{focus.title}</h2>
    <div className="r-row" style={{ gap: 6 }}><span className="r-fact mono">{focus.minutes} min</span><span className="r-fact">{energyNames[focus.energy - 1]} energy</span><span className="r-fact">{context}</span></div>
    {focus.nextStep && !focus.smaller && <div className="r-inset" style={{ marginTop: 14 }}><div className="r-eyebrow-sm">{focus.status === "In progress" ? "Pick up here" : "Next step"}</div><div className="r-body" style={{ marginTop: 4 }}>{focus.nextStep}</div></div>}
    <div className="r-dashed" style={{ marginTop: 12 }}><div className="r-eyebrow-sm">Done when</div><div className="r-body" style={{ marginTop: 4 }}>{focus.doneWhen}</div></div>
    <div className="t-why"><span className="r-diamond" aria-hidden="true" /><span><b>Why this: </b>{chosen ? "You chose this one yourself." : focus.reason}</span></div>
    {finishing
      ? <div style={{ marginTop: 16 }}><DoneForm busy={moving} onSubmit={(note, skills) => void move("Done", `“${focus.taskTitle}” is done.`, { note, skills })} onCancel={() => setFinishing(false)} /></div>
      : <>
        <button type="button" className="r-btn lg block split" style={{ marginTop: 18 }} disabled={busy || moving} onClick={onStart}>{busy ? "Starting…" : "Start focus"}<span className="r-time">{focus.minutes}:00</span></button>
        <div className="r-row t-focus-more">
          {focus.status === "Ready" && !focus.smaller && <button type="button" className="r-ghost sm" disabled={busy || moving} onClick={() => void move("In progress", `Started “${focus.taskTitle}”. It's in progress in Work.`)}>Start without the timer</button>}
          {!focus.smaller && <button type="button" className="r-ghost sm" disabled={busy || moving} onClick={() => setFinishing(true)}>Done already?</button>}
        </div>
      </>}
  </section>;
}

/** The focus card's shape while tonight's answer loads. */
function FocusBones() {
  return <Skeleton label="Finding tonight's focus…">
    <div className="r-card ember t-focus" aria-hidden="true" style={{ display: "grid", gap: 14 }}>
      <span className="r-row r-between"><Bone w={120} h={11} /><Bone w={150} h={28} shape="pill" i={1} /></span>
      <Bone w="78%" h={36} i={2} className="bone-title" />
      <span className="r-row" style={{ gap: 6 }}><Bone w={64} h={28} shape="pill" i={3} /><Bone w={96} h={28} shape="pill" i={4} /><Bone w={110} h={28} shape="pill" i={5} /></span>
      <Bone h={64} shape="block" i={6} />
      <Bone w="70%" h={12} i={7} />
      <Bone h={58} shape="pill" i={8} className="bone-button" />
    </div>
  </Skeleton>;
}

function PublishCard({ title, onStart }: { title: string; onStart: () => void }) {
  return <section className="r-card ember t-focus" aria-labelledby="focus-title">
    <div className="r-row r-between" style={{ gap: 8 }}><span className="r-eyebrow ember">Tonight&apos;s focus</span><span className="r-tag" style={laneColour("Showcases")}><span className="r-dot" style={{ width: 7, height: 7 }} aria-hidden="true" />Proof</span></div>
    <h2 id="focus-title" className="t-focus-title">Share “{title}”</h2>
    <div className="r-row" style={{ gap: 6 }}><span className="r-fact">Ready to share</span></div>
    <div className="r-dashed" style={{ marginTop: 12 }}><div className="r-eyebrow-sm">Done when</div><div className="r-body" style={{ marginTop: 4 }}>It is posted and its link is saved in Proof.</div></div>
    <div className="t-why"><span className="r-diamond" aria-hidden="true" /><span><b>Why this: </b>It&apos;s ready to share. Becoming never posts for you; you post it, then save the link.</span></div>
    <button type="button" className="r-btn lg block split" style={{ marginTop: 18 }} onClick={onStart}>Open publish flow<span className="r-time">→</span></button>
  </section>;
}

function NothingCard({ title, text, onBack, onAdd }: { title: string; text: string; onBack: () => void; onAdd?: () => void }) {
  return <section className="r-card r-rise" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <h2 style={{ font: "400 28px/1.1 var(--r-serif)" }}>{title}</h2>
    <p className="r-lede">{text}</p>
    <div className="r-row" style={{ gap: 8 }}><button type="button" className="r-btn sm" onClick={onBack}>Change tonight</button>{onAdd && <button type="button" className="r-ghost sm" onClick={onAdd}>+ Add a task</button>}</div>
  </section>;
}

function SundayCard({ week }: { week: WeekSummary }) {
  if (week.nextPlan) return <section className="t-sunday done">
    <span className="t-check" aria-hidden="true">✓</span>
    <div style={{ flex: "1 1 220px", minWidth: 0 }}>
      <div className="r-eyebrow-sm" style={{ color: "var(--r-mint-text)" }}>Week {week.weekNumber + 1} is planned · {week.nextPlan.taskIds.length} {week.nextPlan.taskIds.length === 1 ? "step" : "steps"} lined up</div>
      <div style={{ font: "italic 400 20px/1.2 var(--r-serif)", marginTop: 5, color: week.nextPlan.intention ? "var(--r-ink)" : "var(--r-muted)" }}>{week.nextPlan.intention || "No intention set. That's fine too."}</div>
    </div>
    <Link className="r-ghost sm" href="/journey?view=review">Adjust</Link>
  </section>;
  return <section className="t-sunday">
    <div style={{ flex: "1 1 240px" }}>
      <div className="r-eyebrow-sm" style={{ color: "var(--r-mint-text)" }}>Sunday · Week {week.weekNumber}</div>
      <h2 style={{ font: "400 24px/1.1 var(--r-serif)", marginTop: 6 }}>Look back, then shape next week.</h2>
      <div className="r-small" style={{ fontSize: 13, color: "var(--r-text)", marginTop: 6 }}>{week.count} of {week.target ?? "–"} sessions{week.target && week.count >= week.target ? " · target met" : ""}{week.streak ? ` · ${week.streak} ${week.streak === 1 ? "week" : "weeks"} in a row` : ""}</div>
    </div>
    <Link className="r-btn sm mint" href="/journey?view=review">Begin · 3 min</Link>
  </section>;
}
