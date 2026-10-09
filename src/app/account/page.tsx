import type { Metadata } from "next";
import { AccountScreen } from "@/components/account-screen";
import { MindBloom, type Petal } from "@/components/visuals";

export const metadata: Metadata = { title: "Account" };

// The bloom on the right is an illustration of the app, not anyone's data, so it shows
// petal shapes only: no skill names and no numbers.
const illustrationPetals: Petal[] = [
  { name: "a", sessions: 9, lane: "Projects" }, { name: "b", sessions: 6, lane: "Showcases" }, { name: "c", sessions: 8, lane: "Showcases" },
  { name: "d", sessions: 4, lane: "Showcases" }, { name: "e", sessions: 3, lane: "Writing" }, { name: "f", sessions: 2, lane: "Writing" },
  { name: "g", sessions: 5, lane: "Projects" }, { name: "h", sessions: 7, lane: "Projects" },
];

// Embers drifting up behind the bloom: position, size, duration and delay, fixed so the
// page renders the same on the server and in the browser.
const sparks = [
  [12, 3, 11, 0], [24, 2, 14, 3], [33, 4, 12, 7], [46, 2, 16, 1], [58, 3, 13, 5],
  [67, 2, 15, 9], [76, 4, 12, 2], [85, 2, 17, 6], [92, 3, 14, 10], [5, 2, 16, 4],
].map(([left, size, duration, delay]) => ({ left: `${left}%`, width: size, height: size, animationDuration: `${duration}s`, animationDelay: `${delay}s` }));

// Lines from the design's focus screen, cross-fading one at a time.
const quotes = ["Small, finished things compound.", "Fifteen honest minutes beat an hour of tabs.", "Leave a breadcrumb for tomorrow-you."];

// Outside the workspace shell: one quiet screen, no page scroll on desktop. The form on
// the left; on the right, the Mind Bloom and one line about what the app is for.
// The root layout already provides the shared Convex + Better Auth client.
export default function AccountPage() {
  return <main className="account-split">
    <section className="account-side">
      <p className="account-brand"><span className="brand-orb" aria-hidden="true" /><span className="serif">Becoming</span></p>
      <AccountScreen />
      <p className="small account-note" role="note">Links from Becoming arrive by email. If one doesn’t show up in a minute, check your spam folder.</p>
    </section>
    <aside className="account-art" aria-hidden="true">
      <span className="art-halo" />
      {sparks.map((spark, index) => <span key={index} className="art-spark" style={spark} />)}
      <div className="art-figure">
        <span className="art-orbit art-orbit-outer" />
        <span className="art-orbit art-orbit-inner" />
        <div className="art-bloom"><MindBloom petals={illustrationPetals} size={420} labels={false} label="" /></div>
      </div>
      <div className="art-words">
        <p className="serif art-title">A mind that <em>grows</em><br />one evening at a time.</p>
        <p className="serif art-quote">{quotes.map(quote => <span key={quote}>{quote}</span>)}</p>
      </div>
    </aside>
  </main>;
}
