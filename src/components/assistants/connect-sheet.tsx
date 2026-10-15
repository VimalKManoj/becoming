"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useRitual } from "@/components/ritual/ritual-context";
import { radioKeys } from "@/components/ritual/radio-keys";
import { useModal } from "@/components/ritual/use-modal";
import { readableError } from "@/lib/errors";
import { ClaudeLoop } from "./claude-loop";
import { connectCommand, lastHeard, pluginCommands, trusts, type Trust } from "./connect";

// Connect Claude Code, step by step, from anywhere (Today's badge, the end of onboarding,
// Settings → Assistants). Three steps: what it does (with the motion graphic), the one
// command to run, and "connected", which appears by itself the moment Claude Code first
// reaches Becoming (the new token's lastUsedAt, live). Then: what it may do, and the plugin.

export function ConnectSheet() {
  const { connecting, closeConnect } = useRitual();
  if (!connecting) return null;
  return <ConnectCard onClose={closeConnect} />;
}

function ConnectCard({ onClose }: { onClose: () => void }) {
  const { showToast } = useRitual();
  const tokens = useQuery(api.assistants.tokens);
  const create = useAction(api.assistants.createToken);
  const setTrust = useMutation(api.assistants.setTrust);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const row = token ? tokens?.find(item => token.startsWith(item.prefix)) : undefined;
  const step = !token ? "intro" : row?.lastUsedAt ? "connected" : "run";
  const already = tokens?.filter(item => item.lastUsedAt).sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))[0];

  const close = () => {
    if (step === "run") showToast("Not connected yet. Start again from Today whenever you like.");
    onClose();
  };
  const dialog = useModal<HTMLDivElement>(close);

  async function begin() {
    setBusy(true); setError("");
    try { setToken(await create({ name: "Claude Code", trust: "work" })); }
    catch (caught) { setError(readableError(caught, "Could not create a token. Please try again.")); }
    finally { setBusy(false); }
  }
  async function trust(value: Trust) {
    if (!row) return;
    try { await setTrust({ tokenId: row._id, trust: value }); }
    catch (caught) { showToast(readableError(caught, "Could not change what it can do. Please try again."), "alert"); }
  }
  const copy = (value: string, what: string) => void navigator.clipboard.writeText(value).then(
    () => showToast(`${what} copied.`),
    () => showToast("Couldn't copy. Select it and copy by hand.", "alert"),
  );
  const stepNumber = step === "intro" ? 0 : step === "run" ? 1 : 2;

  return <div ref={dialog} className="r-cap" role="dialog" aria-modal="true" aria-labelledby="cn-title">
    <div className="r-cap-back" onClick={close} />
    <div className="r-cap-card cn" aria-busy={busy}>
      <div className="r-row r-between">
        <ol className="cn-steps" aria-label={`Step ${stepNumber + 1} of 3`}>
          {["What it does", "Run one command", "Connected"].map((label, i) => <li key={label} className={i < stepNumber ? "past" : i === stepNumber ? "now" : undefined} aria-current={i === stepNumber ? "step" : undefined}><span className="cn-dot" />{label}</li>)}
        </ol>
        <button type="button" className="r-close" aria-label="Close" onClick={close}>×</button>
      </div>

      {step === "intro" && <>
        <h2 id="cn-title" className="cn-title">Let Claude <em>keep the record.</em></h2>
        <div className="cn-art"><ClaudeLoop /></div>
        <ul className="cn-points">
          <li><span className="cn-num">01</span>You work in Claude Code. It starts the task when you begin, and finishes it with a summary, the skills and the PR link.</li>
          <li><span className="cn-num">02</span>It shows up here in seconds, on Today and in Journey. Every move has an Undo.</li>
          <li><span className="cn-num">03</span>New plans wait for your approval. You choose how much it can do.</li>
        </ul>
        {already && <p className="r-small">{already.name} is already connected (active {lastHeard(already.lastUsedAt ?? 0)}). This makes a new token, for another computer for example.</p>}
        {error && <p role="alert" className="r-small cn-error">{error}</p>}
        <button type="button" className="r-btn" disabled={busy} onClick={() => void begin()}>{busy ? "Getting it ready…" : "Connect Claude Code"}</button>
        <p className="r-small cn-foot">Cursor or VS Code: Settings → Assistants has the address. The Claude app and ChatGPT come with “Sign in with Becoming”.</p>
      </>}

      {step === "run" && token && <>
        <h2 id="cn-title" className="cn-title">Run this once in a <em>terminal.</em></h2>
        <p className="r-body cn-lede">It adds Becoming to Claude Code for every project. Then start <code className="cn-inline">claude</code> anywhere, or run <code className="cn-inline">claude mcp list</code>.</p>
        <div className="cn-code-row"><code className="cn-code">{connectCommand(token)}</code><button type="button" className="r-btn sm" onClick={() => copy(connectCommand(token), "Command")}>Copy</button></div>
        <div className="cn-wait" role="status"><span className="cn-pulse" aria-hidden="true" />Waiting for Claude Code to connect… this updates by itself.</div>
        <p className="r-small">The token in it is shown only here. Treat it like a password: anyone with it can read and change your work. You can revoke it in Settings → Assistants.</p>
        <button type="button" className="r-ghost sm cn-later" onClick={close}>Finish later</button>
      </>}

      {step === "connected" && row && <>
        <div className="cn-burst" aria-hidden="true"><span className="cn-ring" /><span className="cn-ring two" /><span className="cn-check">✓</span></div>
        <h2 id="cn-title" className="cn-title center">Claude Code is <em>connected.</em></h2>
        <p className="r-body cn-lede center">Try asking it: “What should I work on tonight?”</p>

        <section className="cn-section" aria-labelledby="cn-trust">
          <h3 id="cn-trust" className="cn-h">What it can do</h3>
          <div className="s-trust" role="radiogroup" aria-labelledby="cn-trust" onKeyDown={radioKeys}>
            {trusts.map(item => <button key={item.value} type="button" role="radio" aria-checked={row.trust === item.value} className="r-chip round" onClick={() => void trust(item.value)}>{item.label}</button>)}
          </div>
          <p className="r-small">{trusts.find(item => item.value === row.trust)?.hint}</p>
        </section>

        <section className="cn-section" aria-labelledby="cn-plugin">
          <h3 id="cn-plugin" className="cn-h">Add the Becoming plugin <span className="r-small">optional</span></h3>
          <p className="r-small"><code className="cn-inline">/becoming:next</code> starts a task, <code className="cn-inline">/becoming:done</code> finishes it with a summary and the PR link, and <code className="cn-inline">/becoming:log</code> logs progress. Each new session starts knowing what&apos;s in progress.</p>
          <div className="cn-code-row"><code className="cn-code">{pluginCommands}</code><button type="button" className="r-ghost sm" onClick={() => copy(pluginCommands, "Plugin commands")}>Copy</button></div>
        </section>

        <button type="button" className="r-btn" onClick={onClose}>Done</button>
      </>}
    </div>
  </div>;
}
