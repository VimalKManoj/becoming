# Becoming design system — Ritual

The interface follows the owner's design, *Becoming Ritual* (claude.ai/design, exported 6 October 2026), direction **2a Ritual**. It replaced the earlier *Ember Glass* screens. The prototype covers the whole evening: the opening question, a ten-second check-in, one clear focus, the focus orb, the recap, the bloom growing, "Tonight is done", the Sunday review, onboarding, quick capture, Work, Ideas, Journey (Progress and Proof, with the publish flow) and Settings.

The prototype's sample values (names, projects, sessions, quotes) are **never** shown as if they were yours. Every number comes from your records. When there is nothing yet, the screen says so, and an example is always labelled EXAMPLE.

## Principles

1. **One question, then one clear thing.** Today opens with "What's on your mind tonight?". Each answer leads to a single focus with its reason.
2. **Honest data only.** Petals, dots, counts and progress come from saved records. Empty states explain why they're empty and offer the next step.
3. **Calm motion.** Screens rise in (`r-rise`, .6–.7s), sheets slide up, the orb breathes, contribution cells fade in one by one, and the bloom ripples when a petal grows. With reduced motion, states change instantly.
4. **Colour is never the only signal.** Lanes carry a text label (or the P/S/W letter on week dots), and statuses carry a word.
5. **Nothing posts for you.** Becoming never publishes anywhere; you post, then save the link.

## Tokens (`src/styles/ritual.css`, `:root`, prefix `--r-`)

| Token | Value | Use |
|---|---|---|
| Frame | `radial-gradient(90% 55% at 40% -10%, #3A2013, #171110 50%, #0D0B0A)` | The app background (`.r-app`) |
| `--r-ink` / `--r-ink-2` | `#F4EDE6` / `#E9DFD6` | Primary text / body copy |
| `--r-text` | `#C9BDB2` | Secondary text, ghost buttons |
| `--r-muted` | `#A99D93` | Labels, metadata, eyebrows |
| `--r-placeholder` | `#8F847B` | Field placeholders |
| `--r-ember` (+ `-text`, `-soft`, `-pale`) | `#FF8A3D` | Projects lane, primary action, selected chips |
| `--r-mint` (+ `-text`) | `#86E3C3` | Showcases lane, Finished, Ready to share, Sunday |
| `--r-lilac` (+ `-text`, `-pale`) | `#C9B8F0` | Writing lane, ideas, prompts |
| `--r-red` (+ `-text`, `-pale`) | `#FF6B5B` | Blocked, failures (never for running over time) |
| `--r-glass`, `--r-glass-strong` | top-lit gradients | Card fills |
| `--r-line` … `--r-line-4` | `rgba(255,235,215,.08–.14)` | Hairline borders, as designed |

