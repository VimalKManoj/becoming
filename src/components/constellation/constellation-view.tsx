"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Bone, Skeleton } from "@/components/skeleton";
import { authClient } from "@/lib/auth-client";
import {
  DAY, INNER_W, STEPS_PER_DAY, dayMonth, genesisLayout, genesisNote, groupLabel, groupShort, groupsAt, overviewLayout, phaseLayout, plural,
  type CDoc, type Constellation, type GTask,
} from "./model";
import { GenesisLevel, Overview, PhaseLevel, type Level } from "./levels";
import { Panel, buildPanel } from "./panel";

// Work → Projects → Visual: one project as a living map, from the first thought to today.
// The owner's design (documents/design/project-constellation.dc.html), on real records from
// convex/constellation.ts. Plan: documents/PLAN-project-constellation.md.

type Nav = { level: Level; ph: number; sel: string | null };

export function ConstellationView({ projectId }: { projectId: Id<"projects"> }) {
  const data = useQuery(api.constellation.get, { projectId });
  if (data === undefined) return <ConstellationSkeleton />;
  if (data === null) return <div className="cx"><div className="pc"><div className="eyebrow">Visual</div><p className="body14">This project could not be found. It may have been deleted.</p></div></div>;
  return <ConstellationMap key={projectId} data={data} />;
}

