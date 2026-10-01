"use client";

import { usePaginatedQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

const lanes = ["Projects", "Showcases", "Writing"] as const;

// The shared workspace shell handles sign-in; this renders only for a confirmed account.
export function CloudJourneyScreen() {
  const { results, status, loadMore } = usePaginatedQuery(api.journey.listPage, {}, { initialNumItems: 12 });
  const loading = status === "LoadingFirstPage";
  const counts = lanes.map(lane => ({ lane, count: results.filter(session => session.lane === lane).length }));

  return <>
    <div className="heading"><div><p className="eyebrow">Becoming a design engineer</p><h1>Look at what is taking shape.</h1><p className="muted">Every entry is a saved contribution from Today.</p></div></div>
    {loading ? <p role="status">Loading your sessions…</p> : <>
      <div className="grid"><section className="panel"><p className="eyebrow">Sessions shown</p><p className="big-number">{results.length}{status !== "Exhausted" ? "+" : ""}</p><p>saved recaps</p></section>
        <section className="panel"><h2>Balance across shown sessions</h2>{counts.map(({ lane, count }) => <div className="list-row" key={lane}><span>{lane}</span><span>{count} {count === 1 ? "session" : "sessions"}</span></div>)}</section></div>
      <section className="panel space"><h2>Your recent steps</h2>{results.map(session => <article key={session._id} className="list-row"><div><h3>{session.title}{session.smaller && <span className="small"> · smaller step</span>}</h3><p className="preserve">{session.contribution}</p><p className="small">{session.lane} · {new Date(session.endedAt).toLocaleDateString()}</p>{session.nextStep && <p className="small">Next: {session.nextStep}</p>}</div><span className="badge">{session.outcome}</span></article>)}
        {!results.length && <p className="muted space">Finish your first session in Today to start your history. Cancelled sessions do not count.</p>}
        {status === "CanLoadMore" && <button className="secondary space" onClick={() => loadMore(12)}>Show older sessions</button>}
        {status === "LoadingMore" && <p role="status">Loading older sessions…</p>}
      </section>
    </>}
  </>;
}
