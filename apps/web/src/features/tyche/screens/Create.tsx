"use client";

/**
 * CREATE RULE - Tyche chat. Real flow: POST /rule-preflight to
 * compile/validate, then propose on-chain (createProposeRuleInstruction) and
 * POST /rule-proposals. Ported from app-create.jsx (local stub removed).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { address } from "@solana/kit";

import { RULE_MAX_TOKENS } from "@tyche/constants";

import {
  createProposeRuleInstruction,
  deriveSubmitGuessAccounts,
  deriveRuleProposalAddress,
  getActionCutoffTimestamp,
  waitForConfirmedProgramAccount,
  type RulePreflightResult,
} from "../../../solana/tycheProgram";
import { fetchActiveTurnSnapshotFromWorker } from "../../../solana/activeTurnApi";
import { useTyche } from "../context";
import {
  getConversationDrafts,
  postRuleProposal,
  type RuleInterpretationApiResult,
  type RulePreflightProgress,
} from "../data/apiClient";
import type { ConversationDraftApi } from "../data/types";
import { fmtSol, fmtTurnId } from "../data/format";
import { describeTxError, sendInstruction } from "../data/tx";
import {
  buildRuleGuidanceOptions,
  composeRefinedRuleDraft,
  getRuleGuidanceTitle,
  isExplicitRuleRefinementPatch,
  isRuleCreationHelpRequest,
  isRuleRefinementPatch,
  type RuleGuidanceOption,
} from "../ruleRefinement";
import {
  cancelConversationRun,
  isConversationDraftSaveError,
  resumeConversationRun,
  saveConversationDraftSnapshot,
  startConversationRun,
} from "../conversationRun";
import {
  deleteConversationRun,
  forgetLatestConversationRun,
  getConversationRun,
  getLatestConversationRun,
  rememberLatestConversationRun,
  subscribeConversationRun,
  type ConversationRunJob,
  type ConversationRunSnapshot,
} from "../conversationRunStore";
import {
  buildResumeTranscript,
  resolveReattachableJob,
  type ReattachableJob,
} from "../conversationResume";
import {
  clearPersistedPreflightJob,
  isPreflightJobPointerFresh,
  matchesPreflightJobScope,
  readPersistedPreflightJob,
} from "../preflightJobStore";
import { Dealer, Ico, SectionLabel } from "../shared";

interface ChatMessage {
  text: string;
  who: "ai" | "user";
}

interface RuleGuidanceState {
  options: RuleGuidanceOption[];
  terminalRejection: boolean;
  title: string;
}

const RULE_DECISION_PATTERN =
  /\b(win|wins|winner|winning|whoever|if|when|qualifies|eligible|ganha|ganhar|vence|vencer|vencedor|quem|se|quando)\b/i;

const RULE_DATA_PATTERN =
  /\b(guess|guesses|draw|drawn|numbers?|sequence|sum|total|digit|digits|units?|tens?|match|matches|matched|miss|misses|closest|highest|lowest|greater|less|equal|even|odd|prime|palpite|sorteio|numeros?|números?|dezena|dezenas|unidade|unidades|soma|maior|menor|igual|acertar|acerta|errar|erra|pares?|impares?|ímpares?)\b/i;

const RULE_SHAPE_PATTERN =
  /\b(at least|at most|exactly|closest|highest|lowest|greater than|less than|equal to|more than|fewer than|the most|the fewest|pelo menos|no maximo|no máximo|exatamente|mais|menos|maior|menor|igual)\b/i;

const GREETING_PATTERN =
  /^(hi|hello|hey|yo|oi|ola|olá|bom dia|boa tarde|boa noite|sup|e ai|e aí)[!.? ]*$/i;

const QUESTION_PATTERN =
  /^(how|what|why|where|when|can|could|should|do|does|is|are|como|o que|qual|quanto|quantos|quanta|quantas|por que|porque|quando|posso|pode|devo)\b/i;

const COST_TOPIC_PATTERN =
  /\b(cost|costs|price|fee|fees|payment|pay|paid|submit|submission|quanto|quantos|quanta|quantas|custa|custam|custo|preco|preço|valor|taxa|pagar|pagamento|enviar|submeter)\b/i;

const EXAMPLE_TOPIC_PATTERN =
  /\b(example|examples|sample|samples|idea|ideas|inspiration|suggestion|suggestions|exemplo|exemplos|ideia|ideias|inspira|sugestao|sugestão|sugestoes|sugestões)\b/i;

const HOW_IT_WORKS_TOPIC_PATTERN =
  /\b(how does it work|how this works|how rules work|como funciona|como isso funciona|como a regra funciona|funciona)\b/i;

const ALLOWED_TOPIC_PATTERN =
  /\b(allowed|valid|invalid|can i use|what can|only use|permitido|valido|válido|invalido|inválido|posso usar|pode usar|usar na regra|regras validas|regras válidas)\b/i;

const SECURITY_RULE_DRAFT_PATTERN =
  /\b(ignore\b.{0,40}\b(app\s+)?rules?|previous instructions?|compile\b.{0,40}\bvalid|secretly|hide\b.{0,40}\b(blocked|invalid|rejected))\b/i;

const RULE_TIPS_TOPIC_PATTERN =
  /\b(tip|tips|improve|better|strategy|strategies|odds|popular|dica|dicas|melhorar|melhor|estrategia|estratÃ©gia|estrategias|estratÃ©gias|chance|chances|popular)\b/i;

function isLikelyRuleDraft(text: string) {
  const trimmed = text.trim();
  if (!trimmed || GREETING_PATTERN.test(trimmed)) {
    return false;
  }

  return (
    SECURITY_RULE_DRAFT_PATTERN.test(trimmed) ||
    (RULE_DECISION_PATTERN.test(trimmed) && RULE_DATA_PATTERN.test(trimmed)) ||
    (RULE_SHAPE_PATTERN.test(trimmed) && RULE_DATA_PATTERN.test(trimmed))
  );
}

function getDealerChatReply(
  text: string,
  fees: { play: number; playNext: number; remove: number; rule: number; ruleNext: number; vote: number },
) {
  const trimmed = text.trim();
  if (GREETING_PATTERN.test(trimmed)) {
    return "Hey. Send me one winner condition based on the guess and the official draw.";
  }
  if (isRuleCreationHelpRequest(trimmed)) {
    return "To create a different rule, send a complete winner condition in one sentence, starting with something like: Win if... I will treat questions as chat, not as edits, unless you send a clear correction or a complete rule.";
  }
  if (COST_TOPIC_PATTERN.test(trimmed)) {
    return `Submitting this rule costs ${fees.ruleNext === 0 ? "Free" : `${fmtSol(fees.ruleNext)} SOL`}. Chat and preflight are free; payment only happens after the compiler returns a valid rule and you confirm submission.`;
  }
  if (EXAMPLE_TOPIC_PATTERN.test(trimmed)) {
    return "Try one of these:\nWin if at least 4 of your numbers appear in the draw.\nWin if the sum of your numbers equals the sum of the drawn numbers.\nWin if the player matches more numbers than anyone else.";
  }
  if (HOW_IT_WORKS_TOPIC_PATTERN.test(trimmed)) {
    return "Write one winner condition. I check that it only uses the player's guess and the official draw, compile it into a deterministic rule, then you review it before paying.";
  }
  if (ALLOWED_TOPIC_PATTERN.test(trimmed)) {
    return "A valid rule can compare the player's guess with the official draw: matches, misses, sums, order, positions, parity, ranges, digits, or closest/highest/lowest scores. It cannot use wallet history, time, randomness outside the draw, or off-chain events.";
  }
  if (RULE_TIPS_TOPIC_PATTERN.test(trimmed)) {
    return "Strong rules are clear, measurable, and easy for voters to understand. Use only the guess and official draw, define exact thresholds, avoid off-chain facts, and say whether order or positions matter.";
  }
  if (QUESTION_PATTERN.test(trimmed) || trimmed.endsWith("?")) {
    return "A valid rule can only use the player's guess and the official draw. Write the condition in one sentence, and I will compile it before payment.";
  }
  return "I need a winner condition based on the guess and draw. Try: Win if at least 4 of your numbers appear in the draw.";
}

/**
 * Drops the draft's job pointer once we know the API has forgotten the job, so
 * the conversation list stops offering a reconnect that can only 404.
 */
