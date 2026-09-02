import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeading, PublicShell, Stat, shortAddress } from "../../../features/public-site/PublicShell";
import { PublicApiError, getPublicApiJson } from "../../../features/public-site/serverApi";
import type { PublicRound } from "../../../features/public-site/types";

export const dynamic = "force-dynamic";

function parseTurnId(value: string) {
  const turnId = Number(value);
  return Number.isInteger(turnId) && turnId > 0 ? turnId : null;
}

async function loadRound(rawTurnId: string) {
  const turnId = parseTurnId(rawTurnId);
  if (!turnId) notFound();
  try {
    return (await getPublicApiJson<{ round: PublicRound }>(`/rounds/${turnId}`)).round;
  } catch (error) {
    if (error instanceof PublicApiError && error.status === 404) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ turnId: string }> }): Promise<Metadata> {
  const { turnId } = await params;
  const parsed = parseTurnId(turnId);
  if (!parsed) return { title: "Round not found | Tywish" };
  return {
    title: `Turn ${parsed} | Tywish`,
    description: `Public result, community rules, and audit trail for Tywish turn ${parsed}.`,
    openGraph: { title: `Tywish turn ${parsed}`, description: `Verify the result and rules for Tywish turn ${parsed}.` },
  };
}

export default async function RoundDetailPage({ params }: { params: Promise<{ turnId: string }> }) {
  const { turnId: rawTurnId } = await params;
  const round = await loadRound(rawTurnId);
  const activeRule = round.rules.find((rule) => rule.ruleId === round.election?.activeRuleId) ?? null;

  return (
    <PublicShell>
      <PageHeading eyebrow={`Turn ${round.turnId} · ${round.status}`} title={round.status === "completed" ? "Round settled" : "Round state"}>
        A single public view of the prize, draw, elected rule, vote totals, and verification links.
      </PageHeading>
      <div className="public-grid">
        <section className="public-panel">
          <p className="public-eyebrow">Prize and activity</p>
          <h2>{round.pool.totalVisiblePrizePoolSol.toFixed(4)} SOL</h2>
          <dl className="public-stats">
            <Stat label="Guesses" value={round.pool.guesses} />
            <Stat label="Proposals" value={round.pool.proposals} />
            <Stat label="Votes" value={round.totalVotes} />
            <Stat label="Cycle" value={`${round.cycle.durationHours}h`} />
          </dl>
        </section>
        <section className="public-panel">
          <p className="public-eyebrow">Draw</p>
          <h2>{round.draw?.status ?? "Not requested"}</h2>
          {round.draw?.drawResult ? <ol className="public-numbers">{round.draw.drawResult.map((number, index) => <li key={`${number}-${index}`}>{number}</li>)}</ol> : <p>The verified numbers will appear when the draw is fulfilled.</p>}
          {round.draw?.settleSignature ? <p className="public-code">Transaction: {round.draw.settleSignature}</p> : null}
        </section>
        <section className="public-panel wide">
          <p className="public-eyebrow">Rule of the hour</p>
          <h2>{activeRule?.title ?? "Original rule"}</h2>
          <p>{activeRule?.officialInterpretation ?? activeRule?.sanitizedText ?? "No alternative community rule was elected for this turn."}</p>
          {activeRule ? <p><Link href={`/rules/${round.turnId}/${activeRule.ruleId}`}>Inspect rule #{activeRule.ruleId}</Link> · proposed by <Link href={`/players/${activeRule.proposer}`}>{shortAddress(activeRule.proposer)}</Link></p> : null}
        </section>
        <section className="public-panel wide">
          <p className="public-eyebrow">Community rules</p>
          <h2>{round.rules.length} indexed</h2>
          {round.rules.length === 0 ? <p>No community rules were indexed for this round.</p> : (
            <div className="public-table-wrap">
              <table className="public-table">
                <thead><tr><th>Rule</th><th>Creator</th><th>Votes</th><th>State</th></tr></thead>
                <tbody>{round.rules.map((rule) => <tr key={rule.ruleId}><td><Link href={`/rules/${round.turnId}/${rule.ruleId}`}>#{rule.ruleId} {rule.title}</Link></td><td><Link href={`/players/${rule.proposer}`}>{shortAddress(rule.proposer)}</Link></td><td>{rule.votes}</td><td>{rule.state}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </section>
        <section className="public-panel wide">
          <p className="public-eyebrow">Proof trail</p>
          <h2>Verify this turn</h2>
          <p><Link href={`/audit/${round.turnId}`}>Open the public audit chain</Link></p>
        </section>
      </div>
    </PublicShell>
  );
}
