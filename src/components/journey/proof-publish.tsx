"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { dayKey } from "../../../convex/lib/time";
import { Bone, Skeleton } from "@/components/skeleton";
import { useRitual } from "@/components/ritual/ritual-context";
import { readableError } from "@/lib/errors";
import { useNow } from "@/lib/use-rhythm";
import { host, OutLink, ScreenshotControls, useScreenshot, type Artifact } from "./proof-parts";

// The publish flow (design: Context → Where → Published). You post it yourself, then
// save the link here; Becoming only records where and when it went out.

const steps = ["Context", "Where", "Published"];
// Where it went: a choice that shapes the link's placeholder. The link itself is what's saved.
const places = [
  { name: "Portfolio", example: "https://your-site.com/…", match: null },
  { name: "X", example: "https://x.com/…", match: /(^|\.)(x|twitter)\.com$/ },
  { name: "LinkedIn", example: "https://linkedin.com/…", match: /(^|\.)linkedin\.com$/ },
  { name: "Dribbble", example: "https://dribbble.com/…", match: /(^|\.)dribbble\.com$/ },
];
const focusOnMount = (node: HTMLElement | null) => node?.focus({ preventScroll: true });

/** Detects the place from a typed link, so the chip follows what was pasted. */
function placeFor(link: string) {
  if (!/^https?:\/\/[^/]+\.[^/]+/.test(link.trim())) return null;
  const at = places.findIndex(place => place.match?.test(host(link.trim())));
  return at < 0 ? 0 : at;
}

export function PublishFlow({ artifactId, onClose }: { artifactId: string; onClose: () => void }) {
  const artifact = useQuery(api.proof.get, { artifactId });
  if (artifact === undefined) return <PublishSkeleton />;
  if (artifact === null) return <div className="p-flow r-rise-6">
    <div className="p-flow-head"><button type="button" className="r-back" onClick={onClose}>‹ Back</button></div>
    <h2 ref={focusOnMount} tabIndex={-1} className="p-flow-title">This evidence isn’t here.</h2>
    <p className="p-flow-lede">It may have been deleted, or the link is from another account. Everything you have is in Proof.</p>
    <button type="button" className="r-ghost sm" style={{ alignSelf: "flex-start" }} onClick={onClose}>Back to Proof</button>
  </div>;
  return <Flow artifact={artifact} onClose={onClose} />;
}

