"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Coins,
  HelpCircle,
  Lightbulb,
  LoaderCircle,
  Send,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { MVP_FEES_SOL, RULE_MAX_TOKENS } from "@idealer/constants";
import { address } from "@solana/kit";
import {
  useSolanaClient,
  useWaitForSignature,
  useWalletConnection,
} from "@solana/react-hooks";
import {
  createProposeRuleInstruction,
  deriveRuleProposalAddress,
  deriveSubmitGuessAccounts,
  fetchActiveTurnSnapshot,
  getTurnActionReadiness,
  IDEALER_ACTIVE_TURN_ID,
  type RulePreflightResult,
  type RuleProposalReceipt,
} from "../../solana/idealerProgram";

const RULE_MAX_CHARACTERS = 6000;
const API_BASE_URL =
  process.env.NEXT_PUBLIC_IDEALER_API_URL ?? "http://localhost:3002";
const INSPIRATION_EXAMPLES = [
  "Win if at least 4 of your numbers appear in the draw.",
  "The guess with the closest even total to the drawn total wins.",
  "Win if the sum of your numbers equals the sum of the drawn numbers.",
  "The guess containing the most drawn numbers wins.",
] as const;

type ComposerStep = "compose" | "review" | "success";
type ProposalStatus =
  | "idle"
  | "preflighting"
  | "awaiting_approval"
  | "pending"
  | "confirmed"
  | "failed";

interface ProposalFeedback {
  code?: string;
  message: string;
  receipt?: RuleProposalReceipt;
  signature?: string;
  status: ProposalStatus;
}

// Topics the dealer can explain without ever calling the model. These power the
// onboarding so a new player can ask "how does it work?" and get a real answer
// instead of a failed preflight.
type AnswerTopic = "welcome" | "how" | "create" | "examples" | "costs";

interface ChatChip {
  label: string;
  // A chip either opens another canned topic, drops example text into the input,
  // or asks the dealer to preflight a specific text the player already wrote.
  insert?: string;
  preflight?: string;
  topic?: AnswerTopic;
}

interface ChatMessage {
  id: string;
  role: "dealer" | "user";
  title?: string;
  body: string;
  chips?: ChatChip[];
  code?: string;
  tone?: "error";
}

function countApproximateTokens(value: string) {
  return value.match(/\p{L}+|\p{N}+|[^\s\p{L}\p{N}]/gu)?.length ?? 0;
}

function removeControlCharacters(value: string) {
  return Array.from(value)
    .map((character) => {
      const codePoint = character.codePointAt(0);

      return codePoint !== undefined && (codePoint < 32 || codePoint === 127)
        ? " "
        : character;
    })
    .join("");
}

function sanitizePreview(value: string) {
  return removeControlCharacters(value).replace(/\s+/g, " ").trim();
}

function truncateAddress(value: string) {
  return `${value.slice(0, 5)}...${value.slice(-5)}`;
}

// --- Intent detection -------------------------------------------------------
// The composer must tell apart "the player is chatting / asking" from "the
// player is proposing a rule". Only the latter is worth a server preflight.
// This is deliberately a local, deterministic heuristic: onboarding must keep
// working even when the LLM is down (which is exactly what produced the
// RULE_PREFLIGHT_FAILED on a plain "oi").

type MessageIntent = "greeting" | "thanks" | "help" | "rule";

const GREETING_RE =
  /^(oi+|ol[aá]+|al[oô]+|e[ -]?a[ií]|hey+|hi+|hell?o+|hola|yo|sup|bom dia|boa tarde|boa noite|tudo bem|tudo bom)\b/i;
const THANKS_RE = /\b(thanks|thank you|thx|obrigad[oa]|valeu|vlw)\b/i;
const QUESTION_START_RE =
  /^(how|what|why|when|where|can|could|do|does|should|would|is|are|which|como|o que|por ?qu[eê]|qual|quais|posso|tem como|d[aá] pra)\b/i;
const HELP_RE =
  /\?|\b(help|explain|example|examples|cost|costs|fee|fees|token|tokens|limit|works?|funciona|ajuda|d[uú]vida|exemplo|exemplos|custa|pre[çc]o|limite|criar|allowed)\b/i;
const RULE_RE =
  /\b(win|wins|winner|won|lose|loses?|guess|guesses|draw|drawn|number|numbers|sum|total|totals|match|matches|matching|even|odd|highest|lowest|closest|most|least|fewer|greater|ganha|ganh\w*|vence\w*|vencedor|n[uú]mero|n[uú]meros|soma|somar|acert\w*|err\w*|maior|menor|par|[íi]mpar|sorte-?\w*|sorteado)\b/i;

