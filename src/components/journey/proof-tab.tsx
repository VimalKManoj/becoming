"use client";

import Link from "next/link";
import { Suspense, useState, type FormEvent, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Bone, Skeleton } from "@/components/skeleton";
import { useRitual } from "@/components/ritual/ritual-context";
import { readableError } from "@/lib/errors";
import { formatDay, plural } from "@/lib/format";
import { useNow } from "@/lib/use-rhythm";
import { metaLine, OutLink, ScreenshotControls, shortDate, statusClass, useScreenshot, type Artifact } from "./proof-parts";
import { PublishFlow } from "./proof-publish";

// Journey › Proof: three counts (Draft, Ready to share, Published) that also filter the
// list, then the evidence itself. Open a row for its details and next step; publishing
// runs as its own flow at ?publish=<id>. Nothing here posts anywhere.

type ProofView = "all" | "Draft" | "Ready to share" | "Published" | "candidates";
const views: ProofView[] = ["all", "Draft", "Ready to share", "Published", "candidates"];
const asView = (value: string | null): ProofView => views.find(view => view === value) ?? "all";
const headings: Record<ProofView, string> = { "all": "All evidence", "Draft": "Drafts", "Ready to share": "Ready to share", "Published": "Published", "candidates": "Portfolio candidates" };
const tiles = [
  { id: "Draft", key: "draft", label: "Draft · private notes", cls: "draft" },
  { id: "Ready to share", key: "ready", label: "Ready to share", cls: "ready" },
  { id: "Published", key: "published", label: "Published, with a link", cls: "published" },
] as const;
// Pipeline counts stop at 1000 on the server, so say so rather than show a false total.
const shown = (count: number) => count >= 1000 ? "1000+" : String(count);
const focusOnMount = (node: HTMLElement | null) => node?.focus();
const field = (data: FormData, name: string) => String(data.get(name) || "").trim();

/** Rendered by Journey under its header when ?tab=proof. useSearchParams needs Suspense. */
export function ProofTab() {
  return <Suspense fallback={<ProofSkeleton />}><ProofTabBody /></Suspense>;
}

function ProofTabBody() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const publishId = params.get("publish");
  // The same address with or without ?publish=, always on the Proof tab.
  const href = (publish: string | null) => {
    const next = new URLSearchParams(params.toString());
    next.set("tab", "proof");
    if (publish) next.set("publish", publish); else next.delete("publish");
    return `${pathname}?${next.toString()}`;
  };
  if (publishId) return <PublishFlow key={publishId} artifactId={publishId} onClose={() => router.replace(href(null), { scroll: false })} />;
  return <ProofList requested={asView(params.get("view"))} publishHref={href} />;
}

