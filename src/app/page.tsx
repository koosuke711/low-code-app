import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="generated-page">
      <h1>Flow Backend Generator</h1>
      <p>Use the /api/generate endpoint to scaffold tables, routes, templates, and endpoints.</p>
      <Link href="/api/generate">View generator endpoint</Link>
    </main>
  );
}
