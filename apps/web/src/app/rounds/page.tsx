import type { Metadata } from "next";
import Link from "next/link";

import { PageHeading, PublicShell, formatSol } from "../../features/public-site/PublicShell";
import { getPublicApiJson } from "../../features/public-site/serverApi";
import type { TransparencySnapshot } from "../../features/public-site/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Round archive | Tywish",
  description: "Browse Tywish round results, prize pools, activity, and audit proofs.",
};

export default async function RoundsPage() {
  const { snapshot } = await getPublicApiJson<{ snapshot: TransparencySnapshot }>("/transparency");
  const turns = [...snapshot.turns].sort((a, b) => b.turnId - a.turnId);

  return (
    <PublicShell>
      <PageHeading eyebrow="Public archive" title="Every round">
        Follow the game from live play to final settlement. Each entry links to its rules, result, and public proof trail.
      </PageHeading>
      <section className="public-grid" aria-label="Round archive">
        {turns.length === 0 ? <p className="public-empty">No indexed rounds are public yet.</p> : (
          <div className="public-card-list">
            {turns.map((turn) => (
              <Link className="public-card-link" href={`/rounds/${turn.turnId}`} key={turn.turnId}>
                <div>
                  <span className={`public-tag${turn.status === "current" ? " yellow" : ""}`}>{turn.status}</span>
                  <h2>Turn {turn.turnId}</h2>
                  <p>{turn.activity.guesses} guesses, {turn.activity.proposals} proposed rules, and {turn.activity.totalVotes} votes.</p>
                </div>
                <div className="public-card-meta"><span>{formatSol(turn.economy.prizePoolLamports)}</span><span>Open round →</span></div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </PublicShell>
  );
}
