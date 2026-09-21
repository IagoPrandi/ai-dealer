import { createHash } from "node:crypto";
import type {
  JevReviewMode,
  JevSemanticReview,
  JevSemanticReviewRequest,
} from "@tyche/rule-compiler";
import { digestAiCallInput, readProviderUsage, recordAiCall } from "./usage.js";

const DEFAULT_ENDPOINT = "https://openrouter.ai/api/alpha/decisions";
const DEFAULT_MODEL = "typesafe/jev-1.13-20260917";
const DEFAULT_TIMEOUT_MS = 30_000;

export interface JevReviewConfig {
  apiKey: string;
  /** Operator-reviewed evidence, absent until offline and shadow gates pass. */
  calibration?: JevCalibration;
  astCoverageThreshold: number;
  canaryPercent: number;
  endpoint: string;
  facetThreshold: number;
  mode: JevReviewMode;
  model: string;
  sourceSupportThreshold: number;
  structuralConfidenceThreshold: number;
  structuralProbabilityThreshold: number;
  timeoutMs: number;
}

export interface JevCalibration {
  model: string;
  evidenceHash: string;
  incorrectHoldoutAsts: number;
  falseAccepts: number;
  shadowPreflights: number;
  audited: boolean;
  allMetricGatesPassed: boolean;
  cohorts: string[];
  thresholds: {
    probability: number;
    confidence: number;
    support: number;
    coverage: number;
    facet: number;
  };
}

function readCalibration(
  value: string | undefined,
): JevCalibration | undefined {
  if (!clean(value)) return undefined;
  const parsed = JSON.parse(clean(value)) as JevCalibration;
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof parsed.model !== "string" ||
    parsed.model.includes("latest") ||
    !/^[a-f0-9]{64}$/u.test(parsed.evidenceHash) ||
    !Number.isInteger(parsed.incorrectHoldoutAsts) ||
    parsed.incorrectHoldoutAsts < 360 ||
    parsed.falseAccepts !== 0 ||
    !Number.isInteger(parsed.shadowPreflights) ||
    parsed.shadowPreflights < 1000 ||
    parsed.audited !== true ||
    parsed.allMetricGatesPassed !== true ||
    !Array.isArray(parsed.cohorts) ||
    parsed.cohorts.length === 0 ||
    !parsed.cohorts.every((cohort) =>
      /^(en|pt):(simple|medium|complex)$/u.test(cohort),
    ) ||
    !parsed.thresholds ||
    ![
      parsed.thresholds.probability,
      parsed.thresholds.confidence,
      parsed.thresholds.support,
      parsed.thresholds.coverage,
      parsed.thresholds.facet,
    ].every(
      (value) =>
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0.5 &&
        value <= 1,
    )
  ) {
    throw new Error("JEV_CALIBRATION_INVALID");
  }
  return parsed;
}

/** Unknown language stays outside the calibrated cohort. Complexity uses AST nodes. */
export function jevCohort(request: JevSemanticReviewRequest): string {
  const text = request.originalText.toLowerCase();
  const portuguese =
    /\b(ganha|ganhar|jogador|bilhete|numeros|números|sorteados|premio|prêmio)\b/u.test(
      text,
    );
  const english = /\b(win|wins|ticket|guess|draw|drawn|numbers)\b/u.test(text);
  const language =
    portuguese === english ? "unknown" : portuguese ? "pt" : "en";
  const nodes = (JSON.stringify(request.ast).match(/"kind":/gu) ?? []).length;
  const complexity = nodes <= 8 ? "simple" : nodes <= 24 ? "medium" : "complex";
  return `${language}:${complexity}`;
}

export interface JevInterpretationAdvisoryRequest {
  addedOperationalClauses: readonly string[];
  clarificationQuestions: readonly string[];
  normalizedText: string;
  officialInterpretation: string;
  originalText: string;
}

export interface JevInterpretationAdvisory {
  assumptionsSupported: number;
  attestationHash: string;
  clarificationMateriality: Record<string, number>;
  costUsd: number | null;
  errorCode?: string;
  interpretationSupported: number;
  latencyMs: number;
  modelAlias: string;
  policyCategories: Record<string, number>;
  resolvedModel: string;
  status: "ERROR" | "RECORDED";
}