function ProofList({ requested, publishHref }: { requested: ProofView; publishHref: (id: string) => string }) {
  const [view, setView] = useState<ProofView>(requested);
  // A new address (?view=Draft, say) chooses the view again.
  const [addressView, setAddressView] = useState(requested);
  if (requested !== addressView) { setAddressView(requested); setView(requested); }
  const [open, setOpen] = useState<Id<"artifacts"> | null>(null);
  const pipeline = useQuery(api.proof.pipeline);
  const { results, status, loadMore } = usePaginatedQuery(api.proof.listPage, { view }, { initialNumItems: 12 });
  const now = useNow();

  function choose(next: ProofView) { setView(next); setOpen(null); }
  const total = pipeline ? pipeline.draft + pipeline.ready + pipeline.published : undefined;
  const count = pipeline === undefined ? undefined : { "all": total, "Draft": pipeline.draft, "Ready to share": pipeline.ready, "Published": pipeline.published, "candidates": undefined }[view];

  return <div className="p-tab r-rise-6">
    <div className="p-tiles" role="group" aria-label="Show evidence by status">
      {tiles.map(tile => {
        const value = pipeline?.[tile.key];
        return <button key={tile.id} type="button" className={`p-tile ${tile.cls}`} aria-pressed={view === tile.id}
          aria-label={value === undefined ? tile.label : `${tile.label}: ${shown(value)}`} onClick={() => choose(view === tile.id ? "all" : tile.id)}>
          <span className="p-tile-count" aria-hidden="true">{value === undefined ? "·" : shown(value)}</span>
          <span className="p-tile-label" aria-hidden="true">{tile.label}</span>
        </button>;
      })}
    </div>

    <div className="p-filter">
      <h2 id="p-list-label" className="r-eyebrow">{headings[view]}{count !== undefined && count > 0 ? ` · ${count >= 1000 ? "1000+" : plural(count, "piece")}` : ""}</h2>
      <div className="r-row" style={{ gap: 6 }} role="group" aria-label="Filter evidence">
        <button type="button" className="r-chip round h34" aria-pressed={view === "all"} onClick={() => choose("all")}>All{total !== undefined && <span className="r-mono"> · {shown(total)}</span>}</button>
        <button type="button" className="r-chip round h34" aria-pressed={view === "candidates"} onClick={() => choose("candidates")}><span aria-hidden="true">★</span>Portfolio candidates</button>
      </div>
    </div>

    {status === "LoadingFirstPage" ? <RowsSkeleton />
      : results.length === 0 ? <EmptyView view={view} draft={pipeline?.draft ?? 0} ready={pipeline?.ready ?? 0} total={total ?? 0} onView={choose} />
        : <ul className="p-list" aria-labelledby="p-list-label">
          {results.map(artifact => <ProofRow key={artifact._id} artifact={artifact} now={now} expanded={open === artifact._id}
            onToggle={() => setOpen(open === artifact._id ? null : artifact._id)} publishHref={publishHref(artifact._id)} />)}
        </ul>}
    {(status === "CanLoadMore" || status === "LoadingMore") && <button type="button" className="r-ghost sm p-more" disabled={status === "LoadingMore"} onClick={() => loadMore(12)}>
      {status === "LoadingMore" ? "Loading more…" : "Show older evidence"}
    </button>}
    <p className="r-small p-foot">Evidence links from your recaps arrive as drafts. Nothing is ever posted for you.</p>
  </div>;
}

