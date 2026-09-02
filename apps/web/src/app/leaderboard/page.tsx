import type { Metadata } from "next";
import Link from "next/link";

import { PageHeading, PublicShell, formatSol, shortAddress } from "../../features/public-site/PublicShell";
import { getPublicApiJson } from "../../features/public-site/serverApi";
import type { TransparencySnapshot } from "../../features/public-site/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Leaderboard | Tywish", description: "Public Tywish creator leaderboard based on elected rules, votes, winners, and rewards." };

export default async function LeaderboardPage() {
  const { snapshot } = await getPublicApiJson<{ snapshot: TransparencySnapshot }>("/transparency");
  return (
    <PublicShell>
      <PageHeading eyebrow="Public rankings" title="Leaderboard">Creators are ranked from public game records. The table shows contributions and results, not private analytics.</PageHeading>
      <div className="public-grid">
        {snapshot.trends.topCreators.length === 0 ? <p className="public-empty">No creator activity is ranked yet.</p> : <div className="public-table-wrap"><table className="public-table"><thead><tr><th>Rank</th><th>Player</th><th>Rules</th><th>Elected</th><th>Votes</th><th>Winner rules</th><th>Rewards</th></tr></thead><tbody>{snapshot.trends.topCreators.map((creator, index) => <tr key={creator.creator}><td>#{index + 1}</td><td><Link href={`/players/${creator.creator}`}>{shortAddress(creator.creator)}</Link></td><td>{creator.proposedRules}</td><td>{creator.electedRules}</td><td>{creator.votesReceived}</td><td>{creator.winnerProducingRules}</td><td>{formatSol(creator.rewardLamports)}</td></tr>)}</tbody></table></div>}
      </div>
    </PublicShell>
  );
}
