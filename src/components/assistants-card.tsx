"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { radioKeys } from "@/components/ritual/radio-keys";
import { useRitual } from "@/components/ritual/ritual-context";
import { readableError } from "@/lib/errors";

// Settings → Assistants: access tokens for Becoming's MCP endpoint (convex/mcp.ts). An
// assistant can read your work and propose updates; proposals wait in the Inbox on Today.
// A token is shown once, then only its first characters.

const endpoint = `${process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? ""}/mcp`;
const names = ["Claude Code", "Claude", "ChatGPT", "Cursor"];
const when = (time: number) => new Date(time).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function AssistantsCard() {
  const { showToast } = useRitual();
  const tokens = useQuery(api.assistants.tokens);
  const create = useAction(api.assistants.createToken);
  const revoke = useMutation(api.assistants.revokeToken);
  const [name, setName] = useState("Claude Code");
  const [fresh, setFresh] = useState<{ name: string; token: string } | null>(null);
  const [confirming, setConfirming] = useState<Id<"apiTokens"> | null>(null);
  const [busy, setBusy] = useState(false);

  async function make() {
    setBusy(true);
    try { setFresh({ name, token: await create({ name }) }); }
    catch (caught) { showToast(readableError(caught, "Could not create a token. Please try again."), "alert"); }
    finally { setBusy(false); }
  }

  async function remove(tokenId: Id<"apiTokens">) {
    setBusy(true);
    try { await revoke({ tokenId }); setConfirming(null); showToast("Token revoked. That assistant can't reach Becoming any more."); }
    catch (caught) { showToast(readableError(caught, "Could not revoke the token. Please try again."), "alert"); }
    finally { setBusy(false); }
  }

  const copy = (value: string, what: string) => void navigator.clipboard.writeText(value).then(() => showToast(`${what} copied.`), () => showToast("Couldn't copy. Select it and copy by hand.", "alert"));
  const command = fresh ? `claude mcp add --transport http becoming ${endpoint} --header "Authorization: Bearer ${fresh.token}"` : "";

  return <section id="set-assistants" tabIndex={-1} className="s-card" aria-labelledby="set-assistants-h">
    <h2 id="set-assistants-h" className="s-h">Assistants</h2>
    <p className="r-small s-sub">Let Claude Code, Claude or ChatGPT read your work and suggest updates as you go. Anything they add waits in your <b>Inbox on Today</b> until you approve it.</p>

    {fresh
      ? <div className="s-token" role="status">
        <p className="s-switch-title">Token for {fresh.name}</p>
        <p className="r-small s-sub">Shown once. Treat it like a password: anyone with it can read your work and send proposals.</p>
        <div className="s-token-row"><code className="s-code">{fresh.token}</code><button type="button" className="r-ghost xs" onClick={() => copy(fresh.token, "Token")}>Copy</button></div>
        <p className="s-switch-title s-mt10">Connect Claude Code</p>
        <p className="r-small s-sub">Run this once in a terminal. Then ask Claude things like “what should I work on tonight?” or “log this to Becoming”.</p>
        <div className="s-token-row"><code className="s-code">{command}</code><button type="button" className="r-ghost xs" onClick={() => copy(command, "Command")}>Copy</button></div>
        <p className="r-small s-mt10">Other MCP clients (Cursor, VS Code): server URL <code className="s-inline-code">{endpoint}</code> with the header <code className="s-inline-code">Authorization: Bearer &lt;token&gt;</code>.</p>
        <button type="button" className="r-ghost sm s-mt10" onClick={() => setFresh(null)}>Done, I’ve saved it</button>
      </div>
      : <div className="s-token-new">
        <div className="s-chips" role="radiogroup" aria-label="Which assistant" onKeyDown={radioKeys}>
          {names.map(item => <button key={item} type="button" role="radio" aria-checked={name === item} className="r-chip round h34" onClick={() => setName(item)}>{item}</button>)}
        </div>
        <button type="button" className="r-btn sm" disabled={busy} onClick={() => void make()}>{busy ? "Creating…" : `Create a token for ${name}`}</button>
      </div>}

    {tokens && tokens.length > 0 && <ul className="s-tokens" aria-label="Access tokens">
      {tokens.map(token => <li key={token._id} className="s-token-item">
        <div className="s-switch-text">
          <p className="s-switch-title">{token.name} <code className="s-inline-code">{token.prefix}…</code></p>
          <p className="r-small s-sub">Created {when(token.createdAt)} · {token.lastUsedAt ? `last used ${when(token.lastUsedAt)}` : "not used yet"}</p>
        </div>
        {confirming === token._id
          ? <span className="r-row" style={{ gap: 6 }}><button type="button" className="r-btn red" disabled={busy} onClick={() => void remove(token._id)}>Revoke</button><button type="button" className="r-ghost xs" disabled={busy} onClick={() => setConfirming(null)}>Keep</button></span>
          : <button type="button" className="r-ghost xs" onClick={() => setConfirming(token._id)}>Revoke…</button>}
      </li>)}
    </ul>}

    <p className="r-small s-note">The Claude app (web, desktop and phone) and ChatGPT connect with “Sign in with Becoming”, which is coming next. Until then, use a token with Claude Code or another MCP client.</p>
  </section>;
}
