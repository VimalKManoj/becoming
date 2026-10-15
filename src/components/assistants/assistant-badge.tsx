"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useRitual } from "@/components/ritual/ritual-context";
import { lastHeard } from "./connect";

// Today's assistant badge. Until an assistant has reached Becoming, it invites you to connect
// Claude Code (opening the connect sheet) and can be hidden on this device; once one has, it
// says so, with when it was last heard from, and leads to Settings → Assistants.

const hiddenKey = "becoming:connect-badge-hidden";
const readHidden = () => { try { return localStorage.getItem(hiddenKey) === "1"; } catch { return false; } };

export function AssistantBadge() {
  const { openConnect, showToast } = useRitual();
  const tokens = useQuery(api.assistants.tokens);
  const [hidden, setHidden] = useState(readHidden);
  if (tokens === undefined) return null;

  const heard = tokens.filter(item => item.lastUsedAt).sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))[0];
  if (heard) return <Link href="/settings#set-assistants" className="ab on" aria-label={`${heard.name} is connected, active ${lastHeard(heard.lastUsedAt ?? 0)}. Assistant settings`}>
    <Glyph on />
    <span className="ab-text"><b>{heard.name}</b><span className="ab-sub">connected · active {lastHeard(heard.lastUsedAt ?? 0)}</span></span>
  </Link>;

  if (hidden) return null;
  const hide = () => {
    try { localStorage.setItem(hiddenKey, "1"); } catch { /* Optional. */ }
    setHidden(true);
    showToast("Hidden. You can connect any time from Settings → Assistants.");
  };
  return <span className="ab-wrap">
    <button type="button" className="ab" onClick={openConnect}>
      <Glyph />
      <span className="ab-text"><b>Connect Claude Code</b><span className="ab-sub">your work records itself</span></span>
      <span className="ab-go" aria-hidden="true">→</span>
    </button>
    <button type="button" className="ab-x" aria-label="Hide the Connect Claude Code badge" onClick={hide}>×</button>
  </span>;
}

/** A terminal, a wire with a spark running along it, and the Becoming orb. */
export function Glyph({ on = false }: { on?: boolean }) {
  return <span className={`ab-glyph${on ? " on" : ""}`} aria-hidden="true">
    <span className="ab-term">›_</span><span className="ab-wire"><span className="ab-spark" /></span><span className="ab-orb" />
  </span>;
}
