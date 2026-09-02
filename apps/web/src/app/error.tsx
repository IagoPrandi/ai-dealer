"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="route-state" role="alert">
      <p className="public-eyebrow">Public data unavailable</p>
      <h1>Could not load this view</h1>
      <p>{error.message}</p>
      <button onClick={reset} type="button">Try again</button>
    </main>
  );
}