function Flow({ artifact, onClose }: { artifact: Artifact; onClose: () => void }) {
  const { showToast } = useRitual();
  const update = useMutation(api.proof.update);
  const setStatus = useMutation(api.proof.setStatus);
  const setCandidate = useMutation(api.proof.setCandidate);
  const screenshot = useScreenshot();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState(artifact.notes);
  const [link, setLink] = useState(artifact.publishedUrl ?? "");
  const [chosenDay, setChosenDay] = useState(artifact.publishedOn ?? "");
  const [chosenPlace, setChosenPlace] = useState<number | null>(null);
  const now = useNow();
  const today = now === null ? "" : dayKey(now, Intl.DateTimeFormat().resolvedOptions().timeZone);
  const day = chosenDay || today;
  const place = chosenPlace ?? placeFor(link);

  async function run(action: () => Promise<unknown>, success?: string) {
    setBusy(true);
    try { await action(); if (success) showToast(success); return true; }
    catch (caught) { showToast(readableError(caught), "alert"); return false; }
    finally { setBusy(false); }
  }

  async function toWhere() {
    const changed = notes.trim() !== artifact.notes;
    if (changed && !await run(() => update({ artifactId: artifact._id, title: artifact.title, url: artifact.url, notes, skills: artifact.skills }))) return;
    setStep(1);
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await run(() => setStatus({ artifactId: artifact._id, status: "Published", publishedUrl: link.trim(), publishedOn: day }))) setStep(2);
  }

  function done() {
    showToast("Published and linked. It now counts as proof.");
    onClose();
  }

  return <div className="p-flow r-rise-6">
    <div className="p-flow-head">
      <button type="button" className="r-back" onClick={() => step ? setStep(step - 1) : onClose()}>‹ Back</button>
      <ol className="p-steps" aria-label="Publish steps">
        {steps.map((label, i) => <li key={label} className={`p-step${i <= step ? " on" : ""}`} aria-current={i === step ? "step" : undefined}>
          <span className="p-step-n" aria-hidden="true">{i + 1}</span><span className="p-step-l">{label}</span>
        </li>)}
      </ol>
    </div>

    {step === 0 && <div className="r-stack" style={{ gap: 14 }}>
      <h2 key="context" ref={focusOnMount} tabIndex={-1} className="p-flow-title">{artifact.title}</h2>
      {/* A Convex storage URL of unknown size; next/image would need a remote pattern per deployment. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {artifact.imageUrl ? <img className="p-shot" src={artifact.imageUrl} alt={`Screenshot for ${artifact.title}`} />
        : <div className="p-shot empty" aria-hidden="true">{host(artifact.url).toUpperCase()} · FROM YOUR RECAP</div>}
      <div className="r-row p-shot-row">
        <ScreenshotControls artifact={artifact} busy={busy}
          onUpload={file => void run(() => screenshot.upload(artifact._id, file), "Screenshot added.")}
          onRemove={() => void run(() => screenshot.remove(artifact._id), "Screenshot removed.")} />
        <span className="p-shot-link"><span className="r-small">Evidence </span><OutLink href={artifact.url} /></span>
      </div>
      <label className="r-field">What it shows
        <textarea className="r-textarea p-textarea" rows={2} maxLength={4000} value={notes} onChange={event => setNotes(event.target.value)}
          placeholder="What problem, decision or trade-off does this show?" />
      </label>
      <button type="button" className="r-btn p-flat" disabled={busy} onClick={() => void toWhere()}>{busy ? "Saving…" : "Next: where it goes"}</button>
    </div>}

    {step === 1 && <form className="r-stack" style={{ gap: 14 }} onSubmit={publish}>
      <h2 key="where" ref={focusOnMount} tabIndex={-1} className="p-flow-title">Where did you share it?</h2>
      <p className="p-flow-lede">Post it yourself, then save the link here. Becoming never posts for you.</p>
      <div className="r-row p-where" role="group" aria-label="Where it went">
        {places.map((option, i) => <button key={option.name} type="button" className="r-chip round h40" aria-pressed={place === i}
          onClick={() => { setChosenPlace(i); document.getElementById("p-link")?.focus(); }}>{option.name}</button>)}
      </div>
      <label className="r-field">Public link
        <input id="p-link" className="r-input mono mint-text" type="url" required maxLength={2000} value={link}
          onChange={event => setLink(event.target.value)} placeholder={place === null ? "https://…" : places[place].example} />
      </label>
      <label className="r-field">Published on
        <input className="r-input p-date" type="date" required max={today || undefined} value={day} onChange={event => setChosenDay(event.target.value)} />
      </label>
      <button type="submit" className="r-btn p-flat" disabled={busy}>{busy ? "Saving…" : "Mark as published"}</button>
    </form>}

    {step === 2 && <div className="p-done">
      <div className="p-done-mark" aria-hidden="true"><span className="p-done-ring" /><span className="p-done-core">↗</span></div>
      <h2 key="done" ref={focusOnMount} tabIndex={-1} className="p-done-title">It’s out in the <em>world.</em></h2>
      <p className="p-done-text">{artifact.source
        ? <>Linked to “{artifact.source.title}”, the session it came from, so it can become part of a case study later.</>
        : "Saved with its public link, so it can become part of a case study later."}</p>
      {artifact.publishedUrl && <OutLink href={artifact.publishedUrl} tone="ember" />}
      <div className="p-cand">
        <div style={{ flex: 1 }}><div id="p-cand-label" className="p-cand-title">Portfolio candidate</div><div className="r-small" style={{ marginTop: 2 }}>Keep it for your next case study</div></div>
        <button type="button" role="switch" className="r-toggle" aria-checked={artifact.portfolioCandidate} aria-labelledby="p-cand-label" disabled={busy}
          onClick={() => void run(() => setCandidate({ artifactId: artifact._id, portfolioCandidate: !artifact.portfolioCandidate }))} />
      </div>
      <button type="button" className="r-btn block p-flat" onClick={done}>Done</button>
    </div>}
  </div>;
}

function PublishSkeleton() {
  return <Skeleton label="Opening the publish flow…" className="p-flow">
    <span className="p-flow-head" aria-hidden="true"><Bone w={84} h={36} shape="pill" /><span className="r-row" style={{ gap: 6 }}>{[0, 1, 2].map(n => <Bone key={n} w={86} h={28} shape="pill" i={n} />)}</span></span>
    <Bone w="64%" h={42} i={2} className="bone-title" />
    <Bone h={200} shape="block" i={3} />
    <Bone w={110} h={11} i={4} />
    <Bone h={72} shape="block" i={5} />
    <Bone h={56} shape="pill" i={6} className="bone-button" />
  </Skeleton>;
}