function classifyIntent(text: string): MessageIntent {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/).filter(Boolean).length;
  const isQuestion = /\?\s*$/.test(trimmed) || QUESTION_START_RE.test(trimmed);

  if (THANKS_RE.test(trimmed) && words <= 4) {
    return "thanks";
  }

  if (GREETING_RE.test(trimmed) && words <= 3) {
    return "greeting";
  }

  // A question is answered, never preflighted — even if it mentions rule words.
  if (isQuestion) {
    return "help";
  }

  // A declarative sentence with rule vocabulary is a rule draft.
  if (RULE_RE.test(trimmed) && words >= 3) {
    return "rule";
  }

  if (HELP_RE.test(trimmed)) {
    return "help";
  }

  // A long declarative sentence is most likely a rule attempt.
  if (words >= 6) {
    return "rule";
  }

  if (GREETING_RE.test(trimmed)) {
    return "greeting";
  }

  return "help";
}

function detectTopic(text: string): AnswerTopic {
  const value = text.toLowerCase();

  if (/example|exemplo|inspir/.test(value)) {
    return "examples";
  }

  if (/cost|fee|custa|pre[çc]o|token|limit|limite|sol\b/.test(value)) {
    return "costs";
  }

  if (/what can|o que posso|posso (criar|fazer)|create|criar|allowed|kind of/.test(value)) {
    return "create";
  }

  return "how";
}

// --- Canned dealer answers --------------------------------------------------

function exampleChips(): ChatChip[] {
  return INSPIRATION_EXAMPLES.map((example) => ({
    insert: example,
    label: example,
  }));
}

function buildAnswer(topic: AnswerTopic): Omit<ChatMessage, "id" | "role"> {
  switch (topic) {
    case "how":
      return {
        body:
          "Every round draws 6 numbers from 1 to 100. Your rule decides who wins by comparing each player's guess (their 6 numbers) against that draw. Write it in plain words — I rewrite it into one clear, measurable condition, run a safety and token check, and you confirm it before it goes on-chain. Tip: you need to play a guess in this round first to unlock proposing.",
        chips: [
          { label: "What can I create?", topic: "create" },
          { label: "Show examples", topic: "examples" },
          { label: "Costs & limits", topic: "costs" },
        ],
        title: "How a rule works",
      };
    case "create":
      return {
        body:
          "A rule can only look at two things: your guess (6 numbers) and the draw (6 numbers). From there you can compare totals, count how many match, look at the highest or lowest, even or odd, ranges, positions, or drop a few numbers. It just has to be objective and testable — no vague words like 'nice' or 'lucky', and nothing about wallets, votes, time, or other players.",
        chips: [
          { label: "Show examples", topic: "examples" },
          { label: "Costs & limits", topic: "costs" },
          { label: "How does it work?", topic: "how" },
        ],
        title: "What you can create",
      };
    case "examples":
      return {
        body:
          "Here are a few for inspiration — tap one to drop it into the box, then make it your own. These are not templates; write whatever way to win you can imagine.",
        chips: [
          ...exampleChips(),
          { label: "What can I create?", topic: "create" },
        ],
        title: "Example rules",
      };
    case "costs":
      return {
        body: `Proposing a rule costs ${MVP_FEES_SOL.ruleProposal.toFixed(
          2,
        )} SOL, and the text must fit within ${RULE_MAX_TOKENS} tokens — you'll see a live counter as you type. You also need a Game Token, which you get by playing a guess in this round first.`,
        chips: [
          { label: "How does it work?", topic: "how" },
          { label: "Show examples", topic: "examples" },
        ],
        title: "Costs & limits",
      };
    case "welcome":
    default:
      return {
        body:
          "Tell me how you'd like players to win this round and I'll turn it into a rule the game can verify. New here? Ask me anything, or tap an option below to get started.",
        chips: [
          { label: "How does it work?", topic: "how" },
          { label: "What can I create?", topic: "create" },
          { label: "Show examples", topic: "examples" },
          { label: "Costs & limits", topic: "costs" },
        ],
        title: "Welcome — I'm the Dealer.",
      };
  }
}

// Carries the server's machine-readable error code so the dealer can tell the
// player the truth: "the rule is unclear" vs "the AI engine is offline" are very
// different failures and must not be flattened into one generic message.
class PreflightRequestError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "PreflightRequestError";
    this.code = code;
  }
}

