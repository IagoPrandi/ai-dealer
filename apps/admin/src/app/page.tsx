"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CREATOR_REWARD_RESERVE_SHARE_BPS, TREASURY_FEE_BPS } from "@tyche/constants";

type LoadState = "error" | "loading" | "ready";

interface SolanaBrowserProvider {
  publicKey?: {
    toString(): string;
  };
  connect(): Promise<{
    publicKey?: {
      toString(): string;
    };
  }>;
  signMessage?(
    message: Uint8Array,
    encoding?: "utf8",
  ): Promise<Uint8Array | { signature: Uint8Array }>;
}

declare global {
  interface Window {
    solana?: SolanaBrowserProvider;
  }
}

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
    basis: "rule_text_token_projection";
    costPerThousandTokensUsd: number;
    estimatedUsd: number;
    measuredUsd: number | null;
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
  // Measured at the transport, not projected from rule text — see
  // apps/api/src/usage.ts.
  measuredResourceUsage: {
    byProvider: Array<{
      cachedPromptTokens: number;
      calls: number;
      completionTokens: number;
      costUsd: number | null;
      errorCalls: number;
      model: string;
      promptTokens: number;
      provider: string;
      reasoningTokens: number;
      totalDurationMs: number;
      totalTokens: number;
      truncatedCalls: number;
      unpricedCalls: number;
    }>;
    byStep: Array<{
      calls: number;
      completionTokens: number;
      costUsd: number | null;
      errorCalls: number;
      promptTokens: number;
      reasoningTokens: number;
      step: string;
      totalDurationMs: number;
      totalTokens: number;
      truncatedCalls: number;
    }>;
    compute: {
      averageCpuMsPerRun: number;
      averageWallClockMsPerRun: number;
      cpuCores: number;
      hostTotalMemoryBytes: number;
      peakConcurrentRuns: number;
      peakRssBytes: number;
      totalCpuMs: number;
      totalWallClockMs: number;
    };
    coverage: {
      detailedRunCount: number;
      retainedRunCount: number;
      runsWithUnpricedCalls: number;
      runsWithUntokenizedCalls: number;
    };
    perRunAverages: {
      completionTokens: number;
      costUsd: number | null;
      llmCalls: number;
      promptTokens: number;
      totalTokens: number;
      wallClockMs: number;
    };
    pricing: {
      configurationError: string | null;
      flatRatePerThousandTokensUsd: number;
      pricedModels: string[];
      unscopedCallCount: number;
    };
    recentRuns: Array<{
      completedAt: string;
      costUsd: number | null;
      cpuTotalMs: number;
      label: string;
      llmCalls: number;
      peakRssBytes: number;
      subject: string | null;
      totalTokens: number;
      wallClockMs: number;
    }>;
    source: "measured_provider_usage";
    totals: {
      completionTokens: number;
      costUsd: number | null;
      errorCalls: number;
      llmCalls: number;
      promptTokens: number;
      reasoningTokens: number;
      runs: number;
      totalTokens: number;
      truncatedCalls: number;
    };
  };
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

const CONFIGURED_API_BASE_URL = process.env.NEXT_PUBLIC_TYCHE_API_URL?.trim();

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
    "NEXT_PUBLIC_TYCHE_API_URL must be set outside local development.",
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

// A cost the pipeline could not establish reads as unknown. Rendering it as
// $0.0000 would say the run was free, which is the one thing it was not.
function optionalUsdLabel(value: number | null) {
  return value === null ? "Not priced" : usdLabel(value);
}

