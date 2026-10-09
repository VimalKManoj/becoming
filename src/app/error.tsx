"use client";

import Link from "next/link";

// The root error boundary. It says what is safe and offers a retry or a way back to Today.
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="standalone card hero stack fallback-page">
    <span className="brand-orb" aria-hidden="true" />
    <p className="eyebrow ember">Something went wrong</p>
    <h1>Something interrupted your <em>workspace.</em></h1>
    <p className="text-2">Your saved work lives in your account, so nothing you already saved is lost. Unsaved typing on this screen may need re-entering.</p>
    <div className="row"><button onClick={reset}>Try again</button><Link className="button-link secondary" href="/today">Back to Today</Link></div>
  </main>;
}