type FetchLike = typeof fetch;

function clean(value: string | undefined): string {
  return (value ?? "").replace(/\s+#.*$/u, "").trim();
}

function unitInterval(value: string | undefined, fallback: number): number {
  const configured = clean(value);
  if (!configured) return fallback;
  const parsed = Number(configured);
  if (!Number.isFinite(parsed) || parsed < 0.5 || parsed > 1)
    throw new Error("JEV_THRESHOLD_INVALID");
  return parsed;
}

function boundedPercent(value: string | undefined, fallback: number): number {
  const configured = clean(value);
  if (!configured) return fallback;
  const parsed = Number(configured);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100)
    throw new Error("JEV_CANARY_INVALID");
  return parsed;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const configured = clean(value);
  if (!configured) return fallback;
  const parsed = Number(configured);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error("JEV_TIMEOUT_INVALID");
  return parsed;
}

function reviewMode(value: string | undefined): JevReviewMode {
  const normalized = clean(value).toLowerCase();
  if (normalized && !["off", "shadow", "gated", "active"].includes(normalized))
    throw new Error("JEV_MODE_INVALID");
  return normalized === "shadow" ||
    normalized === "gated" ||
    normalized === "active"
    ? normalized
    : "off";
}

export function resolveJevReviewConfig(
  env: NodeJS.ProcessEnv = process.env,
): JevReviewConfig {
  const calibration = readCalibration(env.JEV_CALIBRATION_JSON);
  return {
    ...(calibration ? { calibration } : {}),
    apiKey: clean(env.JEV_API_KEY) || clean(env.API_KEY_OPENROUTER),
    astCoverageThreshold: unitInterval(env.JEV_AST_COVERAGE_THRESHOLD, 0.7),
    canaryPercent: boundedPercent(env.JEV_CANARY_PERCENT, 5),
    endpoint: clean(env.JEV_DECISIONS_ENDPOINT) || DEFAULT_ENDPOINT,
    facetThreshold: unitInterval(env.JEV_FACET_THRESHOLD, 0.9),
    mode: reviewMode(env.JEV_REVIEW_MODE),
    model: clean(env.JEV_MODEL) || DEFAULT_MODEL,
    sourceSupportThreshold: unitInterval(env.JEV_SOURCE_SUPPORT_THRESHOLD, 0.7),
    structuralConfidenceThreshold: unitInterval(
      env.JEV_STRUCTURAL_CONFIDENCE_THRESHOLD,
      0.7,
    ),
    structuralProbabilityThreshold: unitInterval(
      env.JEV_STRUCTURAL_PROBABILITY_THRESHOLD,
      0.7,
    ),
    timeoutMs: positiveInteger(env.JEV_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
  };
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function errorReview(
  request: JevSemanticReviewRequest,
  config: JevReviewConfig,
  latencyMs: number,
  errorCode: string,
): JevSemanticReview {
  const body = {
    astCoversSource: 0,
    candidateArtifactHash: request.candidateArtifactHash,
    costUsd: null,
    errorCode,
    facets: {},
    latencyMs,
    modelAlias: config.model,
    resolvedModel: "unavailable",
    sourceSupportsAst: 0,
    status: "ERROR" as const,
    structural: {
      confidence: 0,
      label: "maybe" as const,
      probability: 0,
    },
  };
  return { ...body, attestationHash: hash(body) };
}

function unitNumber(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
    ? value
    : null;
}

function parseChoice(value: unknown): JevSemanticReview["structural"] | null {
  if (!value || typeof value !== "object") return null;
  const answer = value as Record<string, unknown>;
  const label = answer.choice;
  const probabilities = answer.probabilities;
  const confidence = unitNumber(answer.confidence);
  if (
    (label !== "yes" && label !== "maybe" && label !== "no") ||
    !probabilities ||
    typeof probabilities !== "object" ||
    confidence === null
  ) {
    return null;
  }
  const probability = unitNumber(
    (probabilities as Record<string, unknown>)[label],
  );
  const values = ["yes", "maybe", "no"].map((key) =>
    unitNumber((probabilities as Record<string, unknown>)[key]),
  );
  if (
    values.some((value) => value === null) ||
    Math.abs(values.reduce<number>((sum, value) => sum + (value ?? 0), 0) - 1) >
      0.025 ||
    values.some(
      (value) => value !== null && probability !== null && value > probability,
    )
  )
    return null;
  return probability === null ? null : { confidence, label, probability };
}

function parseNoul(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  return unitNumber((value as Record<string, unknown>).noul);
}

function linkedTimeoutSignal(
  timeoutMs: number,
  externalSignal?: AbortSignal,
): { cleanup: () => void; signal: AbortSignal } {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("JEV_TIMEOUT")),
    timeoutMs,
  );
  timeout.unref();
  const onAbort = () =>
    controller.abort(externalSignal?.reason ?? new Error("JEV_ABORTED"));
  externalSignal?.addEventListener("abort", onAbort, { once: true });
  if (externalSignal?.aborted) onAbort();
  return {
    cleanup: () => {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", onAbort);
    },
    signal: controller.signal,
  };
}

