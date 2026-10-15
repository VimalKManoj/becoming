// The connect motion graphic: Claude Code on the left runs /becoming:next, works, then
// /becoming:done; each command sends a spark across to the task card on the right, which
// goes Ready → In progress → Done, with "via Claude Code" and the skill it grew. One SVG, so
// it scales with its box; an 8-second loop (styles in assistants.css, all under .cl). With
// reduced motion it holds the last frame. Decorative: the words around it say the same.

export function ClaudeLoop({ className = "" }: { className?: string }) {
  return <svg className={`cl ${className}`} viewBox="0 0 480 252" role="presentation" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id="cl-halo"><stop offset="0" stopColor="#86E3C3" stopOpacity=".35" /><stop offset="1" stopColor="#86E3C3" stopOpacity="0" /></radialGradient>
    </defs>

    {/* Claude Code, in a terminal */}
    <g className="cl-term">
      <rect x="8" y="22" width="222" height="208" rx="16" className="cl-term-box" />
      <circle cx="28" cy="42" r="4" className="cl-light" /><circle cx="41" cy="42" r="4" className="cl-light" /><circle cx="54" cy="42" r="4" className="cl-light" />
      <text x="119" y="46" textAnchor="middle" className="cl-mono cl-muted">claude</text>
      <line x1="8" x2="230" y1="58" y2="58" className="cl-rule" />

      <text x="24" y="86" className="cl-mono"><tspan className="cl-ember">›</tspan> /becoming:next</text>
      <rect x="34" y="72" width="130" height="20" className="cl-cover cl-type-1" />
      <text x="24" y="108" className="cl-mono cl-l2"><tspan className="cl-mint">✓</tspan> started <tspan className="cl-ink">Wire the endpoint</tspan></text>
      <text x="24" y="130" className="cl-mono cl-muted cl-l3">· editing convex/mcp.ts</text>
      <text x="24" y="152" className="cl-mono cl-muted cl-l4">· 12 tests pass</text>
      <text x="24" y="182" className="cl-mono"><tspan className="cl-ember">›</tspan> /becoming:done</text>
      <rect x="34" y="168" width="130" height="20" className="cl-cover cl-type-2" />
      <text x="24" y="204" className="cl-mono cl-l6"><tspan className="cl-mint">✓</tspan> done · PR #42 linked</text>
    </g>

    {/* The sparks, from each command to the task's status */}
    <path d="M200 81 C 262 81, 236 118, 289 118" className="cl-wire" />
    <path d="M200 177 C 262 177, 236 118, 289 118" className="cl-wire" />
    <path d="M200 81 C 262 81, 236 118, 300 118" pathLength="100" className="cl-beam cl-beam-1" />
    <path d="M200 177 C 262 177, 236 118, 300 118" pathLength="100" className="cl-beam cl-beam-2" />

    {/* The task in Becoming */}
    <g className="cl-card">
      <circle cx="372" cy="128" r="110" fill="url(#cl-halo)" className="cl-halo" />
      <rect x="266" y="46" width="206" height="168" rx="20" className="cl-card-box" />
      <rect x="266" y="46" width="206" height="168" rx="20" className="cl-card-glow" />
      <text x="286" y="72" className="cl-mono cl-eyebrow">0B·2 · BECOMING</text>
      <text x="286" y="96" className="cl-title">Wire the endpoint</text>

      <circle cx="298" cy="118" r="9" className="cl-ring" />
      <path d="M298 109 A9 9 0 0 0 298 127 Z" className="cl-half" />
      <circle cx="298" cy="118" r="9" className="cl-ping cl-ping-1" />
      <circle cx="298" cy="118" r="9" className="cl-ping cl-ping-2" />
      <g className="cl-check"><circle cx="298" cy="118" r="9" className="cl-check-dot" /><path d="M293.5 118.3 l3 3 l5.5 -6" className="cl-check-mark" /></g>
      <text x="316" y="122.5" className="cl-status cl-s-ready">Ready</text>
      <text x="316" y="122.5" className="cl-status cl-s-doing">In progress</text>
      <text x="316" y="122.5" className="cl-status cl-s-done">Done</text>

      <line x1="286" x2="452" y1="142" y2="142" className="cl-rule" />
      <text x="286" y="164" className="cl-mono cl-muted cl-via">DONE · via Claude Code</text>
      <g className="cl-chip">
        <rect x="286" y="176" width="78" height="24" rx="12" className="cl-chip-box" />
        <text x="325" y="192" textAnchor="middle" className="cl-chip-text">+ Systems</text>
      </g>
      <g className="cl-chip cl-chip-pr">
        <rect x="370" y="176" width="62" height="24" rx="12" className="cl-pr-box" />
        <text x="401" y="192" textAnchor="middle" className="cl-pr-text">PR #42</text>
      </g>
    </g>
  </svg>;
}