async function requestRulePreflight(text: string) {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/rule-preflight`, {
      body: JSON.stringify({ text }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  } catch (error) {
    throw new PreflightRequestError(
      error instanceof Error ? error.message : String(error),
      "RULE_SERVICE_UNREACHABLE",
    );
  }

  let body: {
    error?: string;
    message?: string;
    preflight?: RulePreflightResult;
  };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    throw new PreflightRequestError(
      "The dealer service returned an unreadable response.",
      "RULE_SERVICE_BAD_RESPONSE",
    );
  }

  if (!response.ok || !body.preflight) {
    throw new PreflightRequestError(
      body.message ?? body.error ?? "Rule preflight failed.",
      body.error ?? "RULE_PREFLIGHT_FAILED",
    );
  }

  return body.preflight;
}

async function persistRuleProposal(receipt: RuleProposalReceipt) {
  const response = await fetch(`${API_BASE_URL}/rule-proposals`, {
    body: JSON.stringify(receipt),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  if (!response.ok && response.status !== 409) {
    throw new Error(`Rule proposal API returned HTTP ${response.status}.`);
  }
}

function ProposalPhoneChrome() {
  return (
    <>
      <div className="platform-dynamic-island" aria-hidden="true" />
      <div className="platform-statusbar" aria-hidden="true">
        <span>9:41</span>
        <span className="platform-status-icons">
          <i className="platform-cell-signal">
            <b />
            <b />
            <b />
            <b />
          </i>
          <i className="platform-wifi">⌁</i>
          <i className="platform-battery" />
        </span>
      </div>
      <div className="platform-home-indicator" aria-hidden="true" />
    </>
  );
}

function ProposalDealer({ size = 42 }: { size?: number }) {
  return (
    <span
      className="platform-dealer"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span className="platform-dealer-hat" />
      <i />
      <i />
      <b />
    </span>
  );
}

function normalizeProposalError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("reject") ||
    normalizedMessage.includes("declin") ||
    normalizedMessage.includes("cancel")
  ) {
    return {
      code: "TRANSACTION_REJECTED",
      message: "The wallet request was rejected. Your rule was not submitted.",
    };
  }

  if (
    normalizedMessage.includes("wallet connection failed") ||
    normalizedMessage.includes("not connected") ||
    normalizedMessage.includes("no wallet") ||
    normalizedMessage.includes("disconnected") ||
    normalizedMessage.trim().length === 0
  ) {
    return {
      code: "WALLET_CONNECTION_FAILED",
      message:
        "The wallet connection dropped. Reconnect your wallet and try submitting again.",
    };
  }

  if (
    normalizedMessage.includes("action window") ||
    normalizedMessage.includes("turn is not open") ||
    normalizedMessage.includes("no active turn") ||
    normalizedMessage.includes("custom program error: 0x1773") ||
    normalizedMessage.includes("custom program error: 0x1775") ||
    normalizedMessage.includes("custom program error: 0x1777")
  ) {
    return {
      code: "TURN_NOT_ACCEPTING_RULES",
      message:
        "This turn is no longer accepting rule proposals. Return to the live round.",
    };
  }

  return {
    code: "RULE_PROPOSAL_FAILED",
    message,
  };
}

function dealerErrorMessage(
  error: unknown,
  originalText: string,
): {
  body: string;
  code: string;
  tone: "error" | "offline";
} {
  const code =
    error instanceof PreflightRequestError ? error.code : "RULE_PREFLIGHT_FAILED";
  const raw = (error instanceof Error ? error.message : String(error)).toLowerCase();

  // The API service itself can't be reached (API down, wrong URL, CORS).
  if (
    code === "RULE_SERVICE_UNREACHABLE" ||
    /failed to fetch|networkerror|load failed|fetch failed/.test(raw)
  ) {
    return {
      body: "I can't reach the dealer service right now. Make sure the Idealer API is running, then send your rule again — this isn't about your rule.",
      code: "RULE_SERVICE_UNREACHABLE",
      tone: "offline",
    };
  }

  // The AI model behind the dealer is offline, busy, or returned junk. Be honest:
  // this is an engine problem, not the player's rule.
  if (code.startsWith("RULE_AGENT") || code === "RULE_SERVICE_BAD_RESPONSE") {
    return {
      body: "The dealer engine couldn't process that — the AI model may be offline, busy, or misconfigured. This isn't about your rule; give it another try in a moment.",
      code,
      tone: "offline",
    };
  }

  if (code === "RULE_TOKEN_LIMIT_EXCEEDED" || raw.includes("token")) {
    return {
      body: `That's a bit long for the ${RULE_MAX_TOKENS}-token limit. Trim it to one clear sentence and send it again.`,
      code: "RULE_TOKEN_LIMIT_EXCEEDED",
      tone: "error",
    };
  }

  if (code === "RULE_PROMPT_INJECTION" || raw.includes("injection")) {
    return {
      body: "I can only work with game conditions. Describe a measurable way to win that compares the guess to the draw — leave out any instructions to me.",
      code: "RULE_PROMPT_INJECTION",
      tone: "error",
    };
  }

  if (code === "RULE_EMPTY") {
    return {
      body: "Type a rule first — describe one clear way to win.",
      code: "RULE_EMPTY",
      tone: "error",
    };
  }

  // Genuine rule problem: the text didn't read as a measurable rule.
  const looksTiny = originalText.trim().split(/\s+/).filter(Boolean).length < 3;
  return {
    body: looksTiny
      ? "I didn't catch a rule there. Try describing one clear way to win — for example, “Win if at least 4 of your numbers appear in the draw.”"
      : "I couldn't read that as a measurable rule. Try one clear condition that compares your guess to the draw — for example, “Win if at least 4 of your numbers appear in the draw.”",
    code: code || "RULE_PREFLIGHT_FAILED",
    tone: "error",
  };
}