function ConstellationMap({ data }: { data: Constellation }) {
  const { data: session } = authClient.useSession();
  const initial = session?.user.name?.trim()[0]?.toUpperCase() ?? "";
  const [nav, setNav] = useState<Nav>({ level: "overview", ph: 0, sel: "core" });
  const [view, setView] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [canvasW, setCanvasW] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const box = timer;
    return () => { if (box.current) clearInterval(box.current); };
  }, []);
  // The design's 940px canvas scales down a little to fit a narrower stage, then scrolls.
  const measure = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const observer = new ResizeObserver(entries => setCanvasW(entries[0]?.contentRect.width ?? null));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ---- replay: the map at a chosen day, from real dates ----
  const { start, now } = data.timeline;
  const max = Math.max(1, Math.round(((now - start) / DAY) * STEPS_PER_DAY));
  const shown = view === null ? max : Math.min(view, max);
  const atEnd = shown >= max;
  const at = atEnd ? null : start + (shown / STEPS_PER_DAY) * DAY;
  const groups = useMemo(() => groupsAt(data, at), [data, at]);
  const written = (d: CDoc) => d.writtenAt !== null && (at === null || d.writtenAt <= at);
  const total = groups.reduce((n, g) => n + g.n, 0), done = groups.reduce((n, g) => n + g.pd, 0);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const phDone = groups.filter(g => g.phaseId && g.state === "done").length;

  const stop = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
  const play = () => {
    if (timer.current) { stop(); setPlaying(false); return; }
    let v = 0;
    const step = max / 200;
    setView(0);
    setPlaying(true);
    timer.current = setInterval(() => {
      v += step;
      if (v >= max) { stop(); setView(null); setPlaying(false); return; }
      setView(v);
    }, 50);
  };
  const onScrub = (event: ChangeEvent<HTMLInputElement>) => {
    stop();
    setPlaying(false);
    const v = Number(event.target.value);
    setView(v >= max ? null : v);
  };

  // ---- where you are ----
  const genesis = useMemo(() => genesisLayout(data), [data]);
  let level = nav.level;
  if (level === "genesis" && !genesis) level = "overview";
  if (level === "phase" && !groups.length) level = "overview";
  const ph = Math.min(nav.ph, Math.max(0, groups.length - 1));
  const sel = nav.sel;
  const go = useCallback((lv: Level, p: number | null, se: string | null) => setNav(n => ({ level: lv, ph: p ?? n.ph, sel: se })), []);

  const group = groups[ph];
  const ov = useMemo(() => overviewLayout(groups, data.docs.length), [groups, data.docs.length]);
  const pl = useMemo(() => (group ? phaseLayout(group) : null), [group]);
  const H = level === "overview" ? ov.H : level === "phase" && pl ? pl.H : 544;

  const taskById = useMemo(() => new Map(groups.flatMap(g => g.all).map(t => [String(t.id), t])), [groups]);
  const depOf = (t: GTask) => { for (const id of t.dependencies) { const d = taskById.get(id); if (d && d.state !== "done") return d.code; } return null; };
  const task = level === "phase" && sel?.startsWith("t:") ? taskById.get(sel.slice(2)) ?? null : null;

  const panel = buildPanel({ data, groups, level, ph, sel, go, pct, phDone, initial, genesis, written });

  const crumbs = {
    canBack: level !== "overview",
    back: () => (task ? go("phase", ph, null) : go("overview", null, level === "phase" ? `p:${ph}` : "core")),
    home: () => go("overview", null, level === "phase" ? `p:${ph}` : "core"),
    l1: level === "genesis" ? "Genesis" : group ? groupLabel(group) : "",
    l1cur: (level === "phase" && !task) || level === "genesis",
    l1go: () => (level === "phase" ? go("phase", ph, null) : go("genesis", null, sel)),
    hint: level === "overview" ? "Click to select · double-click a phase, or use the panel button, to go in" : level === "phase" ? "Click a cell for its story" : "From a thought to a project",
  };

  const scale = canvasW ? Math.min(1, Math.max(0.72, canvasW / INNER_W)) : 1;
  const viewPct = ((shown / max) * 100).toFixed(1);
  const span = Math.max(1, now - start);
  const ticks: { l: number; label: string }[] = [];
  for (const g of groups) {
    if (!g.phaseId || g.startedAt === null) continue;
    const l = Math.min(100, Math.max(0, ((g.startedAt - start) / span) * 100));
    if (ticks.length && l - ticks[ticks.length - 1].l < 4) continue;
    ticks.push({ l: +l.toFixed(1), label: `P${Number(g.num)}` });
  }
  const dateLabel = `${atEnd ? "TODAY · " : ""}${dayMonth(at ?? now).toUpperCase()} · DAY ${Math.floor(shown / STEPS_PER_DAY)}`;
  const scrubNote = playing ? "Replaying the build…" : atEnd ? `Press play to watch it grow${data.genesis.idea ? " from the idea" : ""}.` : "Drag to the end for today.";
  const note = data.genesis.idea ? genesisNote(data.genesis.idea.createdAt, data.project.createdAt) : null;

  const meta = [
    ...(data.genesis.idea ? [`IDEA ${dayMonth(data.genesis.idea.createdAt)}`] : []),
    `PROJECT ${dayMonth(data.project.createdAt)}`,
    plural(data.stats.docs, "DOC", "DOCS"), plural(data.stats.phases, "PHASE", "PHASES"), plural(data.stats.total, "TASK", "TASKS"),
  ].join(" · ").toUpperCase();
  const anyBrief = (genesis?.briefs ?? 0) > 0;
  const briefNames = genesis?.briefNames ?? [];

  return <div className="cx">
    <div className="trow">
      <div>
        <h1 className="title">{data.project.title}, <em>taking form</em></h1>
        <div className="mline">{meta}</div>
      </div>
    </div>

    <div className="body">
      <div className="leftcol">
        <div className="stagewrap">
          <nav className="crumbs" aria-label="Where you are">
            {crumbs.canBack && <button type="button" className="backb" onClick={crumbs.back} aria-label="Back">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M8.5 3L4.5 7l4 4" /></svg>
            </button>}
            <button type="button" className={`crumb ${level === "overview" ? "cur" : ""}`} onClick={crumbs.home} aria-current={level === "overview" ? "location" : undefined}>{data.project.title}</button>
            {level !== "overview" && <><span className="csep" aria-hidden="true">›</span><button type="button" className={`crumb ${crumbs.l1cur ? "cur" : ""}`} onClick={crumbs.l1go} aria-current={crumbs.l1cur ? "location" : undefined}>{crumbs.l1}</button></>}
            {task && <><span className="csep" aria-hidden="true">›</span><span className="crumb cur" aria-current="location">{task.code} {task.title}</span></>}
            <span className="chint">{crumbs.hint}</span>
            {level === "phase" && <div className="pn">
              <button type="button" className="tb" onClick={() => go("phase", Math.max(0, ph - 1), null)} disabled={ph === 0} aria-label="Previous phase">‹ {ph > 0 ? groupShort(groups[ph - 1]) : ""}</button>
              <button type="button" className="tb" onClick={() => go("phase", Math.min(groups.length - 1, ph + 1), null)} disabled={ph >= groups.length - 1} aria-label="Next phase">{ph < groups.length - 1 ? groupShort(groups[ph + 1]) : ""} ›</button>
            </div>}
          </nav>

          <div className="canvas" ref={measure}>
            <div className="inner" style={{ height: H, zoom: scale === 1 ? undefined : scale }}>
              {level === "overview" && <Overview key="overview" data={data} groups={groups} layout={ov} sel={sel} go={go} written={written} pct={pct} />}
              {level === "phase" && group && pl && <PhaseLevel key={`phase-${ph}`} group={group} layout={pl} sel={sel} go={go} depOf={depOf} />}
              {level === "genesis" && genesis && <GenesisLevel key="genesis" data={data} layout={genesis} sel={sel} go={go} />}
            </div>
          </div>

          <div className="keyline">
            {level === "overview" && <>
              <span className="k"><b>GENESIS</b>where it came from</span><span className="ksep" />
              <span className="k"><b>DOCS</b>the ground each phase stands on</span><span className="ksep" />
              <span className="k"><b>PHASES</b>one cell per task</span>
              <span className="k" style={{ marginLeft: "auto" }}>
                <span className="cell c-d" style={{ position: "relative" }}><span className="cf" /></span>done{" "}
                <span className="cell c-p" style={{ position: "relative", animation: "none" }}><span className="cf" /></span>doing{" "}
                <span className="cell" style={{ position: "relative" }}><span className="cf" /></span>ready{" "}
                <span className="cell c-b" style={{ position: "relative" }}><span className="cf" /></span>blocked
              </span>
            </>}
            {level === "phase" && <>
              <span className="k"><b>MILESTONES</b>clusters, in plan order</span><span className="ksep" />
              <span className="k"><b>TASKS</b>one cell each · click for its story</span>
              <span className="k" style={{ marginLeft: "auto" }}>
                <span className="sw" style={{ background: "linear-gradient(180deg,#FFB27A,#F06A2A)" }} />done{" "}
                <span className="sw" style={{ border: "1px solid #FF8A3D", background: "rgba(255,138,61,.25)" }} />doing{" "}
                <span className="sw" style={{ border: "1px solid rgba(255,235,215,.3)" }} />ready{" "}
                <span className="sw" style={{ border: "1px solid #FF6B5B" }} />blocked
              </span>
            </>}
            {level === "genesis" && <>
              <span className="k"><span className="sw" style={{ background: "rgba(201,184,240,.5)" }} />thinking</span>
              <span className="k"><span className="sw" style={{ background: "rgba(134,227,195,.5)" }} />decision</span>
              <span className="k"><span className="sw" style={{ background: "linear-gradient(180deg,#FFB27A,#F06A2A)" }} />building</span>
              {anyBrief && <span className="k" style={{ marginLeft: "auto" }}>Bright dots are briefs {briefNames.length === 1 ? briefNames[0] : "assistants"} wrote through MCP</span>}
            </>}
          </div>
        </div>

        {level !== "genesis" && <div className="scrub">
          <button type="button" className="play" onClick={play} aria-label={playing ? "Pause replay" : "Replay how it grew"}>
            {playing
              ? <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="3" y="2" width="3.5" height="12" rx="1" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" /></svg>
              : <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 2.2v11.6c0 .6.7 1 1.2.7l9.2-5.8c.5-.3.5-1 0-1.4L5.2 1.5C4.7 1.2 4 1.6 4 2.2z" /></svg>}
          </button>
          <div className="track">
            <div className="tltop"><span className="tdate">{dateLabel}</span><span className="tnote">{scrubNote}</span></div>
            <div className="rangewrap">
              {ticks.map(t => <span key={t.label} className="tk" style={{ left: `${t.l}%` }}><span>{t.label}</span></span>)}
              <label className="sr" htmlFor="cx-scrub">Replay how the project grew, day by day</label>
              <input id="cx-scrub" className="range" type="range" min={0} max={max} step={1} value={Math.round(shown)} onChange={onScrub}
                aria-valuetext={`${dayMonth(at ?? now)}, ${pct}% formed`}
                style={{ background: `linear-gradient(90deg, #FF8A3D ${viewPct}%, rgba(255,235,215,.12) ${viewPct}%)` }} />
            </div>
          </div>
          <div className="formed"><b>{pct}%</b><span>FORMED</span></div>
        </div>}
        {level === "genesis" && note && <div className="gnote"><b>{note.span}</b>{note.text}</div>}
      </div>

      <Panel key={panel.key} model={panel} />
    </div>
  </div>;
}

