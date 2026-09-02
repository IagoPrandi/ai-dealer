import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeading, PublicShell, Stat, formatSol, shortAddress } from "../../../features/public-site/PublicShell";
import { PublicApiError, getPublicApiJson } from "../../../features/public-site/serverApi";
import type { PublicPlayerProfile } from "../../../features/public-site/types";

export const dynamic = "force-dynamic";
const WALLET_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/u;

async function loadProfile(wallet: string) {
  if (!WALLET_PATTERN.test(wallet)) notFound();
  try {
    return (await getPublicApiJson<{ profile: PublicPlayerProfile }>(`/players/${wallet}/profile`)).profile;
  } catch (error) {
    if (error instanceof PublicApiError && error.status === 404) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ wallet: string }> }): Promise<Metadata> {
  const { wallet } = await params;
  if (!WALLET_PATTERN.test(wallet)) return { title: "Player not found | Tywish" };
  return { title: `${shortAddress(wallet)} | Tywish player`, description: "Public Tywish game activity for this Solana wallet." };
}

export default async function PlayerPage({ params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params;
  const profile = await loadProfile(wallet);
  const stats = profile.stats;
  return (
    <PublicShell>
      <PageHeading eyebrow="Public player profile" title={shortAddress(profile.wallet)}>Only public game activity is shown. Wallet balances, private telemetry, and administrative data are never included.</PageHeading>
      <div className="public-grid">
        <section className="public-panel wide"><p className="public-eyebrow">Wallet</p><p className="public-code">{profile.wallet}</p></section>
        <section className="public-panel"><p className="public-eyebrow">Participation</p><h2>{stats.guessesSubmitted} guesses</h2><dl className="public-stats"><Stat label="Votes cast" value={stats.votesCast} /><Stat label="Elimination votes" value={stats.eliminationVotesCast} /></dl></section>
        <section className="public-panel"><p className="public-eyebrow">Rules</p><h2>{stats.rulesProposed} proposed</h2><dl className="public-stats"><Stat label="Elected" value={stats.rulesElected} /><Stat label="Votes received" value={stats.votesReceived} /><Stat label="Produced winners" value={stats.winnerProducingRules} /></dl></section>
        <section className="public-panel wide"><p className="public-eyebrow">Public proceeds</p><h2>{formatSol(stats.totalEarnedLamports)}</h2><p>Total indexed winner payouts and public creator or voter rewards associated with this wallet.</p></section>
      </div>
    </PublicShell>
  );
}
