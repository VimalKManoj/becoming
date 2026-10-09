"use client";

import { Fragment, type CSSProperties } from "react";
import {
  GENESIS_Y, brainstormEntries, clip, dayMonth, dayRange, genX, plural, researchDots, threadOffsets,
  type CDoc, type Constellation, type GTask, type GenStep, type GenesisLayout, type Group, type OverviewLayout, type PhaseLayout, type TaskState,
} from "./model";

// The three levels of the constellation's map, drawn exactly as the design draws them:
// the overview (genesis → core → docs → phases), one phase (hexagon, milestone clusters,
// honeycomb tasks) and the genesis timeline (idea → … → project).

export type Level = "overview" | "phase" | "genesis";
export type Go = (level: Level, ph: number | null, sel: string | null) => void;

export const WORD: Record<TaskState, string> = { done: "DONE", doing: "IN PROGRESS", ready: "READY", blocked: "BLOCKED" };
const CELL: Record<TaskState, string> = { done: "c-d", doing: "c-p", ready: "c-r", blocked: "c-b" };
const delay = (s: number | string): CSSProperties => ({ animationDelay: `${s}s` });

export const GEN_OVERVIEW = ["idea", "research", "report", "start"];

// ---------- overview ----------

export function Overview({ data, groups, layout, sel, go, written, pct }: {
  data: Constellation; groups: Group[]; layout: OverviewLayout; sel: string | null; go: Go; written: (d: CDoc) => boolean; pct: number;
}) {
  const { H, CY, docY, rows } = layout;
  const docs = data.docs, g = data.genesis;
  const groupOf = new Map(groups.filter(x => x.phaseId).map(x => [x.phaseId as string, x.i]));
  const links = docs.map(d => d.phaseIds.map(id => groupOf.get(id)).filter((i): i is number => i !== undefined));
  const coreDoc = (j: number) => `M348,${CY} C374,${CY} 374,${docY(j)} 400,${docY(j)} `;
  const ry = (i: number) => rows[i].top + 18;
  const docPh = (j: number, i: number) => `M572,${docY(j)} C616,${docY(j)} 616,${ry(i)} 660,${ry(i)} `;
  const corePh = (i: number) => `M348,${CY} C504,${CY} 504,${ry(i)} 660,${ry(i)} `;

  const selPh = sel?.startsWith("p:") ? Number(sel.slice(2)) : -1;
  const isPhSel = selPh >= 0;
  const selDoc = sel?.startsWith("d:") ? docs.find(d => String(d.id) === sel.slice(2)) ?? null : null;
  const isGenSel = GEN_OVERVIEW.includes(sel ?? "");

  const rel: Record<string, boolean> = {};
  let hl = "", base = "", core = "", coreOff = "", lit = "";
  docs.forEach((d, j) => {
    const w = written(d);
    if (w) core += coreDoc(j); else coreOff += coreDoc(j);
    links[j].forEach(i => { base += docPh(j, i); if (w && groups[i].state !== "ahead") lit += docPh(j, i); });
    if (isPhSel && links[j].includes(selPh)) { rel[`d:${d.id}`] = true; hl += coreDoc(j) + docPh(j, selPh); }
    if (selDoc && selDoc.id === d.id) { links[j].forEach(i => { rel[`p:${i}`] = true; hl += docPh(j, i); }); hl += coreDoc(j); }
    if (sel === "core") hl += coreDoc(j);
  });
  // Without docs, the phases hang from the core directly.
  if (!docs.length) groups.forEach((x, i) => { base += corePh(i); if (x.state !== "ahead") lit += corePh(i); if (selPh === i || sel === "core") hl += corePh(i); });
  if (sel) rel[sel] = true;
  const dimmable = isPhSel || !!selDoc;
  const far = (k: string) => (dimmable && !rel[k] ? " far" : "");

  // Genesis column: idea (40) → research threads (76–164) → report (200) → core (252).
  const offsets = threadOffsets(g.research.length);
  let gen = "";
  if (!g.idea) gen = `M52,${CY} L252,${CY}`;
  else {
    if (offsets.length) {
      for (const o of offsets) gen += o === 0 ? `M52,${CY} L76,${CY} ` : `M52,${CY} C64,${CY} 64,${CY + o} 76,${CY + o} `;
      for (const o of offsets) gen += `M76,${CY + o} L164,${CY + o} `;
      for (const o of offsets) gen += o === 0 ? `M164,${CY} L186,${CY} ` : `M164,${CY + o} C178,${CY + o} 176,${CY} 186,${CY} `;
      if (!g.report) gen += `M186,${CY} L214,${CY} `;
    } else gen += `M52,${CY} L${g.report ? 186 : 214},${CY} `;
    gen += `M214,${CY} L252,${CY}`;
  }
  const sources = g.research.reduce((n, r) => n + r.sources.length, 0);
  const on = (k: string) => (sel === k ? "on" : "");

  const writtenDates = docs.map(d => d.writtenAt).filter((x): x is number => x !== null);
  const docsSub = !docs.length ? "None yet" : writtenDates.length ? dayRange(Math.min(...writtenDates), Math.max(...writtenDates)) : "Not written yet";
  const phased = groups.filter(x => x.phaseId);
  const starts = phased.map(x => x.startedAt).filter((x): x is number => x !== null);
  const phasesSub = !phased.length ? "No phases yet" : starts.length ? `${dayMonth(Math.min(...starts))} → today` : "Not started";

  return <div className="lvl">
    <svg className="edges" viewBox={`0 0 940 ${H}`} style={{ height: H }} aria-hidden="true">
      <path className="e-base" d={base || "M0,0"} />
      <path className="e-gen" d={gen} />
      <path className="e-core" d={core || "M0,0"} />
      <path className="e-core off" d={coreOff || "M0,0"} />
      <path className="e-hlg" d={isGenSel ? gen : "M0,0"} />
      <path className="e-hl" d={hl || "M0,0"} />
      <path className="e-flowg" d={gen} />
      <path className="e-flow" d={core + lit || "M0,0"} />
      <path className="e-flow hi" d={hl || "M0,0"} />
    </svg>

    <div className="colh lilac" style={{ left: 16 }}><b><i>01</i>GENESIS</b><span>{dayMonth(g.idea?.createdAt ?? data.project.createdAt)}</span></div>
    <div className="colh ember" style={{ left: 252 }}><b><i>02</i>PROJECT</b><span>{dayMonth(data.project.createdAt)}</span></div>
    <div className="colh lilac" style={{ left: 400 }}><b><i>03</i>DOCS</b><span>{docsSub}</span></div>
    <div className="colh ember" style={{ left: 660 }}><b><i>04</i>PHASES</b><span>{phasesSub}</span></div>

    {g.idea ? <>
      <button type="button" className={`st ${on("idea")}`} style={{ left: 18, top: CY - 22, ...delay(0.4) }} onClick={() => go("overview", null, "idea")} aria-label={`Idea: ${g.idea.title}`} aria-pressed={sel === "idea"}><span className="dia" /></button>
      <div className="slbl" style={{ left: 40, top: CY + 60 }}><b>IDEA</b><span>Captured</span></div>
      {g.research.length > 0 && <>
        <button type="button" className={`thr ${on("research")}`} style={{ left: 70, top: CY - 56, ...delay(1.3) }} onClick={() => go("overview", null, "research")} aria-pressed={sel === "research"}
          aria-label={`Research: ${plural(g.research.length, "thread")}, ${plural(sources, "source")}`}>
          {researchDots(g.research).map((s, k) => <span key={k} className={`src${s.ai ? " ai" : ""}`} style={{ left: s.x, top: s.y }} />)}
        </button>
        <div className="slbl" style={{ left: 120, top: CY + 60 }}><b>RESEARCH</b><span>{plural(sources, "source")}</span></div>
      </>}
      {g.report && <>
        <button type="button" className={`st ${on("report")}`} style={{ left: 178, top: CY - 22, ...delay(2.2) }} onClick={() => go("overview", null, "report")} aria-label={`Report: ${g.report.title}`} aria-pressed={sel === "report"}><span className="rep" /></button>
        <div className="slbl" style={{ left: 200, top: CY + 60 }}><b>REPORT</b><span>{plural(g.report.findings.length, "finding")}</span></div>
      </>}
      {isGenSel && <button type="button" className="openb lilac" style={{ left: 58, top: CY + 110 }} onClick={() => go("genesis", null, sel === "research" || sel === "report" ? sel : "idea")}>Open genesis ›</button>}
    </> : <>
      <button type="button" className={`st ${on("start")}`} style={{ left: 18, top: CY - 22, ...delay(0.4) }} onClick={() => go("overview", null, "start")} aria-label={`Started as a project on ${dayMonth(data.project.createdAt)}`} aria-pressed={sel === "start"}><span className="bsc" /></button>
      <div className="slbl" style={{ left: 40, top: CY + 60 }}><b>STARTED</b><span>As a project</span></div>
    </>}

    <button type="button" className={`core ${on("core")}`} style={{ left: 252, top: CY - 48 }} onClick={() => go("overview", null, "core")} aria-label={`Project: ${data.project.title}, ${pct}% formed`} aria-pressed={sel === "core"}>
      <span className="halo" />
      <svg className="pring" viewBox="0 0 96 96" aria-hidden="true">
        <circle className="pr-bg" cx="48" cy="48" r="44" />
        <circle className="pr-fg" cx="48" cy="48" r="44" style={{ strokeDasharray: `${((276.46 * pct) / 100).toFixed(1)} 999` }} />
      </svg>
      <span className="orb" />
    </button>
    <div className="corelbl" style={{ left: 220, top: CY + 60 }}>
      <div className="corename">{data.project.title}</div>
      <div className="corepct">{pct}% FORMED</div>
    </div>

    {docs.map((d, j) => {
      const key = `d:${d.id}`, w = written(d);
      const cls = (sel === key ? "on" : rel[key] && isPhSel ? "rel" : "") + (w ? "" : " unwritten") + far(key);
      const feeds = links[j].length;
      return <button key={d.id} type="button" className={`doc ${cls}`} style={{ left: 400, top: docY(j) - 27, ...delay((j * 1.2 + 0.6).toFixed(1)) }} onClick={() => go("overview", null, key)}
        aria-label={`${d.title}${w ? "" : ", not written yet"}, feeds ${plural(feeds, "phase")}`} aria-pressed={sel === key}>
        <span className="code">{d.code}</span>
        <span className="dtext"><span className="dname">{d.title}</span><span className="dmeta">{feeds ? `Feeds ${plural(feeds, "phase")}` : "Feeds no phase yet"}</span></span>
      </button>;
    })}
    {!docs.length && <div className="dochint" style={{ left: 400, top: CY - 44 }}><b>No docs yet</b>Add them on the project page or ask Claude to sync them.</div>}

    {groups.map((x, i) => {
      const row = rows[i], key = `p:${i}`;
      const word = x.state === "done" ? "DONE" : x.state === "active" ? `${x.pct}%` : "AHEAD";
      return <button key={x.key} type="button" className={`ph ${x.state}${sel === key ? " on" : ""}${far(key)}`} style={{ left: 660, top: row.top, height: row.height }}
        onClick={() => go("overview", null, key)} onDoubleClick={() => go("phase", i, null)} aria-pressed={sel === key}
        aria-label={`${x.num ? `Phase ${x.num}, ` : ""}${x.name}, ${x.state === "done" ? "done" : `${x.pct}% done`}, ${plural(x.n, "task")}. Double-click to open.`}>
        <span className="anchor" style={delay((i * 0.9 + 1).toFixed(1))} />
        <span className="plbl"><span className="pnum">{x.num || "—"}</span><span className="pname">{x.name}</span><span className="pword">{word}</span></span>
        <span className="pbar"><span style={{ width: `${x.pct}%` }} /></span>
        <span className="cells">
          {x.all.map((t, j) => <span key={t.id} className={`cell ${CELL[t.cur]}`} style={{ left: row.cells[j].x, top: row.cells[j].y, ...delay(((j * 0.37) % 3).toFixed(2)) }}><span className="cf" /></span>)}
        </span>
      </button>;
    })}
    {!groups.length && <div className="phhint" style={{ left: 660, top: CY - 30 }}>No phases yet, and no milestones or tasks. Add them on the project page, or ask Claude to import the plan.</div>}
  </div>;
}