function ProofRow({ artifact, now, expanded, onToggle, publishHref }: { artifact: Artifact; now: number | null; expanded: boolean; onToggle: () => void; publishHref: string }) {
  const panelId = `p-panel-${artifact._id}`;
  return <li className="p-row">
    {/* Convex storage URLs of unknown size; next/image would need a remote pattern per deployment. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {artifact.imageUrl ? <img className="p-thumb" src={artifact.imageUrl} alt="" /> : <span className="p-thumb" aria-hidden="true" />}
    <div className="p-row-text">
      <h3 className="p-row-title">{artifact.title}</h3>
      <p className="p-row-meta">{metaLine(artifact, now)}</p>
    </div>
    <span className={`r-status ${statusClass[artifact.status]}`}>{artifact.status}</span>
    <button type="button" className="r-ghost xs" aria-expanded={expanded} aria-controls={panelId} aria-label={`${expanded ? "Close" : "Open"} ${artifact.title}`} onClick={onToggle}>{expanded ? "Close" : "Open"}</button>
    {expanded && <ProofDetail id={panelId} artifact={artifact} publishHref={publishHref} />}
  </li>;
}

/** An opened row: where it came from, its links, the next step, and everything to manage it. */
function ProofDetail({ id, artifact, publishHref }: { id: string; artifact: Artifact; publishHref: string }) {
  const { showToast } = useRitual();
  const update = useMutation(api.proof.update);
  const setStatus = useMutation(api.proof.setStatus);
  const setCandidate = useMutation(api.proof.setCandidate);
  const remove = useMutation(api.proof.remove);
  const screenshot = useScreenshot();
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [busy, setBusy] = useState(false);
  const { source, status } = artifact;

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try { await action(); showToast(success); return true; }
    catch (caught) { showToast(readableError(caught), "alert"); return false; }
    finally { setBusy(false); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const values = { artifactId: artifact._id, title: field(data, "title"), url: field(data, "url"), notes: field(data, "notes"), skills: field(data, "skills").split(",") };
    if (await run(() => update(values), "Evidence details saved.")) setMode("view");
  }

  if (mode === "edit") return <form id={id} className="p-detail" onSubmit={save} aria-label={`Edit ${artifact.title}`}>
    <fieldset className="p-fields" disabled={busy}>
      <legend className="sr-only">Edit evidence</legend>
      <label className="r-field">Title<input ref={focusOnMount} className="r-input" name="title" required maxLength={1000} defaultValue={artifact.title} /></label>
      <label className="r-field">Evidence link<input className="r-input mono mint-text" name="url" type="url" required maxLength={2000} defaultValue={artifact.url} /></label>
      <label className="r-field">What it shows · optional<textarea className="r-textarea p-textarea" name="notes" rows={3} maxLength={4000} defaultValue={artifact.notes} placeholder="What problem, decision or trade-off does this show?" /></label>
      <label className="r-field">Skills shown · comma-separated<input className="r-input" name="skills" maxLength={500} defaultValue={artifact.skills.join(", ")} placeholder="Interaction design, React, accessibility" /></label>
      <div className="r-row" style={{ gap: 8 }}>
        <button type="submit" className="r-btn sm">{busy ? "Saving…" : "Save details"}</button>
        <button type="button" className="r-ghost sm" onClick={() => setMode("view")}>Cancel</button>
      </div>
    </fieldset>
  </form>;

  if (mode === "delete") return <div id={id} className="p-detail" role="group" aria-label="Confirm deletion">
    <p className="r-body">Delete this evidence{artifact.imageUrl ? " and its screenshot" : ""}? The session stays in your Journey. This can’t be undone.</p>
    <div className="r-row" style={{ gap: 8 }}>
      <button type="button" className="r-btn red" disabled={busy} onClick={() => void run(() => remove({ artifactId: artifact._id }), "Evidence deleted.")}>Delete evidence</button>
      <button ref={focusOnMount} type="button" className="r-ghost sm" onClick={() => setMode("view")}>Keep it</button>
    </div>
  </div>;

  return <div id={id} className="p-detail">
    {source ? <div className="p-source">
      <div className="r-row" style={{ gap: 8 }}><span className={`r-dot lane-${source.lane}`} aria-hidden="true" /><span className="r-small">{source.lane} · {formatDay(source.endedAt)}</span></div>
      <p className="r-body">From “{source.title}” <span className="p-muted">· {source.outcome}</span></p>
      {source.contribution && <p className="p-text preserve">{source.contribution}</p>}
    </div> : <p className="r-small">The source session is unavailable.</p>}
    {artifact.notes && <div className="r-inset"><div className="r-eyebrow-sm">What it shows</div><p className="p-text preserve" style={{ marginTop: 4 }}>{artifact.notes}</p></div>}
    {artifact.skills.length > 0 && <div>
      <div className="r-eyebrow-sm">Skills shown</div>
      <ul className="p-skills">{artifact.skills.map(skill => <li key={skill} className="r-fact">{skill}</li>)}</ul>
    </div>}
    <dl className="p-links">
      <div><dt className="r-eyebrow-sm">Evidence</dt><dd><OutLink href={artifact.url} /></dd></div>
      {artifact.publishedUrl && <div><dt className="r-eyebrow-sm">Published{artifact.publishedOn ? ` · ${shortDate(artifact.publishedOn)}` : ""}</dt><dd><OutLink href={artifact.publishedUrl} tone="ember" /></dd></div>}
    </dl>

    {/* The one next step for this status, then the candidate flag beside it. */}
    <div className="r-row" style={{ gap: 8 }}>
      {status === "Draft" && <button type="button" className="r-btn sm" disabled={busy}
        onClick={() => void run(() => setStatus({ artifactId: artifact._id, status: "Ready to share" }), `“${artifact.title}” is ready to share. Publish it once it’s out.`)}>Mark ready to share</button>}
      {status === "Ready to share" && <Link className="r-btn sm" href={publishHref}>Publish it</Link>}
      {status === "Published" && artifact.publishedUrl && <a className="r-ghost sm" href={artifact.publishedUrl} target="_blank" rel="noreferrer">View <span aria-hidden="true">↗</span><span className="sr-only"> where it was published (opens in a new tab)</span></a>}
      <button type="button" className="r-chip round h40" aria-pressed={artifact.portfolioCandidate} disabled={busy}
        onClick={() => void run(() => setCandidate({ artifactId: artifact._id, portfolioCandidate: !artifact.portfolioCandidate }), artifact.portfolioCandidate ? "Removed from portfolio candidates." : "Flagged as a portfolio candidate.")}>
        <span aria-hidden="true">{artifact.portfolioCandidate ? "★" : "☆"}</span>Portfolio candidate
      </button>
    </div>

    <div className="p-manage">
      <button type="button" className="r-link p-quiet" disabled={busy} onClick={() => setMode("edit")}>Edit details</button>
      <ScreenshotControls artifact={artifact} busy={busy}
        onUpload={file => void run(() => screenshot.upload(artifact._id, file), "Screenshot added.")}
        onRemove={() => void run(() => screenshot.remove(artifact._id), "Screenshot removed.")} />
      {status === "Draft" && <Link className="r-link p-quiet" href={publishHref}>Already public? Mark published</Link>}
      {status === "Published" && <Link className="r-link p-quiet" href={publishHref}>Change the link</Link>}
      {status !== "Draft" && <button type="button" className="r-link p-quiet" disabled={busy}
        onClick={() => void run(() => setStatus({ artifactId: artifact._id, status: "Draft" }), `“${artifact.title}” is back in drafts.`)}>Back to draft</button>}
      <button type="button" className="r-link p-quiet p-danger" disabled={busy} onClick={() => setMode("delete")}>Delete</button>
    </div>
  </div>;
}

/** Honest, per view: why it's empty, and the one useful place to go instead. */
function EmptyView({ view, draft, ready, total, onView }: { view: ProofView; draft: number; ready: number; total: number; onView: (view: ProofView) => void }) {
  const go = (target: ProofView, n: number, word: string) => <button type="button" className="r-ghost sm" onClick={() => onView(target)}>See {shown(n)} {word}</button>;
  const drafts = draft === 1 ? "draft" : "drafts";
  const content: Record<ProofView, { title: string; detail: string; action: ReactNode }> = {
    "all": { title: "Your first proof belongs here.", detail: "Add an evidence link when you finish a session in Today, or add one to a past session under Progress → All sessions. It arrives here as a private draft.",
      action: <Link className="r-ghost sm" href="/today">Go to Today</Link> },
    "Draft": { title: "No drafts right now.", detail: "New evidence starts here, from the evidence link in a recap.",
      action: ready > 0 ? go("Ready to share", ready, "ready to share") : null },
    "Ready to share": { title: "Nothing is ready to share yet.", detail: "When a draft could be shown to someone, open it and mark it ready to share.",
      action: draft > 0 ? go("Draft", draft, drafts) : null },
    "Published": { title: "Nothing is marked published yet.", detail: "Post it yourself, then save its link and the day it went out. Becoming never posts for you.",
      action: ready > 0 ? go("Ready to share", ready, "ready to share") : draft > 0 ? go("Draft", draft, drafts) : null },
    "candidates": { title: "No portfolio candidates yet.", detail: "Flag your strongest evidence as a portfolio candidate to gather it here.",
      action: total > 0 ? go("all", total, total === 1 ? "piece" : "pieces") : null },
  };
  const { title, detail, action } = content[view];
  return <div className="r-card p-empty">
    <p className="p-empty-title">{title}</p>
    <p className="r-lede">{detail}</p>
    {action}
  </div>;
}

function RowsSkeleton() {
  return <Skeleton label="Loading your evidence…" className="r-stack p-skel"><RowBones /></Skeleton>;
}

function RowBones() {
  return <>{[0, 1, 2].map(n => <div key={n} className="p-row" aria-hidden="true">
    <Bone w={84} h={60} shape="block" i={n * 2} />
    <span className="p-row-text r-stack" style={{ gap: 6 }}><Bone w="58%" h={14} i={n * 2 + 1} /><Bone w="40%" h={10} i={n * 2 + 2} /></span>
    <Bone w={92} h={26} shape="pill" i={n * 2 + 2} />
    <Bone w={64} h={38} shape="pill" i={n * 2 + 3} />
  </div>)}</>;
}

function ProofSkeleton() {
  return <Skeleton label="Opening your proof…" className="p-tab">
    <div className="p-tiles" aria-hidden="true">{tiles.map((tile, n) => <div key={tile.id} className={`p-tile ${tile.cls}`}><Bone w={24} h={28} i={n} /><Bone w="60%" h={11} i={n + 1} /></div>)}</div>
    <RowBones />
  </Skeleton>;
}
