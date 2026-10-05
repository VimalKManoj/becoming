import Link from "next/link";

// Renders inside the workspace shell (its <main>), so it is a section, not a page.
export default function WorkspaceNotFound() {
  return <section className="panel empty stack">
    <h1>This page is not in your workspace.</h1>
    <p className="muted">Check the address, or pick a section from the navigation.</p>
    <Link href="/today">Back to Today</Link>
  </section>;
}
