import type { CSSProperties, ReactNode } from "react";

// Skeletons in the Ritual style: the shape of what's coming, breathing softly while
// it loads (design: "Breathe while focusing"; with reduced motion they hold still). Each
// keeps a screen-reader announcement, so nothing is lost by replacing the loading text.

type BoneProps = { w?: number | string; h?: number | string; shape?: "line" | "pill" | "circle" | "block"; i?: number; className?: string };

/** One shape. `i` staggers the breath, so a group doesn't pulse as one block. */
export function Bone({ w = "100%", h = 12, shape = "line", i = 0, className }: BoneProps) {
  const style = { width: w, height: h, "--i": i } as CSSProperties;
  return <span className={`bone bone-${shape}${className ? ` ${className}` : ""}`} style={style} aria-hidden="true" />;
}

/** The accessible wrapper: announces once, hides the shapes from assistive technology. */
export function Skeleton({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <div className={`skeleton${className ? ` ${className}` : ""}`} role="status" aria-live="polite" aria-busy="true">
    <span className="sr-only">{label}</span>
    {children}
  </div>;
}

/** A glass card with an eyebrow, a serif title and a few lines. */
export function CardBones({ lines = 3, title = true, chips = 0, button = false, image = false, i = 0, hero = false }: { lines?: number; title?: boolean; chips?: number; button?: boolean; image?: boolean; i?: number; hero?: boolean }) {
  return <div className={`r-card${hero ? " ember" : ""} skel-card`} aria-hidden="true">
    {image && <Bone h={150} shape="block" i={i} />}
    <Bone w="34%" h={10} i={i + 1} />
    {title && <Bone w="72%" h={26} i={i + 2} className="bone-title" />}
    {chips > 0 && <span className="skel-row">{Array.from({ length: chips }, (_, n) => <Bone key={n} w={n === 0 ? 64 : 92} h={26} shape="pill" i={i + 3 + n} />)}</span>}
    {Array.from({ length: lines }, (_, n) => <Bone key={n} w={n === lines - 1 ? "58%" : "100%"} i={i + 4 + n} />)}
    {button && <Bone h={button && hero ? 56 : 44} shape="pill" i={i + 8} className="bone-button" />}
  </div>;
}

/** A grid of cards, for lists such as tasks, ideas and evidence. */
export function CardGridSkeleton({ label, count = 4, image = false, chips = 2, lines = 2, toolbar = true }: { label: string; count?: number; image?: boolean; chips?: number; lines?: number; toolbar?: boolean }) {
  return <Skeleton label={label} className="skel-stack">
    {toolbar && <span className="skel-row" aria-hidden="true"><Bone w={180} h={44} shape="pill" /><Bone w={110} h={36} shape="pill" i={1} /><Bone w={110} h={36} shape="pill" i={2} /></span>}
    <div className="skel-grid">{Array.from({ length: count }, (_, n) => <CardBones key={n} image={image} chips={chips} lines={lines} i={n * 2} />)}</div>
  </Skeleton>;
}

/** The empty bloom's outline: eight petal slots around a core. */
export function BloomBones({ size = 260 }: { size?: number }) {
  return <span className="skel-bloom" style={{ width: size, height: size }} aria-hidden="true">
    {Array.from({ length: 8 }, (_, n) => <span key={n} className="skel-petal" style={{ "--n": n, "--i": n } as CSSProperties} />)}
    <span className="skel-core" />
  </span>;
}

/** Seven day dots. */
export function WeekBones() {
  return <span className="skel-week" aria-hidden="true">{Array.from({ length: 7 }, (_, n) => <Bone key={n} w={36} h={36} shape="circle" i={n} />)}</span>;
}

/** Today, as the Ritual opening: date and greeting, the prompt card, six intent tiles, the week bar. */
export function TodaySkeleton({ label = "Getting tonight ready…" }: { label?: string }) {
  return <Skeleton label={label} className="r-col r-top skel-today">
    <span className="skel-full" aria-hidden="true"><Bone w={190} h={11} /><Bone w="62%" h={46} i={1} className="bone-title" /><Bone w="44%" h={14} i={2} /></span>
    <div className="t-prompt skel-card" aria-hidden="true"><span className="skel-row between"><Bone w={140} h={10} i={2} /><Bone w={84} h={30} shape="pill" i={3} /></span><Bone w="80%" h={28} i={4} className="bone-title" /></div>
    <div className="skel-full" aria-hidden="true" style={{ marginTop: 6 }}>
      <Bone w={210} h={14} i={4} />
      <div className="t-intents">{Array.from({ length: 6 }, (_, n) => <div key={n} className="r-tile t-intent skel-card"><Bone w={10} h={10} shape="circle" i={5 + n} /><span className="skel-full"><Bone w="56%" h={15} i={6 + n} /><Bone w="78%" h={10} i={7 + n} /></span></div>)}</div>
      <div className="t-weekbar"><span className="skel-row">{Array.from({ length: 7 }, (_, n) => <Bone key={n} w={20} h={20} shape="circle" i={n} />)}</span><Bone w={180} h={11} i={8} /></div>
    </div>
  </Skeleton>;
}

/** Journey: the bloom card and the history beside it. */
export function JourneySkeleton({ label = "Loading your journey…" }: { label?: string }) {
  return <Skeleton label={label} className="skel-columns">
    <div className="skel-stack">
      <div className="r-card skel-card skel-center" aria-hidden="true"><span className="skel-full"><Bone w={80} h={10} /><Bone w="46%" h={30} i={1} className="bone-title" /></span><BloomBones size={240} /></div>
      <CardBones lines={2} chips={0} i={3} />
    </div>
    <div className="skel-stack">{[0, 1, 2].map(n => <CardBones key={n} lines={3} chips={2} i={n * 2} />)}</div>
  </Skeleton>;
}

/** Settings: a column of cards. */
export function SettingsSkeleton({ label = "Loading your settings…" }: { label?: string }) {
  return <Skeleton label={label} className="skel-columns">
    <div className="skel-stack"><CardBones hero lines={2} button /><CardBones lines={3} i={2} /></div>
    <div className="skel-stack"><CardBones lines={1} chips={4} title={false} i={1} /><CardBones lines={2} i={3} /><CardBones lines={2} button i={5} /></div>
  </Skeleton>;
}

/** The sign-in form while the session is checked. */
export function AuthSkeleton() {
  return <Skeleton label="Checking your session…" className="skel-auth">
    <Bone w="70%" h={48} className="bone-title" />
    <Bone w="52%" h={12} i={1} />
    <span className="skel-gap" />
    <Bone w={60} h={10} i={2} /><Bone h={48} shape="block" i={3} />
    <Bone w={80} h={10} i={4} /><Bone h={48} shape="block" i={5} />
    <Bone h={50} shape="pill" i={6} className="bone-button" />
  </Skeleton>;
}

/** A few lines, for small inline waits (a card's milestones, a form's choices). */
export function LinesSkeleton({ label, lines = 3, small = false }: { label: string; lines?: number; small?: boolean }) {
  return <Skeleton label={label} className="skel-stack tight">
    {Array.from({ length: lines }, (_, n) => <Bone key={n} w={n === lines - 1 ? "55%" : "100%"} h={small ? 10 : 12} i={n} />)}
  </Skeleton>;
}
