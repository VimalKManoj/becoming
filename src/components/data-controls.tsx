"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { useRitual } from "@/components/ritual/ritual-context";
import { readableError } from "@/lib/errors";

type Backup = FunctionArgs<typeof api.data.importBackup>["backup"];
type Kind = "workspace" | "account";

const failure = (caught: unknown) => (caught instanceof Error && !("data" in caught) ? caught.message : readableError(caught));

// Settings' "Your data" card: export, restore into an empty workspace, and the two
// permanent deletions behind "Type DELETE". Every step says what it will and won't do.
export function DataControls() {
  const convex = useConvex();
  const router = useRouter();
  const { showToast } = useRitual();
  const { data: session } = authClient.useSession();
  const empty = useQuery(api.data.isEmpty);
  const importBackup = useMutation(api.data.importBackup);
  const deleteBatch = useMutation(api.data.deleteBatch);
  const [busy, setBusy] = useState(false);
  const [keepError, setKeepError] = useState("");
  const [pending, setPending] = useState<{ backup: Backup; summary: string } | null>(null);
  const [confirming, setConfirming] = useState<Kind | null>(null);
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  // Google-only accounts have no password: they confirm with a recent sign-in instead.
  const [hasPassword, setHasPassword] = useState(true);
  const [deleteError, setDeleteError] = useState("");

  async function exportBackup() {
    setBusy(true); setKeepError("");
    try {
      const backup = await convex.query(api.data.exportAll, {});
      const stamped = { ...backup, exportedAt: Date.now() };
      const file = `becoming-backup-${new Date(stamped.exportedAt).toISOString().slice(0, 10)}.json`;
      const url = URL.createObjectURL(new Blob([JSON.stringify(stamped, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url; link.download = file; link.click();
      // Some browsers start the download after click() returns, so release the file a moment later.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast(`Downloaded ${file}. Keep it somewhere safe.`);
    } catch (caught) { setKeepError(failure(caught)); }
    finally { setBusy(false); }
  }

  async function chooseFile(file: File | undefined) {
    setKeepError(""); setPending(null);
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Backup;
      if (parsed?.format !== "becoming-backup") throw new Error("That file isn't a Becoming backup.");
      const summary = `${parsed.tasks?.length ?? 0} tasks, ${parsed.sessions?.length ?? 0} sessions, ${parsed.ideas?.length ?? 0} ideas, ${parsed.projects?.length ?? 0} projects and ${parsed.artifacts?.length ?? 0} pieces of proof`;
      setPending({ backup: parsed, summary });
    } catch (caught) {
      setKeepError(caught instanceof SyntaxError ? "That file isn't valid JSON, so it can't be a backup." : caught instanceof Error ? caught.message : "Could not read that file.");
    }
  }

  async function restore() {
    if (!pending) return;
    setBusy(true); setKeepError("");
    try {
      const result = await importBackup({ backup: pending.backup });
      setPending(null);
      showToast(`Restored ${result.tasks} tasks, ${result.sessions} sessions, ${result.ideas} ideas and ${result.projects} projects.`);
    } catch (caught) {
      // The server checks every field; a hand-edited file may not match the format.
      setKeepError(caught instanceof ConvexError ? readableError(caught) : "That backup doesn't match the format this app restores. Nothing was changed.");
    } finally { setBusy(false); }
  }

  async function deleteEverything() {
    // Small batches until nothing owned is left.
    for (let round = 0; round < 1000; round += 1) {
      const { done } = await deleteBatch({});
      if (done) return;
    }
    throw new Error("Deletion is taking longer than expected. Please try again to finish it.");
  }

  function ask(kind: Kind | null) {
    setConfirming(kind); setTyped(""); setPassword(""); setDeleteError("");
    if (kind === "account") void authClient.listAccounts().then(result => { if (result.data) setHasPassword(result.data.some(account => account.providerId === "credential")); });
  }

  const ready = typed.trim().toUpperCase() === "DELETE" && (confirming !== "account" || !hasPassword || password.length > 0);

  async function confirmDelete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirming || !ready || busy) return;
    setBusy(true); setDeleteError("");
    try {
      if (confirming === "workspace") {
        await deleteEverything();
        ask(null);
        showToast("Your workspace data is deleted. Your account stays.");
        return;
      }
      const email = session?.user.email;
      if (!email) throw new Error("Your session has ended. Sign in again, then delete your account.");
      if (hasPassword) {
        // Check the password before deleting anything, so a typo can't leave a half-deleted account.
        const check = await authClient.signIn.email({ email, password });
        if (check.error) throw new Error("That password isn't right. Nothing was deleted.");
      } else if (Date.now() - new Date(session.session.createdAt).getTime() > 20 * 60 * 60 * 1000) {
        // Without a password, removing the account needs a sign-in from the last day.
        throw new Error("For safety, sign out and continue with Google again, then delete your account. Nothing was deleted.");
      }
      await deleteEverything();
      const removed = await authClient.deleteUser(hasPassword ? { password } : {});
      if (removed.error) throw new Error("Your workspace data is deleted, but the sign-in account couldn't be removed. Sign in and try again.");
      router.push("/account");
    } catch (caught) { setDeleteError(failure(caught)); }
    finally { setBusy(false); }
  }

  const restoreOff = busy || empty !== true;
  return <section id="set-data" tabIndex={-1} className="s-card" aria-labelledby="set-data-h">
    <h2 id="set-data-h" className="s-h">Your data</h2>
    <div className="s-tiles">
      <div className="s-tile">
        <h3 className="s-tile-title">Export a backup</h3>
        <p className="s-tile-text">Everything in one JSON file, with the links between tasks, sessions and proof. Screenshots aren’t included.</p>
        <button type="button" className="s-mini" disabled={busy} onClick={() => void exportBackup()}>Download backup</button>
      </div>
      <div className="s-tile">
        <h3 className="s-tile-title">Restore from a file</h3>
        <p className="s-tile-text">{empty === false
          ? "Restore only fills an empty workspace, and this one already has data, so nothing can be duplicated."
          : "You’ll see exactly what the file contains before anything changes. It restores into an empty workspace."}</p>
        {!pending && <label className={`s-mini${restoreOff ? " is-off" : ""}`}>Choose a file
          <input type="file" accept="application/json,.json" disabled={restoreOff} onChange={event => { void chooseFile(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
        </label>}
        {pending && <div className="s-restore" role="group" aria-label="Confirm restore">
          <p className="r-body">This file holds {pending.summary}. Your motive, rhythm and preferences become the backup’s.</p>
          <div className="r-row" style={{ gap: 8 }}>
            <button type="button" className="s-mini ember" disabled={busy} onClick={() => void restore()}>{busy ? "Restoring…" : "Restore it"}</button>
            <button type="button" className="s-mini" disabled={busy} onClick={() => setPending(null)}>Cancel</button>
          </div>
        </div>}
      </div>
    </div>
    {keepError && <p role="alert" className="s-error s-mt10">{keepError}</p>}

    <div className="s-danger">
      <h3 className="r-eyebrow red">Permanent</h3>
      {confirming
        ? <form className="s-confirm" onSubmit={event => void confirmDelete(event)} aria-label={confirming === "account" ? "Confirm account deletion" : "Confirm workspace deletion"}>
          <p className="s-confirm-text">{confirming === "account"
            ? "Your account and everything in it will be removed. This cannot be undone."
            : "Tasks, sessions, ideas, projects, proof and settings will be removed. Your account stays."}</p>
          <label className="r-field">Type DELETE to confirm
            <input className="s-confirm-input" value={typed} onChange={event => setTyped(event.target.value)} placeholder="DELETE" autoFocus autoComplete="off" autoCapitalize="characters" spellCheck={false} disabled={busy} />
          </label>
          {confirming === "account" && hasPassword && <label className="r-field">Your password
            <input className="s-confirm-input sans" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" disabled={busy} />
          </label>}
          {deleteError && <p role="alert" className="s-error">{deleteError}</p>}
          <div className="r-row" style={{ gap: 8 }}>
            <button type="submit" className="r-btn red" disabled={!ready || busy}>{busy ? "Deleting…" : confirming === "account" ? "Delete my account" : "Delete workspace data"}</button>
            <button type="button" className="r-ghost sm" disabled={busy} onClick={() => ask(null)}>Keep everything</button>
          </div>
        </form>
        : <>
          <div className="s-danger-actions">
            <button type="button" className="r-ghost red" disabled={busy} onClick={() => ask("workspace")}>Delete workspace data</button>
            <button type="button" className="r-ghost red" disabled={busy} onClick={() => ask("account")}>Delete account</button>
          </div>
          <p className="r-small s-mt10">Export a backup first if you might want this back.</p>
        </>}
    </div>
  </section>;
}