function facetQuestion(facet: string) {
  return {
    type: "noul",
    instructions: `Does the candidate AST faithfully preserve the proposal's ${facet} semantics, without adding, omitting, or weakening a material choice?`,
  };
}

const INTERPRETATION_POLICY_CATEGORIES = [
  "eligibility",
  "external_state",
  "boolean_scope",
  "ordering_or_source",
  "randomness",
  "threshold",
  "tie_handling",
] as const;

function interpretationError(
  config: JevReviewConfig,
  latencyMs: number,
  errorCode: string,
): JevInterpretationAdvisory {
  const body = {
    assumptionsSupported: 0,
    clarificationMateriality: {},
    costUsd: null,
    errorCode,
    interpretationSupported: 0,
    latencyMs,
    modelAlias: config.model,
    policyCategories: {},
    resolvedModel: "unavailable",
    status: "ERROR" as const,
  };
  return { ...body, attestationHash: hash(body) };
}

export async function reviewInterpretationWithJev(
  request: JevInterpretationAdvisoryRequest,
  config: JevReviewConfig = resolveJevReviewConfig(),
  signal?: AbortSignal,
  fetchImpl: FetchLike = fetch,
): Promise<JevInterpretationAdvisory> {
  const startedAt = new Date().toISOString();
  const startedAtMs = performance.now();
  const payload = {
    model: config.model,
    state: {
      addedOperationalClauses: request.addedOperationalClauses,
      clarificationQuestions: request.clarificationQuestions,
      fixedGameDomain:
        "Guess and draw each contain six distinct integers from 1 through 100. Rules may use only deterministic bounded operations over guess and draw.",
      normalizedText: request.normalizedText,
      officialInterpretation: request.officialInterpretation,
      originalProposal: request.originalText,
    },
    questions: {
      interpretation_supported: {
        type: "noul",
        instructions:
          "Is every material claim in `officialInterpretation` supported by `originalProposal`, without an invented player choice?",
      },
      assumptions_supported: {
        type: "noul",
        instructions:
          "Are all items in `addedOperationalClauses` explicitly supported or logically required by `originalProposal`? An empty list is fully supported.",
      },
      ...Object.fromEntries(
        request.clarificationQuestions.map((_question, index) => [
          `question_${index}`,
          {
            type: "noul",
            instructions: `Would answering \`clarificationQuestions[${index}]\` materially change which tickets can win, their ranking, eligibility, or tie outcome? Score relevance only; never decide whether the question may be omitted.`,
          },
        ]),
      ),
      ...Object.fromEntries(
        INTERPRETATION_POLICY_CATEGORIES.map((category) => [
          `policy_${category}`,
          {
            type: "noul",
            instructions: `Does \`originalProposal\` or \`officialInterpretation\` contain an unresolved or forbidden ${category.replaceAll("_", " ")} issue that needs deterministic policy handling or a player question? This score is advisory and cannot remove an existing question.`,
          },
        ]),
      ),
    },
  };
  const serializedPayload = JSON.stringify(payload);
  if (!config.apiKey) return interpretationError(config, 0, "NOT_CONFIGURED");

  const linked = linkedTimeoutSignal(config.timeoutMs, signal);
  let responseBody: unknown = null;
  let outcome: "error" | "ok" = "error";
  try {
    const response = await fetchImpl(config.endpoint, {
      body: serializedPayload,
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      method: "POST",
      signal: linked.signal,
    });
    responseBody = await response.json().catch(() => null);
    if (!response.ok || !responseBody || typeof responseBody !== "object") {
      return interpretationError(
        config,
        Math.round(performance.now() - startedAtMs),
        response.ok ? "MALFORMED_RESPONSE" : `HTTP_${response.status}`,
      );
    }
    const body = responseBody as Record<string, unknown>;
    if (typeof body.model !== "string" || !body.model.trim()) {
      return interpretationError(
        config,
        Math.round(performance.now() - startedAtMs),
        "MISSING_MODEL_VERSION",
      );
    }
    const answerMap = body.answers as Record<string, unknown> | undefined;
    const interpretationSupported = parseNoul(
      answerMap?.interpretation_supported,
    );
    const assumptionsSupported = parseNoul(answerMap?.assumptions_supported);
    const clarificationMateriality = Object.fromEntries(
      request.clarificationQuestions.map((_question, index) => [
        String(index),
        parseNoul(answerMap?.[`question_${index}`]),
      ]),
    );
    const policyCategories = Object.fromEntries(
      INTERPRETATION_POLICY_CATEGORIES.map((category) => [
        category,
        parseNoul(answerMap?.[`policy_${category}`]),
      ]),
    );
    if (
      interpretationSupported === null ||
      assumptionsSupported === null ||
      Object.values(clarificationMateriality).some((value) => value === null) ||
      Object.values(policyCategories).some((value) => value === null)
    ) {
      return interpretationError(
        config,
        Math.round(performance.now() - startedAtMs),
        "MALFORMED_RESPONSE",
      );
    }
    const usage = readProviderUsage(body);
    const resultBody = {
      assumptionsSupported,
      clarificationMateriality: clarificationMateriality as Record<
        string,
        number
      >,
      costUsd: usage?.costUsd ?? null,
      interpretationSupported,
      latencyMs: Math.round(performance.now() - startedAtMs),
      modelAlias: config.model,
      policyCategories: policyCategories as Record<string, number>,
      resolvedModel:
        typeof body.model === "string" && body.model.trim()
          ? body.model.trim()
          : config.model,
      status: "RECORDED" as const,
    };
    outcome = "ok";
    return { ...resultBody, attestationHash: hash(resultBody) };
  } catch {
    const code =
      linked.signal.aborted && !signal?.aborted
        ? "TIMEOUT"
        : signal?.aborted
          ? "ABORTED"
          : "REQUEST_FAILED";
    return interpretationError(
      config,
      Math.round(performance.now() - startedAtMs),
      code,
    );
  } finally {
    linked.cleanup();
    const usage = readProviderUsage(responseBody);
    recordAiCall({
      cachedPromptTokens: usage?.cachedPromptTokens ?? null,
      completionTokens: usage?.completionTokens ?? null,
      durationMs: performance.now() - startedAtMs,
      inputDigest: digestAiCallInput([serializedPayload]),
      model: config.model,
      outcome,
      promptTokens: usage?.promptTokens ?? null,
      provider: "openrouter-decisions",
      providerCostOnly: true,
      providerCostUsd: usage?.costUsd ?? null,
      reasoningTokens: usage?.reasoningTokens ?? null,
      startedAt,
      step: "jev_interpretation_advisory",
      totalTokens: usage?.totalTokens ?? null,
    });
  }
}