async function forgetDraftPreflightJob(args: {
  draftId: string;
  messages: ChatMessage[];
  prompt: string;
  turnId: number;
  wallet: null | string | undefined;
}) {
  try {
    await saveConversationDraftSnapshot({
      draftId: args.draftId,
      lastMessage: args.messages.at(-1)?.text ?? args.prompt,
      messages: args.messages,
      preflightJobId: null,
      prompt: args.prompt,
      turnId: args.turnId,
      wallet: args.wallet,
    });
  } catch (cause) {
    // The stale pointer only costs one wasted reconnect attempt, which lands on
    // the same expired card. Never worth failing the screen over.
    console.error(
      "Could not clear the expired preflight job pointer",
      cause instanceof Error ? cause.name : "UnknownError",
    );
  }
}

function createClientDraftId(turnId: number) {
  const suffix =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `client:${turnId}:${suffix}`;
}

function RulePreview({ rule }: { rule: RulePreflightResult }) {
  const valid = rule.decision === "VALID" && !rule.needsClarification;
  const terminalRejection = rule.semanticImpact?.triviallyAlwaysTrue ?? false;
  const statusLabel = valid
    ? "valid rule"
    : terminalRejection
      ? "invalid rule"
    : rule.confirmationRequired
      ? "review required"
      : "needs adjustment";
  const statusColor = valid
    ? "var(--green)"
    : terminalRejection
      ? "var(--red)"
      : "var(--yellow)";
  const pct = Math.round((rule.tokenCount / RULE_MAX_TOKENS) * 100);
  const confidencePct =
    typeof rule.finalConfidence === "number"
      ? Math.round(rule.finalConfidence * 100)
      : null;
  return (
    <div style={{ padding: 16, border: "1px solid var(--line)", borderRadius: 16, background: "var(--surface)", animation: "ide-rise .3s ease both" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <span className="ide-pill" style={{ color: statusColor, padding: "4px 10px" }}>
          {valid ? <Ico.check style={{ width: 13, height: 13, color: statusColor }} /> : <Ico.info style={{ width: 13, height: 13, color: statusColor }} />} {statusLabel}
        </span>
        {confidencePct !== null ? (
          <span className="ide-pill" style={{ padding: "4px 10px", color: "var(--purple-soft)" }}>
            <Ico.shield style={{ width: 12, height: 12, color: "var(--purple-soft)" }} /> <span className="ide-num">{confidencePct}%</span> interpretation confidence
          </span>
        ) : null}
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--dim)" }} className="ide-num">{rule.tokenCount}/{RULE_MAX_TOKENS} tokens</span>
      </div>
      <h2 style={{ margin: "0 0 6px", fontSize: 19, lineHeight: 1.25 }}>{rule.title}</h2>
      {rule.normalizedText ? <p style={{ margin: "0 0 14px", fontSize: 15, color: "var(--text)", lineHeight: 1.45, fontWeight: 600 }}>{rule.normalizedText}</p> : null}
      {rule.officialInterpretation ? (
        <>
          <SectionLabel>How it works</SectionLabel>
          <p style={{ margin: "7px 0 0", fontSize: 14, lineHeight: 1.55, color: "var(--muted)" }}>{rule.officialInterpretation}</p>
        </>
      ) : null}
      {!valid && rule.reasonSummary ? (
        <p style={{ margin: "12px 0 0", fontSize: 13, lineHeight: 1.5, color: statusColor, display: "flex", gap: 7 }}>
          <Ico.info style={{ color: statusColor, flexShrink: 0, marginTop: 1 }} /> {rule.reasonSummary}
        </p>
      ) : null}
      {rule.reproposalBlocked ? (
        <p style={{ margin: "12px 0 0", fontSize: 13, lineHeight: 1.5, color: "var(--red)", display: "flex", gap: 7 }}>
          <Ico.lock style={{ color: "var(--red)", flexShrink: 0, marginTop: 1 }} /> This rule was already rejected this turn and can&apos;t be re-proposed.
        </p>
      ) : null}
      <div style={{ marginTop: 14, height: 6, borderRadius: 4, background: "var(--surface-3)", overflow: "hidden" }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: valid ? "var(--grad-btn)" : statusColor, borderRadius: 4, transition: "width .4s" }} />
      </div>
    </div>
  );
}

