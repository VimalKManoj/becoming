"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { radioKeys } from "@/components/ritual/radio-keys";
import { useRitual } from "@/components/ritual/ritual-context";
import { readableError } from "@/lib/errors";
import { connectCommand, mcpEndpoint as endpoint, trusts, type Trust } from "@/components/assistants/connect";

// Settings → Assistants: access tokens for Becoming's MCP endpoint (convex/mcp.ts). An
// assistant can read your work and change it. Each token's trust says what goes straight in
// and what waits in the Inbox on Today (PLAN-one-tap-and-daily-loop, Phase 2).
// A token is shown once, then only its first characters. "Set up step by step" opens the
// same guided sheet as Today's badge (components/assistants/connect-sheet.tsx).

const names = ["Claude Code", "Claude", "ChatGPT", "Cursor"];
const when = (time: number) => new Date(time).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function AssistantsCard() {
  const { showToast, openConnect } = useRitual();
  const tokens = useQuery(api.assistants.tokens);
  const create = useAction(api.assistants.createToken);
  const revoke = useMutation(api.assistants.revokeToken);
  const setTrust = useMutation(api.assistants.setTrust);
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

  async function trust(tokenId: Id<"apiTokens">, value: Trust) {
    try { await setTrust({ tokenId, trust: value }); }
    catch (caught) { showToast(readableError(caught, "Could not change what it can do. Please try again."), "alert"); }
  }

  const copy = (value: string, what: string) => void navigator.clipboard.writeText(value).then(() => showToast(`${what} copied.`), () => showToast("Couldn't copy. Select it and copy by hand.", "alert"));
  const command = fresh ? connectCommand(fresh.token) : "";

  return <section id="set-assistants" tabIndex={-1} className="s-card" aria-labelledby="set-assistants-h">
    <h2 id="set-assistants-h" className="s-h">Assistants</h2>
    <p className="r-small s-sub">Let Claude Code, Claude or ChatGPT read your work and record it as you go. By default they start, finish and log tasks straight away, and new plans wait in your <b>Inbox on Today</b>. Choose per token below.</p>

    {fresh
      ? <div className="s-token" role="status">
        <p className="s-switch-title">Token for {fresh.name}</p>
        <p className="r-small s-sub">Shown once. Treat it like a password: anyone with it can read your work and change it.</p>
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
        <span className="r-row" style={{ gap: 8 }}>
          <button type="button" className="r-ghost sm" onClick={openConnect}>Set up step by step</button>
          <button type="button" className="r-btn sm" disabled={busy} onClick={() => void make()}>{busy ? "Creating…" : `Create a token for ${name}`}</button>
        </span>
      </div>}

    {tokens && tokens.length > 0 && <ul className="s-tokens" aria-label="Access tokens">
      {tokens.map(token => <li key={token._id} className="s-token-item">
        <div className="s-switch-text">
          <p className="s-switch-title">{token.name} <code className="s-inline-code">{token.prefix}…</code></p>
          <p className="r-small s-sub">Created {when(token.createdAt)} · {token.lastUsedAt ? `last used ${when(token.lastUsedAt)}` : "not used yet"}</p>
          <div className="s-trust" role="radiogroup" aria-label={`What ${token.name} can do`} onKeyDown={radioKeys}>
            {trusts.map(item => <button key={item.value} type="button" role="radio" aria-checked={token.trust === item.value} className="r-chip round" onClick={() => void trust(token._id, item.value)}>{item.label}</button>)}
          </div>
          <p className="r-small s-sub">{trusts.find(item => item.value === token.trust)?.hint}</p>
        </div>
        {confirming === token._id
          ? <span className="r-row" style={{ gap: 6 }}><button type="button" className="r-btn red" disabled={busy} onClick={() => void remove(token._id)}>Revoke</button><button type="button" className="r-ghost xs" disabled={busy} onClick={() => setConfirming(null)}>Keep</button></span>
          : <button type="button" className="r-ghost xs" onClick={() => setConfirming(token._id)}>Revoke…</button>}
      </li>)}
    </ul>}

    <p className="r-small s-note">The Claude app (web, desktop and phone) and ChatGPT connect with “Sign in with Becoming”, which is coming next. Until then, use a token with Claude Code or another MCP client.</p>
  </section>;
}