function requestPayload(request: JevSemanticReviewRequest, model: string) {
  return {
    model,
    state: {
      ast: request.ast,
      astContract:
        "Predicate results test a condition; ranking selects min/max eligible scores with share_pool ties and lexicographic criteria. source loads guess/draw. intersection/difference use membership; reverse/sort/slice change order. at uses zero-based positions. reduce performs count/sum/product/min/max/range_span (max minus min). arith applies add/sub/mul/div/mod. compare applies eq/neq/lt/lte/gt/gte. and/or/not are Boolean; XOR must exclude both-true. exists/forall bind elem; pairs_exists/pairs_forall bind aligned pair sides; depth selects the enclosing binder. No external state, random tie-break, payment, submission, or concrete runtime ticket decision is in scope.",
      astDescription: request.astDescription,
      approvedInterpretation: request.officialInterpretation,
      candidateArtifactHash: request.candidateArtifactHash,
      clauseFacts: collectClauseFacts(request.ast),
      gameDomain:
        "Guess and draw each contain six distinct integers from 1 through 100. Runtime execution, payout, freezing, and submission are controlled by separate deterministic gates.",
      normalizedText: request.normalizedText,
      originalProposal: request.originalText,
    },
    questions: {
      structural: {
        type: "choice",
        instructions:
          "Does `ast` preserve the approved interpretation's main winning-rule structure and logic? Judge the broad eligibility, ranking or predicate mechanism. A missing core branch or different winner mechanism is no. Do not evaluate a concrete ticket.",
        criteria: {
          maybe:
            "Part of the core mechanism matches, but a material structure or branch cannot be established.",
          no: "The AST omits or changes a core winning condition or mechanism.",
          yes: "The AST has the same complete core winning mechanism.",
        },
      },
      source_supports_ast: {
        type: "noul",
        instructions:
          "Is every material executable condition in `ast` explicitly stated or logically required by `originalProposal` and `approvedInterpretation`? Plausible defaults are not player authorization. Judge source-to-AST support only.",
      },
      ast_covers_source: {
        type: "noul",
        instructions:
          "Does `ast` implement every material winning condition in `originalProposal` and `approvedInterpretation`, with no stated condition omitted or weakened? Judge AST coverage of the source only.",
      },
      ...Object.fromEntries(
        request.facets.map((facet) => [`facet_${facet}`, facetQuestion(facet)]),
      ),
    },
  };
}

