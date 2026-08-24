"use client";

/**
 * CREATE RULE - Tyche chat. Real flow: POST /rule-preflight to
 * compile/validate, then propose on-chain (createProposeRuleInstruction) and
 * POST /rule-proposals. Ported from app-create.jsx (local stub removed).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { address } from "@solana/kit";

import { BRAND_NAME } from "@tyche/config";
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
  getLocalGreetingReply,
  getVisibleRuleDifficultyClass,
  isExplicitRuleRefinementPatch,
  isLikelyRuleDraft,
  isRuleRefinementPatch,
  resolveGuidanceSubmissionText,
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
import {
  buildStreamPlan,
  StreamLiveDot,
  StreamText,
  useStreamReveal,
  type StreamBlock,
  type StreamPlan,
} from "../streamReveal";
import { Dealer, Ico, SectionLabel, useCountdownTo } from "../shared";

interface ChatMessage {
  text: string;
  who: "ai" | "user";
}

interface RuleGuidanceState {
  options: RuleGuidanceOption[];
  questions: readonly string[];
  terminalRejection: boolean;
  title: string;
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

// Difficulty is a compiler verdict (PRD §6.8), so it reads as a label on the
// card rather than as prose. Colour tracks how the class affects the game:
// green is playable, yellow warns the rule barely filters, red is a class the
// compiler rejects outright.
const DIFFICULTY_TAG: Record<string, { color: string; label: string }> = {
  ALWAYS_TRUE: { color: "var(--red)", label: "Always true" },
  BALANCED: { color: "var(--green)", label: "Balanced" },
  EXTREME: { color: "var(--gold)", label: "Extreme" },
  HARD: { color: "var(--purple-soft)", label: "Hard" },
  IMPOSSIBLE: { color: "var(--red)", label: "Impossible" },
  TOO_EASY: { color: "var(--yellow)", label: "Too easy" },
};

function RulePreview({
  onRetryGeneration,
  rule,
  stream,
}: {
  onRetryGeneration: () => void;
  rule: RulePreflightResult;
  /** Non-null while this card is being typewriter-revealed (style 1a). */
  stream: null | StreamBlock;
}) {
  const valid = rule.decision === "VALID" && !rule.needsClarification;
  // Stream segment order must match ruleStreamSegments in streamReveal.tsx.
  const officialSeg = rule.normalizedText ? 1 : 0;
  const terminalRejection = rule.semanticImpact?.triviallyAlwaysTrue ?? false;
  // A valid rule states itself: no badge. Anything short of valid keeps its
  // status visible so a rejection is never silently dressed up as accepted.
  const statusLabel = terminalRejection
    ? "invalid rule"
    : rule.confirmationRequired
      ? "review required"
      : "needs adjustment";
  const statusColor = valid
    ? "var(--green)"
    : terminalRejection
      ? "var(--red)"
      : "var(--yellow)";
  const difficultyClass = getVisibleRuleDifficultyClass(rule);
  const difficulty = difficultyClass
    ? DIFFICULTY_TAG[difficultyClass]
    : undefined;
  const pct = Math.round((rule.tokenCount / RULE_MAX_TOKENS) * 100);
  return (
    // Highlighted card (components.md → "Cartão destacado"): square corners, a
    // solid orange offset plus the cyan halo, never a border or a soft radius.
    <div
      style={{
        animation: "ide-rise .3s ease both",
        background: "var(--surface)",
        borderRadius: 0,
        boxShadow: "var(--solid-5), var(--halo-cyan-lg)",
        marginRight: 3,
        padding: "14px 16px",
      }}
    >
      {valid && !difficulty ? null : (
        <div
          style={{
            alignItems: "center",
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 10,
          }}
        >
          {valid ? null : (
            <span
              className="ide-pill"
              style={{ color: statusColor, padding: "4px 10px" }}
            >
              <Ico.info style={{ width: 13, height: 13, color: statusColor }} />{" "}
              {statusLabel}
            </span>
          )}
          {difficulty ? (
            <span
              className="ide-pill"
              style={{
                color: difficulty.color,
                fontSize: 11,
                marginLeft: "auto",
                padding: "3px 9px",
              }}
              title="How hard this rule is to win"
            >
              {difficulty.label}
            </span>
          ) : null}
        </div>
      )}
      <h2
        style={{
          fontFamily: "Bevan, serif",
          fontSize: 19,
          fontWeight: 400,
          lineHeight: 1.25,
          margin: "0 0 8px",
          textTransform: "uppercase",
        }}
      >
        {rule.title}
      </h2>
      {rule.normalizedText ? (
        // The compiled wording is machine text, so it reads in DM Mono like the
        // interpretation card rather than as an Archivo paragraph.
        <p
          className="ide-num"
          style={{
            color: "var(--mono-mute)",
            fontSize: 12,
            lineHeight: 1.5,
            margin: "0 0 14px",
          }}
        >
          <StreamText block={stream} seg={0} text={rule.normalizedText} />
        </p>
      ) : null}
      {rule.officialInterpretation ? (
        <>
          <SectionLabel>
            <StreamLiveDot block={stream} />
            How it works
          </SectionLabel>
          <p
            style={{
              color: "var(--ink-body)",
              fontSize: 13,
              lineHeight: 1.5,
              margin: "7px 0 0",
            }}
          >
            <StreamText
              block={stream}
              seg={officialSeg}
              text={rule.officialInterpretation}
            />
          </p>
        </>
      ) : null}
      {stream === null && !valid && rule.reasonSummary ? (
        <p
          style={{
            margin: "12px 0 0",
            fontSize: 13,
            lineHeight: 1.5,
            color: statusColor,
            display: "flex",
            gap: 7,
          }}
        >
          <Ico.info
            style={{ color: statusColor, flexShrink: 0, marginTop: 1 }}
          />{" "}
          {rule.reasonSummary}
        </p>
      ) : null}
      {stream === null && !valid && rule.refinementFocus?.length ? (
        <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
          <SectionLabel>What to adjust</SectionLabel>
          {rule.refinementFocus.map((item) => (
            <p
              key={item}
              style={{
                color: "var(--muted)",
                fontSize: 13,
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              {item}
            </p>
          ))}
        </div>
      ) : null}
      {stream === null && rule.reproposalBlocked ? (
        <p
          style={{
            margin: "12px 0 0",
            fontSize: 13,
            lineHeight: 1.5,
            color: "var(--red)",
            display: "flex",
            gap: 7,
          }}
        >
          <Ico.lock
            style={{ color: "var(--red)", flexShrink: 0, marginTop: 1 }}
          />{" "}
          This rule was already rejected this turn and can&apos;t be
          re-proposed.
        </p>
      ) : null}
      {stream === null && rule.generationRetryable ? (
        <button
          className="ide-btn-ghost ide-btn"
          onClick={onRetryGeneration}
          style={{
            fontSize: 13,
            marginTop: 14,
            minHeight: 44,
            padding: "10px 14px",
            width: "100%",
          }}
          type="button"
        >
          <Ico.bolt style={{ color: "var(--cyan)", height: 17, width: 17 }} />
          Retry generation
        </button>
      ) : null}
      {/* Token meter: the label + square rail + DM Mono value row from
          screens-html/07-create.html, carrying the PRD §6.3 "Tokens used"
          wording. Cyan fill with its glow — yellow stays the primary action. */}
      <div
        style={{
          alignItems: "center",
          display: "flex",
          gap: 9,
          marginTop: 14,
        }}
      >
        <span
          style={{
            color: "var(--muted)",
            fontFamily: "Oswald, sans-serif",
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          Tokens used
        </span>
        <span
          style={{
            background: "var(--line)",
            borderRadius: 0,
            flex: 1,
            height: 8,
            overflow: "hidden",
          }}
        >
          <span
            style={{
              background: "var(--cyan)",
              boxShadow: "0 0 18px rgba(53,240,224,0.8)",
              display: "block",
              height: "100%",
              transition: "width .4s",
              width: `${Math.min(100, pct)}%`,
            }}
          />
        </span>
        <span
          className="ide-num"
          style={{
            color: "var(--yellow)",
            fontSize: 11.5,
            whiteSpace: "nowrap",
          }}
        >
          {rule.tokenCount} / {RULE_MAX_TOKENS}
        </span>
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
  questions,
  selectedIndex,
  stream,
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
  questions: readonly string[];
  selectedIndex: number | null;
  /** Non-null while this card is being typewriter-revealed (style 1a). */
  stream: null | StreamBlock;
  terminalRejection: boolean;
  title: string;
}) {
  const selectedOption = selectedIndex === null ? null : options[selectedIndex];
  const canSubmit = Boolean(selectedOption || manualText.trim());

  return (
    <div
      aria-label={title}
      className="ide-clarification-card"
      style={{
        animation: "ide-rise .3s ease both",
      }}
    >
      <div className="ide-clarification-prompt">
        <h2 className="ide-clarification-title">{title}</h2>
        {questions.length > 0 ? (
          <div
            aria-label="Clarification questions"
            className="ide-clarification-questions"
          >
            <SectionLabel>
              <StreamLiveDot block={stream} />
              Questions to answer
            </SectionLabel>
            {questions.map((question, index) => (
              <div key={question} className="ide-clarification-question">
                <StreamText block={stream} seg={index} text={question} />
              </div>
            ))}
          </div>
        ) : null}
      </div>
      {stream !== null ? null : (
        <>
          <div className="ide-clarification-options">
            {options.map((option, index) => {
              const selected = selectedIndex === index;
              return (
                <button
                  aria-pressed={selected}
                  className={`ide-clarification-option${selected ? " is-selected" : ""}`}
                  key={option.text}
                  onClick={() => onSelect(index)}
                  type="button"
                >
                  <span className="ide-num ide-clarification-option-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="ide-clarification-option-text">
                    {option.text}
                  </span>
                </button>
              );
            })}
            <button
              aria-pressed={selectedIndex === null}
              className={`ide-clarification-option ide-clarification-manual${selectedIndex === null ? " is-selected" : ""}`}
              onClick={onManualSelect}
              type="button"
            >
              <span className="ide-clarification-manual-icon">
                <Ico.edit
                  style={{
                    color:
                      selectedIndex === null
                        ? "var(--on-cyan)"
                        : "var(--muted)",
                    height: 17,
                    width: 17,
                  }}
                />
              </span>
              <span className="ide-clarification-option-text">
                {manualText.trim()
                  ? manualText
                  : terminalRejection
                    ? "Write a different valid rule..."
                    : "Write your own clarification..."}
              </span>
            </button>
          </div>
          <div className="ide-clarification-actions">
            <button
              className="ide-clarification-dismiss"
              onClick={onDismiss}
              type="button"
            >
              Dismiss
            </button>
            <button
              className="ide-btn ide-clarification-submit"
              disabled={disabled || !canSubmit}
              onClick={onSubmit}
              type="button"
            >
              {terminalRejection ? "Use rule" : "Submit"}{" "}
              <Ico.back
                style={{
                  color: "var(--on-accent)",
                  height: 18,
                  transform: "rotate(180deg)",
                  width: 18,
                }}
              />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function InterpretationConfirmation({
  interpretation,
  onConfirm,
  onEdit,
  stream,
}: {
  interpretation: RuleInterpretationApiResult;
  onConfirm: () => void;
  onEdit: () => void;
  /** Non-null while this card is being typewriter-revealed (style 1a). */
  stream: null | StreamBlock;
}) {
  return (
    <div
      className="ide-card"
      style={{
        animation: "ide-rise .3s ease both",
        display: "grid",
        gap: 12,
        padding: 16,
      }}
    >
      <div>
        <SectionLabel>
          <StreamLiveDot block={stream} />
          My interpretation
        </SectionLabel>
        <h2
          style={{
            fontFamily: "Bevan, serif",
            fontSize: 19,
            // Bevan ships a single weight; without this the h2 default renders
            // as synthetic bold and stops matching the other plates.
            fontWeight: 400,
            lineHeight: 1.25,
            margin: "8px 0 8px",
            textTransform: "uppercase",
          }}
        >
          {interpretation.title}
        </h2>
        <p
          className="ide-num"
          style={{
            color: "var(--mono-mute)",
            fontSize: 12,
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          <StreamText
            block={stream}
            seg={0}
            text={interpretation.normalizedText}
          />
        </p>
      </div>
      <p
        style={{
          color: "var(--ink-body)",
          fontSize: 13,
          lineHeight: 1.5,
          margin: 0,
        }}
      >
        <StreamText
          block={stream}
          seg={1}
          text={interpretation.officialInterpretation}
        />
      </p>
      {stream !== null ? null : (
        <>
          <p
            style={{
              color: "var(--dim)",
              fontSize: 13,
              lineHeight: 1.45,
              margin: 0,
            }}
          >
            Confirm this interpretation and I will generate the executable rule.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="ide-btn-ghost ide-btn"
              onClick={onEdit}
              style={{
                flex: 1,
                fontSize: 14,
                lineHeight: 1.2,
                minHeight: 44,
                padding: "9px 10px",
              }}
              type="button"
            >
              Edit wording
            </button>
            <button
              className="ide-btn"
              onClick={onConfirm}
              style={{
                flex: 1,
                fontSize: 14,
                lineHeight: 1.2,
                minHeight: 44,
                padding: "9px 10px",
              }}
              type="button"
            >
              Confirm and generate
            </button>
          </div>
        </>
      )}
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
        <span
          style={{
            color: "var(--purple-soft)",
            fontSize: 11.5,
            fontWeight: 750,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {BRAND_NAME}
        </span>
        <span style={{ color: "var(--text)", fontSize: 14, lineHeight: 1.4 }}>
          {reconnecting
            ? "Reconnecting to the dealer..."
            : (progress?.message ?? "Preparing your rule...")}
        </span>
        {reconnecting && progress?.message ? (
          <span
            style={{ color: "var(--dim)", fontSize: 12.5, lineHeight: 1.35 }}
          >
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
      <div
        style={{
          alignItems: "center",
          display: "flex",
          gap: 9,
          marginBottom: 7,
        }}
      >
        <Ico.info style={{ color: "var(--yellow)", height: 16, width: 16 }} />
        <b style={{ fontSize: 15 }}>
          {expired ? "This run expired" : "Connection lost"}
        </b>
      </div>
      <p
        style={{
          color: "var(--muted)",
          fontSize: 13.5,
          lineHeight: 1.5,
          margin: "0 0 13px",
        }}
      >
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
        <Ico.bolt style={{ color: "var(--on-accent)" }} />{" "}
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
  const {
    chatId,
    client,
    connected,
    createIntent,
    endSeconds,
    fees,
    go,
    newConversationKey,
    phase1EndsAt,
    played,
    reloadAll,
    returnTo,
    seed,
    turnId,
    wallet,
    walletAddress,
  } = useTyche();

  // `newConversationKey` stays the remount key and nothing else: it counts how
  // many blank chats this page session has opened, which says nothing about why
  // the screen is mounting now. `createIntent` answers that.
  return (
    <CreateChat
      key={`${newConversationKey}:${chatId || seed || "new"}`}
      {...{
        chatId,
        client,
        connected,
        createIntent,
        endSeconds,
        fees,
        go,
        phase1EndsAt,
        played,
        reloadAll,
        returnTo,
        seed,
        turnId,
        wallet,
        walletAddress,
      }}
    />
  );
}

type ChatProps = Pick<
  ReturnType<typeof useTyche>,
  | "chatId"
  | "client"
  | "connected"
  | "createIntent"
  | "endSeconds"
  | "fees"
  | "go"
  | "phase1EndsAt"
  | "played"
  | "reloadAll"
  | "returnTo"
  | "seed"
  | "turnId"
  | "wallet"
  | "walletAddress"
>;

function CreateChat({
  chatId,
  client,
  connected,
  createIntent,
  endSeconds,
  fees,
  go,
  phase1EndsAt,
  played,
  reloadAll,
  returnTo,
  seed,
  turnId,
  wallet,
  walletAddress,
}: ChatProps) {
  const [msgs, setMsgs] = useState<ChatMessage[]>([
    {
      text: "Hey! Tell me in one sentence how your rule decides the round winner. Be creative - I turn it into a valid rule.",
      who: "ai",
    },
  ]);
  const [val, setVal] = useState(seed ?? "");
  const [typing, setTyping] = useState(false);
  const [progress, setProgress] = useState<RulePreflightProgress | null>(null);
  const [interpretation, setInterpretation] =
    useState<RuleInterpretationApiResult | null>(null);
  const [rule, setRule] = useState<RulePreflightResult | null>(null);
  const [guidance, setGuidance] = useState<RuleGuidanceState | null>(null);
  const [selectedGuidanceIndex, setSelectedGuidanceIndex] = useState<
    number | null
  >(0);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retryingDraftSave, setRetryingDraftSave] = useState(false);
  const [error, setError] = useState<null | string>(null);
  const [activeDraftId, setActiveDraftId] = useState<null | string>(null);
  const [runStatus, setRunStatus] =
    useState<ConversationRunSnapshot["status"]>("done");
  const [connection, setConnection] =
    useState<ConversationRunSnapshot["connection"]>("closed");
  const [runJob, setRunJob] = useState<ConversationRunJob | null>(null);
  const [resuming, setResuming] = useState(false);
  // True while the dealer's answer is still arriving token by token.
  const [streaming, setStreaming] = useState(false);
  // The typewriter plan for the response being revealed (style 1a). Only a run
  // this screen watched creates one, so reopened history renders complete
  // without re-animating. The reveal cursor lives in useStreamReveal; the text
  // itself stays in the conversation run store.
  const [streamPlan, setStreamPlan] = useState<null | StreamPlan>(null);
  const reveal = useStreamReveal(streamPlan);
  const prevRunRef = useRef<{
    interpretation: RuleInterpretationApiResult | null;
    rule: RulePreflightResult | null;
    status: ConversationRunSnapshot["status"];
  }>({ interpretation: null, rule: null, status: "done" });
  // Messages already on screen when the current run started: everything from
  // here up is what this response added, and only that animates.
  const baselineRef = useRef(0);
  // Distinguishes two runs that start from the same transcript ("Run again"),
  // which would otherwise share a plan id and skip the second animation.
  const runSeqRef = useRef(0);
  // Auto-scroll follows the caret only while the player has not scrolled away.
  const userScrolledRef = useRef(false);
  // The scrollTop the code last set, so the resulting scroll event can be told
  // apart from a scroll the player performed. Without this, the "pin the first
  // line of a long answer" scroll below reads as the player scrolling away and
  // silently disables auto-scroll for everything that follows.
  const programmaticTopRef = useRef<number | null>(null);
  // The turn countdown the rest of the app shows: the chat is a game surface
  // too, and the player needs to know how long this round still runs.
  const [turnH, turnM, turnS] = useCountdownTo(endSeconds);
  const scrollRef = useRef<HTMLDivElement>(null);
  // The transcript column inside the scroll box. The box itself is flex-sized
  // and never resizes when content grows inside it, so its height is what a
  // ResizeObserver has to watch.
  const scrollContentRef = useRef<HTMLDivElement>(null);
  // The newest dealer bubble, when it is the last message. Used to keep the
  // first line of a long answer on screen instead of its last line.
  const lastAnswerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoSentRef = useRef(false);
  // Safety net against a clarification loop: after too many consecutive
  // still-needs-clarification results, stop auto-merging the reply into the
  // draft so the raw answer is sent standalone and the loop cannot continue.
  const clarificationAttemptsRef = useRef(0);
  const MAX_CLARIFICATION_ATTEMPTS = 2;

  // Every scroll the code performs goes through here, so the scroll listener can
  // recognize the event it causes and leave `userScrolledRef` alone.
  const scrollToTop = useCallback((el: HTMLDivElement, top: number) => {
    const clamped = Math.max(
      0,
      Math.min(top, el.scrollHeight - el.clientHeight),
    );
    programmaticTopRef.current = clamped;
    el.scrollTop = clamped;
  }, []);

  const pinToBottom = useCallback(
    (el: HTMLDivElement) => scrollToTop(el, el.scrollHeight),
    [scrollToTop],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    pinToBottom(el);
    // Jumping to the absolute bottom lands a long dealer answer on its LAST
    // line, so the sentence that actually answers the question is scrolled off
    // the top and the scrollbar is hidden, leaving no cue that it exists. When
    // the newest answer does not fit the viewport, pin its first line instead.
    const answer = lastAnswerRef.current;
    if (!answer) {
      return;
    }
    const answerTop = answer.getBoundingClientRect().top;
    const viewTop = el.getBoundingClientRect().top;
    if (answerTop < viewTop) {
      scrollToTop(el, el.scrollTop + answerTop - viewTop - 12);
    }
  }, [
    msgs,
    typing,
    progress,
    interpretation,
    rule,
    guidance,
    pinToBottom,
    scrollToTop,
  ]);

  // The user cancels auto-scroll by scrolling up; returning to the bottom
  // re-engages it. A scroll the code performed says nothing about intent - and
  // it does not always land at the bottom, because pinning a long answer's
  // first line deliberately scrolls up.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return undefined;
    }
    const onScroll = () => {
      const programmatic = programmaticTopRef.current;
      if (programmatic !== null && Math.abs(el.scrollTop - programmatic) <= 1) {
        programmaticTopRef.current = null;
        return;
      }
      userScrolledRef.current =
        el.scrollHeight - el.scrollTop - el.clientHeight > 48;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Follow the caret: every revealed character pins the scroll to the bottom
  // (streaming-typewriter.html drain loop), unless the player scrolled away.
  useEffect(() => {
    if (reveal.settled || userScrolledRef.current) {
      return;
    }
    const el = scrollRef.current;
    if (el) {
      pinToBottom(el);
    }
  }, [reveal.settled, reveal.tick, pinToBottom]);

  // The rule-creation cards are the tall content on this screen, and they grow
  // after the state that produced them has settled: each one mounts behind the
  // reveal gate and then streams its own text in, and the progress card swaps
  // stage lines while it waits. None of that is a change to the state the effect
  // above depends on, so the newest line kept ending up under the composer with
  // nothing to scroll it into view. Watching the transcript's real height covers
  // every growth step regardless of which state produced it.
  useEffect(() => {
    const el = scrollRef.current;
    const content = scrollContentRef.current;
    if (!el || !content || typeof ResizeObserver === "undefined") {
      return undefined;
    }
    const observer = new ResizeObserver(() => {
      if (userScrolledRef.current) {
        return;
      }
      pinToBottom(el);
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [pinToBottom]);

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

  const openGuidance = useCallback(
    (
      context: Parameters<typeof buildRuleGuidanceOptions>[0],
    ): null | RuleGuidanceState => {
      const options = buildRuleGuidanceOptions(context);
      const questions = context.refinementQuestions ?? [];
      const terminalRejection = Boolean(context.triviallyAlwaysTrue);
      if (
        options.length === 0 &&
        questions.length === 0 &&
        !terminalRejection
      ) {
        // The verdict card already explains compiler-only failures. Opening an
        // empty "Clarify" panel adds a disabled Submit button and falsely tells
        // the player that an answer is missing when the API identified none.
        setGuidance(null);
        return null;
      }
      const opened: RuleGuidanceState = {
        options,
        questions,
        terminalRejection,
        title: getRuleGuidanceTitle(context),
      };
      setGuidance(opened);
      // Never preselect an option over words the player is already typing: the
      // card can open while they answer the previous message, and a
      // preselection would replace what they wrote on send. Read the live
      // textarea instead of `val` so this stays free of render-order deps.
      const typing = textareaRef.current?.value.trim() ?? "";
      setSelectedGuidanceIndex(options.length > 0 && !typing ? 0 : null);
      return opened;
    },
    [],
  );

  const applyRunSnapshot = useCallback(
    (snapshot: ConversationRunSnapshot) => {
      const prev = prevRunRef.current;
      prevRunRef.current = {
        interpretation: snapshot.interpretation,
        rule: snapshot.rule,
        status: snapshot.status,
      };
      if (snapshot.status === "pending" && prev.status !== "pending") {
        // A run starts here: freeze what counts as "already on screen".
        baselineRef.current = snapshot.messages.length;
        runSeqRef.current += 1;
        setStreamPlan(null);
      }
      const planId = `${snapshot.draftId}:${runSeqRef.current}`;
      setStreaming(snapshot.streaming === true);
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
        // A streaming answer animates while it arrives: the plan carries the
        // growing message as a live block and keeps the same id, so the reveal
        // continues instead of restarting on every delta.
        if (snapshot.streaming) {
          setStreamPlan(
            buildStreamPlan({
              baselineMessageCount: baselineRef.current,
              guidanceQuestions: null,
              interpretation: null,
              interpretationIsNew: false,
              messages: snapshot.messages,
              planId,
              rule: null,
              ruleIsNew: false,
              streaming: true,
            }),
          );
        }
        return;
      }
      if (snapshot.status === "disconnected" || snapshot.status === "expired") {
        // An interrupted run is not a verdict on the rule: never open guidance.
        setStreamPlan(null);
        setResuming(false);
        setGuidance(null);
        return;
      }

      let openedGuidance: null | RuleGuidanceState = null;
      if (snapshot.guidanceContext) {
        openedGuidance = openGuidance(snapshot.guidanceContext);
      } else if (snapshot.interpretation) {
        if (snapshot.interpretation.needsClarification) {
          clarificationAttemptsRef.current += 1;
          openedGuidance = openGuidance({
            clarityNote: snapshot.interpretation.clarityNote,
            currentRuleText: snapshot.interpretation.sanitizedText,
            needsClarification: true,
            refinementQuestions: snapshot.interpretation.clarificationQuestions,
            suggestedRewrites: snapshot.interpretation.suggestedRewrites,
          });
        } else {
          setGuidance(null);
        }
      } else if (snapshot.rule) {
        const valid =
          snapshot.rule.decision === "VALID" &&
          !snapshot.rule.needsClarification;
        if (valid) {
          clarificationAttemptsRef.current = 0;
          setGuidance(null);
        } else {
          clarificationAttemptsRef.current += 1;
          openedGuidance = openGuidance({
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
        }
      } else {
        setGuidance(null);
      }

      // Only a response the player watched finish gets the typewriter: a
      // pending -> done transition. Errors and reopened history render at once.
      // The plan id matches the streaming one, so an answer that was already
      // being typed keeps its cursor and simply stops being live.
      if (snapshot.status === "done" && prev.status === "pending") {
        setStreamPlan(
          buildStreamPlan({
            baselineMessageCount: baselineRef.current,
            guidanceQuestions: openedGuidance ? openedGuidance.questions : null,
            interpretation: snapshot.interpretation,
            interpretationIsNew:
              snapshot.interpretation !== prev.interpretation,
            messages: snapshot.messages,
            planId,
            rule: snapshot.rule,
            ruleIsNew: snapshot.rule !== prev.rule,
            streaming: false,
          }),
        );
      } else {
        setStreamPlan(null);
      }
    },
    [openGuidance],
  );

  useEffect(
    () => subscribeConversationRun(activeDraftId, applyRunSnapshot),
    [activeDraftId, applyRunSnapshot],
  );

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
          setError(
            `Could not load this conversation. ${describeTxError(cause)}`,
          );
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
    const selectedText = resolveGuidanceSubmissionText({
      options: guidance.options,
      selectedIndex: selectedGuidanceIndex,
      typedText: val,
    });
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
    const transcript: ChatMessage[] = [
      ...msgs,
      { text: confirmation, who: "user" },
    ];
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
      approvedInterpretation: interpretation,
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

  /**
   * Re-runs only the artifact-generation phase. The transcript is intentionally
   * unchanged: the player's earlier confirmation remains the approval record,
   * and clicking Retry must not manufacture a second confirmation bubble or send
   * the rule back through interpretation.
   */
  function retryRuleGeneration() {
    if (!rule?.generationRetryable || typing) {
      return;
    }
    cancelConversationRun(activeDraftId);
    const ruleText = rule.sanitizedText;
    setTyping(true);
    setError(null);
    setGuidance(null);
    setRule(null);
    let draftIdForThisRun = activeDraftId;
    if (!draftIdForThisRun) {
      draftIdForThisRun = createClientDraftId(turnId);
      setActiveDraftId(draftIdForThisRun);
    }
    const approvedInterpretation: RuleInterpretationApiResult = {
      addedOperationalClauses: [...rule.addedOperationalClauses],
      clarificationQuestions: [],
      clarityNote: rule.clarityNote,
      dealerMessage: rule.dealerMessage,
      englishText: rule.normalizedText,
      guardianChecked: false,
      needsClarification: false,
      normalizedText: rule.normalizedText,
      officialInterpretation: rule.officialInterpretation,
      sanitizedText: rule.sanitizedText,
      suggestedRewrites: [...(rule.suggestedRewrites ?? [])],
      title: rule.title,
      tokenCount: rule.tokenCount,
    };
    startConversationRun({
      approvedInterpretation,
      draftId: draftIdForThisRun,
      initialMessages: msgs,
      lastUserMessage: msgs.at(-1)?.text ?? ruleText,
      localDealerReply: null,
      phase: "compile",
      refinedDraft: null,
      ruleText,
      turnId,
      wallet: walletAddress,
    });
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
    const pendingInterpretation = interpretation;
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
      baseCanBeClarified: Boolean(pendingInterpretation?.needsClarification),
      currentRuleText:
        pendingRule?.sanitizedText ??
        pendingInterpretation?.sanitizedText ??
        null,
      refinementQuestions:
        pendingRule?.refinementQuestions ??
        pendingInterpretation?.clarificationQuestions ??
        null,
      suggestedRewrite:
        pendingRule?.suggestedRewrite ??
        pendingInterpretation?.suggestedRewrites[0] ??
        null,
      suggestedRewrites:
        pendingRule?.suggestedRewrites ??
        pendingInterpretation?.suggestedRewrites ??
        null,
      triviallyAlwaysTrue:
        pendingRule?.semanticImpact?.triviallyAlwaysTrue ?? false,
    };
    const refinedDraft =
      !clarificationBudgetExhausted &&
      (pendingRule || pendingInterpretation) &&
      !submitted &&
      (!likelyRuleDraft || explicitPatch) &&
      isRuleRefinementPatch(t, refinementContext)
        ? composeRefinedRuleDraft(t, refinementContext)
        : null;
    const localGreetingReply =
      !refinedDraft && !likelyRuleDraft ? getLocalGreetingReply(t) : null;
    const dealerQuestion =
      !refinedDraft && !likelyRuleDraft && !localGreetingReply ? t : null;
    const ruleText =
      refinedDraft ?? (dealerQuestion ? (pendingRule?.sanitizedText ?? t) : t);
    setVal("");
    setError(null);
    setGuidance(null);
    const transcript: ChatMessage[] = [...msgs, { text: t, who: "user" }];
    setMsgs(transcript);
    setTyping(true);
    setRule(dealerQuestion || localGreetingReply ? pendingRule : null);
    let draftIdForThisSend = activeDraftId;
    if (!draftIdForThisSend) {
      draftIdForThisSend = createClientDraftId(turnId);
      setActiveDraftId(draftIdForThisSend);
    }
    startConversationRun({
      draftId: draftIdForThisSend,
      dealerQuestion,
      initialMessages: transcript,
      lastUserMessage: t,
      localDealerReply: localGreetingReply,
      phase: "interpret",
      previousRule: dealerQuestion || localGreetingReply ? pendingRule : null,
      refinedDraft,
      ruleText,
      turnId,
      wallet: walletAddress,
    });
  }

  // Auto-send the seed coming from the home prompt (once).
  useEffect(() => {
    if (!seed || chatId || autoSentRef.current) {
      return undefined;
    }
    const id = window.setTimeout(() => {
      // The one-shot is claimed when the send actually happens, never when it is
      // merely scheduled. Claiming it up front loses the prompt entirely on any
      // remount that cancels the timer first - which React's development
      // double-invoke does on every mount, so a prompt typed on Home silently
      // arrived as an unsent draft in the composer.
      autoSentRef.current = true;
      void send(seed);
    }, 350);
    return () => window.clearTimeout(id);
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
        throw new Error(
          "The active round changed before rule submission. Reopen the rule composer for the current round.",
        );
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
          throw new Error(
            "Rule creation has closed for this round. New rules open when the next round starts.",
          );
        }
      }
      const ruleProposalAddress = await deriveRuleProposalAddress({
        ruleId: rule.ruleId,
        turnId,
      });
      const existingRuleProposal = await client.runtime.rpc
        .getAccountInfo(ruleProposalAddress, {
          commitment: "confirmed",
          encoding: "base64",
        })
        .send();
      if (existingRuleProposal.value) {
        throw new Error(
          "This compiled rule id is already used on devnet. Send the same rule text again so the dealer can issue a fresh preflight before payment.",
        );
      }
      await waitForConfirmedProgramAccount({
        account: accounts.gameToken,
        client,
        label: "Your round pass",
      });
      const instruction = await createProposeRuleInstruction({
        player,
        preflight: rule,
        turnId,
      });
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
          messages: [
            ...msgs,
            { text: "Rule submitted to the round.", who: "ai" },
          ],
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
        setError(
          `Rule submitted, but the draft status could not be updated. ${describeTxError(draftError)}`,
        );
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

    const latestUserMessage = [...msgs]
      .reverse()
      .find((message) => message.who === "user")?.text;
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

  function reset(
    message = "On to the next one! How does your new rule decide the winner?",
  ) {
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
    setStreamPlan(null);
    setStreaming(false);
    prevRunRef.current = { interpretation: null, rule: null, status: "done" };
    baselineRef.current = 1;
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
    const lastUserMessage = [...msgs]
      .reverse()
      .find((message) => message.who === "user")?.text;
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
    <div
      className="ide-app ide-screen ide-chat-screen"
      style={{
        height: "100%",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div className="ide-ambient" />
      <div
        style={{
          position: "relative",
          zIndex: 2,
          padding: "var(--ide-shell-content-top) 18px 12px",
          borderBottom: "1px solid var(--line)",
          background: "rgba(11,9,16,0.6)",
          backdropFilter: "blur(10px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            aria-label="Back"
            className="ide-iconbtn"
            onClick={() => go(returnTo)}
            type="button"
          >
            <Ico.back style={{ width: 18, height: 18 }} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Dealer size={34} />
            <div>
              <div
                style={{
                  fontWeight: 800,
                  fontSize: 16,
                  lineHeight: 1.15,
                  whiteSpace: "nowrap",
                }}
              >
                {BRAND_NAME}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color:
                    connection === "reconnecting"
                      ? "var(--yellow)"
                      : "var(--green)",
                  marginTop: 1,
                  whiteSpace: "nowrap",
                }}
              >
                {submitted
                  ? "● rule submitted"
                  : connection === "reconnecting"
                    ? "● reconnecting"
                    : connected
                      ? "● crafting your rule"
                      : "● preflight is free"}
              </div>
            </div>
          </div>
          <div
            style={{
              marginLeft: "auto",
              display: "grid",
              gap: 2,
              justifyItems: "end",
            }}
          >
            {endSeconds !== null ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 12,
                  color: "var(--muted)",
                  whiteSpace: "nowrap",
                }}
              >
                <Ico.clock
                  style={{ color: "var(--yellow)", width: 13, height: 13 }}
                />{" "}
                <span
                  className="ide-num"
                  style={{ color: "var(--text)", fontWeight: 700 }}
                >
                  {turnH}:{turnM}:{turnS}
                </span>
              </span>
            ) : null}
            <span
              style={{
                fontSize: 12,
                color: "var(--dim)",
                whiteSpace: "nowrap",
              }}
            >
              submit{" "}
              <span className="ide-num" style={{ color: "var(--muted)" }}>
                {fees.ruleNext === 0 ? "Free" : fmtSol(fees.ruleNext)}
              </span>
            </span>
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="ide-scroll"
        style={{
          position: "relative",
          zIndex: 1,
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          minWidth: 0,
          padding: "18px 16px 8px",
        }}
      >
        {/* The measured column. The scroll box is flex-sized and never resizes
            when content grows inside it, so the ResizeObserver watches this. */}
        <div
          ref={scrollContentRef}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          {msgs.map((mm, i) => {
            if (mm.who !== "ai") {
              return (
                <div
                  key={i}
                  className="ide-bubble-user"
                  style={{ animation: "ide-rise .3s ease both" }}
                >
                  {mm.text}
                </div>
              );
            }
            // Style 1a: a dealer bubble streams in DM Mono and only enters the
            // screen when its first character is written.
            if (!reveal.isBlockVisible(`msg:${i}`)) {
              return null;
            }
            return (
              <div
                key={i}
                className="ide-bubble-ai"
                ref={i === msgs.length - 1 ? lastAnswerRef : null}
                style={{ animation: "ide-rise .3s ease both" }}
              >
                <StreamText
                  block={reveal.blockFor(`msg:${i}`)}
                  text={mm.text}
                />
              </div>
            );
          })}
          {typing && !streaming ? (
            <AgentProgress connection={connection} progress={progress} />
          ) : null}
          {!typing &&
          (runStatus === "disconnected" || runStatus === "expired") ? (
            <RunInterruptedCard
              busy={resuming}
              kind={runStatus}
              onRetry={resumeOrRerun}
            />
          ) : null}

          {interpretation &&
          !interpretation.needsClarification &&
          !typing &&
          reveal.isBlockVisible("interpretation") ? (
            <InterpretationConfirmation
              interpretation={interpretation}
              onConfirm={confirmInterpretation}
              onEdit={editInterpretation}
              stream={reveal.blockFor("interpretation")}
            />
          ) : null}

          {rule && !typing && reveal.isBlockVisible("rule") ? (
            <RulePreview
              onRetryGeneration={retryRuleGeneration}
              rule={rule}
              stream={reveal.blockFor("rule")}
            />
          ) : null}

          {guidance && !typing && reveal.isBlockVisible("guidance") ? (
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
              questions={guidance.questions}
              selectedIndex={selectedGuidanceIndex}
              stream={reveal.blockFor("guidance")}
              terminalRejection={guidance.terminalRejection}
              title={guidance.title}
            />
          ) : null}

          {rule && valid && !typing && reveal.settled ? (
            submitted ? (
              <div
                style={{
                  padding: "16px 2px",
                  borderTop: "1px solid rgba(124,246,184,0.3)",
                  borderBottom: "1px solid var(--line)",
                  animation: "ide-rise .3s ease both",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 8,
                  }}
                >
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 9,
                      background: "var(--green)",
                      color: "var(--on-accent)",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <Ico.check />
                  </span>
                  <b style={{ fontSize: 15.5 }}>Rule in the round</b>
                </div>
                <p
                  style={{
                    margin: "0 0 14px",
                    color: "var(--muted)",
                    fontSize: 14,
                    lineHeight: 1.5,
                  }}
                >
                  In voting for round {fmtTurnId(turnId)}. If elected and
                  winners exist, you earn{" "}
                  <b style={{ color: "var(--text)" }}>15%</b> of one winner's
                  payout.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => reset()}
                    className="ide-btn-ghost ide-btn"
                    style={{ flex: 1, padding: 13 }}
                    type="button"
                  >
                    Create another
                  </button>
                  <button
                    onClick={() => go("vote")}
                    className="ide-btn"
                    style={{ flex: 1, padding: 13 }}
                    type="button"
                  >
                    See in voting
                  </button>
                </div>
              </div>
            ) : ruleCreationClosed ? (
              <div
                style={{
                  padding: "16px 2px",
                  borderTop: "1px solid rgba(255,210,63,0.3)",
                  borderBottom: "1px solid var(--line)",
                  animation: "ide-rise .3s ease both",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    marginBottom: 7,
                  }}
                >
                  <Ico.lock
                    style={{ color: "var(--yellow)", width: 16, height: 16 }}
                  />
                  <b style={{ fontSize: 15 }}>Rule creation closed</b>
                </div>
                <p
                  style={{
                    margin: "0 0 13px",
                    color: "var(--muted)",
                    fontSize: 13.5,
                    lineHeight: 1.5,
                  }}
                >
                  The create phase for round {fmtTurnId(turnId)} has ended, so
                  new rules can&apos;t be submitted. Your draft is saved and you
                  can submit it when the next round opens.
                </p>
                <button
                  onClick={() => go("home")}
                  className="ide-btn"
                  style={{ width: "100%", padding: 13 }}
                  type="button"
                >
                  <Ico.back
                    style={{
                      color: "var(--on-accent)",
                      transform: "rotate(180deg)",
                    }}
                  />{" "}
                  Back to the round
                </button>
              </div>
            ) : played ? (
              <button
                onClick={submit}
                disabled={busy}
                className="ide-btn"
                style={{
                  padding: 15,
                  fontSize: 15.5,
                  animation: "ide-rise .3s ease both",
                  opacity: busy ? 0.7 : 1,
                }}
                type="button"
              >
                <Ico.check style={{ color: "var(--on-accent)" }} />{" "}
                {busy
                  ? "Submitting..."
                  : `Submit to the round · ${fees.ruleNext === 0 ? "Free" : `${fmtSol(fees.ruleNext)} SOL`}`}
              </button>
            ) : (
              <div
                style={{
                  padding: "16px 2px",
                  borderTop: "1px solid rgba(255,210,63,0.3)",
                  borderBottom: "1px solid var(--line)",
                  animation: "ide-rise .3s ease both",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    marginBottom: 7,
                  }}
                >
                  <Ico.lock
                    style={{ color: "var(--yellow)", width: 16, height: 16 }}
                  />
                  <b style={{ fontSize: 15 }}>Play to submit</b>
                </div>
                <p
                  style={{
                    margin: "0 0 13px",
                    color: "var(--muted)",
                    fontSize: 13.5,
                    lineHeight: 1.5,
                  }}
                >
                  Make a guess this round to unlock submitting. Your draft stays
                  here.
                </p>
                <button
                  onClick={() => go("play")}
                  className="ide-btn"
                  style={{ width: "100%", padding: 13 }}
                  type="button"
                >
                  <Ico.bolt style={{ color: "var(--on-accent)" }} /> Play now ·{" "}
                  {fees.playNext === 0
                    ? "Free"
                    : `${fmtSol(fees.playNext)} SOL`}
                </button>
              </div>
            )
          ) : null}

          {error ? (
            <div
              className="ide-card"
              style={{
                borderColor: "rgba(255,59,47,0.3)",
                color: "var(--red)",
                display: "grid",
                fontSize: 13,
                gap: 10,
                padding: "11px 14px",
              }}
            >
              <span>{error}</span>
              {isConversationDraftSaveError(error) ? (
                <button
                  className="ide-votebtn"
                  disabled={retryingDraftSave}
                  onClick={() => void retryDraftSave()}
                  style={{
                    justifySelf: "start",
                    opacity: retryingDraftSave ? 0.7 : 1,
                    padding: "8px 12px",
                  }}
                  type="button"
                >
                  {retryingDraftSave ? "Saving..." : "Retry saving"}
                </button>
              ) : null}
            </div>
          ) : null}
          <div style={{ height: 4 }} />
        </div>
      </div>

      {!submitted ? (
        <div
          style={{
            position: "relative",
            zIndex: 2,
            padding: "10px 14px calc(14px + env(safe-area-inset-bottom,0px))",
            borderTop: "1px solid var(--line)",
            background: "rgba(11,9,16,0.7)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-end", gap: 9 }}>
            <textarea
              aria-label="Message"
              ref={textareaRef}
              value={val}
              onChange={(e) => {
                setVal(e.target.value);
                // Typing is choosing to write your own answer. Move the card's
                // selection to "write your own" so the card always shows what
                // sending will actually send, and the player's words are never
                // swapped for the preselected suggestion.
                if (guidance && e.target.value.trim()) {
                  setSelectedGuidanceIndex(null);
                }
              }}
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
              placeholder={
                guidance
                  ? guidance.terminalRejection
                    ? "Choose a valid variation or write a different rule..."
                    : "Choose an option or write your own clarification..."
                  : rule
                    ? "Ask for a tweak or describe another rule..."
                    : "Describe your rule..."
              }
              style={{
                flex: 1,
                minWidth: 0,
                resize: "none",
                background: "var(--surface)",
                border: "1px solid var(--line-2)",
                borderRadius: 16,
                padding: "13px 15px",
                color: "var(--text)",
                fontSize: 15,
                fontFamily: "Archivo",
                outline: "none",
                maxHeight: 90,
              }}
            />
            <button
              aria-label={guidance ? "Submit clarification" : "Send message"}
              onClick={() => {
                if (guidance) {
                  submitGuidance();
                  return;
                }
                void send();
              }}
              className={`ide-btn ide-composer-send${guidance ? " is-guidance" : ""}`}
              style={{
                width: 48,
                height: 48,
                padding: 0,
                borderRadius: "var(--radius-btn-sm)",
                flexShrink: 0,
              }}
              type="button"
            >
              <Ico.send
                style={{
                  color: guidance ? "var(--cyan)" : "var(--on-accent)",
                }}
              />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