function ClarificationPrompt({
  disabled,
  manualText,
  onDismiss,
  onManualSelect,
  onSelect,
  onSubmit,
  options,
  selectedIndex,
  terminalRejection,
  title,
}: {
  disabled: boolean;
  manualText: string;
  onDismiss: () => void;
  onManualSelect: () => void;
  onSelect: (index: number) => void;
  onSubmit: () => void;
  options: readonly RuleGuidanceOption[];
  selectedIndex: number | null;
  terminalRejection: boolean;
  title: string;
}) {
  const selectedOption = selectedIndex === null ? null : options[selectedIndex];
  const canSubmit = Boolean(selectedOption || manualText.trim());

  return (
    <div
      aria-label={title}
      className="ide-card"
      style={{
        animation: "ide-rise .3s ease both",
        background: "rgba(23,18,31,0.96)",
        borderColor: "rgba(255,255,255,0.12)",
        borderRadius: 24,
        boxShadow: "0 22px 44px -28px rgba(0,0,0,0.9)",
        display: "grid",
        gap: 10,
        padding: 12,
      }}
    >
      <h2 style={{ color: "var(--text)", fontSize: 17, fontWeight: 800, letterSpacing: "-0.01em", lineHeight: 1.2, margin: "0 2px 2px" }}>
        {title}
      </h2>
      <div style={{ display: "grid", gap: 7 }}>
        {options.map((option, index) => {
          const selected = selectedIndex === index;
          return (
            <button
              aria-pressed={selected}
              key={option.text}
              onClick={() => onSelect(index)}
              style={{
                alignItems: "center",
                background: selected ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.035)",
                border: "1px solid transparent",
                borderColor: selected ? "rgba(255,255,255,0.08)" : "transparent",
                borderRadius: 18,
                color: "var(--text)",
                cursor: "pointer",
                display: "grid",
                fontFamily: "Outfit",
                gap: 12,
                gridTemplateColumns: "44px minmax(0, 1fr)",
                minHeight: 54,
                padding: "10px 12px",
                textAlign: "left",
              }}
              type="button"
            >
              <span className="ide-num" style={{ alignItems: "center", background: selected ? "rgba(244,241,250,0.9)" : "rgba(255,255,255,0.12)", borderRadius: 999, color: selected ? "#17121F" : "var(--muted)", display: "inline-flex", fontSize: 17, fontWeight: 800, height: 40, justifyContent: "center", width: 40 }}>
                {index + 1}
              </span>
              <span style={{ color: selected ? "var(--text)" : "var(--muted)", fontSize: 15, fontWeight: 400, lineHeight: 1.45, minWidth: 0, overflowWrap: "anywhere" }}>
                {option.text}
              </span>
            </button>
          );
        })}
        <button
          aria-pressed={selectedIndex === null}
          onClick={onManualSelect}
          style={{
            alignItems: "center",
            background: selectedIndex === null ? "rgba(255,255,255,0.06)" : "transparent",
            border: "1px solid transparent",
            borderRadius: 16,
            color: "var(--muted)",
            cursor: "pointer",
            display: "grid",
            fontFamily: "Outfit",
            gap: 12,
            gridTemplateColumns: "44px minmax(0, 1fr)",
            minHeight: 48,
            padding: "6px 12px",
            textAlign: "left",
          }}
          type="button"
        >
          <span style={{ alignItems: "center", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 999, display: "inline-flex", height: 34, justifyContent: "center", width: 34 }}>
            <Ico.edit style={{ color: "var(--muted)", height: 17, width: 17 }} />
          </span>
          <span style={{ fontSize: 15, fontWeight: 400, lineHeight: 1.45, minWidth: 0, overflowWrap: "anywhere" }}>
            {manualText.trim() ? manualText : terminalRejection ? "Write a different valid rule..." : "Write your own clarification..."}
          </span>
        </button>
      </div>
      <div style={{ alignItems: "center", display: "flex", gap: 10, justifyContent: "space-between", paddingTop: 2 }}>
        <button
          onClick={onDismiss}
          style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", fontFamily: "Outfit", fontSize: 14.5, fontWeight: 650, minHeight: 44, padding: "9px 2px" }}
          type="button"
        >
          Dismiss
        </button>
        <button
          className="ide-btn"
          disabled={disabled || !canSubmit}
          onClick={onSubmit}
          style={{ background: "#78b7df", borderRadius: 20, boxShadow: "none", color: "#09131A", minWidth: 112, opacity: disabled || !canSubmit ? 0.5 : 1, padding: "13px 18px" }}
          type="button"
        >
          {terminalRejection ? "Use rule" : "Submit"} <Ico.back style={{ color: "#09131A", height: 18, transform: "rotate(180deg)", width: 18 }} />
        </button>
      </div>
    </div>
  );
}

function InterpretationConfirmation({
  interpretation,
  onConfirm,
  onEdit,
}: {
  interpretation: RuleInterpretationApiResult;
  onConfirm: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="ide-card" style={{ animation: "ide-rise .3s ease both", display: "grid", gap: 12, padding: 16 }}>
      <div>
        <SectionLabel>My interpretation</SectionLabel>
        <h2 style={{ fontSize: 19, lineHeight: 1.25, margin: "5px 0 7px" }}>{interpretation.title}</h2>
        <p style={{ color: "var(--text)", fontSize: 15, fontWeight: 600, lineHeight: 1.48, margin: 0 }}>{interpretation.normalizedText}</p>
      </div>
      <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.55, margin: 0 }}>{interpretation.officialInterpretation}</p>
      <p style={{ color: "var(--dim)", fontSize: 13, lineHeight: 1.45, margin: 0 }}>Confirm this interpretation and I will generate the executable rule.</p>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="ide-btn-ghost ide-btn" onClick={onEdit} style={{ flex: 1, fontSize: 14, lineHeight: 1.2, minHeight: 44, padding: "9px 10px" }} type="button">Edit wording</button>
        <button className="ide-btn" onClick={onConfirm} style={{ flex: 1, fontSize: 14, lineHeight: 1.2, minHeight: 44, padding: "9px 10px" }} type="button">Confirm and generate</button>
      </div>
    </div>
  );
}