Primary buttons use the gradient `#FF9F58 → #F06A2A` with `--r-on-ember` ink. A selected chip or tile (the prototype's `sel()`) is `rgba(255,138,61,.16)` fill, `#FFC08F` text and an `rgba(255,138,61,.5)` border.

`src/lib/contrast.test.ts` checks every Ritual text token at 4.5:1 or more on the frame's base, middle and top glow, placeholders on the base and middle, and the ink on ember and mint buttons. The hairline borders are deliberately faint, as in the design. They are decorative: every control also has a text label or a filled selected state.

## Type

- **Bricolage Grotesque** (`--r-serif`, the display face; swapped in for the prototype's Instrument Serif on 8 October 2026 at the owner's request): greetings, questions, titles, prompts, the motive. Emphasis goes in `<em>` in `--r-ember-text`. The font has no italic, and `font-synthesis-style: none` stops the browser faking one, so emphasis is colour only and nothing in the app is slanted.
- **Geist** (`--r-sans`): interface text.
- **Geist Mono** (`--r-mono`): the date line, times, counts and eyebrows (uppercase, letter-spacing .12em).

The fonts are latin subsets under the SIL Open Font License, in `src/app/fonts/`, loaded through `next/font/local`: Geist and Geist Mono from the design export, Bricolage Grotesque (variable, weights 200–800) from Google Fonts.

Sizes follow the prototype and scale with the content column through container queries (`.r-scroll` and `.r-overlay` are inline-size containers), for example the greeting is `clamp(40px, 8cqi, 64px)`.

## Parts (`src/styles/ritual.css`, prefix `r-`)

| Class | Use |
|---|---|
| `r-col` / `r-wide` | The 620px reading column / the 1080px wide column, centred |
| `r-top`, `r-rise`, `r-rise-6`, `r-d1`–`r-d4` | Top spacing, the rise-in animation and its delays |
| `r-date`, `r-greet`, `r-title`, `r-title-xl`, `r-motive`, `r-eyebrow(-sm)`, `r-lede`, `r-body`, `r-small`, `r-label` | Type |
| `r-card` (`ember`, `lilac`, `mint`, `soft`, `flat`, `lg`, `xl`), `r-inset`, `r-dashed` | Cards and the "next step" / "done when" boxes |
| `r-btn` (`lg`, `md`, `sm`, `block`, `split` with `r-time`, `mint`, `red`) | Primary actions |
| `r-ghost` (`sm`, `xs`, `ember`, `lilac`, `red`), `r-back`, `r-link`, `r-underline` | Secondary and tertiary actions |
| `r-chip` (`round`, `mono`, `h34`/`h38`/`h40`), `r-tile` | Choices; `aria-pressed` / `aria-checked` shows the selected look |
| `r-dot` (`--dot`, `glow`), `lane-Projects/Showcases/Writing`, `r-tag`, `r-fact`, `r-badge`, `r-example`, `r-diamond` | Lanes, facts and markers |
| `r-status` (`s-ready`, `s-progress`, `s-blocked`, `s-done`, `s-archived`, `s-draft`, `s-share`, `s-published`, `s-captured`, `s-brainstorming`, `s-active`) | Status words |
| `r-toggle` | A 48×28 switch (`role="switch"`, `aria-checked`) |
| `r-field`, `r-input`, `r-textarea`, `r-hint` | Forms |
| `r-bar`, `r-week` / `r-wdot` | Progress bars and week dots |
| `r-overlay` (`focus`, `recap`, `reward`, `sheet`, `setup`), `r-close` | Full-screen moments |
| `r-cap*`, `r-toast` | Quick capture sheet and the toast (3.4s) |
| `r-embers`, `r-spark` (`ritual/embers.tsx`) | Behind every workspace screen and onboarding: a light breathing glow and embers drifting up, as on the sign-in screen; hidden with reduced motion |

Shared React parts: `src/components/ritual/` (`ritual-context.tsx` for capture, new project and the toast; `capture-sheet.tsx`; `new-project-sheet.tsx`; `week.tsx` with `useWeek` and `WeekDots`), `src/components/visuals.tsx` (`MindBloom`: eight fixed skills, each petal full at 12 sessions, `mode` all / mini / reward) and `src/lib/ritual.ts` (date line, greeting, week line, session line, "last worked").

Skeletons (`src/components/skeleton.tsx`, plus screen-specific ones beside each screen) take the shape of the screen that is coming and breathe on a 2.6s cycle. Each keeps a screen-reader announcement.

## Layout

- **Desktop (≥ 900px):** a 92px rail: the orb, the + capture button, Today, Work, Ideas, Journey, and the avatar (Settings) at the bottom. Content padding is 40px 56px 56px.
- **Phones (< 900px):** a floating pill at the bottom: Today, Work, +, Ideas, Journey. The current section expands to show its label. The avatar sits at the top right. Content padding is 72px 20px 130px.

## Flow

1. **Today, open.** Date line, greeting, your motive and a prompt card ("Another ↻" cycles a question, a spark from your ideas, or a note from Sunday-you / last time). After three or more days away, a card shows where you were with "Pick up here". On Sunday, a mint card invites the weekly review (or shows next week's plan with "Adjust"). Then the intents: Build, Small piece, Write, Publish (only when something is ready to share), Catch an idea, Reflect. The week bar links to Journey.
2. **Which project** (Build, when you have projects): each project with its next step, progress and when you last worked on it; the suggested one is marked. Or start a new project.
3. **Check-in:** 15–90 minutes and Low / Steady / High energy. Nothing is saved.
4. **Plan:** one focus card (lane, project, minutes, energy, context, next step, done when, why this) and up to two alternatives from other lanes ("Or, explicitly" → Choose).
5. **Focus:** the orb and timer, optional quotes and a lo-fi link. **Recap:** outcome tiles, the adaptive follow-up, up to five skills, optional evidence. **Reward:** the bloom grows. Then **Tonight is done.**
6. **Work, Ideas, Journey, Settings** use the same parts. Journey holds Progress (contributions, bloom, week, sessions) and Proof (Draft → Ready to share → Published, with the three-step publish flow), and the three-step weekly review.

## Links between screens

| From | Link | Opens |
|---|---|---|
| New project sheet, Work | `/today?intent=build&project=<id>` | Today's check-in for that project |
| Today's Publish intent | `/journey?tab=proof&publish=<id>` | The publish flow for that evidence |
| Reflect, the Sunday card | `/journey?view=review` | The weekly review |
| Paste assignment (capture) | `/ideas?idea=<id>` | That idea's brainstorm |
| Old links | `/proof` | Redirects to `/journey?tab=proof` |

## Where things live

- **Tokens and parts:** `src/styles/ritual.css`. The old Ember Glass tokens in `src/app/globals.css` still style the sign-in and account pages.
- **Screen styles:** one file per screen in `src/styles/` (`today.css` `t-`, `work.css` `w-`, `ideas.css` `i-`, `journey.css` `j-`, `proof.css` `p-`, `settings.css` `s-`), all imported by the root layout.
- **Shell:** `workspace-shell.tsx` (sign-in gate, capture and new-project sheets, toast), `workspace-nav.tsx` (rail, pill, avatar) and `workspace-sections.ts` (labels).
- **Today:** `cloud-today-screen.tsx` (open, which, check, plan, after), `today/session.tsx` (focus, recap, reward) and `today/onboarding.tsx` (first-time setup).
- **Project constellation** (Work → Projects → Visual): `src/components/constellation/` with its own stylesheet `src/styles/constellation.css`, scoped under `.cx` and ported from the owner's *Project Constellation* design (`documents/design/project-constellation.dc.html`). It shares the Ritual palette and adds its own state colours: done is filled ember, doing is half-filled and pulsing (an in-progress cell fills like liquid by its sessions out of planned, else focused minutes out of the estimate), ready is an outline, blocked is red, a decision is mint, and genesis is lilac, with bright dots for briefs Claude wrote. When the canvas is narrower than the design's width (`INNER_W`), it scales down (CSS `zoom`) to 72%, then scrolls sideways so the map keeps its shape. Reduced motion stops the breathing, flow and pulse.