export function RuleProposalComposer() {
  const client = useSolanaClient();
  const {
    connected,
    error: connectionError,
    status: connectionStatus,
    wallet,
  } = useWalletConnection();
  const [ruleText, setRuleText] = useState("");
  const [step, setStep] = useState<ComposerStep>("compose");
  const [preflight, setPreflight] = useState<RulePreflightResult | null>(null);
  const [feedback, setFeedback] = useState<ProposalFeedback>({
    message: "",
    status: "idle",
  });
  const messageIdRef = useRef(0);
  const nextMessageId = () => {
    messageIdRef.current += 1;
    return `msg-${messageIdRef.current}`;
  };
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { ...buildAnswer("welcome"), id: "msg-0", role: "dealer" },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tokenCount = useMemo(
    () => countApproximateTokens(ruleText),
    [ruleText],
  );
  const sanitizedPreview = useMemo(() => sanitizePreview(ruleText), [ruleText]);
  const walletAddress = wallet?.account.address.toString();
  const isEmpty = sanitizedPreview.length === 0;
  const isOverLimit = tokenCount > RULE_MAX_TOKENS;
  const isSubmitting =
    feedback.status === "preflighting" ||
    feedback.status === "awaiting_approval" ||
    feedback.status === "pending";
  const isThinking = feedback.status === "preflighting";
  const canSend = !isEmpty && !isOverLimit && !isSubmitting;
  const signatureStatus = useWaitForSignature(feedback.signature, {
    commitment: "confirmed",
    disabled: !feedback.signature,
    subscribe: true,
  });

  // Keep the latest message in view as the conversation grows (no scrollIntoView).
  useEffect(() => {
    const node = scrollRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [messages, isThinking, step]);

  useEffect(() => {
    if (!feedback.signature || !feedback.receipt) {
      return;
    }

    const receipt = feedback.receipt;
    const signature = feedback.signature;

    if (signatureStatus.isSuccess) {
      void persistRuleProposal(receipt)
        .then(() => {
          setFeedback({
            message: "Your rule proposal was confirmed on Solana devnet.",
            receipt,
            signature,
            status: "confirmed",
          });
          setStep("success");
        })
        .catch((error: unknown) => {
          setFeedback({
            code: "RULE_PROPOSAL_API_FAILED",
            message: error instanceof Error ? error.message : String(error),
            receipt,
            signature,
            status: "failed",
          });
        });
    } else if (signatureStatus.isError) {
      const normalized = normalizeProposalError(signatureStatus.waitError);
      setFeedback({
        code: normalized.code,
        message: normalized.message,
        receipt,
        signature,
        status: "failed",
      });
    }
  }, [
    feedback.receipt,
    feedback.signature,
    signatureStatus.isError,
    signatureStatus.isSuccess,
    signatureStatus.waitError,
  ]);

  function appendMessages(...entries: Array<Omit<ChatMessage, "id">>) {
    setMessages((current) => [
      ...current,
      ...entries.map((entry) => ({ ...entry, id: nextMessageId() })),
    ]);
  }

  function resetComposer() {
    setRuleText("");
    setStep("compose");
    setPreflight(null);
    setFeedback({ message: "", status: "idle" });
    messageIdRef.current = 0;
    setMessages([{ ...buildAnswer("welcome"), id: "msg-0", role: "dealer" }]);
  }

  function answerTopic(topic: AnswerTopic) {
    appendMessages({ ...buildAnswer(topic), role: "dealer" });
  }

  function focusInput() {
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function insertExample(text: string) {
    setRuleText(text);
    setPreflight(null);
    setFeedback({ message: "", status: "idle" });
    focusInput();
  }

  async function runPreflight(text: string) {
    const clean = sanitizePreview(text);
    if (!clean) {
      return;
    }

    setFeedback({
      message: "The dealer is interpreting and normalizing your rule.",
      status: "preflighting",
    });

    try {
      const result = await requestRulePreflight(text);
      setPreflight(result);
      setRuleText(text);
      setFeedback({ message: "", status: "idle" });
      setStep("review");
    } catch (error) {
      const { body, code, tone } = dealerErrorMessage(error, text);
      setFeedback({ message: "", status: "idle" });
      // An engine/service outage isn't the player's fault — offer a retry, not
      // "rewrite your rule". A genuine rule problem gets the examples shortcuts.
      const chips: ChatChip[] =
        tone === "offline"
          ? [
              { label: "Try again", preflight: text },
              { label: "How does it work?", topic: "how" },
            ]
          : [
              { label: "Show examples", topic: "examples" },
              { label: "What can I create?", topic: "create" },
            ];
      appendMessages({
        body,
        chips,
        code,
        role: "dealer",
        title: tone === "offline" ? "Dealer engine unavailable" : "Let's adjust that",
        tone: "error",
      });
    }
  }

  function answerIntent(intent: MessageIntent, text: string) {
    if (intent === "rule") {
      void runPreflight(text);
      return;
    }

    if (intent === "greeting" || intent === "thanks") {
      appendMessages({ ...buildAnswer("welcome"), role: "dealer" });
      return;
    }

    // help — route to the closest topic. If the question still carried rule
    // vocabulary, offer a one-tap shortcut to actually preflight what they wrote.
    const answer = buildAnswer(detectTopic(text));
    const chips = [...(answer.chips ?? [])];
    if (RULE_RE.test(text) && sanitizePreview(text).split(/\s+/).length >= 3) {
      chips.unshift({ label: "Check that as a rule", preflight: text });
    }
    appendMessages({ ...answer, chips, role: "dealer" });
  }

  function handleSend() {
    const text = ruleText;
    const clean = sanitizePreview(text);
    if (!clean || isOverLimit || isSubmitting) {
      return;
    }

    const intent = classifyIntent(clean);
    appendMessages({ body: clean, role: "user" });

    if (intent === "rule") {
      // Keep the draft in the box so "Edit rule" on the review screen works.
      void runPreflight(text);
    } else {
      setRuleText("");
      answerIntent(intent, clean);
    }
  }

  function handleChip(chip: ChatChip) {
    if (chip.topic) {
      answerTopic(chip.topic);
      return;
    }
    if (chip.preflight) {
      setRuleText(chip.preflight);
      void runPreflight(chip.preflight);
      return;
    }
    if (chip.insert) {
      insertExample(chip.insert);
    }
  }

  async function submitProposal() {
    if (!preflight) {
      await runPreflight(ruleText);
      return;
    }

    if (preflight.needsClarification) {
      setFeedback({
        code: "RULE_NEEDS_CLARIFICATION",
        message:
          preflight.clarityNote ||
          "The dealer needs a clearer, measurable rule. Edit it and try again.",
        status: "failed",
      });
      return;
    }

    if (
      !connected ||
      !wallet ||
      !walletAddress ||
      connectionStatus !== "connected"
    ) {
      setFeedback({
        code: "WALLET_NOT_CONNECTED",
        message: connectionError
          ? "The wallet connection failed. Reconnect your wallet and try again."
          : "Connect a Solana devnet wallet before submitting your rule.",
        status: "failed",
      });
      return;
    }

    let receipt: RuleProposalReceipt | undefined;

    try {
      const player = address(walletAddress);
      const activeTurn = await fetchActiveTurnSnapshot(client);
      const turnReadiness = getTurnActionReadiness({
        cutoffBps: activeTurn.globalConfig.ruleElectionCutoffBps,
        globalConfig: activeTurn.globalConfig,
        turn: activeTurn.turnState,
      });

      if (!turnReadiness.ok) {
        setFeedback({
          code: turnReadiness.code,
          message: turnReadiness.message,
          status: "failed",
        });
        return;
      }

      const turnId = activeTurn.globalConfig.activeTurnId;
      const accounts = await deriveSubmitGuessAccounts({
        player,
        turnId,
      });
      const gameToken = await client.runtime.rpc
        .getAccountInfo(accounts.gameToken, {
          commitment: "confirmed",
          encoding: "base64",
        })
        .send();

      if (!gameToken.value) {
        setFeedback({
          code: "GAME_TOKEN_REQUIRED",
          message: "Submit a guess for this turn before proposing a rule.",
          status: "failed",
        });
        return;
      }

      const ruleProposal = await deriveRuleProposalAddress({
        ruleId: preflight.ruleId,
        turnId,
      });
      const existingRule = await client.runtime.rpc
        .getAccountInfo(ruleProposal, {
          commitment: "confirmed",
          encoding: "base64",
        })
        .send();

      if (existingRule.value) {
        setFeedback({
          code: "RULE_ID_COLLISION",
          message: "This rule id already exists. Edit the rule and try again.",
          status: "failed",
        });
        return;
      }

      receipt = {
        ...preflight,
        proposer: walletAddress,
        ruleProposal: ruleProposal.toString(),
        signature: "",
        submittedAt: new Date().toISOString(),
        turnId,
      };
      setFeedback({
        message: "Approve the rule proposal transaction in your wallet.",
        receipt,
        status: "awaiting_approval",
      });

      const instruction = await createProposeRuleInstruction({
        player,
        preflight,
        turnId,
      });
      const signature = (
        await client.transaction.prepareAndSend(
          {
            authority: wallet,
            commitment: "confirmed",
            feePayer: player,
            instructions: [instruction],
            version: 0,
          },
          { commitment: "confirmed", maxRetries: 3, skipPreflight: false },
        )
      ).toString();
      const pendingReceipt = { ...receipt, signature };
      setFeedback({
        message: "Wallet approval returned. Waiting for devnet confirmation.",
        receipt: pendingReceipt,
        signature,
        status: "pending",
      });
    } catch (error) {
      const normalized = normalizeProposalError(error);
      setFeedback({
        code: normalized.code,
        message: normalized.message,
        status: "failed",
        ...(receipt ? { receipt } : {}),
      });
    }
  }

  if (step === "success") {
    return (
      <main className="platform-stage">
        <div className="platform-phone-shell">
          <ProposalPhoneChrome />
          <section
            className="platform-screen platform-propose-screen proposal-action-mode"
            aria-labelledby="proposal-success-title"
          >
            <div className="platform-ambient" />
            <div className="platform-scroll platform-propose-scroll">
              <div className="proposal-success-card">
                <CheckCircle2 aria-hidden="true" size={34} />
                <p className="platform-section-label">Proposal submitted</p>
                <h1 id="proposal-success-title">
                  Your devnet rule is queued.
                </h1>
                <p>{feedback.message}</p>
              </div>
              <div className="sanitized-preview proposal-chat-card">
                <span>Submitted rule</span>
                <p>{preflight?.sanitizedText ?? sanitizedPreview}</p>
              </div>
              {feedback.receipt ? (
                <dl className="review-costs proposal-meta-grid">
                  <div>
                    <dt>RuleProposal PDA</dt>
                    <dd>{truncateAddress(feedback.receipt.ruleProposal)}</dd>
                  </div>
                  <div>
                    <dt>Signature</dt>
                    <dd>
                      <a
                        href={`https://explorer.solana.com/tx/${feedback.receipt.signature}?cluster=devnet`}
                        rel="noreferrer"
                        target="_blank"
                      >
                        View receipt
                      </a>
                    </dd>
                  </div>
                </dl>
              ) : null}
            </div>
            <nav
              className="proposal-chat-actions"
              aria-label="Proposal success actions"
            >
              <Link className="platform-ghost-button" href="/play">
                Back to live round
              </Link>
              <button
                className="platform-primary-button proposal-primary-button"
                onClick={resetComposer}
                type="button"
              >
                Propose another
              </button>
            </nav>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="platform-stage">
      <div className="platform-phone-shell">
        <ProposalPhoneChrome />
        <section
          className={`platform-screen platform-propose-screen ${
            step === "compose" ? "proposal-compose-mode" : "proposal-action-mode"
          }`}
          aria-labelledby="rule-composer-title"
        >
          <div className="platform-ambient" />
          <div
            className="platform-scroll platform-propose-scroll"
            ref={scrollRef}
          >
            <header className="platform-screen-header proposal-chat-header">
              <Link aria-label="Back to live round" href="/play">
                <ArrowLeft aria-hidden="true" size={20} />
              </Link>
              <div>
                <p className="platform-section-label">
                  Turn TURN-{IDEALER_ACTIVE_TURN_ID.toString().padStart(4, "0")}
                </p>
                <h1 id="rule-composer-title">Dealer chat</h1>
              </div>
              <span
                className={
                  isOverLimit
                    ? "proposal-token-pill warning"
                    : "proposal-token-pill"
                }
              >
                {preflight?.tokenCount ?? tokenCount}/{RULE_MAX_TOKENS}
              </span>
            </header>

            <section className="proposal-chat-intro">
              <ProposalDealer />
              <div>
                <p className="platform-section-label">Free-form rule</p>
                <h2>Describe a new way to win.</h2>
                <p>
                  Chat with the dealer. Ask how it works, or just describe how
                  players should win — I&apos;ll know the difference and only run
                  a preflight when you propose an actual rule.
                </p>
              </div>
            </section>

            {step === "review" ? (
              <section
                className="proposal-chat-thread"
                aria-labelledby="proposal-review-title"
              >
                <article className="proposal-bubble-ai">
                  <Sparkles aria-hidden="true" size={16} />
                  <div>
                    <p className="platform-section-label">Review proposal</p>
                    <h2 id="proposal-review-title">
                      Confirm this rule before devnet submission.
                    </h2>
                  </div>
                </article>
                {preflight?.dealerMessage ? (
                  <article className="proposal-bubble-ai">
                    <Sparkles aria-hidden="true" size={16} />
                    <div>
                      <strong>Dealer worked your rule</strong>
                      <p>{preflight.dealerMessage}</p>
                    </div>
                  </article>
                ) : null}
                <div className="sanitized-preview proposal-bubble-user">
                  <span>Your rule text</span>
                  <p>{preflight?.sanitizedText ?? sanitizedPreview}</p>
                </div>
                {preflight?.reproposalBlocked ? (
                  <article
                    className="guess-status-card proposal-status-card failed"
                    role="alert"
                  >
                    <strong>Rule already used</strong>
                    <p>
                      {preflight.reasonSummary ||
                        "This rule was already the Rule of the Hour in a previous turn. Add a condition to differentiate it before reusing it."}
                    </p>
                  </article>
                ) : preflight?.needsClarification ? (
                  <article
                    className="guess-status-card proposal-status-card failed"
                    role="alert"
                  >
                    <strong>Needs clarification</strong>
                    <p>
                      {preflight.clarityNote ||
                        "The dealer could not interpret this rule objectively. Edit it and try again."}
                    </p>
                  </article>
                ) : null}
                <div className="mock-check proposal-chat-card">
                  <span>Normalized rule</span>
                  <p>{preflight?.normalizedText ?? sanitizedPreview}</p>
                </div>
                <div className="mock-check proposal-chat-card">
                  <span>Official interpretation</span>
                  <p>{preflight?.officialInterpretation ?? sanitizedPreview}</p>
                </div>
                {preflight && preflight.addedOperationalClauses.length > 0 ? (
                  <div className="mock-check proposal-chat-card">
                    <span>Added operational clauses</span>
                    <ul>
                      {preflight.addedOperationalClauses.map((clause) => (
                        <li key={clause}>{clause}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {preflight?.decision ? (
                  <div
                    className={`mock-check proposal-chat-card${
                      preflight.decision === "VALID" ? "" : " failed"
                    }`}
                  >
                    <span>Compiled &amp; tested</span>
                    <p>
                      {preflight.decision === "VALID"
                        ? `The dealer compiled this into a verifiable ${
                            preflight.ruleMode === "ranking"
                              ? "ranking rule (best score wins)"
                              : "win/lose rule"
                          }.`
                        : preflight.reasonSummary ||
                          "This rule could not be compiled into a verifiable condition."}
                      {typeof preflight.finalConfidence === "number"
                        ? ` Confidence ${(preflight.finalConfidence * 100).toFixed(0)}%.`
                        : ""}
                      {preflight.difficultyClass
                        ? ` Difficulty: ${preflight.difficultyClass}.`
                        : ""}
                    </p>
                  </div>
                ) : null}
                <div className="mock-check proposal-chat-card">
                  <span>Preflight commitment</span>
                  <p>
                    Server token count and hashes are locked before wallet
                    approval.
                  </p>
                </div>
                <dl className="review-costs proposal-meta-grid">
                  <div>
                    <dt>Proposal fee</dt>
                    <dd>{MVP_FEES_SOL.ruleProposal.toFixed(2)} SOL</dd>
                  </div>
                  <div>
                    <dt>Token count</dt>
                    <dd>
                      {preflight?.tokenCount ?? tokenCount}/{RULE_MAX_TOKENS}
                    </dd>
                  </div>
                  <div>
                    <dt>Wallet</dt>
                    <dd>
                      {walletAddress
                        ? truncateAddress(walletAddress)
                        : "Not connected"}
                    </dd>
                  </div>
                </dl>
                {feedback.status !== "idle" ? (
                  <article
                    aria-live="polite"
                    className={`guess-status-card proposal-status-card ${feedback.status}`}
                    role={feedback.status === "failed" ? "alert" : undefined}
                  >
                    <strong>
                      {feedback.status === "preflighting"
                        ? "Running preflight"
                        : null}
                      {feedback.status === "awaiting_approval"
                        ? "Awaiting wallet approval"
                        : null}
                      {feedback.status === "pending"
                        ? "Transaction pending"
                        : null}
                      {feedback.status === "confirmed"
                        ? "Proposal confirmed"
                        : null}
                      {feedback.status === "failed" ? "Proposal failed" : null}
                    </strong>
                    <p>{feedback.message}</p>
                    {feedback.code ? <code>{feedback.code}</code> : null}
                    {feedback.signature ? (
                      <a
                        href={`https://explorer.solana.com/tx/${feedback.signature}?cluster=devnet`}
                        rel="noreferrer"
                        target="_blank"
                      >
                        View devnet transaction
                      </a>
                    ) : null}
                  </article>
                ) : null}
              </section>
            ) : (
              <section className="proposal-chat-thread" aria-label="Dealer conversation">
                {messages.map((message) =>
                  message.role === "user" ? (
                    <div
                      className="sanitized-preview proposal-bubble-user"
                      key={message.id}
                    >
                      <span>You</span>
                      <p>{message.body}</p>
                    </div>
                  ) : (
                    <article
                      className={
                        message.tone === "error"
                          ? "proposal-bubble-ai proposal-bubble-error"
                          : "proposal-bubble-ai"
                      }
                      key={message.id}
                    >
                      {message.tone === "error" ? (
                        <ShieldCheck aria-hidden="true" size={16} />
                      ) : (
                        <Sparkles aria-hidden="true" size={16} />
                      )}
                      <div>
                        {message.title ? <strong>{message.title}</strong> : null}
                        <p>{message.body}</p>
                        {message.code ? <code>{message.code}</code> : null}
                        {message.chips && message.chips.length > 0 ? (
                          <div className="proposal-chip-row">
                            {message.chips.map((chip) => (
                              <button
                                className={
                                  chip.insert
                                    ? "proposal-chip proposal-chip-example"
                                    : "proposal-chip"
                                }
                                key={chip.label}
                                onClick={() => handleChip(chip)}
                                type="button"
                              >
                                {chip.topic === "examples" ? (
                                  <Lightbulb aria-hidden="true" size={13} />
                                ) : chip.topic === "costs" ? (
                                  <Coins aria-hidden="true" size={13} />
                                ) : chip.topic ? (
                                  <HelpCircle aria-hidden="true" size={13} />
                                ) : null}
                                <span>{chip.label}</span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ),
                )}

                {isThinking ? (
                  <article
                    className="proposal-bubble-ai"
                    aria-live="polite"
                  >
                    <LoaderCircle
                      aria-hidden="true"
                      className="wallet-spinner"
                      size={16}
                    />
                    <div>
                      <strong>Working on your rule…</strong>
                      <p>Interpreting, normalizing, and running the preflight.</p>
                    </div>
                  </article>
                ) : null}
              </section>
            )}
          </div>

          {step === "compose" ? (
            <nav
              className="proposal-chat-composer"
              aria-label="Rule proposal actions"
            >
              <div className="composer-field proposal-input-field">
                <label htmlFor="rule-text">Message</label>
                <textarea
                  aria-describedby="rule-token-guidance"
                  id="rule-text"
                  maxLength={RULE_MAX_CHARACTERS}
                  onChange={(event) => {
                    setRuleText(event.target.value);
                    setPreflight(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Ask how it works, or describe a way to win…"
                  ref={textareaRef}
                  rows={2}
                  value={ruleText}
                />
              </div>
              <button
                aria-label="Send message"
                className="proposal-send-button"
                disabled={!canSend}
                onClick={handleSend}
                type="button"
              >
                {isThinking ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="wallet-spinner"
                    size={19}
                  />
                ) : (
                  <Send aria-hidden="true" size={19} />
                )}
                <span>Send message</span>
              </button>
              <button
                className="proposal-clear-button"
                onClick={() => setRuleText("")}
                type="button"
              >
                Clear
              </button>
              <p
                className={
                  isOverLimit ? "token-guidance warning" : "token-guidance"
                }
                id="rule-token-guidance"
              >
                {isOverLimit
                  ? `Your rule is ${tokenCount - RULE_MAX_TOKENS} token${
                      tokenCount - RULE_MAX_TOKENS === 1 ? "" : "s"
                    } over the ${RULE_MAX_TOKENS}-token limit. Trim it a little before sending it to the dealer.`
                  : "Write freely. Questions get answered; rules get a preflight."}
              </p>
            </nav>
          ) : (
            <nav
              className="proposal-chat-actions"
              aria-label="Rule proposal review actions"
            >
              <button
                className="platform-ghost-button"
                onClick={() => setStep("compose")}
                type="button"
              >
                Edit rule
              </button>
              {connected ? (
                <button
                  className="platform-primary-button proposal-primary-button"
                  disabled={
                    isSubmitting ||
                    preflight?.needsClarification === true ||
                    preflight?.reproposalBlocked === true ||
                    (preflight?.decision !== undefined &&
                      preflight.decision !== "VALID")
                  }
                  onClick={submitProposal}
                  type="button"
                >
                  {isSubmitting ? "Submitting..." : "Submit to devnet"}
                </button>
              ) : (
                <Link
                  className="platform-primary-button proposal-primary-button"
                  href="/play/wallet"
                >
                  <Wallet aria-hidden="true" size={17} />
                  Connect wallet
                </Link>
              )}
            </nav>
          )}
        </section>
      </div>
    </main>
  );
}
