"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CREATOR_REWARD_RESERVE_SHARE_BPS, TREASURY_FEE_BPS } from "@idealer/constants";

type LoadState = "error" | "loading" | "ready";

interface ConsoleSafetyBoundary {
  allowedHttpMethods: readonly string[];
  dashboardFieldReviewChecklist: string[];
  dataLoaderMode: "read_only";
  logsExcludePrivateUserAnalytics: boolean;
  mutationEndpointsAvailable: false;
  noPrivateAnalyticsRequired: boolean;
  outcomeControlUnavailable: boolean;
  privateTelemetryDenylist: string[];
  protectedGameStateMutationDenylist: string[];
  publicExportsContainOnlyPublicDerivableFields: boolean;
  readOnly: true;
  restrictedAiCanBeDisabledWithoutPublicImpact: boolean;
  restrictedAiExportsContainOnlyRedactedOperationalFields: boolean;
}

interface TransparencySnapshot {
  activeTurnId: number;
  dataBoundary: {
    consoleSafetyBoundary: ConsoleSafetyBoundary;
    deniedPrivateFields: string[];
    publicExportFieldsOnly: boolean;
    publicMetricsOnly: boolean;
    restrictedAiOperations: {
      endpoint: "/operator/ai-operations";
      exportEndpoint: "/operator/ai-operations/export";
      role: "ai_operator";
      status: "access_controlled";
    };
  };
  exports: {
    csvPath: string;
    excludedPrivateAnalytics: string[];
    jsonPath: string;
  };
  filters: {
    fromDate?: string;
    fromTurnId: number;
    toDate?: string;
    toTurnId: number;
  };
  generatedAt: string;
  sourceReferences: Array<{
    derivation: string;
    endpoint: string;
    label: string;
    source: string;
  }>;
  totals: {
    approvalVotes: number;
    claims: number;
    creatorRewardLamports: number;
    drawProofs: number;
    eliminationVotes: number;
    grossFeesLamports: number;
    guesses: number;
    paidRemovals: number;
    platformTreasuryLamports: number;
    proposals: number;
    rolloverInLamports: number;
    rolloverOutLamports: number;
    settlementTransitions: number;
    voterRewardLamports: number;
    winnerPayoutLamports: number;
  };
  trends: {
    byTurnDuration: Array<{
      approvalVotes: number;
      creatorRewardLamports: number;
      durationHours: number;
      eliminationVotes: number;
      grossFeesLamports: number;
      guesses: number;
      prizePoolLamports: number;
      proposals: number;
      rolloverLamports: number;
      turns: number;
      voterRewardLamports: number;
    }>;
    repeatedPaidActions: Array<{
      count: number;
      feeLamports: number;
      scope: string;
    }>;
    ruleLifecycle: {
      active: number;
      eliminated: number;
      finalist: number;
      invalidated: number;
      proposed: number;
      removed: number;
      survived: number;
    };
    topCreators: Array<{
      creator: string;
      electedRules: number;
      proposedRules: number;
      rewardLamports: number;
      votesReceived: number;
      winnerProducingRules: number;
    }>;
  };
  turns: Array<{
    activity: {
      claims: number;
      eliminationVotes: number;
      guesses: number;
      paidRemovals: number;
      proposals: number;
      settlementTransitions: number;
      totalVotes: number;
    };
    claims: {
      availableLamports: number;
      belowThresholdLamports: number;
      claimedLamports: number;
      expiredLamports: number;
      pendingLamports: number;
      rolledOverLamports: number;
      statusCounts: Record<string, number>;
    };
    durationHours: number;
    economy: {
      alternativeBucketLamports: number;
      expiredUnclaimedLamports: number;
      grossFeesLamports: number;
      originalBucketLamports: number;
      payoutDustLamports: number;
      pendingClaimableLamports: number;
      platformTreasuryLamports: number;
      prizePoolLamports: number;
      rolloverInLamports: number;
      rolloverOutLamports: number;
    };
    proofs: {
      activeRuleId: number | null;
      auditChainHead: string | null;
      drawRandomnessAccount: string | null;
      drawResultHash: string | null;
      eligiblePoolHash: string | null;
      finalistSetHash: string | null;
      settlementAuditEndpoint: string;
      winnerCalculationHash: string | null;
    };
    rewards: {
      creatorRewardLamports: number;
      creatorRewardReserveLamports: number;
      remainingReserveLamports: number;
      voterRewardLamports: number;
      voterRewardRecipients: number;
    };
    rules: {
      activeRuleId: number | null;
      eliminated: number;
      finalistRuleIds: number[];
      invalidated: number;
      precompiled: number;
      proposed: number;
      randomFinalistRuleIds: number[];
      removed: number;
      ruleTokenCountAverage: number;
      survived: number;
      topRules: Array<{
        creator: string;
        ruleId: number;
        title: string;
        totalVotes: number;
        uniqueApprovalVoters: number;
      }>;
      topVotedFinalistRuleIds: number[];
    };
    status: "completed" | "current" | "upcoming";
    turnId: number;
    voting: {
      approvalFeeLamports: number;
      repeatedApprovalVotes: number;
      repeatedEliminationVotes: number;
      totalApprovalVotes: number;
      totalEliminationVotes: number;
      uniqueApprovalVoters: number;
      uniqueEliminationVoters: number;
      eliminationFeeLamports: number;
    };
  }>;
}