function bytesLabel(value: number) {
  if (value >= 1_073_741_824) {
    return `${(value / 1_073_741_824).toLocaleString("en-US", {
      maximumFractionDigits: 2,
    })} GB`;
  }
  return `${(value / 1_048_576).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  })} MB`;
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

/**
 * What the AI pipeline actually spent. Kept apart from the rule-text projection
 * above it because the two count different things: the projection counts the
 * players' ~80-token sentences, this counts the ~15k-token prompts the compiler
 * and reviewer send on every call.
 */
function MeasuredResourceUsagePanel({
  usage,
}: {
  usage: OperatorAiOperationsSnapshot["measuredResourceUsage"];
}) {
  const {
    byProvider,
    byStep,
    compute,
    coverage,
    perRunAverages,
    pricing,
    recentRuns,
    totals,
  } = usage;
  return (
    <section className="operator-grid">
      <div>
        <h3>Measured tokens by provider</h3>
        <ul className="stack-list">
          {byProvider.length === 0 ? (
            <li>
              <span>No measured calls retained</span>
              <strong>0 tokens</strong>
            </li>
          ) : (
            byProvider.map((row) => (
              <li key={`${row.provider}:${row.model}`}>
                <span>
                  {row.provider} / {row.model} / {row.calls} calls
                </span>
                <strong>
                  {metricLabel(row.promptTokens)} in /{" "}
                  {metricLabel(row.completionTokens)} out /{" "}
                  {metricLabel(row.totalTokens)} total
                  {/* Token counts are complete for every OpenAI-compatible
                      endpoint; only the USD conversion depends on a price. */}
                  {row.unpricedCalls === row.calls
                    ? " / tokens only"
                    : ` / ${optionalUsdLabel(row.costUsd)}`}
                </strong>
              </li>
            ))
          )}
        </ul>
      </div>
      <div>
        <h3>Measured spend by pipeline step</h3>
        <ul className="stack-list">
          {byStep.length === 0 ? (
            <li>
              <span>No measured calls retained</span>
              <strong>0 tokens</strong>
            </li>
          ) : (
            byStep.map((step) => (
              <li key={step.step}>
                <span>
                  {formatScope(step.step)} / {step.calls} calls
                  {step.truncatedCalls > 0
                    ? ` / ${step.truncatedCalls} truncated`
                    : ""}
                </span>
                <strong>
                  {metricLabel(step.promptTokens)} in /{" "}
                  {metricLabel(step.completionTokens)} out /{" "}
                  {optionalUsdLabel(step.costUsd)}
                </strong>
              </li>
            ))
          )}
        </ul>
      </div>
      <div>
        <h3>Compute per run</h3>
        <ul className="stack-list">
          <li>
            <span>LLM calls</span>
            <strong className="numeric">
              {perRunAverages.llmCalls.toLocaleString("en-US", {
                maximumFractionDigits: 1,
              })}
            </strong>
          </li>
          <li>
            <span>Tokens</span>
            <strong className="numeric">
              {metricLabel(Math.round(perRunAverages.totalTokens))}
            </strong>
          </li>
          <li>
            <span>Wall clock</span>
            <strong className="numeric">
              {millisecondsLabel(perRunAverages.wallClockMs)}
            </strong>
          </li>
          <li>
            <span>API CPU time</span>
            <strong className="numeric">
              {millisecondsLabel(compute.averageCpuMsPerRun)}
            </strong>
          </li>
          <li>
            <span>Host RAM</span>
            <strong className="numeric">
              {bytesLabel(compute.peakRssBytes)} peak /{" "}
              {bytesLabel(compute.hostTotalMemoryBytes)} total
            </strong>
          </li>
          <li>
            {/* Above 1, CPU and RSS are shared across overlapping runs:
                process.cpuUsage() is process-wide. */}
            <span>Peak concurrent runs</span>
            <strong className="numeric">{compute.peakConcurrentRuns}</strong>
          </li>
        </ul>
      </div>
      <div>
        <h3>Account coverage</h3>
        <ul className="stack-list">
          <li>
            <span>Runs retained / with per-call detail</span>
            <strong className="numeric">
              {coverage.retainedRunCount} / {coverage.detailedRunCount}
            </strong>
          </li>
          <li>
            <span>Runs with unpriced calls</span>
            <strong className="numeric">{coverage.runsWithUnpricedCalls}</strong>
          </li>
          <li>
            <span>Runs with untokenized calls</span>
            <strong className="numeric">
              {coverage.runsWithUntokenizedCalls}
            </strong>
          </li>
          <li>
            <span>Truncated / failed calls</span>
            <strong className="numeric">
              {totals.truncatedCalls} / {totals.errorCalls}
            </strong>
          </li>
          <li>
            <span>Calls recorded outside a run</span>
            <strong className="numeric">{pricing.unscopedCallCount}</strong>
          </li>
          <li>
            <span>Price source</span>
            <strong>
              {pricing.configurationError
                ? pricing.configurationError
                : pricing.pricedModels.length > 0
                  ? `${pricing.pricedModels.length} models priced locally`
                  : pricing.flatRatePerThousandTokensUsd > 0
                    ? "Flat configured rate"
                    : "Provider-reported only"}
            </strong>
          </li>
        </ul>
      </div>
      <div>
        <h3>Recent runs</h3>
        <ul className="stack-list">
          {recentRuns.length === 0 ? (
            <li>
              <span>No runs recorded</span>
              <strong>0 calls</strong>
            </li>
          ) : (
            recentRuns.map((run) => (
              <li key={`${run.completedAt}:${run.subject ?? run.label}`}>
                <span>
                  {formatScope(run.label)}
                  {run.subject ? ` / ${run.subject}` : ""}
                </span>
                <strong>
                  {run.llmCalls} calls / {metricLabel(run.totalTokens)} tokens /{" "}
                  {optionalUsdLabel(run.costUsd)} /{" "}
                  {millisecondsLabel(run.wallClockMs)}
                </strong>
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
}

export function OperatorAiOperationsPage() {
  const [operatorWallet, setOperatorWallet] = useState("");
  const [operatorLoadState, setOperatorLoadState] = useState<LoadState | "idle">("idle");
  const [operatorError, setOperatorError] = useState<string | null>(null);
  const [operatorSnapshot, setOperatorSnapshot] =
    useState<OperatorAiOperationsSnapshot | null>(null);
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);

  async function getOperatorAuthHeaders() {
    const provider = window.solana;
    if (!provider?.connect || !provider.signMessage) {
      throw new Error("Connect a Solana wallet that supports message signing.");
    }

    const connected = await provider.connect();
    const wallet = connected.publicKey?.toString() ?? provider.publicKey?.toString();
    if (!wallet) {
      throw new Error("The connected wallet did not return a public address.");
    }

    const challengeResponse = await fetch(
      `${apiBaseUrl}/operator/ai-operations/challenge`,
      {
        body: JSON.stringify({ wallet }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      },
    );
    if (!challengeResponse.ok) {
      throw new Error(`Operator challenge returned HTTP ${challengeResponse.status}.`);
    }
    const challengeBody = (await challengeResponse.json()) as {
      challenge?: {
        message: string;
        nonce: string;
        wallet: string;
      };
    };
    if (
      !challengeBody.challenge ||
      challengeBody.challenge.wallet !== wallet ||
      !challengeBody.challenge.nonce ||
      !challengeBody.challenge.message
    ) {
      throw new Error("Operator challenge response was invalid.");
    }

    const signed = await provider.signMessage(
      new TextEncoder().encode(challengeBody.challenge.message),
      "utf8",
    );
    const signature = signed instanceof Uint8Array ? signed : signed.signature;
    if (!(signature instanceof Uint8Array)) {
      throw new Error("The connected wallet did not return a valid signature.");
    }

    setOperatorWallet(wallet);
    return {
      "x-operator-nonce": challengeBody.challenge.nonce,
      "x-operator-signature": bytesToBase64(signature),
      "x-operator-wallet": wallet,
    };
  }

  async function loadOperatorSnapshot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOperatorLoadState("loading");
    setOperatorError(null);
    setOperatorSnapshot(null);

    try {
      const headers = await getOperatorAuthHeaders();
      const response = await fetch(`${apiBaseUrl}/operator/ai-operations`, {
        headers,
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
      const headers = await getOperatorAuthHeaders();
      const response = await fetch(
        `${apiBaseUrl}/operator/ai-operations/export?format=${format}`,
        { headers },
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
          ? "tyche-operator-ai-operations.csv"
          : "tyche-operator-ai-operations.json";
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
          <span>Authorized wallet required</span>
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
              Operator wallet
              <input
                readOnly
                value={operatorWallet || "Connect and sign with an authorized wallet"}
              />
            </label>
            <button disabled={operatorLoadState === "loading"} type="submit">
              Connect wallet
            </button>
          </form>

          {operatorLoadState === "loading" ? (
            <p className="muted">Waiting for wallet signature and loading restricted metrics.</p>
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
                  label="Rule text tokens"
                  source="Player rule sentences, not inference"
                  value={metricLabel(operatorSnapshot.estimatedCost.totalTokens)}
                />
                <StatCard
                  label="Measured tokens"
                  source={`Provider usage over ${operatorSnapshot.measuredResourceUsage.totals.runs} runs`}
                  value={metricLabel(
                    operatorSnapshot.measuredResourceUsage.totals.totalTokens,
                  )}
                />
                <StatCard
                  label="Measured cost"
                  source={
                    operatorSnapshot.measuredResourceUsage.coverage
                      .runsWithUnpricedCalls > 0
                      ? `Floor: ${operatorSnapshot.measuredResourceUsage.coverage.runsWithUnpricedCalls} runs have unpriced calls`
                      : "Every call priced"
                  }
                  value={optionalUsdLabel(
                    operatorSnapshot.measuredResourceUsage.totals.costUsd,
                  )}
                />
                <StatCard
                  label="Cost per run"
                  source="Measured average"
                  value={optionalUsdLabel(
                    operatorSnapshot.measuredResourceUsage.perRunAverages.costUsd,
                  )}
                />
                <StatCard
                  label="API CPU time"
                  source={`${operatorSnapshot.measuredResourceUsage.compute.cpuCores} cores / peak RSS ${bytesLabel(operatorSnapshot.measuredResourceUsage.compute.peakRssBytes)}`}
                  value={millisecondsLabel(
                    operatorSnapshot.measuredResourceUsage.compute.totalCpuMs,
                  )}
                />
              </div>

              <MeasuredResourceUsagePanel
                usage={operatorSnapshot.measuredResourceUsage}
              />

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
          <h1>Tyche Transparency Console</h1>
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
