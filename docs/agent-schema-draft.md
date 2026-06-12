# Agent Schema Draft

The AI system compiles natural-language rules into deterministic DSL/AST artifacts. It does not decide final winner outcomes.

## Rule Compiler Input

```ts
interface RuleCompilerInput {
  schema_version: 1;
  rule_id: string;
  turn_id: string;
  original_text: string;
  sanitized_text: string;
  token_count: number;
  max_tokens: 80;
  language_hint: "pt" | "en" | "unknown";
  allowed_nodes_version: string;
  runtime_limits: {
    max_ast_depth: number;
    max_operation_count: number;
    timeout_ms: number;
    max_removable_numbers: 4;
  };
}
```

## Rule Compilation Result

```ts
interface RuleCompilationResult {
  valid: boolean;
  rule_id: string;
  turn_id: string;
  original_text: string;
  normalized_text: string;
  official_interpretation: string;
  added_operational_clauses: string[];
  normalization_hash: string;
  compiled_artifact: CompiledRuleArtifact;
  confidence_breakdown: CompilerConfidenceBreakdown;
  difficulty_class: "EASY" | "MEDIUM" | "HARD" | "EXTREME";
  test_summary: RuleTestSummary;
  provider_path: ProviderAttemptLog[];
  fallback_triggered: boolean;
  fallback_rate_sample: 0 | 1;
  provider_disagreement_rate_sample: 0 | 1;
  rejection_reasons?: string[];
  compiler_version: string;
  runtime_version: string;
  test_harness_version: string;
  created_at: string;
  frozen_at?: string;
}
```

`RuleCompilationResult` must not include dedup scores or similar-rule lists. Dedup belongs to preflight.

## Compiled Artifact

```ts
interface CompiledRuleArtifact {
  schema_version: 1;
  artifact_hash: string;
  ast: Record<string, unknown>;
  allowed_nodes_version: string;
  deterministic: true;
  requires_order: boolean;
  uses_sum: boolean;
  uses_parity: boolean;
  uses_position: boolean;
  model_identity: ModelIdentity;
  provider_path: ProviderAttemptLog[];
}
```

## Provider Routing & Fallback

```ts
interface ModelIdentity {
  provider: string;
  model: string;
  digest: string | null;
  quantization: string | null;
  serving_engine: string;
}

interface ProviderAttemptLog {
  priority: "primary" | "secondary" | "tertiary";
  provider: string;
  model_identity: ModelIdentity;
  request_shape: "deterministic_json_schema" | "ollama_format" | "openai_response_format";
  capability_flags: {
    grammar_constrained_decoding: boolean;
    json_schema_response: boolean;
    local: boolean;
    openai_compatible: boolean;
    supports_ollama_format: boolean;
  };
  confidence_action: "ACCEPT" | "ESCALATE" | "REJECT";
  decision: "VALID" | "INVALID";
  final_confidence: number;
  status:
    | "accepted"
    | "escalated"
    | "malformed_response"
    | "provider_disagreement"
    | "rejected"
    | "schema_validation_failed"
    | "timeout";
}
```

Normal cases must stop after the primary provider. Timeout, malformed response, schema-constrained decoding failure, low confidence, and provider disagreement must add auditable provider-path entries. Tertiary provider output is used only as a tiebreaker for provider disagreement and never hides the provider path.

## Composite Confidence

```ts
interface CompilerConfidenceBreakdown {
  model_confidence: number;
  rule_clarity_score: number;
  compiler_confidence: number;
  reviewer_agreement_score: number;
  test_coverage_score: number;
  runtime_safety_score: number;
  schema_score: number;
  final_confidence: number;
}
```

Thresholds:

- `final_confidence >= 0.85`: accept compiled rule if deterministic checks pass.
- `0.70 <= final_confidence < 0.85`: escalate to reviewer or fallback provider.
- `final_confidence < 0.70`: reject or request clarification.

## Gate Check Schemas

```ts
interface RuleDedupResult {
  rule_id?: string;
  turn_id: string;
  verdict: "PASS" | "WARN" | "BLOCK";
  score: number;
  similarity_threshold_used: number;
  similar_rule_ids: string[];
  similar_rule_snippets?: string[];
  checked_at: string;
  embedding_model_version: string;
  canonical_signature_version?: string;
}

interface GateCheckLog {
  id: string;
  turn_id: string;
  player_wallet: string;
  gate_type: "game_token" | "token_count" | "prohibited_reference" | "prompt_injection" | "dedup";
  result: "PASS" | "WARN" | "BLOCK";
  reason: string;
  input_hash: string;
  output_hash: string;
  created_at: string;
}

interface CompilerAgentLog {
  id: string;
  rule_id: string;
  turn_id: string;
  agent_name: "interpreter" | "normalizer" | "compiler" | "reviewer" | "adversarial_tester" | "final_validator";
  provider: string;
  model: string;
  input_hash: string;
  output_hash: string;
  confidence?: number;
  result: "PASS" | "WARN" | "FAIL";
  latency_ms: number;
  created_at: string;
}
```

## Validation & Verification Attestation

```ts
interface AuditLogRecord {
  schemaVersion: 1;
  kind: "compiler.validation" | "guess.verification";
  turnId: number;
  ruleId: number | null;
  player: string | null;
  validationLogId: string | null;
  resultId: string | null;
  publicStateRef: {
    type: "rule_validation" | "guess_verification_result";
    key: string;
  };
  inputHash: string;
  outputHash: string;
  logHash: string;
  previousLogHash: string | null;
  commitmentHash: string;
  commitmentMechanism: "postgres_hash_chain_v1";
  reason: string;
  result: string;
  createdAt: string;
}
```

Compiler validation audit input includes sanitized rule text and token count. Compiler output includes model identity, `model_confidence`, `final_confidence`, and the full confidence breakdown. Guess verification audit input includes draw and guess data plus the frozen artifact hash when relevant; output includes original and alternative branch results. `logHash` and `commitmentHash` must be recomputable from the stored row to detect tampering.

## Formal Rule State Machine

Primary path:

```text
DRAFT
-> PREFLIGHT_PENDING
-> PREFLIGHT_PASSED
-> PROPOSED
-> PRECOMPILING
-> PRECOMPILED_VALID
-> ELIGIBLE_FOR_ELECTION
-> FINALIST_SET_MEMBER
-> VRF_ELECTED
-> FROZEN
-> ACTIVE
-> EXPIRED
```

Failure states:

```text
PREFLIGHT_BLOCKED
PRECOMPILATION_FAILED
NEEDS_CLARIFICATION
REJECTED_UNSUPPORTED
REJECTED_DUPLICATE
REJECTED_TOO_EASY
REJECTED_ALWAYS_TRUE
REJECTED_IMPOSSIBLE
REPORTED
REMOVED_PAID
INVALIDATED
CANCELLED_BY_TURN_END
```

Every transition must persist `input_hash`, `output_hash`, `transition_reason`, `actor`, and timestamp.
