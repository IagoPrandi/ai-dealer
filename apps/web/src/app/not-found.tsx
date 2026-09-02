import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="route-state">
      <p className="public-eyebrow">404 · Not found</p>
      <h1>This public record does not exist</h1>
      <p>Check the turn, rule, or wallet identifier and try again.</p>
      <Link href="/rounds">Browse public rounds</Link>
    </main>
  );
}
