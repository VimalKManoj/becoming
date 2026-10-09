import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Guards the measured WCAG contrast of the Ember Glass tokens in globals.css (still used by
// the sign-in and account pages), so a later colour tweak can't quietly undo it. Text needs
// 4.5:1; borders that identify a control need 3:1 (WCAG 1.4.3 and 1.4.11).

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const root = css.match(/:root\s*\{([^}]*)\}/)![1];
const theme = Object.fromEntries([...root.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\b/gi)].map(match => [match[1], match[2].toLowerCase()]));

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

const backgrounds = ["paper", "surface", "soft"];

describe("Ember Glass contrast", () => {
  it.each(backgrounds)("keeps every text colour readable on %s (4.5:1)", background => {
    for (const text of ["ink", "text-2", "muted", "accent-text", "mint", "lilac", "danger-text"]) {
      expect(ratio(theme[text], theme[background]), `${text} on ${background}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(backgrounds)("keeps field, chip and secondary-button borders visible on %s (3:1)", background => {
    expect(ratio(theme["field-line"], theme[background])).toBeGreaterThanOrEqual(3);
  });

  it("keeps text on the ember button and on mint readable (4.5:1)", () => {
    expect(ratio(theme["on-accent"], theme.accent)).toBeGreaterThanOrEqual(4.5);
    // The button gradient's darker end.
    expect(ratio(theme["on-accent"], "#f06a2a")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(theme["mint-ink"], theme.mint)).toBeGreaterThanOrEqual(4.5);
  });
});

// The Ritual design (src/styles/ritual.css): text tokens on the frame's darkest, middle and
// brightest (top glow) colours. Faint hairline borders are decorative in this design, so
// only text is guarded here; every control also has a text label or a filled state.
const ritualCss = readFileSync(new URL("../styles/ritual.css", import.meta.url), "utf8");
const ritualRoot = ritualCss.match(/:root\s*\{([^}]*)\}/)![1];
const ritual = Object.fromEntries([...ritualRoot.matchAll(/--r-([a-z0-9-]+):\s*(#[0-9a-f]{6})\b/gi)].map(match => [match[1], match[2].toLowerCase()]));
const frame = { base: ritual.bg, middle: "#171110", glow: "#3a2013" };

describe("Ritual contrast", () => {
  it.each(Object.entries(frame))("keeps every text colour readable on the %s of the frame (4.5:1)", (_, background) => {
    for (const text of ["ink", "ink-2", "text", "muted", "ember-text", "ember-soft", "mint-text", "lilac-text", "red-text"]) {
      expect(ratio(ritual[text], background), `${text} on ${background}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps placeholders readable where fields sit (4.5:1)", () => {
    expect(ratio(ritual.placeholder, frame.base)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(ritual.placeholder, frame.middle)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps text on the ember button and on mint readable (4.5:1)", () => {
    expect(ratio(ritual["on-ember"], ritual.ember)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(ritual["on-ember"], "#f06a2a")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(ritual["on-mint"], ritual.mint)).toBeGreaterThanOrEqual(4.5);
  });
});