// ---------- phase level ----------

export function PhaseLevel({ group, layout, sel, go, depOf }: { group: Group; layout: PhaseLayout; sel: string | null; go: Go; depOf: (t: GTask) => string | null }) {
  const { H, hexCY, hx, clusters, edges } = layout;
  const ph = group.i;
  const lit = edges.filter(e => e.lit).map(e => e.d).join("");
  const stateWord = group.state === "done" ? "DONE" : group.state === "active" ? "IN PROGRESS" : "AHEAD";
  return <div className="lvl">
    <svg className="edges" viewBox={`0 0 940 ${H}`} style={{ height: H }} aria-hidden="true">
      <path className="e-base" style={{ stroke: "rgba(225,215,205,.14)" }} d={edges.map(e => e.d).join("") || "M0,0"} />
      <path className="e-flow" d={lit || "M0,0"} />
    </svg>
    <button type="button" className={`phx ${sel === null ? "on" : ""}`} style={{ left: hx, top: hexCY - 86 }} onClick={() => go("phase", ph, null)}
      aria-label={`${group.num ? `Phase ${group.num}` : group.name} summary, ${group.pct}% done`} aria-pressed={sel === null}>
      <span className="phglow" />
      <svg className="phring" viewBox="0 0 150 173" aria-hidden="true">
        <polygon className="hr-bg" points="75,2 148,44.25 148,128.75 75,171 2,128.75 2,44.25" />
        <polygon className="hr-fg" points="75,2 148,44.25 148,128.75 75,171 2,128.75 2,44.25" style={{ strokeDasharray: `${((506 * group.pct) / 100).toFixed(1)} 999` }} />
        <polygon className="hr-in" points="75,10 141,48.5 141,124.5 75,163 9,124.5 9,48.5" />
        <circle className="hr-v" cx="75" cy="2" r="2" /><circle className="hr-v" cx="148" cy="44.25" r="2" /><circle className="hr-v" cx="148" cy="128.75" r="2" />
        <circle className="hr-v" cx="75" cy="171" r="2" /><circle className="hr-v" cx="2" cy="128.75" r="2" /><circle className="hr-v" cx="2" cy="44.25" r="2" />
      </svg>
      <span className="phcore">
        <span className="phk">{group.num ? `PHASE ${group.num}` : "NO PHASE"}</span>
        <span className="phn">{group.pct}<small>%</small></span>
        <span className="phrule" />
        <span className="phc">{group.pd} OF {plural(group.n, "TASK", "TASKS")}</span>
        <span className={`phw ${group.state}`}>{stateWord}</span>
      </span>
    </button>
    <div className="phname" style={{ left: hx - 15, top: hexCY + 98 }}>
      {group.name}
      {!clusters.length && <small>No milestones here yet.</small>}
    </div>
    {clusters.map(c => {
      const m = c.m, n = m.tasks.length;
      const word = m.state === "done" ? "DONE" : m.state === "active" ? `${m.done} OF ${n}` : n ? "AHEAD" : "NO TASKS";
      const wcls = m.state === "done" ? "w" : m.state === "active" ? "wp" : "wa";
      return <Fragment key={m.key}>
        <div className="mlbl" style={{ left: c.x, top: c.y }}><b>{m.code}</b><span className="mt">{` ${m.title.toUpperCase()} `}</span><span className={wcls}>· {word}</span></div>
        {!n && <span className="mempty" style={{ left: c.x, top: c.y + 30 }}>No tasks in this milestone yet.</span>}
        {c.tasks.map(({ t, x, y, k }) => {
          const dep = t.cur === "ready" ? depOf(t) : null;
          const foot = dep ? `AFTER ${dep}` : t.cur === "doing" && t.plannedSessions ? `${t.sessions} OF ${t.plannedSessions}` : t.cur === "done" ? `${t.focusedMinutes || t.minutes} MIN` : WORD[t.cur];
          const key = `t:${t.id}`;
          return <button key={t.id} type="button" className={`hx ${t.cur}${sel === key ? " on" : ""}`} style={{ left: x, top: y, ...delay((k * 0.7).toFixed(1)) }} onClick={() => go("phase", ph, key)}
            aria-label={`${t.code} ${t.title}, ${WORD[t.cur].toLowerCase()}`} aria-pressed={sel === key}>
            <svg className="ring" viewBox="0 0 98 113" aria-hidden="true"><polygon points="49,1.5 96.5,28.75 96.5,84.25 49,111.5 1.5,84.25 1.5,28.75" /></svg>
            <span className="hs" />
            <span className="hin">
              {t.cur === "doing" && <span className="lvlfill" style={{ height: `${liquid(t)}%` }} />}
              <span className="hid">{t.code}</span>
              <span className="htt">{t.title}</span>
              <span className="hft">{foot}</span>
            </span>
          </button>;
        })}
      </Fragment>;
    })}
  </div>;
}

