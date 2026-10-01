"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="standalone panel stack"><h1>Something interrupted your workspace.</h1><p>Your saved work lives in your account, so nothing you already saved is lost. Unsaved typing on this screen may need re-entering.</p><button onClick={reset}>Try again</button></main>;
}
