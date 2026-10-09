import type { CSSProperties } from "react";

// Embers drifting up behind the workspace screens and onboarding, as on the sign-in screen,
// under a soft breathing glow. Purely decorative: hidden from assistive technology, and with
// reduced motion they don't appear at all. Fixed values, so server and browser render the same.
// Each: left %, size px, duration s, delay s, sideways drift px.
const sparks = [
  [6, 4, 13, 0, 18], [13, 3, 16, 5, -14], [21, 5, 12, 2, 22], [28, 3, 17, 8, -20], [36, 4, 14, 4, 16],
  [43, 3, 15, 10, -12], [51, 6, 12, 1, 24], [58, 3, 18, 6, -18], [65, 4, 13, 9, 14], [72, 3, 16, 3, -22],
  [79, 5, 14, 7, 20], [86, 3, 15, 11, -16], [92, 4, 12, 5, 12], [97, 3, 17, 2, -10], [32, 2, 19, 12, 10], [69, 2, 20, 14, -8],
].map(([left, size, duration, delay, drift]) => ({ left: `${left}%`, width: size, height: size, animationDuration: `${duration}s`, animationDelay: `${delay}s`, "--drift": `${drift}px` }) as CSSProperties);

export function Embers() {
  return <div className="r-embers" aria-hidden="true">
    <span className="r-embers-glow" />
    <div className="r-sparks">{sparks.map((style, index) => <span key={index} className="r-spark" style={style} />)}</div>
  </div>;
}
