"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="standalone panel"><h1>Something interrupted your workspace.</h1><p>Your saved browser data has not been intentionally cleared.</p><button onClick={reset}>Try again</button></main>;
}
