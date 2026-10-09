"use client";

import { useState, type CSSProperties } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { useRitual } from "@/components/ritual/ritual-context";
import { readableError } from "@/lib/errors";

// The Inbox on Today: what your assistants proposed (convex/inbox.ts). Nothing counts
// toward your Journey, bloom or week until you approve it here.

type Item = FunctionReturnType<typeof api.inbox.list>[number];
const kindLabel: Record<Item["kind"], string> = {
  session: "Work done", task: "New task", idea: "Idea", milestone: "Milestone", nextStep: "Next step",
  phase: "New phase", doc: "New doc", docUpdate: "Doc update", research: "Research", report: "Report", decision: "Decision", plan: "Whole plan",
};
const kindColour: Record<Item["kind"], string> = {
  session: "#FF8A3D", task: "#FF8A3D", idea: "#C9B8F0", milestone: "#86E3C3", nextStep: "#E9DFD6",
  phase: "#86E3C3", doc: "#E9DFD6", docUpdate: "#E9DFD6", research: "#C9B8F0", report: "#C9B8F0", decision: "#86E3C3", plan: "#FF8A3D",
};
const approvedText: Record<Item["kind"], string> = {
  session: "Logged to your Journey.", task: "Added to Work.", idea: "Saved to Ideas.", milestone: "Milestone added.", nextStep: "Next step updated.",
  phase: "Phase added.", doc: "Doc added.", docUpdate: "Doc updated.", research: "Research added.", report: "Report saved.", decision: "Decision recorded.", plan: "Plan added to the project.",
};
const isWebLink = (link: string) => /^https?:\/\//i.test(link);
const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// A whole plan, previewed as one item: each phase with its milestone and task counts.
function PlanPreview({ plan }: { plan: NonNullable<Item["plan"]> }) {
  const [open, setOpen] = useState(false);
  const shown = open ? plan.phases : plan.phases.slice(0, 6);
  return <div className="r-dashed">
    <div className="r-eyebrow-sm">Phases</div>
    <ol style={{ listStyle: "none", margin: "6px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
      {shown.map((phase, i) => <li key={phase.name} className="r-row r-between" style={{ gap: 10 }}>
        <span className="r-body">{String(i).padStart(2, "0")} · {phase.name}{phase.existing && <span className="r-small" style={{ fontSize: 12 }}> · already there</span>}</span>
        <span className="r-small" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{count(phase.milestones, "milestone")} · {count(phase.tasks, "task")}{phase.done ? ` · ${phase.done} done` : ""}</span>
      </li>)}
    </ol>
    {plan.phases.length > 6 && <button type="button" className="r-link" style={{ marginTop: 6 }} onClick={() => setOpen(!open)}>{open ? "Show fewer phases" : `Show all ${plan.phases.length} phases`}</button>}
    {plan.docs.length > 0 && <div className="r-row" style={{ gap: 6, marginTop: 8 }}><span className="r-small" style={{ fontSize: 12 }}>Docs</span>{plan.docs.map(code => <span key={code} className="r-fact">{code}</span>)}</div>}
  </div>;
}

function ago(time: number, now: number) {
  const minutes = Math.round((now - time) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

export function InboxCard({ now }: { now: number }) {
  const { showToast } = useRitual();
  const items = useQuery(api.inbox.list);
  const approve = useMutation(api.inbox.approve);
  const discard = useMutation(api.inbox.discard);
  const [busy, setBusy] = useState<Id<"inbox"> | null>(null);
  const [all, setAll] = useState(false);
  if (!items?.length) return null;
  const shown = all ? items : items.slice(0, 3);

  async function act(item: Item, keep: boolean) {
    setBusy(item._id);
    try {
      if (keep) { await approve({ itemId: item._id }); showToast(approvedText[item.kind]); }
      else { await discard({ itemId: item._id }); showToast("Discarded. Nothing was saved."); }
    } catch (caught) { showToast(readableError(caught, "Could not save that. Please try again."), "alert"); }
    finally { setBusy(null); }
  }

  return <section className="r-col t-inbox" aria-labelledby="inbox-title">
    <div className="r-row r-between" style={{ gap: 10 }}>
      <h2 id="inbox-title" className="r-eyebrow-sm" style={{ color: "var(--r-ember-soft)" }}>From your assistants · {items.length} waiting</h2>
      <span className="r-small" style={{ fontSize: 12 }}>Counts once you approve</span>
    </div>
    <ul className="t-inbox-list">
      {shown.map(item => <li key={item._id} className="t-inbox-item">
        <div className="r-row" style={{ gap: 8 }}>
          <span className="r-tag" style={{ "--dot": kindColour[item.kind] } as CSSProperties}><span className="r-dot" style={{ width: 7, height: 7 }} aria-hidden="true" />{kindLabel[item.kind]}</span>
          <span className="r-small" style={{ fontSize: 12 }}>from {item.source} · {ago(item.createdAt, now)}</span>
        </div>
        <p className="t-inbox-title">{item.title}</p>
        {item.details.length > 0 && <div className="r-row" style={{ gap: 6 }}>{item.details.map(detail => <span key={detail} className="r-fact">{detail}</span>)}</div>}
        {item.body && <p className="r-body t-inbox-body" style={{ whiteSpace: "pre-line" }}>{item.body}</p>}
        {item.plan && <PlanPreview plan={item.plan} />}
        {item.next && <div className="r-dashed"><div className="r-eyebrow-sm">{item.kind === "doc" || item.kind === "docUpdate" ? "Next edit" : "Next step"}</div><div className="r-body" style={{ marginTop: 4 }}>{item.next}</div></div>}
        {item.link && item.kind === "session" && <p className="r-small t-inbox-link">Evidence: <a href={item.link} target="_blank" rel="noreferrer noopener">{item.link}</a> · becomes a draft in Proof</p>}
        {item.link && item.kind !== "session" && <p className="r-small t-inbox-link">Link: {isWebLink(item.link) ? <a href={item.link} target="_blank" rel="noreferrer noopener">{item.link}</a> : <code>{item.link}</code>}</p>}
        <div className="r-row" style={{ gap: 8, marginTop: 4 }}>
          <button type="button" className="r-btn sm" disabled={busy !== null} onClick={() => void act(item, true)}>{busy === item._id ? "Saving…" : "Approve"}</button>
          <button type="button" className="r-ghost sm" disabled={busy !== null} onClick={() => void act(item, false)}>Discard</button>
        </div>
      </li>)}
    </ul>
    {items.length > 3 && <button type="button" className="r-link" style={{ alignSelf: "flex-start" }} onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${items.length}`}</button>}
  </section>;
}
