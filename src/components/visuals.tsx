import type { CSSProperties } from "react";
import { bloomFull, bloomPetals } from "../../convex/lib/bloom";
import { capacityMax, capacityMin, petalPath, polar } from "@/lib/visuals";

// The design's signature pieces (1f Mind Bloom, 1g capacity dial, 1h focus orb), drawn
// from real values only. Each is an image with a text alternative; the numbers they
// show are also available as text nearby.

type Lane = "Projects" | "Showcases" | "Writing";
const laneColour: Record<Lane, string> = { Projects: "#FF8A3D", Showcases: "#86E3C3", Writing: "#C9B8F0" };

export type Petal = { name: string; sessions: number; lane: Lane };

/**
 * The Mind Bloom (Ritual design): eight skills in fixed places, each petal growing with
 * the sessions that practised it and full at ${bloomFull}. "mini" drops the labels; "all"
 * blooms every petal in on arrival; "reward" ripples and lights up the petals that grew.
 */
export function MindBloom({ petals, size = 300, label, labels = true, mode = "all", grown = [] }: {
  petals: Petal[]; size?: number; label: string; labels?: boolean; mode?: "all" | "mini" | "reward"; grown?: string[];
}) {
  const c = 160, r0 = 40, r1 = 146, gap = 7;
  const any = petals.some(petal => petal.sessions > 0);
  const lit = new Set(grown.map(name => name.toLowerCase()));
  return <svg viewBox="-10 -10 340 340" width={size} height={size} role="img" aria-label={label} className="bloom">
    <circle cx={c} cy={c} r={158} fill="none" stroke="rgba(255,235,215,.14)" strokeDasharray="1.5 7" className="bloom-ring" />
    {mode === "reward" && [0, 1, 2].map(i => <circle key={`ripple-${i}`} cx={c} cy={c} r={130} fill="none" stroke="#FF8A3D" strokeWidth={1.5} className="bloom-ripple" style={{ animationDelay: `${700 + i * 500}ms` }} />)}
    {Array.from({ length: bloomPetals }, (_, index) => {
      const a0 = index * 45, a1 = a0 + 45;
      const petal = petals[index];
      const value = petal?.sessions ?? 0;
      const rf = r0 + (r1 - r0) * Math.min(value, bloomFull) / bloomFull;
      const inside = rf > 110;
      const [x, y] = polar(c, c, inside ? rf - 32 : rf + 24, a0 + 22.5);
      const halo: CSSProperties = inside ? {} : { paintOrder: "stroke", stroke: "#171210", strokeWidth: 4, strokeLinejoin: "round" };
      const isGrown = mode === "reward" && petal && lit.has(petal.name.toLowerCase());
      const animation = mode === "all" ? `bloomIn .9s cubic-bezier(.2,.9,.25,1) ${150 + index * 70}ms both` : isGrown ? "bloomIn 1.1s cubic-bezier(.2,.9,.25,1) 500ms both" : "none";
      return <g key={index}>
        <path d={petalPath(c, r0, r1, a0, a1, gap)} fill="rgba(255,240,225,.06)" stroke="rgba(255,240,225,.06)" strokeWidth={8} strokeLinejoin="round" />
        {petal && value > 0 && <path key={isGrown ? `grown-${value}` : "petal"} d={petalPath(c, r0, rf, a0, a1, gap)} fill={laneColour[petal.lane]} stroke={laneColour[petal.lane]} strokeWidth={8} strokeLinejoin="round"
          className="petal" style={{ animation, filter: isGrown ? `drop-shadow(0 0 12px ${laneColour[petal.lane]})` : undefined }} />}
        {petal && value > 0 && labels && mode !== "mini" && <>
          <text x={x} y={y - 1} textAnchor="middle" fill={inside ? "#1B120D" : "#F4EDE6"} style={{ ...halo, font: "500 18px var(--r-mono)" }}>{value}</text>
          <text x={x} y={y + 13} textAnchor="middle" fill={inside ? "rgba(27,18,13,.78)" : "#C9BDB2"} style={{ ...halo, font: "500 10px var(--r-sans)" }}>{petal.name}</text>
        </>}
      </g>;
    })}
    <circle cx={c} cy={c} r={24} fill={any ? "#FF8A3D" : "rgba(255,240,225,.05)"} className={any ? "bloom-core" : undefined} />
  </svg>;
}