function AgentProgress({
  connection,
  progress,
}: {
  connection: ConversationRunSnapshot["connection"];
  progress: RulePreflightProgress | null;
}) {
  const reconnecting = connection === "reconnecting";
  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className="ide-bubble-ai"
      role="status"
      style={{
        alignItems: "center",
        display: "grid",
        gap: 11,
        gridTemplateColumns: "28px minmax(0, 1fr)",
        maxWidth: "92%",
        padding: "12px 14px",
      }}
    >
      <span
        aria-hidden="true"
        className="ide-spin"
        style={{
          border: "2px solid var(--surface-3)",
          borderRadius: "50%",
          borderTopColor: reconnecting ? "var(--yellow)" : "var(--green)",
          height: 24,
          width: 24,
        }}
      />
      <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
        <span style={{ color: "var(--purple-soft)", fontSize: 11.5, fontWeight: 750, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Tyche
        </span>
        <span style={{ color: "var(--text)", fontSize: 14, lineHeight: 1.4 }}>
          {reconnecting
            ? "Reconnecting to the dealer..."
            : progress?.message ?? "Preparing your rule..."}
        </span>
        {reconnecting && progress?.message ? (
          <span style={{ color: "var(--dim)", fontSize: 12.5, lineHeight: 1.35 }}>
            {progress.message}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/**
 * Shown when the stream ended but the rule did not. Yellow, not red: the red
 * card below stays reserved for a hard failure the player cannot recover from.
 */
function RunInterruptedCard({
  busy,
  kind,
  onRetry,
}: {
  busy: boolean;
  kind: "disconnected" | "expired";
  onRetry: () => void;
}) {
  const expired = kind === "expired";
  return (
    <div
      style={{
        animation: "ide-rise .3s ease both",
        borderBottom: "1px solid var(--line)",
        borderTop: "1px solid rgba(255,210,63,0.3)",
        padding: "16px 2px",
      }}
    >
      <div style={{ alignItems: "center", display: "flex", gap: 9, marginBottom: 7 }}>
        <Ico.info style={{ color: "var(--yellow)", height: 16, width: 16 }} />
        <b style={{ fontSize: 15 }}>{expired ? "This run expired" : "Connection lost"}</b>
      </div>
      <p style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.5, margin: "0 0 13px" }}>
        {expired
          ? "The dealer stopped holding this run. Run it again and I will compile your last message from scratch."
          : "I lost the live connection, but your rule may still be compiling. Reconnect to pick it back up."}
      </p>
      <button
        className="ide-btn"
        disabled={busy}
        onClick={onRetry}
        style={{ opacity: busy ? 0.7 : 1, padding: 13, width: "100%" }}
        type="button"
      >
        <Ico.bolt style={{ color: "#08110C" }} />{" "}
        {busy
          ? expired
            ? "Starting..."
            : "Reconnecting..."
          : expired
            ? "Run again"
            : "Reconnect"}
      </button>
    </div>
  );
}

export function CreateScreen() {
  const { chatId, client, connected, createIntent, fees, go, newConversationKey, phase1EndsAt, played, reloadAll, seed, turnId, wallet, walletAddress } = useTyche();

  // `newConversationKey` stays the remount key and nothing else: it counts how
  // many blank chats this page session has opened, which says nothing about why
  // the screen is mounting now. `createIntent` answers that.
  return <CreateChat key={`${newConversationKey}:${chatId || seed || "new"}`} {...{ chatId, client, connected, createIntent, fees, go, phase1EndsAt, played, reloadAll, seed, turnId, wallet, walletAddress }} />;
}

type ChatProps = Pick<ReturnType<typeof useTyche>, "chatId" | "client" | "connected" | "createIntent" | "fees" | "go" | "phase1EndsAt" | "played" | "reloadAll" | "seed" | "turnId" | "wallet" | "walletAddress">;

function CreateChat({ chatId, client, connected, createIntent, fees, go, phase1EndsAt, played, reloadAll, seed, turnId, wallet, walletAddress }: ChatProps) {
  const [msgs, setMsgs] = useState<ChatMessage[]>([
    { text: "Hey! Tell me in one sentence how your rule decides the round winner. Be creative - I turn it into a valid rule.", who: "ai" },
  ]);
  const [val, setVal] = useState(seed ?? "");
  const [typing, setTyping] = useState(false);
  const [progress, setProgress] = useState<RulePreflightProgress | null>(null);
  const [interpretation, setInterpretation] = useState<RuleInterpretationApiResult | null>(null);
  const [rule, setRule] = useState<RulePreflightResult | null>(null);
  const [guidance, setGuidance] = useState<RuleGuidanceState | null>(null);
  const [selectedGuidanceIndex, setSelectedGuidanceIndex] = useState<number | null>(0);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retryingDraftSave, setRetryingDraftSave] = useState(false);
  const [error, setError] = useState<null | string>(null);
  const [activeDraftId, setActiveDraftId] = useState<null | string>(null);
  const [runStatus, setRunStatus] = useState<ConversationRunSnapshot["status"]>("done");
  const [connection, setConnection] = useState<ConversationRunSnapshot["connection"]>("closed");
  const [runJob, setRunJob] = useState<ConversationRunJob | null>(null);
  const [resuming, setResuming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoSentRef = useRef(false);
  // Safety net against a clarification loop: after too many consecutive
  // still-needs-clarification results, stop auto-merging the reply into the
  // draft so the raw answer is sent standalone and the loop cannot continue.
  const clarificationAttemptsRef = useRef(0);
  const MAX_CLARIFICATION_ATTEMPTS = 2;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [msgs, typing, progress, interpretation, rule, guidance]);

  useEffect(() => {
    if (!guidance) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setGuidance(null);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedGuidanceIndex((index) => {
          const current = index ?? -1;
          return Math.min(guidance.options.length - 1, current + 1);
        });
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedGuidanceIndex((index) => {
          const current = index ?? guidance.options.length;
          return Math.max(0, current - 1);
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [guidance]);

  const openGuidance = useCallback((context: Parameters<typeof buildRuleGuidanceOptions>[0]) => {
    const options = buildRuleGuidanceOptions(context);
    setGuidance({
      options,
      terminalRejection: Boolean(context.triviallyAlwaysTrue),
      title: getRuleGuidanceTitle(context),
    });
    setSelectedGuidanceIndex(options.length > 0 ? 0 : null);
  }, []);

  const applyRunSnapshot = useCallback((snapshot: ConversationRunSnapshot) => {
    setMsgs(snapshot.messages);
    setTyping(snapshot.status === "pending");
    setProgress(snapshot.progress);
    setInterpretation(snapshot.interpretation);
    setRule(snapshot.rule);
    setError(snapshot.error);
    setRunStatus(snapshot.status);
    setConnection(snapshot.connection);
    setRunJob(snapshot.job);
    if (snapshot.status === "pending") {
      setGuidance(null);
      return;
    }
    if (snapshot.status === "disconnected" || snapshot.status === "expired") {
      // An interrupted run is not a verdict on the rule: never open guidance.
      setResuming(false);
      setGuidance(null);
      return;
    }
    if (snapshot.guidanceContext) {
      openGuidance(snapshot.guidanceContext);
      return;
    }
    if (snapshot.interpretation) {
      if (!snapshot.interpretation.needsClarification) {
        setGuidance(null);
        return;
      }
      clarificationAttemptsRef.current += 1;
      openGuidance({
        clarityNote: snapshot.interpretation.clarityNote,
        currentRuleText: snapshot.interpretation.sanitizedText,
        needsClarification: true,
        refinementQuestions: [],
        suggestedRewrites: snapshot.interpretation.suggestedRewrites,
      });
      return;
    }
    if (!snapshot.rule) {
      setGuidance(null);
      return;
    }
    const valid = snapshot.rule.decision === "VALID" && !snapshot.rule.needsClarification;
    if (valid) {
      clarificationAttemptsRef.current = 0;
      setGuidance(null);
      return;
    }
    clarificationAttemptsRef.current += 1;
    openGuidance({
      clarityNote: snapshot.rule.clarityNote,
      confirmationRequired: snapshot.rule.confirmationRequired,
      currentRuleText: snapshot.rule.sanitizedText,
      needsClarification: snapshot.rule.needsClarification,
      reasonSummary: snapshot.rule.reasonSummary ?? null,
      refinementQuestions: snapshot.rule.refinementQuestions ?? null,
      reproposalBlocked: snapshot.rule.reproposalBlocked ?? false,
      sanitizedText: snapshot.rule.sanitizedText,
      suggestedRewrite: snapshot.rule.suggestedRewrite ?? null,
      suggestedRewrites: snapshot.rule.suggestedRewrites ?? null,
      triviallyAlwaysTrue:
        snapshot.rule.semanticImpact?.triviallyAlwaysTrue ?? false,
    });
  }, [openGuidance]);

  useEffect(() => subscribeConversationRun(activeDraftId, applyRunSnapshot), [activeDraftId, applyRunSnapshot]);

  // Everything that brings a conversation back on mount, in one place and in
  // one order. Three leads can name the same run - the in-memory snapshot, the
  // saved draft, and the localStorage job pointer - and as separate effects
  // they raced each other into three different views of it.
  //
  // Skipped only for the two intents that mean "start something new": an
  // explicit blank chat, and a prompt typed on Home that is about to auto-send.
  // Deliberately NOT skipped for `newConversationKey > 0`, which only says this
  // page session once opened a blank chat and stays true forever after.
  useEffect(() => {
    if (activeDraftId || createIntent === "new" || createIntent === "seed") {
      return undefined;
    }

    const storage = typeof window === "undefined" ? null : window.localStorage;
    const stored = readPersistedPreflightJob(storage);
    const pointer =
      stored &&
      matchesPreflightJobScope(stored, {
        draftId: chatId,
        turnId,
        wallet: walletAddress ?? null,
      })
        ? stored
        : null;

    // A run this tab never stopped following wins outright: its snapshot is
    // live and already carries the whole transcript.
    const memoryRun = chatId
      ? getConversationRun(chatId)
      : getLatestConversationRun(walletAddress, turnId);
    if (memoryRun && (chatId !== null || memoryRun.status === "pending")) {
      autoSentRef.current = true;
      setActiveDraftId(memoryRun.draftId);
      applyRunSnapshot(memoryRun);
      return undefined;
    }

    const draftId = chatId ?? pointer?.draftId ?? null;
    if (!draftId) {
      return undefined;
    }
    // Whatever happens below, this mount is showing an existing conversation,
    // so the seed must never auto-send on top of it.
    autoSentRef.current = true;

    const attach = (messages: ChatMessage[], job: ReattachableJob) => {
      setActiveDraftId(draftId);
      if (isPreflightJobPointerFresh(job.stampedAt, Date.now())) {
        void resumeConversationRun({
          cursor: job.cursor,
          draftId,
          jobId: job.jobId,
          messages,
          phase: job.phase,
          ruleText: job.ruleText,
          turnId,
          wallet: walletAddress,
        });
        return;
      }
      // Older than the window the API keeps, so there is nothing to attach to.
      // Say so without spending a request on a guaranteed 404, and drop both
      // copies of the pointer so the conversation list stops advertising it.
      clearPersistedPreflightJob(storage, draftId);
      void forgetDraftPreflightJob({
        draftId,
        messages,
        prompt: job.ruleText,
        turnId,
        wallet: walletAddress,
      });
      setMsgs(messages);
      setRunStatus("expired");
      setConnection("closed");
      setRunJob(null);
      setTyping(false);
    };

    // No wallet means no draft record to read. The pointer alone still gets the
    // player their result, just without the earlier turns of the conversation.
    if (!walletAddress) {
      const job = resolveReattachableJob(undefined, pointer);
      if (job) {
        attach(buildResumeTranscript(undefined, pointer), job);
      }
      return undefined;
    }

    let cancelled = false;
    void (async () => {
      let draft: ConversationDraftApi | undefined;
      try {
        const body = await getConversationDrafts(walletAddress);
        draft = body?.drafts.find((entry) => entry.draftId === draftId);
      } catch (cause) {
        if (!cancelled) {
          setError(`Could not load this conversation. ${describeTxError(cause)}`);
        }
        return;
      }
      if (cancelled) {
        return;
      }

      setActiveDraftId(draftId);
      rememberLatestConversationRun({ draftId, turnId, wallet: walletAddress });

      const transcript = buildResumeTranscript(draft, pointer);
      const job = resolveReattachableJob(draft, pointer);
      if (!job) {
        // Nothing in flight: this is a plain reopen of a saved conversation.
        if (transcript.length > 0) {
          setMsgs(transcript);
        }
        return;
      }
      attach(transcript, job);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    activeDraftId,
    applyRunSnapshot,
    chatId,
    createIntent,
    turnId,
    walletAddress,
  ]);

  function submitGuidance() {
    if (!guidance || typing) {
      return;
    }
    const selectedText =
      selectedGuidanceIndex === null
        ? val.trim()
        : guidance.options[selectedGuidanceIndex]?.text.trim();
    if (!selectedText) {
      textareaRef.current?.focus();
      return;
    }
    void send(selectedText);
  }

  function confirmInterpretation() {
    if (!interpretation || typing) {
      return;
    }
    cancelConversationRun(activeDraftId);
    const confirmation = "Yes, generate this rule.";
    const transcript: ChatMessage[] = [...msgs, { text: confirmation, who: "user" }];
    setMsgs(transcript);
    setTyping(true);
    setError(null);
    setGuidance(null);
    setRule(null);
    let draftIdForThisSend = activeDraftId;
    if (!draftIdForThisSend) {
      draftIdForThisSend = createClientDraftId(turnId);
      setActiveDraftId(draftIdForThisSend);
    }
    startConversationRun({
      draftId: draftIdForThisSend,
      initialMessages: transcript,
      lastUserMessage: confirmation,
      localDealerReply: null,
      phase: "compile",
      refinedDraft: null,
      ruleText: interpretation.sanitizedText,
      turnId,
      wallet: walletAddress,
    });
  }

  function editInterpretation() {
    if (!interpretation || typing) {
      return;
    }
    setVal(interpretation.sanitizedText);
    setInterpretation(null);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function send(text?: string) {
    const t = (text ?? val).trim();
    if (!t || typing) {
      return;
    }
    // Sending is a legitimate escape hatch from a stuck run: stop following the
    // old job before starting a new one.
    cancelConversationRun(activeDraftId);
    const pendingRule = rule;
    const likelyRuleDraft = isLikelyRuleDraft(t);
    const explicitPatch = isExplicitRuleRefinementPatch(t);
    // A fresh rule draft restarts the clarification budget.
    if (likelyRuleDraft && !explicitPatch) {
      clarificationAttemptsRef.current = 0;
    }
    // Past the clarification budget, stop merging: send the raw answer on its
    // own so a misbehaving clarification cycle cannot loop indefinitely.
    const clarificationBudgetExhausted =
      clarificationAttemptsRef.current >= MAX_CLARIFICATION_ATTEMPTS;
    const refinementContext = {
      baseWasValid: pendingRule?.decision === "VALID",
      currentRuleText: pendingRule?.sanitizedText ?? null,
      refinementQuestions: pendingRule?.refinementQuestions ?? null,
      suggestedRewrite: pendingRule?.suggestedRewrite ?? null,
      suggestedRewrites: pendingRule?.suggestedRewrites ?? null,
      triviallyAlwaysTrue:
        pendingRule?.semanticImpact?.triviallyAlwaysTrue ?? false,
    };
    const refinedDraft =
      !clarificationBudgetExhausted &&
      pendingRule && !submitted && (!likelyRuleDraft || explicitPatch) &&
      isRuleRefinementPatch(t, refinementContext)
        ? composeRefinedRuleDraft(t, refinementContext)
        : null;
    const ruleText = refinedDraft ?? t;
    setVal("");
    setError(null);
    setGuidance(null);
    const transcript: ChatMessage[] = [...msgs, { text: t, who: "user" }];
    setMsgs(transcript);
    setTyping(true);
    setRule(null);
    let draftIdForThisSend = activeDraftId;
    if (!draftIdForThisSend) {
      draftIdForThisSend = createClientDraftId(turnId);
      setActiveDraftId(draftIdForThisSend);
    }
    startConversationRun({
      draftId: draftIdForThisSend,
      initialMessages: transcript,
      lastUserMessage: t,
      localDealerReply: !refinedDraft && !likelyRuleDraft ? getDealerChatReply(t, fees) : null,
      phase: "interpret",
      refinedDraft,
      ruleText,
      turnId,
      wallet: walletAddress,
    });
  }

  // Auto-send the seed coming from the home prompt (once).
  useEffect(() => {
    if (seed && !chatId && !autoSentRef.current) {
      autoSentRef.current = true;
      const id = window.setTimeout(() => void send(seed), 350);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, []);

  async function submit() {
    if (
      !rule ||
      rule.decision !== "VALID" ||
      rule.needsClarification ||
      rule.confirmationRequired ||
      !played ||
      !wallet ||
      !walletAddress
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const player = address(walletAddress);
      const [freshTurn, accounts] = await Promise.all([
        fetchActiveTurnSnapshotFromWorker({ requireFresh: true }),
        deriveSubmitGuessAccounts({ player, sequence: 1, turnId }),
      ]);
      if (freshTurn.globalConfig.activeTurnId !== turnId) {
        throw new Error("The active round changed before rule submission. Reopen the rule composer for the current round.");
      }
      // Phase 1 (create rules + pick numbers) closes at the rule-election
      // cutoff; the program rejects proposals past it (ActionWindowClosed). Gate
      // the submission here from the freshly-fetched turn so a rule drafted
      // during phase 1 can't be sent once the create phase has closed.
      if (freshTurn.turnState) {
        const cutoffSeconds = getActionCutoffTimestamp({
          cutoffBps: freshTurn.globalConfig.ruleElectionCutoffBps,
          turn: freshTurn.turnState,
        });
        if (Math.floor(Date.now() / 1000) >= cutoffSeconds) {
          throw new Error("Rule creation has closed for this round. New rules open when the next round starts.");
        }
      }
      const ruleProposalAddress = await deriveRuleProposalAddress({ ruleId: rule.ruleId, turnId });
      const existingRuleProposal = await client.runtime.rpc
        .getAccountInfo(ruleProposalAddress, {
          commitment: "confirmed",
          encoding: "base64",
        })
        .send();
      if (existingRuleProposal.value) {
        throw new Error("This compiled rule id is already used on devnet. Send the same rule text again so the dealer can issue a fresh preflight before payment.");
      }
      await waitForConfirmedProgramAccount({
        account: accounts.gameToken,
        client,
        label: "Your round pass",
      });
      const instruction = await createProposeRuleInstruction({ player, preflight: rule, turnId });
      const signature = await sendInstruction(client, wallet, instruction);
      const ruleProposal = ruleProposalAddress.toString();
      await postRuleProposal({
        ...rule,
        feeLamports: Math.round(fees.ruleNext * 1_000_000_000),
        proposer: walletAddress,
        ruleProposal,
        signature,
        submittedAt: new Date().toISOString(),
        turnId,
      });
      setSubmitted(true);
      reloadAll();
      try {
        await saveConversationDraftSnapshot({
          draftId: activeDraftId,
          lastMessage: "Rule submitted to the round.",
          messages: [...msgs, { text: "Rule submitted to the round.", who: "ai" }],
          normalizedText: rule.normalizedText || null,
          officialInterpretation: rule.officialInterpretation || null,
          prompt: rule.sanitizedText,
          ruleId: rule.ruleId,
          status: "submitted",
          turnId,
          wallet: walletAddress,
        });
        forgetLatestConversationRun({
          draftId: activeDraftId,
          turnId,
          wallet: walletAddress,
        });
        deleteConversationRun(activeDraftId);
      } catch (draftError) {
        setError(`Rule submitted, but the draft status could not be updated. ${describeTxError(draftError)}`);
      }
    } catch (cause) {
      setError(describeTxError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function retryDraftSave() {
    if (!walletAddress || !activeDraftId || retryingDraftSave) {
      return;
    }

    const latestUserMessage = [...msgs].reverse().find((message) => message.who === "user")?.text;
    const prompt = rule?.sanitizedText ?? latestUserMessage;
    if (!prompt) {
      setError("There is no rule text available to save.");
      return;
    }

    setRetryingDraftSave(true);
    try {
      const savedDraftId = await saveConversationDraftSnapshot({
        draftId: activeDraftId,
        lastMessage: msgs.at(-1)?.text ?? prompt,
        messages: msgs,
        normalizedText: rule?.normalizedText ?? null,
        officialInterpretation: rule?.officialInterpretation ?? null,
        prompt,
        ruleId: rule?.ruleId ?? null,
        status: "draft",
        turnId,
        wallet: walletAddress,
      });
      if (savedDraftId) {
        setActiveDraftId(savedDraftId);
      }
      setError(null);
    } catch (cause) {
      setError(`Draft still could not be saved. ${describeTxError(cause)}`);
    } finally {
      setRetryingDraftSave(false);
    }
  }

  function reset(message = "On to the next one! How does your new rule decide the winner?") {
    cancelConversationRun(activeDraftId);
    forgetLatestConversationRun({
      draftId: activeDraftId,
      turnId,
      wallet: walletAddress,
    });
    deleteConversationRun(activeDraftId);
    setRule(null);
    setInterpretation(null);
    setSubmitted(false);
    setTyping(false);
    setProgress(null);
    setError(null);
    setActiveDraftId(null);
    setGuidance(null);
    setSelectedGuidanceIndex(0);
    setRunStatus("done");
    setConnection("closed");
    setRunJob(null);
    setResuming(false);
    setMsgs([{ text: message, who: "ai" }]);
  }

  /**
   * Reconnect keeps following the same server-side job; Run again starts a
   * fresh one from the player's last message, with no new bubble because the
   * transcript already ends with it.
   */
  function resumeOrRerun() {
    if (resuming || !activeDraftId) {
      return;
    }
    setResuming(true);
    setError(null);

    if (runStatus === "disconnected" && runJob) {
      setTyping(true);
      void resumeConversationRun({
        cursor: runJob.cursor,
        draftId: activeDraftId,
        jobId: runJob.jobId,
        messages: msgs,
        phase: runJob.phase,
        ruleText: runJob.ruleText,
        turnId,
        wallet: walletAddress,
      });
      return;
    }

    cancelConversationRun(activeDraftId);
    const lastUserMessage = [...msgs].reverse().find((message) => message.who === "user")?.text;
    const ruleText = runJob?.ruleText ?? lastUserMessage;
    if (!ruleText) {
      setResuming(false);
      setRunStatus("done");
      textareaRef.current?.focus();
      return;
    }
    setTyping(true);
    startConversationRun({
      draftId: activeDraftId,
      initialMessages: msgs,
      lastUserMessage: lastUserMessage ?? ruleText,
      localDealerReply: null,
      phase: runJob?.phase ?? "interpret",
      refinedDraft: null,
      ruleText,
      turnId,
      wallet: walletAddress,
    });
  }

  const valid = rule?.decision === "VALID" && !rule.needsClarification;
  // Phase 1 (create rules) closes at the rule-election cutoff (phase1EndsAt).
  // Past it the program rejects proposals, so hide the submit affordance and
  // tell the player rule creation is closed for the round.
  const ruleCreationClosed =
    phase1EndsAt !== null && Math.floor(Date.now() / 1000) >= phase1EndsAt;

  return (
    <div className="ide-app ide-screen ide-chat-screen" style={{ height: "100%", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div className="ide-ambient" />
      <div style={{ position: "relative", zIndex: 2, padding: "var(--ide-shell-content-top) 18px 12px", borderBottom: "1px solid var(--line)", background: "rgba(11,9,16,0.6)", backdropFilter: "blur(10px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => go(chatId ? "profile" : "home")} style={{ width: 40, height: 40, borderRadius: 13, background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--text)", display: "grid", placeItems: "center", cursor: "pointer" }} type="button"><Ico.back /></button>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Dealer size={30} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.15, whiteSpace: "nowrap" }}>Tyche</div>
              <div style={{ fontSize: 12, color: connection === "reconnecting" ? "var(--yellow)" : "var(--green)", marginTop: 1, whiteSpace: "nowrap" }}>{submitted ? "● rule submitted" : connection === "reconnecting" ? "● reconnecting" : connected ? "● crafting your rule" : "● preflight is free"}</div>
            </div>
          </div>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--dim)" }}>submit <span className="ide-num" style={{ color: "var(--muted)" }}>{fees.ruleNext === 0 ? "Free" : fmtSol(fees.ruleNext)}</span></span>
        </div>
      </div>

      <div ref={scrollRef} className="ide-scroll" style={{ position: "relative", zIndex: 1, flex: 1, overflowY: "auto", overflowX: "hidden", minWidth: 0, padding: "18px 16px 8px", display: "flex", flexDirection: "column", gap: 12 }}>
        {msgs.map((mm, i) => (
          <div key={i} className={mm.who === "ai" ? "ide-bubble-ai" : "ide-bubble-user"} style={{ animation: "ide-rise .3s ease both" }}>{mm.text}</div>
        ))}
        {typing ? <AgentProgress connection={connection} progress={progress} /> : null}
        {!typing && (runStatus === "disconnected" || runStatus === "expired") ? (
          <RunInterruptedCard
            busy={resuming}
            kind={runStatus}
            onRetry={resumeOrRerun}
          />
        ) : null}

        {interpretation && !interpretation.needsClarification && !typing ? (
          <InterpretationConfirmation
            interpretation={interpretation}
            onConfirm={confirmInterpretation}
            onEdit={editInterpretation}
          />
        ) : null}

        {rule && !typing ? <RulePreview rule={rule} /> : null}

        {guidance && !typing ? (
          <ClarificationPrompt
            disabled={typing}
            manualText={val}
            onDismiss={() => setGuidance(null)}
            onManualSelect={() => {
              setSelectedGuidanceIndex(null);
              textareaRef.current?.focus();
            }}
            onSelect={(index) => setSelectedGuidanceIndex(index)}
            onSubmit={submitGuidance}
            options={guidance.options}
            selectedIndex={selectedGuidanceIndex}
            terminalRejection={guidance.terminalRejection}
            title={guidance.title}
          />
        ) : null}

        {rule && valid && !typing ? (
          submitted ? (
            <div style={{ padding: "16px 2px", borderTop: "1px solid rgba(20,241,149,0.3)", borderBottom: "1px solid var(--line)", animation: "ide-rise .3s ease both" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ width: 28, height: 28, borderRadius: 9, background: "var(--green)", color: "#08110C", display: "grid", placeItems: "center" }}><Ico.check /></span>
                <b style={{ fontSize: 15.5 }}>Rule in the round</b>
              </div>
              <p style={{ margin: "0 0 14px", color: "var(--muted)", fontSize: 14, lineHeight: 1.5 }}>In voting for round {fmtTurnId(turnId)}. If elected and winners exist, you earn <b style={{ color: "var(--text)" }}>15%</b> of one winner's payout.</p>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => reset()} className="ide-btn-ghost ide-btn" style={{ flex: 1, padding: 13 }} type="button">Create another</button>
                <button onClick={() => go("vote")} className="ide-btn" style={{ flex: 1, padding: 13 }} type="button">See in voting</button>
              </div>
            </div>
          ) : ruleCreationClosed ? (
            <div style={{ padding: "16px 2px", borderTop: "1px solid rgba(255,210,63,0.3)", borderBottom: "1px solid var(--line)", animation: "ide-rise .3s ease both" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
                <Ico.lock style={{ color: "var(--yellow)", width: 16, height: 16 }} />
                <b style={{ fontSize: 15 }}>Rule creation closed</b>
              </div>
              <p style={{ margin: "0 0 13px", color: "var(--muted)", fontSize: 13.5, lineHeight: 1.5 }}>The create phase for round {fmtTurnId(turnId)} has ended, so new rules can&apos;t be submitted. Your draft is saved and you can submit it when the next round opens.</p>
              <button onClick={() => go("home")} className="ide-btn" style={{ width: "100%", padding: 13 }} type="button">
                <Ico.back style={{ color: "#08110C", transform: "rotate(180deg)" }} /> Back to the round
              </button>
            </div>
          ) : played ? (
            <button onClick={submit} disabled={busy} className="ide-btn" style={{ padding: 15, fontSize: 15.5, animation: "ide-rise .3s ease both", opacity: busy ? 0.7 : 1 }} type="button">
              <Ico.check style={{ color: "#08110C" }} /> {busy ? "Submitting..." : `Submit to the round · ${fees.ruleNext === 0 ? "Free" : `${fmtSol(fees.ruleNext)} SOL`}`}
            </button>
          ) : (
            <div style={{ padding: "16px 2px", borderTop: "1px solid rgba(255,210,63,0.3)", borderBottom: "1px solid var(--line)", animation: "ide-rise .3s ease both" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
                <Ico.lock style={{ color: "var(--yellow)", width: 16, height: 16 }} />
                <b style={{ fontSize: 15 }}>Play to submit</b>
              </div>
              <p style={{ margin: "0 0 13px", color: "var(--muted)", fontSize: 13.5, lineHeight: 1.5 }}>Make a guess this round to unlock submitting. Your draft stays here.</p>
              <button onClick={() => go("play")} className="ide-btn" style={{ width: "100%", padding: 13 }} type="button">
                <Ico.bolt style={{ color: "#08110C" }} /> Play now · {fees.playNext === 0 ? "Free" : `${fmtSol(fees.playNext)} SOL`}
              </button>
            </div>
          )
        ) : null}

        {error ? (
          <div className="ide-card" style={{ borderColor: "rgba(255,107,107,0.3)", color: "var(--red)", display: "grid", fontSize: 13, gap: 10, padding: "11px 14px" }}>
            <span>{error}</span>
            {isConversationDraftSaveError(error) ? (
              <button
                className="ide-votebtn"
                disabled={retryingDraftSave}
                onClick={() => void retryDraftSave()}
                style={{ justifySelf: "start", opacity: retryingDraftSave ? 0.7 : 1, padding: "8px 12px" }}
                type="button"
              >
                {retryingDraftSave ? "Saving..." : "Retry saving"}
              </button>
            ) : null}
          </div>
        ) : null}
        <div style={{ height: 4 }} />
      </div>

      {!submitted ? (
        <div style={{ position: "relative", zIndex: 2, padding: "10px 14px calc(14px + env(safe-area-inset-bottom,0px))", borderTop: "1px solid var(--line)", background: "rgba(11,9,16,0.7)", backdropFilter: "blur(12px)" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 9 }}>
            <textarea
              aria-label="Message"
              ref={textareaRef}
              value={val}
              onChange={(e) => setVal(e.target.value)}
              rows={1}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (guidance) {
                    submitGuidance();
                  } else {
                    void send();
                  }
                }
              }}
              placeholder={guidance ? guidance.terminalRejection ? "Choose a valid variation or write a different rule..." : "Choose an option or write your own clarification..." : rule ? "Ask for a tweak or describe another rule..." : "Describe your rule..."}
              style={{ flex: 1, minWidth: 0, resize: "none", background: "var(--surface)", border: "1px solid var(--line-2)", borderRadius: 16, padding: "13px 15px", color: "var(--text)", fontSize: 15, fontFamily: "Outfit", outline: "none", maxHeight: 90 }}
            />
            <button aria-label="Send message" onClick={() => void send()} className="ide-btn" style={{ width: 48, height: 48, padding: 0, borderRadius: 15, flexShrink: 0 }} type="button"><Ico.send style={{ color: "#08110C" }} /></button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
