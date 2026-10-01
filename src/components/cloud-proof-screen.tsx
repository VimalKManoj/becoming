"use client";

import Link from "next/link";
import { usePaginatedQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

// The shared workspace shell handles sign-in; this renders only for a confirmed account.
export function CloudProofScreen() {
  const { results, status, loadMore } = usePaginatedQuery(api.proof.listPage, {}, { initialNumItems: 12 });

  return <>
    <div className="heading"><div><p className="eyebrow">Your body of work</p><h1>Make the progress visible.</h1><p className="muted">Each link stays connected to the focus session where you captured it.</p></div></div>
    {status === "LoadingFirstPage" ? <p role="status">Loading your evidence…</p> : <>
      <div className="grid">{results.map(artifact => <article className="panel stack" key={artifact._id}>
        <div className="row"><span className="badge">{artifact.status}</span>{artifact.source && <span className="small">{artifact.source.lane}</span>}</div>
        <h2>{artifact.title}</h2>
        {artifact.source ? <><p className="preserve">{artifact.source.contribution}</p><p className="small">From a {artifact.source.outcome.toLowerCase()} session · {new Date(artifact.source.endedAt).toLocaleDateString()}</p></> : <p className="muted">The source session is unavailable.</p>}
        <a href={artifact.url} target="_blank" rel="noreferrer">Open evidence ↗</a>
      </article>)}</div>
      {!results.length && <section className="panel empty stack"><h2>Your first proof belongs here.</h2><p className="muted">Add a demo, screenshot, or writing link when you finish a session in Today.</p><Link href="/today">Go to Today</Link></section>}
      {status === "CanLoadMore" && <button className="secondary space" onClick={() => loadMore(12)}>Show older evidence</button>}
      {status === "LoadingMore" && <p role="status">Loading older evidence…</p>}
    </>}
  </>;
}
