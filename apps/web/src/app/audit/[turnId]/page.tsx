import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeading, PublicShell } from "../../../features/public-site/PublicShell";
import { getPublicApiJson } from "../../../features/public-site/serverApi";
import type { PublicAuditLog } from "../../../features/public-site/types";

export const dynamic = "force-dynamic";

function parseTurnId(value: string) {
  const turnId = Number(value);
  return Number.isInteger(turnId) && turnId > 0 ? turnId : null;
}

export async function generateMetadata({ params }: { params: Promise<{ turnId: string }> }): Promise<Metadata> {
  const { turnId } = await params;
  const parsed = parseTurnId(turnId);
  return { title: parsed ? `Turn ${parsed} audit | Tywish` : "Audit not found | Tywish", description: parsed ? `Public hash-chain records for Tywish turn ${parsed}.` : undefined };
}

export default async function AuditPage({ params }: { params: Promise<{ turnId: string }> }) {
  const { turnId: rawTurnId } = await params;
  const turnId = parseTurnId(rawTurnId);
  if (!turnId) notFound();
  const { logs } = await getPublicApiJson<{ logs: PublicAuditLog[] }>(`/audit?turnId=${turnId}`);
  return (
    <PublicShell>
      <PageHeading eyebrow={`Turn ${turnId}`} title="Audit chain">Verify the ordered public commitments behind validation, election, draw, and settlement without exposing prompts or operational telemetry.</PageHeading>
      <div className="public-grid">
        {logs.length === 0 ? <p className="public-empty">No audit records have been published for this turn.</p> : logs.map((log, index) => (
          <article className="public-panel wide" key={log.logHash}>
            <p className="public-eyebrow">Record {index + 1} · {log.kind}</p>
            <h2>{log.result}</h2>
            <p>{log.reason}</p>
            <dl className="public-stats">
              <div className="public-stat"><dt>Created</dt><dd>{new Date(log.createdAt).toLocaleString("en-US", { timeZone: "UTC", timeZoneName: "short" })}</dd></div>
              <div className="public-stat"><dt>Rule</dt><dd>{log.ruleId ? <Link href={`/rules/${turnId}/${log.ruleId}`}>#{log.ruleId}</Link> : "Turn-level"}</dd></div>
              <div className="public-stat"><dt>Public state</dt><dd>{log.publicStateRef.type}</dd></div>
              <div className="public-stat"><dt>Previous record</dt><dd className="public-code">{log.previousLogHash ?? "Genesis"}</dd></div>
            </dl>
            <p className="public-code">Commitment: {log.commitmentHash}</p>
            <p className="public-code">Log: {log.logHash}</p>
          </article>
        ))}
      </div>
    </PublicShell>
  );
}