/** How full an in-progress cell is: sessions of the planned sessions, or focused minutes of the estimate. */
export function liquid(t: GTask) {
  const clamp = (v: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, v)));
  if (t.plannedSessions) return clamp((t.sessions / t.plannedSessions) * 100, 8, 100);
  if (t.minutes > 0) return clamp((t.focusedMinutes / t.minutes) * 100, 12, 92);
  return 40;
}

// ---------- genesis level ----------

export function GenesisLevel({ data, layout, sel, go }: { data: Constellation; layout: GenesisLayout; sel: string | null; go: Go }) {
  const g = data.genesis;
  const has = (s: GenStep) => layout.steps.includes(s);
  const on = (s: GenStep) => (sel === s ? "on" : "");
  const pick = (s: GenStep) => () => go("genesis", null, s);
  const Y = GENESIS_Y;
  const lastRow = layout.rows.length ? Math.max(...layout.rows.map(r => r.y)) : Y;
  const answers = brainstormEntries(g.idea?.brainstorm ?? null).length;
  return <div className="lvl">
    <svg className="edges" viewBox="0 0 940 544" aria-hidden="true">
      <path className="e-gen" style={{ stroke: "rgba(215,208,228,.3)" }} d={layout.gen} />
      <path className="e-flowg" d={layout.gen} />
      <path className="e-mint" d={layout.mint} />
      <path className="e-flow" d={layout.mint} />
    </svg>
    {layout.times.map((t, k) => <span key={k} className="time" style={{ left: t.x }}>{t.label}</span>)}

    <button type="button" className={`gst ${on("idea")}`} style={{ left: genX.idea, top: Y }} onClick={pick("idea")} aria-label={`Idea: ${g.idea?.title ?? ""}`} aria-pressed={sel === "idea"}><span className="dia" /></button>
    <div className="slbl" style={{ left: genX.idea, top: Y + 38 }}><b>IDEA</b><span>Captured</span></div>

    {has("brain") && <>
      <button type="button" className={`gst ${on("brain")}`} style={{ left: genX.brain, top: Y, ...delay(1) }} onClick={pick("brain")} aria-label="Brainstorm" aria-pressed={sel === "brain"}>
        <span className="bsc" />
        <span className="orbit"><i style={{ left: -2.5, top: 19.5 }} /><i style={{ left: 19.5, top: -2.5 }} /><i style={{ right: -2.5, top: 19.5 }} /><i style={{ left: 19.5, bottom: -2.5 }} /></span>
      </button>
      <div className="slbl" style={{ left: genX.brain, top: Y + 38 }}><b>BRAINSTORM</b><span>{plural(answers, "answer")}</span></div>
    </>}

    {has("research") && <>
      {layout.rows.map((r, k) => <span key={`l${k}`} className="tlbl" style={{ left: 264, top: r.y - 22 }}>{r.title.toUpperCase()} <i>· {r.count}{r.mcp ? " · MCP" : ""}</i></span>)}
      {layout.rows.flatMap((r, k) => r.dots.map((d, i) => <span key={`s${k}-${i}`} className={`src${d.ai ? " ai" : ""}`} style={{ left: d.x, top: r.y, ...delay(d.delay) }} />))}
      {layout.rows.map((r, k) => <button key={`t${k}`} type="button" className={`tgo ${on("research")}`} style={{ top: r.y }} onClick={pick("research")} aria-label={`Research thread: ${r.title}, ${plural(r.count, "source")}`} />)}
      <div className="slbl" style={{ left: 380, top: lastRow + 34 }}><b>RESEARCH</b><span>{plural(g.research.length, "thread")} · {plural(layout.sources, "source")}</span></div>
    </>}

    {has("report") && g.report && <>
      <button type="button" className={`gst ${on("report")}`} style={{ left: genX.report, top: Y, ...delay(2) }} onClick={pick("report")} aria-label={`Report: ${g.report.title}`} aria-pressed={sel === "report"}><span className="rep" /></button>
      <div className="slbl" style={{ left: genX.report, top: Y + 38 }}><b>REPORT</b><span>{plural(g.report.findings.length, "finding")}</span></div>
    </>}
    {has("decision") && g.decision && <>
      <button type="button" className={`gst ${on("decision")}`} style={{ left: genX.decision, top: Y, ...delay(3) }} onClick={pick("decision")} aria-label={`Decision: ${g.decision.verdict}`} aria-pressed={sel === "decision"}><span className="gate" /></button>
      <div className="slbl mint" style={{ left: genX.decision, top: Y + 38 }}><b>DECISION</b><span>{clip(g.decision.verdict, 22)}</span></div>
    </>}
    <button type="button" className={`gst ember ${on("project")}`} style={{ left: genX.project, top: Y, ...delay(4) }} onClick={pick("project")} aria-label={`Project: ${data.project.title}`} aria-pressed={sel === "project"}><span className="porb" /></button>
    <div className="slbl ember" style={{ left: genX.project, top: Y + 38 }}><b>PROJECT</b><span>{clip(data.project.title, 22)}</span></div>
  </div>;
}