interface OperatorAiOperationsSnapshot {
  access: {
    permissions: readonly string[];
    readOnly: true;
    role: "ai_operator";
  };
  agentCallVolumeByRole: Array<{
    calls: number;
    role: string;
    source: string;
  }>;
  auditLinks: Array<{
    artifactHash: string | null;
    auditEndpoint: string;
    auditLogHash: string | null;
    role: string;
    ruleId: number;
    turnId: number;
    validationLogId: string;
  }>;
  confidenceDistributions: {
    compilerConfidenceBuckets: Record<string, number>;
    finalConfidenceBuckets: Record<string, number>;
    modelConfidenceBuckets: Record<string, number>;
  };
  estimatedCost: {
    costPerThousandTokensUsd: number;
    estimatedUsd: number;
    source: "configured_rate" | "not_configured";
    totalTokens: number;
  };
  failureCounts: Array<{
    count: number;
    model: string;
    provider: string;
    role: string;
    status: string;
  }>;
  generatedAt: string;
  consoleSafetyBoundary: ConsoleSafetyBoundary;
  latencyPercentiles: Array<{
    count: number;
    model: string;
    p50Ms: number;
    p95Ms: number;
    provider: string;
    role: string;
    source: string;
  }>;
  localModelHealth: Array<{
    configuredModel: string;
    digest: string | null;
    lastHealthCheckResult: string;
    provider: string;
    quantization: string | null;
    servingEngine: string;
  }>;
  modelRouting: Array<{
    escalationCount: number;
    fallbackTriggered: number;
    local: boolean;
    model: string;
    provider: string;
    role: string;
    statuses: Record<string, number>;
    validationCalls: number;
  }>;
  operationCounts: {
    auditCompilerValidationLogs: number;
    auditGuessVerificationLogs: number;
    validationCalls: number;
    verificationJobs: number;
  };
  queue: {
    backlogJobs: number;
    deadLetterJobs: number;
    statusCounts: Record<string, number>;
  };
  redactionPolicy: {
    exportedFieldsOnly: string[];
    excludedFields: string[];
  };
  redactedIncidents: Array<{
    artifactHash: string | null;
    auditEndpoint: string | null;
    auditLogHash: string | null;
    model: string;
    provider: string;
    reasonCodes: string[];
    role: string;
    ruleId: number | null;
    status: string;
    turnId: number | null;
  }>;
  ruleCompiler: {
    confidenceActionCounts: Record<string, number>;
    decisionCounts: Record<string, number>;
    fallbackRate: number;
    providerDisagreementAverage: number;
    reasonCodeCounts: Record<string, number>;
  };
  sourceReferences: Array<{
    endpoint: string;
    label: string;
    source: string;
    status: "available" | "not_recorded";
  }>;
  tokenUsageByProviderModelRole: Array<{
    estimatedUsd: number;
    model: string;
    provider: string;
    role: string;
    source: string;
    totalTokens: number;
    validationCalls: number;
  }>;
}

const CONFIGURED_API_BASE_URL = process.env.NEXT_PUBLIC_IDEALER_API_URL?.trim();

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function isLocalHost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
}

function getApiBaseUrl() {
  if (CONFIGURED_API_BASE_URL) {
    return stripTrailingSlash(CONFIGURED_API_BASE_URL);
  }
  if (typeof window !== "undefined" && isLocalHost(window.location.hostname)) {
    return `${window.location.protocol}//${window.location.hostname}:3002`;
  }
  if (typeof window === "undefined") {
    return "http://localhost:3002";
  }
  throw new Error(
    "NEXT_PUBLIC_IDEALER_API_URL must be set outside local development.",
  );
}

