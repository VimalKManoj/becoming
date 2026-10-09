import Link from "next/link";

// Renders inside the workspace shell (its <main>), below the header's own h1, so it is a section.
export default function WorkspaceNotFound() {
  return <section className="card empty stack fallback-card" aria-labelledby="not-found-heading">
    <p className="eyebrow">Not found</p>
    <h2 id="not-found-heading" className="serif fallback-title">This page isn’t in your <em>workspace.</em></h2>
    <p className="text-2">Check the address, or pick a section from the navigation.</p>
    <Link className="button-link" href="/today">Back to Today →</Link>
  </section>;
}