/** A picture of tonight's minutes on the 15–120 arc. The value itself is in the text beside it. */
export function CapacityDial({ minutes, size = 210 }: { minutes: number; size?: number }) {
  const cx = 150, cy = 150, f = (minutes - capacityMin) / (capacityMax - capacityMin);
  const [kx, ky] = polar(cx, cy, 134, -90 + 180 * f);
  return <svg viewBox="0 0 300 178" width={size} height={(size * 178) / 300} aria-hidden="true" className="dial">
    <path d="M16 150 A134 134 0 0 1 284 150" fill="none" stroke="rgba(255,240,225,.07)" strokeWidth={3} strokeLinecap="round" />
    <path d="M16 150 A134 134 0 0 1 284 150" fill="none" stroke="#FF8A3D" strokeWidth={3} strokeLinecap="round" pathLength={100} strokeDasharray={`${f * 100} 100`} className="dial-arc" />
    {Array.from({ length: 37 }, (_, i) => {
      const a = -90 + i * 5, major = i % 6 === 0, on = i / 36 <= f + 1e-6;
      const [x1, y1] = polar(cx, cy, major ? 98 : 106, a), [x2, y2] = polar(cx, cy, 120, a);
      return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={on ? "#FF8A3D" : "rgba(255,240,225,.16)"} strokeWidth={major ? 2.5 : 2} strokeLinecap="round" style={{ transition: `stroke .25s ${i * 6}ms` }} />;
    })}
    <circle cx={kx} cy={ky} r={13} fill="rgba(255,138,61,.25)" className="dial-knob" />
    <circle cx={kx} cy={ky} r={6.5} fill="#FFD2B0" className="dial-knob" />
    <text x={16} y={172} textAnchor="middle" fill="#A99D93" style={{ font: "500 11px var(--font-mono-stack)" }}>{capacityMin}</text>
    <text x={284} y={172} textAnchor="middle" fill="#A99D93" style={{ font: "500 11px var(--font-mono-stack)" }}>{capacityMax}</text>
  </svg>;
}

/** The focus orb's glow gauge: 72 ticks light up as planned time passes; a needle marks now. */
export function FocusGauge({ fraction, size = 300 }: { fraction: number; size?: number }) {
  const c = 150, N = 72;
  const f = Math.max(0, Math.min(1, fraction));
  const lit = Math.round(f * N);
  const [nx1, ny1] = polar(c, c, 86, f * 360), [nx2, ny2] = polar(c, c, 128, f * 360);
  return <svg viewBox="0 0 300 300" width={size} height={size} aria-hidden="true" className="gauge">
    <defs>
      <filter id="gauge-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation={9} /></filter>
      <radialGradient id="gauge-core" cx="50%" cy="40%" r="60%"><stop offset="0%" stopColor="#3A1A0C" /><stop offset="100%" stopColor="#0E0907" /></radialGradient>
    </defs>
    <circle cx={c} cy={c} r={146} fill="none" stroke="rgba(255,235,215,.12)" strokeWidth={1} />
    <circle cx={c} cy={c} r={124} fill="none" stroke="#FF6A2A" strokeWidth={34} opacity={0.45} pathLength={100} strokeDasharray={`${f * 100} 100`} transform={`rotate(-90 ${c} ${c})`} filter="url(#gauge-blur)" style={{ transition: "stroke-dasharray 1s linear" }} />
    {Array.from({ length: N }, (_, i) => {
      const a = (i * 360) / N, major = i % 6 === 0, on = i < lit;
      const [x1, y1] = polar(c, c, major ? 112 : 120, a), [x2, y2] = polar(c, c, 134, a);
      return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={on ? "#FFE2CC" : "rgba(255,240,225,.14)"} strokeOpacity={on ? 0.35 + 0.65 * ((i + 1) / lit) ** 2 : 1} strokeWidth={major ? 2.2 : 1.4} strokeLinecap="round" />;
    })}
    <line x1={nx1} y1={ny1} x2={nx2} y2={ny2} stroke="#FF8A3D" strokeWidth={8} strokeLinecap="round" opacity={0.5} filter="url(#gauge-blur)" />
    <line x1={nx1} y1={ny1} x2={nx2} y2={ny2} stroke="#FFF4EC" strokeWidth={2.5} strokeLinecap="round" />
    <circle cx={c} cy={c} r={82} fill="url(#gauge-core)" stroke="rgba(255,235,215,.18)" strokeWidth={1} />
  </svg>;
}

export type DayMark = { label: string; lane: Lane | null; today: boolean; future: boolean; count: number; paused?: boolean };

/** Seven days, each filled in the lane colour of that day's work with its initial. */
export function WeekDots({ days, size = 38 }: { days: DayMark[]; size?: number }) {
  return <ol className="week-dots" aria-label="This week, day by day">
    {days.map((day, index) => <li key={index} style={{ "--dot": `${size}px` } as CSSProperties}>
      <span className={`dot${day.lane ? ` lane-${day.lane.toLowerCase()} filled` : ""}${day.today ? " today" : ""}${day.paused ? " paused" : ""}`} aria-hidden="true">{day.lane ? day.lane[0] : ""}</span>
      <span className="day">{day.label[0]}</span>
      <span className="sr-only">{day.label}: {day.future ? "later this week" : day.count ? `${day.count} ${day.count === 1 ? "session" : "sessions"}, ${day.lane}` : day.today ? "today, nothing saved yet" : "rest"}</span>
    </li>)}
  </ol>;
}