function lamportsToSol(value: number) {
  return `${(value / 1_000_000_000).toLocaleString("en-US", {
    maximumFractionDigits: 4,
    minimumFractionDigits: 4,
  })} SOL`;
}

function compact(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value);
}

function shortHash(value: string | null) {
  if (!value) {
    return "Pending";
  }
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function shortAddress(value: string) {
  return `${value.slice(0, 5)}...${value.slice(-5)}`;
}

function metricLabel(value: number, suffix = "") {
  return `${compact(value)}${suffix}`;
}

function percentLabel(value: number) {
  return `${(value * 100).toLocaleString("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  })}%`;
}

function millisecondsLabel(value: number) {
  if (value >= 1_000) {
    return `${(value / 1_000).toLocaleString("en-US", {
      maximumFractionDigits: 1,
    })}s`;
  }
  return `${Math.round(value).toLocaleString("en-US")}ms`;
}

function usdLabel(value: number) {
  return value.toLocaleString("en-US", {
    currency: "USD",
    maximumFractionDigits: 4,
    minimumFractionDigits: 4,
    style: "currency",
  });
}

function bucketLabel(value: string) {
  return value.replace("_", "-");
}

function buildQuery(filters: {
  fromDate: string;
  fromTurnId: string;
  toDate: string;
  toTurnId: string;
}) {
  const params = new URLSearchParams();
  if (filters.fromTurnId) {
    params.set("fromTurnId", filters.fromTurnId);
  }
  if (filters.toTurnId) {
    params.set("toTurnId", filters.toTurnId);
  }
  if (filters.fromDate) {
    params.set("fromDate", filters.fromDate);
  }
  if (filters.toDate) {
    params.set("toDate", filters.toDate);
  }
  return params.toString();
}

function formatScope(value: string) {
  return value.replaceAll("_", " ");
}

function StatCard({
  label,
  source,
  value,
}: {
  label: string;
  source: string;
  value: string;
}) {
  return (
    <article className="stat-card">
      <span>{label}</span>
      <strong className="numeric">{value}</strong>
      <small>{source}</small>
    </article>
  );
}

export function OperatorAiOperationsPage() {
  const [operatorToken, setOperatorToken] = useState("");
  const [operatorLoadState, setOperatorLoadState] = useState<LoadState | "idle">("idle");
  const [operatorError, setOperatorError] = useState<string | null>(null);
  const [operatorSnapshot, setOperatorSnapshot] =
    useState<OperatorAiOperationsSnapshot | null>(null);
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);

  async function loadOperatorSnapshot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOperatorLoadState("loading");
    setOperatorError(null);
    setOperatorSnapshot(null);

    try {
      const response = await fetch(`${apiBaseUrl}/operator/ai-operations`, {
        headers: {
          authorization: `Bearer ${operatorToken}`,
        },
      });
      if (!response.ok) {
        throw new Error(`Operator API returned HTTP ${response.status}.`);
      }
      const body = (await response.json()) as {
        snapshot?: OperatorAiOperationsSnapshot;
      };
      if (!body.snapshot) {
        throw new Error("Operator API response did not include a snapshot.");
      }
      setOperatorSnapshot(body.snapshot);
      setOperatorLoadState("ready");
    } catch (fetchError) {
      setOperatorError(
        fetchError instanceof Error
          ? fetchError.message
          : "Could not load AI operations data.",
      );
      setOperatorLoadState("error");
    }
  }

  async function downloadOperatorExport(format: "csv" | "json") {
    setOperatorError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/operator/ai-operations/export?format=${format}`,
        {
          headers: {
            authorization: `Bearer ${operatorToken}`,
          },
        },
      );
      if (!response.ok) {
        throw new Error(`Operator export returned HTTP ${response.status}.`);
      }
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download =
        format === "csv"
          ? "idealer-operator-ai-operations.csv"
          : "idealer-operator-ai-operations.json";
      link.click();
      URL.revokeObjectURL(href);
    } catch (fetchError) {
      setOperatorError(
        fetchError instanceof Error
          ? fetchError.message
          : "Could not export AI operations data.",
      );
      setOperatorLoadState("error");
    }
  }

  return (
    <main className="admin-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Restricted AI operations</p>
          <h1>AI Operations Console</h1>
          <p>
            Redacted, read-only operational monitoring for AI Rule Compiler
            providers, latency, fallback, confidence, cost, and queue health.
          </p>
        </div>
        <div className="policy-strip" aria-label="Console policy">
          <span>Bearer token required</span>
          <span>Redacted operations only</span>
          <a href="/">Public transparency</a>
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="panel wide restricted-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Restricted operator surface</p>
              <h2>AI operations monitoring</h2>
            </div>
            {operatorSnapshot ? (
              <div className="export-actions">
                <button type="button" onClick={() => void downloadOperatorExport("json")}>
                  JSON
                </button>
                <button type="button" onClick={() => void downloadOperatorExport("csv")}>
                  CSV
                </button>
              </div>
            ) : null}
          </div>
          <form className="operator-gate" onSubmit={loadOperatorSnapshot}>
            <label>
              Operator bearer token
              <input
                autoComplete="off"
                onChange={(event) => setOperatorToken(event.target.value)}
                placeholder="Restricted token"
                type="password"
                value={operatorToken}
              />
            </label>
            <button disabled={!operatorToken || operatorLoadState === "loading"} type="submit">
              Load AI ops
            </button>
          </form>

          {operatorLoadState === "loading" ? (
            <p className="muted">Loading restricted redacted AI operations metrics.</p>
          ) : null}

          {operatorLoadState === "error" ? (
            <p className="operator-error" role="alert">
              {operatorError}
            </p>
          ) : null}

          {operatorSnapshot ? (
            <>
              <div className="operator-metrics">
                <StatCard
                  label="Validation calls"
                  source="Compiler audit aggregate"
                  value={metricLabel(operatorSnapshot.operationCounts.validationCalls)}
                />
                <StatCard
                  label="Fallback rate"
                  source="Provider routing aggregate"
                  value={percentLabel(operatorSnapshot.ruleCompiler.fallbackRate)}
                />
                <StatCard
                  label="Provider disagreement"
                  source="Confidence aggregate"
                  value={percentLabel(
                    operatorSnapshot.ruleCompiler.providerDisagreementAverage,
                  )}
                />
                <StatCard
                  label="Dead letters"
                  source="Verification queue"
                  value={metricLabel(operatorSnapshot.queue.deadLetterJobs)}
                />
                <StatCard
                  label="Token volume"
                  source="Rule proposal tokens"
                  value={metricLabel(operatorSnapshot.estimatedCost.totalTokens)}
                />
                <StatCard
                  label="Estimated cost"
                  source={formatScope(operatorSnapshot.estimatedCost.source)}
                  value={usdLabel(operatorSnapshot.estimatedCost.estimatedUsd)}
                />
              </div>

              <div className="operator-grid">
                <div>
                  <h3>Call volume by role</h3>
                  <ul className="stack-list">
                    {operatorSnapshot.agentCallVolumeByRole.map((record) => (
                      <li key={record.role}>
                        <span>{formatScope(record.role)}</span>
                        <strong>
                          {record.calls} calls / {record.source}
                        </strong>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3>Provider routing by role</h3>
                  <ul className="stack-list">
                    {operatorSnapshot.modelRouting.length === 0 ? (
                      <li>
                        <span>No routing records</span>
                        <strong>0 calls</strong>
                      </li>
                    ) : (
                      operatorSnapshot.modelRouting.map((route) => (
                        <li key={`${route.role}:${route.provider}:${route.model}`}>
                          <span>
                            {formatScope(route.role)} / {route.provider} / {route.model}
                          </span>
                          <strong>
                            {route.validationCalls} calls / {route.fallbackTriggered} fallback /{" "}
                            {route.escalationCount} escalated
                          </strong>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div>
                  <h3>Latency percentiles</h3>
                  <ul className="stack-list">
                    {operatorSnapshot.latencyPercentiles.length === 0 ? (
                      <li>
                        <span>No latency samples</span>
                        <strong>0ms</strong>
                      </li>
                    ) : (
                      operatorSnapshot.latencyPercentiles.map((latency) => (
                        <li
                          key={`${latency.source}:${latency.role}:${latency.provider}:${latency.model}`}
                        >
                          <span>
                            {formatScope(latency.role)} / {latency.provider}
                          </span>
                          <strong>
                            p50 {millisecondsLabel(latency.p50Ms)} / p95{" "}
                            {millisecondsLabel(latency.p95Ms)}
                          </strong>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div>
                  <h3>Failure counters</h3>
                  <ul className="stack-list">
                    {operatorSnapshot.failureCounts.length === 0 ? (
                      <li>
                        <span>No failures recorded</span>
                        <strong>0</strong>
                      </li>
                    ) : (
                      operatorSnapshot.failureCounts.map((failure) => (
                        <li
                          key={`${failure.role}:${failure.provider}:${failure.model}:${failure.status}`}
                        >
                          <span>
                            {formatScope(failure.status)} / {formatScope(failure.role)}
                          </span>
                          <strong>{failure.count}</strong>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div>
                  <h3>Confidence distributions</h3>
                  <ul className="stack-list compact">
                    {Object.entries(
                      operatorSnapshot.confidenceDistributions.compilerConfidenceBuckets,
                    ).map(([bucket, count]) => (
                      <li key={`compiler-${bucket}`}>
                        <span>Compiler {bucketLabel(bucket)}</span>
                        <strong>{count}</strong>
                      </li>
                    ))}
                    {Object.entries(
                      operatorSnapshot.confidenceDistributions.finalConfidenceBuckets,
                    ).map(([bucket, count]) => (
                      <li key={`final-${bucket}`}>
                        <span>Final {bucketLabel(bucket)}</span>
                        <strong>{count}</strong>
                      </li>
                    ))}
                    {Object.entries(
                      operatorSnapshot.confidenceDistributions.modelConfidenceBuckets,
                    ).map(([bucket, count]) => (
                      <li key={`model-${bucket}`}>
                        <span>Model {bucketLabel(bucket)}</span>
                        <strong>{count}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3>Token and cost projection</h3>
                  <ul className="stack-list">
                    {operatorSnapshot.tokenUsageByProviderModelRole.length === 0 ? (
                      <li>
                        <span>No token records</span>
                        <strong>0 tokens</strong>
                      </li>
                    ) : (
                      operatorSnapshot.tokenUsageByProviderModelRole.map((usage) => (
                        <li key={`${usage.role}:${usage.provider}:${usage.model}`}>
                          <span>
                            {formatScope(usage.role)} / {usage.provider} / {usage.model}
                          </span>
                          <strong>
                            {metricLabel(usage.totalTokens)} tokens / {usdLabel(usage.estimatedUsd)}
                          </strong>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div>
                  <h3>Queue status</h3>
                  <ul className="stack-list">
                    <li>
                      <span>Backlog</span>
                      <strong className="numeric">{operatorSnapshot.queue.backlogJobs}</strong>
                    </li>
                    {Object.entries(operatorSnapshot.queue.statusCounts).map(
                      ([status, count]) => (
                        <li key={status}>
                          <span>{formatScope(status)}</span>
                          <strong className="numeric">{count}</strong>
                        </li>
                      ),
                    )}
                  </ul>
                </div>
                <div>
                  <h3>Local model health</h3>
                  <ul className="stack-list">
                    {operatorSnapshot.localModelHealth.map((model) => (
                      <li key={`${model.provider}:${model.configuredModel}`}>
                        <span>
                          {model.servingEngine} / {model.configuredModel}
                        </span>
                        <strong>
                          {formatScope(model.lastHealthCheckResult)} /{" "}
                          {model.quantization ?? "No quantization"} /{" "}
                          {model.digest ? shortHash(model.digest) : "No digest"}
                        </strong>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3>Redacted incidents</h3>
                  <ul className="stack-list">
                    {operatorSnapshot.redactedIncidents.length === 0 ? (
                      <li>
                        <span>No incidents recorded</span>
                        <strong>0</strong>
                      </li>
                    ) : (
                      operatorSnapshot.redactedIncidents.slice(0, 6).map((incident) => (
                        <li
                          key={`${incident.turnId}:${incident.ruleId}:${incident.status}:${incident.provider}`}
                        >
                          <span>
                            {formatScope(incident.status)} / turn {incident.turnId ?? "n/a"}
                          </span>
                          <strong>
                            {incident.auditEndpoint ? (
                              <a href={`${apiBaseUrl}${incident.auditEndpoint}`}>
                                {shortHash(incident.auditLogHash)}
                              </a>
                            ) : (
                              "No audit link"
                            )}
                          </strong>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div>
                  <h3>Audit links</h3>
                  <ul className="stack-list">
                    {operatorSnapshot.auditLinks.slice(0, 6).map((link) => (
                      <li key={link.validationLogId}>
                        <span>
                          Turn {link.turnId} / rule {link.ruleId}
                        </span>
                        <strong>
                          <a href={`${apiBaseUrl}${link.auditEndpoint}`}>
                            {shortHash(link.auditLogHash)}
                          </a>
                        </strong>
                      </li>
                    ))}
                    {operatorSnapshot.auditLinks.length === 0 ? (
                      <li>
                        <span>No audit links</span>
                        <strong>0</strong>
                      </li>
                    ) : null}
                  </ul>
                </div>
                <div>
                  <h3>Redaction</h3>
                  <p className="boundary-note">
                    Exported fields are limited to{" "}
                    {operatorSnapshot.redactionPolicy.exportedFieldsOnly.join(", ")}.
                    Excluded fields include{" "}
                    {operatorSnapshot.redactionPolicy.excludedFields.slice(0, 7).join(", ")}
                    , and related private telemetry.
                  </p>
                </div>
              </div>
            </>
          ) : null}
        </article>
      </section>
    </main>
  );
}

export default function AdminPage() {
  const [filters, setFilters] = useState({
    fromDate: "",
    fromTurnId: "",
    toDate: "",
    toTurnId: "",
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<TransparencySnapshot | null>(null);

  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const query = useMemo(() => buildQuery(appliedFilters), [appliedFilters]);
  const exportQuery = query ? `${query}&` : "";
  const jsonExportUrl = `${apiBaseUrl}/transparency/export?${exportQuery}format=json`;
  const csvExportUrl = `${apiBaseUrl}/transparency/export?${exportQuery}format=csv`;

  useEffect(() => {
    const controller = new AbortController();
    setLoadState("loading");
    setError(null);

    void fetch(`${apiBaseUrl}/transparency${query ? `?${query}` : ""}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Transparency API returned HTTP ${response.status}.`);
        }
        const body = (await response.json()) as { snapshot?: TransparencySnapshot };
        if (!body.snapshot) {
          throw new Error("Transparency API response did not include a snapshot.");
        }
        setSnapshot(body.snapshot);
        setLoadState("ready");
      })
      .catch((fetchError: unknown) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") {
          return;
        }
        setError(fetchError instanceof Error ? fetchError.message : "Could not load transparency data.");
        setLoadState("error");
      });

    return () => controller.abort();
  }, [apiBaseUrl, query]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedFilters(filters);
  }

  return (
    <main className="admin-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Public transparency</p>
          <h1>Idealer Transparency Console</h1>
          <p>
            Read-only public metrics derived from devnet game state, public API
            projections, on-chain references, and hash-chained audit logs.
          </p>
        </div>
        <div className="policy-strip" aria-label="Console policy">
          <span>Read-only</span>
          <span>Public data only</span>
          <a href="/operator/ai-operations">Restricted AI operations</a>
        </div>
      </section>

      <form className="filter-panel" onSubmit={applyFilters}>
        <label>
          From turn
          <input
            inputMode="numeric"
            onChange={(event) =>
              setFilters((current) => ({ ...current, fromTurnId: event.target.value }))
            }
            placeholder="1"
            type="number"
            value={filters.fromTurnId}
          />
        </label>
        <label>
          To turn
          <input
            inputMode="numeric"
            onChange={(event) =>
              setFilters((current) => ({ ...current, toTurnId: event.target.value }))
            }
            placeholder={snapshot ? String(snapshot.activeTurnId) : "Current"}
            type="number"
            value={filters.toTurnId}
          />
        </label>
        <label>
          From date
          <input
            onChange={(event) =>
              setFilters((current) => ({ ...current, fromDate: event.target.value }))
            }
            type="date"
            value={filters.fromDate}
          />
        </label>
        <label>
          To date
          <input
            onChange={(event) =>
              setFilters((current) => ({ ...current, toDate: event.target.value }))
            }
            type="date"
            value={filters.toDate}
          />
        </label>
        <button type="submit">Apply filters</button>
      </form>

      {loadState === "loading" ? (
        <section className="state-panel" aria-live="polite">
          <strong>Loading public transparency data</strong>
          <p>Reading the API projection from {apiBaseUrl}.</p>
        </section>
      ) : null}

      {loadState === "error" ? (
        <section className="state-panel error" role="alert">
          <strong>Transparency data unavailable</strong>
          <p>{error}</p>
        </section>
      ) : null}

      {loadState === "ready" && snapshot ? (
        <>
          <section className="metric-grid" aria-label="Transparency totals">
            <StatCard
              label="Gross public fees"
              source="Public fee projection"
              value={lamportsToSol(snapshot.totals.grossFeesLamports)}
            />
            <StatCard
              label="Treasury fee"
              source={`${TREASURY_FEE_BPS / 100}% policy`}
              value={lamportsToSol(snapshot.totals.platformTreasuryLamports)}
            />
            <StatCard
              label="Guesses"
              source="On-chain/API receipts"
              value={metricLabel(snapshot.totals.guesses)}
            />
            <StatCard
              label="Proposals"
              source="Rule proposal accounts"
              value={metricLabel(snapshot.totals.proposals)}
            />
            <StatCard
              label="Votes"
              source="Approval + elimination"
              value={metricLabel(snapshot.totals.approvalVotes + snapshot.totals.eliminationVotes)}
            />
            <StatCard
              label="Winner payouts"
              source="Settlement projection"
              value={lamportsToSol(snapshot.totals.winnerPayoutLamports)}
            />
            <StatCard
              label="Creator rewards"
              source={`${CREATOR_REWARD_RESERVE_SHARE_BPS / 100}% reserve policy`}
              value={lamportsToSol(snapshot.totals.creatorRewardLamports)}
            />
            <StatCard
              label="Audit transitions"
              source="Hash chain"
              value={metricLabel(snapshot.totals.settlementTransitions)}
            />
          </section>

          <section className="dashboard-grid">
            <article className="panel wide">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Turn & economy transparency</p>
                  <h2>Public turn ledger</h2>
                </div>
                <div className="export-actions">
                  <a href={jsonExportUrl}>JSON</a>
                  <a href={csvExportUrl}>CSV</a>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Turn</th>
                      <th>Status</th>
                      <th>Duration</th>
                      <th>Actions</th>
                      <th>Fees</th>
                      <th>Prize</th>
                      <th>Rollover</th>
                      <th>Proofs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.turns.map((turn) => (
                      <tr key={turn.turnId}>
                        <td className="numeric">#{turn.turnId}</td>
                        <td>{turn.status}</td>
                        <td className="numeric">{turn.durationHours}h</td>
                        <td>
                          {turn.activity.guesses} guesses / {turn.activity.proposals} rules /{" "}
                          {turn.activity.totalVotes} votes
                        </td>
                        <td className="numeric">{lamportsToSol(turn.economy.grossFeesLamports)}</td>
                        <td className="numeric">{lamportsToSol(turn.economy.prizePoolLamports)}</td>
                        <td className="numeric">
                          {lamportsToSol(turn.economy.rolloverInLamports)} in /{" "}
                          {lamportsToSol(turn.economy.rolloverOutLamports)} out
                        </td>
                        <td>
                          <a href={`${apiBaseUrl}${turn.proofs.settlementAuditEndpoint}`}>
                            {shortHash(turn.proofs.auditChainHead)}
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="panel">
              <p className="eyebrow">Rule & voting transparency</p>
              <h2>Rule lifecycle</h2>
              <dl className="compact-list">
                <div>
                  <dt>Proposed</dt>
                  <dd className="numeric">{snapshot.trends.ruleLifecycle.proposed}</dd>
                </div>
                <div>
                  <dt>Finalists</dt>
                  <dd className="numeric">{snapshot.trends.ruleLifecycle.finalist}</dd>
                </div>
                <div>
                  <dt>Eliminated</dt>
                  <dd className="numeric">{snapshot.trends.ruleLifecycle.eliminated}</dd>
                </div>
                <div>
                  <dt>Survived</dt>
                  <dd className="numeric">{snapshot.trends.ruleLifecycle.survived}</dd>
                </div>
                <div>
                  <dt>Active</dt>
                  <dd className="numeric">{snapshot.trends.ruleLifecycle.active}</dd>
                </div>
                <div>
                  <dt>Removed</dt>
                  <dd className="numeric">{snapshot.trends.ruleLifecycle.removed}</dd>
                </div>
              </dl>
            </article>

            <article className="panel">
              <p className="eyebrow">Repeated paid actions</p>
              <h2>Fee escalation</h2>
              <ul className="stack-list">
                {snapshot.trends.repeatedPaidActions.map((action) => (
                  <li key={action.scope}>
                    <span>{formatScope(action.scope)}</span>
                    <strong className="numeric">
                      {action.count} / {lamportsToSol(action.feeLamports)}
                    </strong>
                  </li>
                ))}
              </ul>
            </article>

            <article className="panel">
              <p className="eyebrow">Public trends</p>
              <h2>By turn duration</h2>
              <ul className="stack-list">
                {snapshot.trends.byTurnDuration.map((trend) => (
                  <li key={trend.durationHours}>
                    <span className="numeric">{trend.durationHours}h</span>
                    <strong>
                      {trend.turns} turns / {trend.guesses} guesses /{" "}
                      {lamportsToSol(trend.grossFeesLamports)}
                    </strong>
                  </li>
                ))}
              </ul>
            </article>

            <article className="panel">
              <p className="eyebrow">Creator transparency</p>
              <h2>Top public creators</h2>
              {snapshot.trends.topCreators.length === 0 ? (
                <p className="muted">No public creator activity in this filter.</p>
              ) : (
                <ul className="stack-list">
                  {snapshot.trends.topCreators.map((creator) => (
                    <li key={creator.creator}>
                      <span className="numeric">{shortAddress(creator.creator)}</span>
                      <strong>
                        {creator.proposedRules} rules / {creator.votesReceived} votes /{" "}
                        {creator.electedRules} elected
                      </strong>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="panel wide">
              <p className="eyebrow">Settlement & proof dashboard</p>
              <h2>Latest public proof material</h2>
              <div className="proof-grid">
                {snapshot.turns.slice(-4).map((turn) => (
                  <div key={`proof-${turn.turnId}`} className="proof-tile">
                    <span className="numeric">TURN-{turn.turnId}</span>
                    <dl>
                      <div>
                        <dt>Draw result hash</dt>
                        <dd className="numeric">{shortHash(turn.proofs.drawResultHash)}</dd>
                      </div>
                      <div>
                        <dt>Finalist set hash</dt>
                        <dd className="numeric">{shortHash(turn.proofs.finalistSetHash)}</dd>
                      </div>
                      <div>
                        <dt>Winner hash</dt>
                        <dd className="numeric">{shortHash(turn.proofs.winnerCalculationHash)}</dd>
                      </div>
                      <div>
                        <dt>Claims</dt>
                        <dd>
                          {turn.activity.claims} records / {lamportsToSol(turn.claims.pendingLamports)} pending
                        </dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel wide">
              <p className="eyebrow">Data boundary</p>
              <h2>Source references and exclusions</h2>
              <div className="source-grid">
                {snapshot.sourceReferences.map((source) => (
                  <div key={source.label}>
                    <strong>{source.label}</strong>
                    <span>{source.source}</span>
                    <p>{source.derivation}</p>
                    <code>{source.endpoint}</code>
                  </div>
                ))}
              </div>
              <p className="boundary-note">
                Exports include only public or derivable fields and exclude{" "}
                {snapshot.exports.excludedPrivateAnalytics.join(", ")} analytics.
                Denied fields include {snapshot.dataBoundary.deniedPrivateFields.slice(0, 6).join(", ")}
                , and related private telemetry.
              </p>
              <div className="source-grid">
                <div>
                  <strong>Console safety</strong>
                  <span>{formatScope(snapshot.dataBoundary.consoleSafetyBoundary.dataLoaderMode)}</span>
                  <p>
                    Methods:{" "}
                    {snapshot.dataBoundary.consoleSafetyBoundary.allowedHttpMethods.join(", ")}.
                    Mutations:{" "}
                    {snapshot.dataBoundary.consoleSafetyBoundary.mutationEndpointsAvailable
                      ? "available"
                      : "unavailable"}
                    .
                  </p>
                  <code>
                    {snapshot.dataBoundary.consoleSafetyBoundary.protectedGameStateMutationDenylist.join(", ")}
                  </code>
                </div>
                <div>
                  <strong>Field review checklist</strong>
                  <span>Required for dashboard changes</span>
                  <ul className="stack-list compact">
                    {snapshot.dataBoundary.consoleSafetyBoundary.dashboardFieldReviewChecklist.map(
                      (item) => (
                        <li key={item}>
                          <span>{item}</span>
                          <strong>Required</strong>
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              </div>
            </article>
          </section>
        </>
      ) : null}
    </main>
  );
}