// ---------- loading ----------

/** The map's shape while it loads: the title, the four columns, the scrubber and the panel. */
function ConstellationSkeleton() {
  const at = (left: number, top: number) => ({ position: "absolute" as const, left, top });
  return <Skeleton label="Drawing the constellation…" className="cx">
    <div className="trow" aria-hidden="true"><div><Bone w={360} h={42} className="bone-title" /><span style={{ display: "block", marginTop: 12 }}><Bone w={420} h={11} i={1} /></span></div></div>
    <div className="body" aria-hidden="true">
      <div className="leftcol">
        <div className="stagewrap">
          <div className="crumbs"><Bone w={110} h={16} i={2} /></div>
          <div className="canvas">
            <div className="inner">
              {[16, 252, 400, 660].map((left, n) => <span key={left} style={at(left, 14)}><Bone w={70} h={10} i={n} /></span>)}
              {[18, 98, 178].map((left, n) => <span key={left} style={at(left, 270)}><Bone w={44} h={44} shape="circle" i={n + 1} /></span>)}
              <span style={at(252, 244)}><Bone w={96} h={96} shape="circle" i={3} /></span>
              {Array.from({ length: 6 }, (_, j) => <span key={j} style={at(400, 100 + j * 66)}><Bone w={172} h={54} shape="block" i={j} /></span>)}
              {Array.from({ length: 8 }, (_, j) => <span key={j} style={at(670, 62 + j * 60)}><Bone w={250} h={12} i={j} /><span style={{ display: "block", marginTop: 14 }}><Bone w={140} h={9} i={j + 1} /></span></span>)}
            </div>
          </div>
          <div className="keyline"><Bone w={320} h={10} i={4} /></div>
        </div>
        <div className="scrub"><Bone w={44} h={44} shape="circle" /><span style={{ flex: 1 }}><Bone h={10} i={2} /></span><Bone w={90} h={12} i={3} /></div>
      </div>
      <div className="panel">
        <div className="pc head"><Bone w="50%" h={10} /><span style={{ display: "block", marginTop: 14 }}><Bone w="80%" h={28} i={1} className="bone-title" /></span><span style={{ display: "block", marginTop: 14 }}><Bone w={90} h={24} shape="pill" i={2} /></span></div>
        <Bone h={46} shape="pill" i={3} />
        <div className="stats">{Array.from({ length: 4 }, (_, n) => <div key={n} className="stc"><Bone w="50%" h={22} i={n} /><span style={{ display: "block", marginTop: 8 }}><Bone w="70%" h={10} i={n + 1} /></span></div>)}</div>
        <div className="pc"><Bone w="40%" h={10} /><span style={{ display: "block", marginTop: 12 }}><Bone h={12} i={1} /></span><span style={{ display: "block", marginTop: 8 }}><Bone w="60%" h={12} i={2} /></span></div>
      </div>
    </div>
  </Skeleton>;
}
