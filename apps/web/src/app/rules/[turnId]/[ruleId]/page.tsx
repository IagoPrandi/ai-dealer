import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeading, PublicShell, Stat, shortAddress } from "../../../../features/public-site/PublicShell";
import { PublicApiError, getPublicApiJson } from "../../../../features/public-site/serverApi";
import type { PublicRuleDetail } from "../../../../features/public-site/types";

export const dynamic = "force-dynamic";

function positiveId(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function loadRule(turnValue: string, ruleValue: string) {
  const turnId = positiveId(turnValue);
  const ruleId = positiveId(ruleValue);
  if (!turnId || !ruleId) notFound();
  try {
    return (await getPublicApiJson<{ rule: PublicRuleDetail }>(`/api/v1/turns/${turnId}/rules/${ruleId}`)).rule;
  } catch (error) {
    if (error instanceof PublicApiError && error.status === 404) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ turnId: string; ruleId: string }> }): Promise<Metadata> {
  const values = await params;
  const detail = await loadRule(values.turnId, values.ruleId);
  return {
    title: `${detail.rule.title} | Tywish rule`,
    description: detail.rule.officialInterpretation ?? detail.rule.sanitizedText,
    openGraph: { title: detail.rule.title, description: detail.rule.officialInterpretation ?? detail.rule.sanitizedText },
  };
}

export default async function RuleDetailPage({ params }: { params: Promise<{ turnId: string; ruleId: string }> }) {
  const values = await params;
  const detail = await loadRule(values.turnId, values.ruleId);
  const rule = detail.rule;
  return (
    <PublicShell>
      <PageHeading eyebrow={`Turn ${detail.turnId} · Rule ${rule.ruleId}`} title={rule.title}>
        {rule.officialInterpretation ?? rule.sanitizedText}
      </PageHeading>
      <div className="public-grid">
        <section className="public-panel">
          <p className="public-eyebrow">Public status</p>
          <h2>{rule.state}</h2>
          <dl className="public-stats">
            <Stat label="Votes" value={rule.votes} />
            <Stat label="Election" value={detail.election.active ? "Active rule" : detail.election.finalist ? "Finalist" : "Not finalist"} />
            <Stat label="Source" value={detail.election.source ?? "—"} />
            <Stat label="Precompile" value={rule.precompilationStatus} />
          </dl>
        </section>
        <section className="public-panel">
          <p className="public-eyebrow">Creator</p>
          <h2>{shortAddress(rule.proposer)}</h2>
          <p><Link href={`/players/${rule.proposer}`}>Open public player profile</Link></p>
          <p className="public-code">{rule.proposer}</p>
        </section>
        <section className="public-panel wide">
          <p className="public-eyebrow">Proposed wording</p>
          <h2>What the player asked</h2>
          <p>{rule.sanitizedText}</p>
        </section>
        <section className="public-panel">
          <p className="public-eyebrow">Validation</p>
          <h2>{rule.validation?.decision ?? "Pending"}</h2>
          <p>{rule.validation?.reasonSummary ?? "This rule does not have a published validation decision yet."}</p>
          {rule.validation?.reasonCodes.length ? <p className="public-code">{rule.validation.reasonCodes.join(" · ")}</p> : null}
        </section>
        <section className="public-panel">
          <p className="public-eyebrow">Elimination</p>
          <h2>{detail.elimination?.status ?? "Not shortlisted"}</h2>
          {detail.elimination ? <dl className="public-stats"><Stat label="Approval" value={detail.elimination.approvalVotes} /><Stat label="Elimination" value={detail.elimination.eliminationVotes} /></dl> : <p>Only shortlisted rules enter the elimination decision.</p>}
        </section>
        <section className="public-panel wide">
          <p className="public-eyebrow">Worked examples</p>
          <h2>Frozen behavior</h2>
          {rule.workedExamples.length === 0 ? <p>No public examples were generated.</p> : <div className="public-table-wrap"><table className="public-table"><thead><tr><th>Guess</th><th>Draw</th><th>Outcome</th></tr></thead><tbody>{rule.workedExamples.map((example, index) => <tr key={`${example.guess.join("-")}-${index}`}><td>{example.guess.join(", ")}</td><td>{example.draw.join(", ")}</td><td>{example.outcome}</td></tr>)}</tbody></table></div>}
        </section>
        <section className="public-panel wide">
          <p className="public-eyebrow">References</p>
          <h2>Public audit records</h2>
          {detail.audit.length === 0 ? <p>No rule-specific audit record is public yet.</p> : <ul>{detail.audit.map((record) => <li key={record.logHash}><span>{record.kind}: </span><code className="public-code">{record.logHash}</code></li>)}</ul>}
          <p><Link href={`/audit/${detail.turnId}`}>Open the complete turn audit</Link></p>
        </section>
      </div>
    </PublicShell>
  );
}
