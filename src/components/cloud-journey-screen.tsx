"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useWeek } from "@/components/ritual/week";
import { HistorySkeleton, JourneyHistory } from "@/components/journey/history";
import { ProgressSkeleton, ProgressTab } from "@/components/journey/progress";
import { ProofTab } from "@/components/journey/proof-tab";
import { ReviewSkeleton, WeeklyReview } from "@/components/journey/review";

// Journey, as the owner's Ritual design: "How you're becoming." with Progress and Proof
// tabs (?tab=progress|proof), the weekly review (?view=review) and every saved session
// (?view=history). The shared shell handles sign-in; this renders for a confirmed account.

type Tab = "progress" | "proof";
const tabs: { id: Tab; label: string }[] = [{ id: "progress", label: "Progress" }, { id: "proof", label: "Proof" }];

export function CloudJourneyScreen() {
  return <Suspense fallback={<ProgressSkeleton />}><Journey /></Suspense>;
}

function Journey() {
  const router = useRouter();
  const params = useSearchParams();
  const weekData = useWeek();
  const view = params.get("view");
  const tab: Tab = params.get("tab") === "proof" ? "proof" : "progress";

  if (view === "review") return weekData ? <WeeklyReview key={weekData.rhythm.currentWeek} rhythm={weekData.rhythm} week={weekData.week} /> : <ReviewSkeleton />;
  if (view === "history") return weekData ? <JourneyHistory rhythm={weekData.rhythm} /> : <HistorySkeleton />;
  // The publish flow covers Journey on its own, without the header and tabs.
  if (tab === "proof" && params.get("publish")) return <ProofTab />;

  function choose(next: Tab) {
    if (next !== tab) router.replace(next === "proof" ? "/journey?tab=proof" : "/journey", { scroll: false });
  }

  return <>
    <div className="j-head">
      <div><div className="r-eyebrow">Journey</div><h1 className="r-title">How you&apos;re <em>becoming.</em></h1></div>
      <div className="j-tabs" role="tablist" aria-label="Journey">
        {tabs.map(item => <button key={item.id} id={`journey-tab-${item.id}`} type="button" role="tab" className="j-tab" aria-selected={tab === item.id} aria-controls={`journey-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1}
          onClick={() => choose(item.id)}
          onKeyDown={event => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { const next = tab === "progress" ? "proof" : "progress"; choose(next); document.getElementById(`journey-tab-${next}`)?.focus(); } }}>{item.label}</button>)}
      </div>
    </div>
    {tab === "proof"
      ? <div role="tabpanel" id="journey-panel-proof" aria-labelledby="journey-tab-proof"><ProofTab /></div>
      : weekData ? <ProgressTab rhythm={weekData.rhythm} week={weekData.week} /> : <ProgressSkeleton />}
  </>;
}
