// Geometry for the design's SVG pieces (Mind Bloom, capacity dial, focus gauge).
// Angles are in degrees, clockwise from twelve o'clock.

export function polar(cx: number, cy: number, r: number, degrees: number): [number, number] {
  const t = (degrees * Math.PI) / 180;
  return [cx + r * Math.sin(t), cy - r * Math.cos(t)];
}

/** A petal: the ring segment between radii ra and rb and angles a0..a1, with a gap g on each side. */
export function petalPath(c: number, ra: number, rb: number, a0: number, a1: number, g: number) {
  const point = (r: number, a: number, side: number) => {
    const t = (a * Math.PI) / 180;
    return [(c + r * Math.sin(t) + side * g * Math.cos(t)).toFixed(2), (c - r * Math.cos(t) + side * g * Math.sin(t)).toFixed(2)].join(" ");
  };
  return `M${point(rb, a0, 1)}A${rb} ${rb} 0 0 1 ${point(rb, a1, -1)}L${point(ra, a1, -1)}A${ra} ${ra} 0 0 0 ${point(ra, a0, 1)}Z`;
}

/** Capacity runs 15–120 minutes in 15-minute steps; 15 is a valid evening, not a failure. */
export const capacityMin = 15;
export const capacityMax = 120;
export const capacityStep = 15;
export const clampCapacity = (minutes: number) => Math.min(capacityMax, Math.max(capacityMin, Math.round(minutes / capacityStep) * capacityStep));

/**
 * How full a petal is. The most-evidenced skill fills its petal; a scale floor keeps
 * one or two sessions from looking like a lifetime of practice.
 */
export function petalFill(sessions: number, most: number) {
  return sessions <= 0 ? 0 : Math.min(1, sessions / Math.max(most, 6));
}
