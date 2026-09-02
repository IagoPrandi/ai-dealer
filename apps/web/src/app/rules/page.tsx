import type { Metadata } from "next";
import Link from "next/link";

import { PageHeading, PublicShell, shortAddress } from "../../features/public-site/PublicShell";
import { getPublicApiJson } from "../../features/public-site/serverApi";
import type { PublicRound } from "../../features/public-site/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Community rules | Tywish", description: "Inspect the community rules in the live Tywish turn." };

export default async function RulesPage() {
  const { activeTurnId, round } = await getPublicApiJson<{ activeTurnId: number; round: PublicRound }>("/rounds");
  return (
    <PublicShell>
      <PageHeading eyebrow={`Live turn ${activeTurnId}`} title="Community rules">Read the exact public interpretation, validation status, votes, election state, and worked examples for every rule.</PageHeading>
      <section className="public-grid">
        {round.rules.length === 0 ? <p className="public-empty">No rules have been proposed for this turn yet.</p> : (
          <div className="public-card-list">
            {round.rules.map((rule) => <Link className="public-card-link" href={`/rules/${round.turnId}/${rule.ruleId}`} key={rule.ruleId}><div><span className="public-tag">{rule.state}</span><h2>{rule.title}</h2><p>{rule.officialInterpretation ?? rule.sanitizedText}</p></div><div className="public-card-meta"><span>{rule.votes} votes</span><span>{shortAddress(rule.proposer)}</span></div></Link>)}
          </div>
        )}
      </section>
    </PublicShell>
  );
}
