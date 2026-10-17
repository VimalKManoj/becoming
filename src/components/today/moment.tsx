"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { useModal } from "@/components/ritual/use-modal";

// Moments (PLAN-one-tap-and-daily-loop, Phase 5): a milestone or phase finished, or the week
// met, shown once on Today the next time you open it, even when an assistant finished it
// while you were away. "That counts" (or Escape) marks it seen; it never shows again.

type Moment = FunctionReturnType<typeof api.moments.list>[number];

export function MomentOverlay() {
  const moments = useQuery(api.moments.list, {});
  const see = useMutation(api.moments.see);
  const [hidden, setHidden] = useState<string[]>([]);
  const moment = moments?.find(item => !hidden.includes(item.key));
  if (!moment) return null;
  const dismiss = () => {
    setHidden(keys => [...keys, moment.key]);
    void see({ key: moment.key }).catch(() => undefined);
  };
  return <MomentCard key={moment.key} moment={moment} onDismiss={dismiss} />;
}

function MomentCard({ moment, onDismiss }: { moment: Moment; onDismiss: () => void }) {
  const router = useRouter();
  const dialog = useModal<HTMLDivElement>(onDismiss);
  const eyebrow = moment.kind === "phase" ? "Phase complete" : moment.kind === "milestone" ? "Milestone complete" : "Week met";
  const where = [moment.project, moment.by ? `finished by ${moment.by}` : null].filter(Boolean).join(" · ");
  return <div ref={dialog} className="r-overlay reward mo" role="dialog" aria-modal="true" aria-labelledby="moment-title">
    <div className="mo-body">
      <div className="mo-burst" aria-hidden="true"><span className="mo-ring" /><span className="mo-ring two" /><span className={`mo-core ${moment.kind}`}>✓</span></div>
      <div className="r-eyebrow ember mo-eyebrow">{eyebrow}</div>
      <h1 id="moment-title" className="mo-title">{moment.kind === "week" ? <>Your week is <em>met.</em></> : <>{moment.title}, <em>done.</em></>}</h1>
      <p className="r-body mo-sub">{moment.kind === "week" ? `${moment.title}. Anything more this week is a bonus.` : where || "Every task in it is finished."}</p>
      <div className="mo-actions">
        {moment.projectId && <button type="button" className="r-ghost" onClick={() => { onDismiss(); router.push(`/work?view=projects&project=${moment.projectId}&visual=1`); }}>See it on the map</button>}
        <button type="button" className="r-btn" onClick={onDismiss}>That counts</button>
      </div>
    </div>
  </div>;
}
