"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// Pieces shared by the Proof list and the publish flow.

export type Artifact = NonNullable<FunctionReturnType<typeof api.proof.get>>;
export type ArtifactStatus = Artifact["status"];

export const statusClass: Record<ArtifactStatus, string> = { "Draft": "s-draft", "Ready to share": "s-share", "Published": "s-published" };
export const imageTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const maxImageBytes = 5 * 1024 * 1024;

/** "example.com/post" from "https://example.com/post/". */
export const bare = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

/** "x.com" from a link, or the bare link if it doesn't parse. */
export function host(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return bare(url); }
}

/** "12 Sep" for a day key, without shifting the date (en-GB would write "Sept"). */
export function shortDate(day: string) {
  const date = new Date(`${day}T12:00:00Z`);
  return `${date.getUTCDate()} ${date.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" }).slice(0, 3)}`;
}

/** "today", "yesterday", "6 days ago", "3 weeks ago", then the date. `now` is null before the clock is read. */
export function ago(time: number, now: number | null) {
  const date = new Date(time);
  const fallback = `${date.getDate()} ${date.toLocaleDateString("en-GB", { month: "long" }).slice(0, 3)}`;
  if (now === null) return fallback;
  const days = Math.floor((now - time) / 86_400_000);
  if (days < 1) return "today";
  if (days < 2) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return fallback;
}

/** The row's second line: where it was published, or the session it came from. */
export function metaLine(artifact: Artifact, now: number | null) {
  if (artifact.status === "Published" && artifact.publishedUrl) return `Published${artifact.publishedOn ? ` ${shortDate(artifact.publishedOn)}` : ""} · ${host(artifact.publishedUrl)}`;
  if (!artifact.source) return "The source session is unavailable";
  return `From “${artifact.source.title}” · ${ago(artifact.source.endedAt, now)}`;
}

/** Upload, replace and remove a screenshot. Each throws a readable ConvexError on failure. */
export function useScreenshot() {
  const generateUploadUrl = useMutation(api.proof.generateUploadUrl);
  const attachImage = useMutation(api.proof.attachImage);
  const removeImage = useMutation(api.proof.removeImage);
  return {
    async upload(artifactId: Id<"artifacts">, file: File) {
      if (!imageTypes.includes(file.type) || file.size > maxImageBytes) throw new ConvexError("Choose a PNG, JPEG, WebP or GIF image of up to 5 MB.");
      const uploadUrl = await generateUploadUrl();
      const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      if (!response.ok) throw new ConvexError("The upload didn't arrive. Please try again.");
      const { storageId } = await response.json() as { storageId: Id<"_storage"> };
      // A rejected file is deleted on the server and its reason returned, not thrown.
      const result = await attachImage({ artifactId, storageId });
      if (!result.attached) throw new ConvexError(result.message);
    },
    remove: (artifactId: Id<"artifacts">) => removeImage({ artifactId }),
  };
}

/** Add or replace a screenshot (a file input inside a link-style label), and remove it. */
export function ScreenshotControls({ artifact, busy, onUpload, onRemove }: { artifact: Artifact; busy: boolean; onUpload: (file: File) => void; onRemove: () => void }) {
  return <>
    <label className="p-file">
      {artifact.imageUrl ? "Replace screenshot" : "Add a screenshot"}
      <input type="file" accept={imageTypes.join(",")} disabled={busy} onChange={event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (file) onUpload(file);
      }} />
    </label>
    {artifact.imageUrl && <button type="button" className="r-link p-quiet" disabled={busy} onClick={onRemove}>Remove screenshot</button>}
  </>;
}

/** A link that opens in a new tab, shown as its bare address. */
export function OutLink({ href, tone = "mint" }: { href: string; tone?: "mint" | "ember" }) {
  return <a className={`p-url ${tone}`} href={href} target="_blank" rel="noreferrer">
    <span className="p-url-text">{bare(href)}</span><span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span>
  </a>;
}