function collectClauseFacts(
  ast: unknown,
): { path: string; expression: unknown }[] {
  const facts: { path: string; expression: unknown }[] = [];
  const visit = (value: unknown, path: string) => {
    if (!value || typeof value !== "object") return;
    if (!Array.isArray(value) && "kind" in value)
      facts.push({ path, expression: value });
    for (const [key, child] of Object.entries(value))
      visit(child, `${path}.${key}`);
  };
  visit(ast, "ast");
  return facts;
}

export async function reviewRuleAstWithJev(
  request: JevSemanticReviewRequest,
  config: JevReviewConfig = resolveJevReviewConfig(),
  signal?: AbortSignal,
  fetchImpl: FetchLike = fetch,
): Promise<JevSemanticReview> {
  const startedAt = new Date().toISOString();
  const startedAtMs = performance.now();
  const payload = requestPayload(request, config.model);
  const serializedPayload = JSON.stringify(payload);
  if (!config.apiKey) {
    return errorReview(request, config, 0, "NOT_CONFIGURED");
  }

  const linked = linkedTimeoutSignal(config.timeoutMs, signal);
  let responseBody: unknown = null;
  let outcome: "error" | "ok" = "error";
  try {
    const response = await fetchImpl(config.endpoint, {
      body: serializedPayload,
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      method: "POST",
      signal: linked.signal,
    });
    responseBody = await response.json().catch(() => null);
    if (!response.ok) {
      return errorReview(
        request,
        config,
        Math.round(performance.now() - startedAtMs),
        `HTTP_${response.status}`,
      );
    }
    if (!responseBody || typeof responseBody !== "object") {
      return errorReview(
        request,
        config,
        Math.round(performance.now() - startedAtMs),
        "MALFORMED_RESPONSE",
      );
    }
    const body = responseBody as Record<string, unknown>;
    if (typeof body.model !== "string" || !body.model.trim()) {
      return errorReview(
        request,
        config,
        Math.round(performance.now() - startedAtMs),
        "MISSING_MODEL_VERSION",
      );
    }
    const answers = body.answers;
    if (!answers || typeof answers !== "object") {
      return errorReview(
        request,
        config,
        Math.round(performance.now() - startedAtMs),
        "MALFORMED_RESPONSE",
      );
    }
    const answerMap = answers as Record<string, unknown>;
    const structural = parseChoice(answerMap.structural);
    const sourceSupportsAst = parseNoul(answerMap.source_supports_ast);
    const astCoversSource = parseNoul(answerMap.ast_covers_source);
    const facets = Object.fromEntries(
      request.facets.map((facet) => [
        facet,
        parseNoul(answerMap[`facet_${facet}`]),
      ]),
    );
    if (
      structural === null ||
      sourceSupportsAst === null ||
      astCoversSource === null ||
      Object.values(facets).some((value) => value === null)
    ) {
      return errorReview(
        request,
        config,
        Math.round(performance.now() - startedAtMs),
        "MALFORMED_RESPONSE",
      );
    }
    const typedFacets = facets as Record<string, number>;
    const calibration = config.calibration;
    const calibrated =
      calibration !== undefined &&
      calibration.model === body.model &&
      calibration.model === config.model &&
      calibration.cohorts.includes(jevCohort(request));
    const thresholds = calibrated
      ? calibration.thresholds
      : {
          probability: config.structuralProbabilityThreshold,
          confidence: config.structuralConfidenceThreshold,
          support: config.sourceSupportThreshold,
          coverage: config.astCoverageThreshold,
          facet: config.facetThreshold,
        };
    const passes =
      structural.label === "yes" &&
      structural.probability >= thresholds.probability &&
      structural.confidence >= thresholds.confidence &&
      sourceSupportsAst >= thresholds.support &&
      astCoversSource >= thresholds.coverage &&
      Object.values(typedFacets).every((value) => value >= thresholds.facet);
    const mismatches =
      (structural.label === "no" &&
        structural.probability >= thresholds.probability &&
        structural.confidence >= thresholds.confidence) ||
      sourceSupportsAst <= 1 - thresholds.support ||
      astCoversSource <= 1 - thresholds.coverage ||
      Object.values(typedFacets).some((value) => value <= 1 - thresholds.facet);
    const usage = readProviderUsage(body);
    const resultBody = {
      astCoversSource,
      cohort: jevCohort(request),
      ...(calibrated
        ? { calibrationEvidenceHash: calibration.evidenceHash }
        : {}),
      candidateArtifactHash: request.candidateArtifactHash,
      costUsd: usage?.costUsd ?? null,
      facets: typedFacets,
      latencyMs: Math.round(performance.now() - startedAtMs),
      modelAlias: config.model,
      resolvedModel:
        typeof body.model === "string" && body.model.trim()
          ? body.model.trim()
          : config.model,
      sourceSupportsAst,
      ...(!calibrated && (config.mode === "active" || config.mode === "gated")
        ? { errorCode: "UNCALIBRATED_COHORT" }
        : {}),
      status:
        !calibrated && (config.mode === "active" || config.mode === "gated")
          ? ("ABSTAIN" as const)
          : passes
            ? ("PASS" as const)
            : mismatches
              ? ("MISMATCH" as const)
              : ("ABSTAIN" as const),
      structural,
    };
    outcome = "ok";
    return { ...resultBody, attestationHash: hash(resultBody) };
  } catch {
    const code =
      linked.signal.aborted && !signal?.aborted
        ? "TIMEOUT"
        : signal?.aborted
          ? "ABORTED"
          : "REQUEST_FAILED";
    return errorReview(
      request,
      config,
      Math.round(performance.now() - startedAtMs),
      code,
    );
  } finally {
    linked.cleanup();
    const usage = readProviderUsage(responseBody);
    recordAiCall({
      cachedPromptTokens: usage?.cachedPromptTokens ?? null,
      completionTokens: usage?.completionTokens ?? null,
      durationMs: performance.now() - startedAtMs,
      inputDigest: digestAiCallInput([serializedPayload]),
      model: config.model,
      outcome,
      promptTokens: usage?.promptTokens ?? null,
      provider: "openrouter-decisions",
      providerCostOnly: true,
      providerCostUsd: usage?.costUsd ?? null,
      reasoningTokens: usage?.reasoningTokens ?? null,
      startedAt,
      step: "jev_semantic_review",
      totalTokens: usage?.totalTokens ?? null,
    });
  }
}
