import Link from "next/link";

// Outside the workspace shell: its own brand mark, headline and a way back.
export default function NotFound() {
  return <main className="standalone card stack fallback-page">
    <span className="brand-orb" aria-hidden="true" />
    <p className="eyebrow">Not found</p>
    <h1>This page isn’t in your <em>workspace.</em></h1>
    <p className="text-2">The address may be mistyped, or the page has moved. Your work is where you left it.</p>
    <Link className="button-link" href="/today">Back to Today →</Link>
  </main>;
}
