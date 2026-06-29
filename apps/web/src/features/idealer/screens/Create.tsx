"use client";

/**
 * CRIAR REGRA — chat with the AI dealer. Real flow: POST /rule-preflight to
 * compile/validate, then propose on-chain (createProposeRuleInstruction) and
 * POST /rule-proposals. Ported from app-create.jsx (local stub removed).
 */
import { useEffect, useRef, useState } from "react";
import { address } from "@solana/kit";

import { RULE_MAX_TOKENS } from "@idealer/constants";

import {
  createProposeRuleInstruction,
  deriveRuleProposalAddress,
  type RulePreflightResult,
} from "../../../solana/idealerProgram";
import { useIdealer } from "../context";
import { postConversationDraft, postRuleProposal, postRulePreflight } from "../data/apiClient";
import { fmtSol, fmtTurnId } from "../data/format";
import { describeTxError, sendInstruction } from "../data/tx";
import { Dealer, Ico, SectionLabel } from "../shared";

interface ChatMessage {
  text: string;
  who: "ai" | "user";
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

function isLikelyRuleDraft(text: string) {
  const trimmed = text.trim();
  if (!trimmed || GREETING_PATTERN.test(trimmed)) {
    return false;
  }

  return (
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
  if (QUESTION_PATTERN.test(trimmed) || trimmed.endsWith("?")) {
    return "A valid rule can only use the player's guess and the official draw. Write the condition in one sentence, and I will compile it before payment.";
  }
  return "I need a winner condition based on the guess and draw. Try: Win if at least 4 of your numbers appear in the draw.";
}

function RulePreview({ rule }: { rule: RulePreflightResult }) {
  const valid = rule.decision === "VALID" && !rule.needsClarification;
  const pct = Math.round((rule.tokenCount / RULE_MAX_TOKENS) * 100);
  const confidencePct =
    typeof rule.finalConfidence === "number"
      ? Math.round(rule.finalConfidence * 100)
      : null;
  return (
    <div className="ide-card" style={{ padding: 16, borderColor: "var(--line-2)", background: "linear-gradient(160deg, var(--surface-2), var(--surface))", animation: "ide-rise .3s ease both" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <span className="ide-pill" style={{ color: valid ? "var(--green)" : "var(--yellow)", padding: "4px 10px" }}>
          {valid ? <><Ico.check style={{ width: 13, height: 13, color: "var(--green)" }} /> valid rule</> : "needs adjustment"}
        </span>
        {confidencePct !== null ? (
          <span className="ide-pill" style={{ padding: "4px 10px", color: "var(--purple-soft)" }}>
            <Ico.shield style={{ width: 12, height: 12, color: "var(--purple-soft)" }} /> <span className="ide-num">{confidencePct}%</span> confidence
          </span>
        ) : null}
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--dim)" }} className="ide-num">{rule.tokenCount}/{RULE_MAX_TOKENS} tokens</span>
      </div>
      {rule.normalizedText ? <p style={{ margin: "0 0 14px", fontSize: 15, color: "var(--text)", lineHeight: 1.45, fontWeight: 600 }}>{rule.normalizedText}</p> : null}
      {rule.officialInterpretation ? (
        <>
          <SectionLabel>How it works</SectionLabel>
          <p style={{ margin: "7px 0 0", fontSize: 14, lineHeight: 1.55, color: "var(--muted)" }}>{rule.officialInterpretation}</p>
        </>
      ) : null}
      {!valid && rule.reasonSummary ? (
        <p style={{ margin: "12px 0 0", fontSize: 13, lineHeight: 1.5, color: "var(--yellow)", display: "flex", gap: 7 }}>
          <Ico.info style={{ color: "var(--yellow)", flexShrink: 0, marginTop: 1 }} /> {rule.reasonSummary}
        </p>
      ) : null}
      {rule.reproposalBlocked ? (
        <p style={{ margin: "12px 0 0", fontSize: 13, lineHeight: 1.5, color: "var(--red)", display: "flex", gap: 7 }}>
          <Ico.lock style={{ color: "var(--red)", flexShrink: 0, marginTop: 1 }} /> This rule was already rejected this turn and can&apos;t be re-proposed.
        </p>
      ) : null}
      <div style={{ marginTop: 14, height: 6, borderRadius: 4, background: "var(--surface-3)", overflow: "hidden" }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: valid ? "var(--grad-btn)" : "var(--yellow)", borderRadius: 4, transition: "width .4s" }} />
      </div>
    </div>
  );
}

export function CreateScreen() {
  const { client, connect, connected, fees, go, played, reloadAll, seed, turnId, wallet, walletAddress } = useIdealer();

  if (!connected) {
    return (
      <div className="ide-app ide-screen" style={{ height: "100%", position: "relative", overflow: "hidden" }}>
        <div className="ide-ambient" />
        <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: "52px 22px 30px" }}>
          <div style={{ display: "flex" }}>
            <button onClick={() => go("home")} style={{ width: 40, height: 40, borderRadius: 13, background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--text)", display: "grid", placeItems: "center", cursor: "pointer" }} type="button"><Ico.back /></button>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
            <div style={{ animation: "ide-float 4s ease-in-out infinite" }}><Dealer size={64} /></div>
            <h2 style={{ fontSize: 25, fontWeight: 800, margin: "18px 0 8px", letterSpacing: "-0.02em" }}>Connect to create</h2>
            <p style={{ color: "var(--muted)", fontSize: 15.5, lineHeight: 1.5, margin: "0 0 26px" }}>Chat with the dealer and design your winning rule by prompt. Submitting this rule costs <span className="ide-num" style={{ color: "var(--text)" }}>{fees.ruleNext === 0 ? "Free" : `${fmtSol(fees.ruleNext)} SOL`}</span>.</p>
            <button onClick={() => connect()} className="ide-btn" style={{ width: "100%", padding: 16, fontSize: 16 }} type="button">
              <Ico.wallet style={{ color: "#08110C" }} /> Connect wallet
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <CreateChat key={seed || "new"} {...{ client, fees, go, played, reloadAll, seed, turnId, wallet, walletAddress }} />;
}

type ChatProps = Pick<ReturnType<typeof useIdealer>, "client" | "fees" | "go" | "played" | "reloadAll" | "seed" | "turnId" | "wallet" | "walletAddress">;

function CreateChat({ client, fees, go, played, reloadAll, seed, turnId, wallet, walletAddress }: ChatProps) {
  const [msgs, setMsgs] = useState<ChatMessage[]>([
    { text: "Hey! Tell me in one sentence how your rule decides the round winner. Be creative — I turn it into a valid rule. 🎲", who: "ai" },
  ]);
  const [val, setVal] = useState(seed ?? "");
  const [typing, setTyping] = useState(false);
  const [rule, setRule] = useState<RulePreflightResult | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<null | string>(null);
  const [activeDraftId, setActiveDraftId] = useState<null | string>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoSentRef = useRef(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [msgs, typing, rule]);

  async function send(text?: string) {
    const t = (text ?? val).trim();
    if (!t || typing) {
      return;
    }
    setVal("");
    setError(null);
    setMsgs((m) => [...m, { text: t, who: "user" }]);
    setTyping(true);
    setRule(null);
    try {
      if (!isLikelyRuleDraft(t)) {
        setMsgs((m) => [...m, { text: getDealerChatReply(t, fees), who: "ai" }]);
        return;
      }

      const body = await postRulePreflight(t);
      const preflight = body.preflight as unknown as RulePreflightResult;
      const valid = preflight.decision === "VALID" && !preflight.needsClarification;
      setMsgs((m) => [
        ...m,
        { text: preflight.dealerMessage || (valid ? "Done! I compiled your rule. Review it — if you like it, submit it to the round." : "Almost there! Try describing the win condition in a few clear words."), who: "ai" },
      ]);
      setRule(preflight);
      if (walletAddress) {
        try {
          const saved = await postConversationDraft(walletAddress, {
            lastMessage: preflight.dealerMessage,
            normalizedText: preflight.normalizedText || null,
            officialInterpretation: preflight.officialInterpretation || null,
            prompt: preflight.sanitizedText,
            ruleId: preflight.ruleId,
            status: "draft",
            tokenCount: preflight.tokenCount,
            turnId,
            wallet: walletAddress,
          });
          setActiveDraftId(saved.draft.draftId);
        } catch (draftError) {
          setError(`Rule compiled, but the draft could not be saved. ${describeTxError(draftError)}`);
        }
      }
    } catch (cause) {
      setMsgs((m) => [...m, { text: "Dealer engine unavailable. The compiler must be online before I can lock a rule.", who: "ai" }]);
      setError(describeTxError(cause));
    } finally {
      setTyping(false);
    }
  }

  // Auto-send the seed coming from the home prompt (once).
  useEffect(() => {
    if (seed && !autoSentRef.current) {
      autoSentRef.current = true;
      const id = window.setTimeout(() => void send(seed), 350);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, []);

  async function submit() {
    if (!rule || !played || !wallet || !walletAddress) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const player = address(walletAddress);
      const instruction = await createProposeRuleInstruction({ player, preflight: rule, turnId });
      const signature = await sendInstruction(client, wallet, instruction);
      const ruleProposal = (await deriveRuleProposalAddress({ ruleId: rule.ruleId, turnId })).toString();
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
        await postConversationDraft(walletAddress, {
          ...(activeDraftId ? { draftId: activeDraftId } : {}),
          lastMessage: "Rule submitted to the round.",
          normalizedText: rule.normalizedText || null,
          officialInterpretation: rule.officialInterpretation || null,
          prompt: rule.sanitizedText,
          ruleId: rule.ruleId,
          status: "submitted",
          tokenCount: rule.tokenCount,
          turnId,
          wallet: walletAddress,
        });
      } catch (draftError) {
        setError(`Rule submitted, but the draft status could not be updated. ${describeTxError(draftError)}`);
      }
    } catch (cause) {
      setError(describeTxError(cause));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setRule(null);
    setSubmitted(false);
    setError(null);
    setActiveDraftId(null);
    setMsgs([{ text: "On to the next one! How does your new rule decide the winner?", who: "ai" }]);
  }

  const valid = rule?.decision === "VALID" && !rule.needsClarification;

  return (
    <div className="ide-app ide-screen" style={{ height: "100%", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div className="ide-ambient" />
      <div style={{ position: "relative", zIndex: 2, padding: "52px 18px 12px", borderBottom: "1px solid var(--line)", background: "rgba(11,9,16,0.6)", backdropFilter: "blur(10px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => go("home")} style={{ width: 40, height: 40, borderRadius: 13, background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--text)", display: "grid", placeItems: "center", cursor: "pointer" }} type="button"><Ico.back /></button>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Dealer size={30} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.15, whiteSpace: "nowrap" }}>AI Dealer</div>
              <div style={{ fontSize: 12, color: "var(--green)", marginTop: 1, whiteSpace: "nowrap" }}>{submitted ? "● rule submitted" : "● crafting your rule"}</div>
            </div>
          </div>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--dim)" }}>submit <span className="ide-num" style={{ color: "var(--muted)" }}>{fees.ruleNext === 0 ? "Free" : fmtSol(fees.ruleNext)}</span></span>
        </div>
      </div>

      <div ref={scrollRef} className="ide-scroll" style={{ position: "relative", zIndex: 1, flex: 1, overflowY: "auto", overflowX: "hidden", minWidth: 0, padding: "18px 16px 8px", display: "flex", flexDirection: "column", gap: 12 }}>
        {msgs.map((mm, i) => (
          <div key={i} className={mm.who === "ai" ? "ide-bubble-ai" : "ide-bubble-user"} style={{ animation: "ide-rise .3s ease both" }}>{mm.text}</div>
        ))}
        {typing ? <div className="ide-bubble-ai ide-typing" style={{ width: 56 }}><span /><span /><span /></div> : null}

        {rule && !typing ? <RulePreview rule={rule} /> : null}

        {rule && valid && !typing ? (
          submitted ? (
            <div className="ide-card" style={{ padding: 16, borderColor: "rgba(20,241,149,0.35)", background: "linear-gradient(120deg, rgba(20,241,149,0.12), var(--surface))", animation: "ide-rise .3s ease both" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ width: 28, height: 28, borderRadius: 9, background: "var(--green)", color: "#08110C", display: "grid", placeItems: "center" }}><Ico.check /></span>
                <b style={{ fontSize: 15.5 }}>Rule in the round</b>
              </div>
              <p style={{ margin: "0 0 14px", color: "var(--muted)", fontSize: 14, lineHeight: 1.5 }}>In voting for round {fmtTurnId(turnId)}. If elected, you earn <b style={{ color: "var(--text)" }}>15%</b> of each prize.</p>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={reset} className="ide-btn-ghost ide-btn" style={{ flex: 1, padding: 13 }} type="button">Create another</button>
                <button onClick={() => go("vote")} className="ide-btn" style={{ flex: 1, padding: 13 }} type="button">See in voting</button>
              </div>
            </div>
          ) : played ? (
            <button onClick={submit} disabled={busy} className="ide-btn" style={{ padding: 15, fontSize: 15.5, animation: "ide-rise .3s ease both", opacity: busy ? 0.7 : 1 }} type="button">
              <Ico.check style={{ color: "#08110C" }} /> {busy ? "Submitting…" : `Submit to the round - ${fees.ruleNext === 0 ? "Free" : `${fmtSol(fees.ruleNext)} SOL`}`}
            </button>
          ) : (
            <div className="ide-card" style={{ padding: 16, borderColor: "rgba(255,210,63,0.35)", background: "linear-gradient(120deg, rgba(255,210,63,0.1), var(--surface))", animation: "ide-rise .3s ease both" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
                <Ico.lock style={{ color: "var(--yellow)", width: 16, height: 16 }} />
                <b style={{ fontSize: 15 }}>Play to submit</b>
              </div>
              <p style={{ margin: "0 0 13px", color: "var(--muted)", fontSize: 13.5, lineHeight: 1.5 }}>Make a guess this round to unlock submitting. Your draft stays here.</p>
              <button onClick={() => go("play")} className="ide-btn" style={{ width: "100%", padding: 13 }} type="button">
                <Ico.bolt style={{ color: "#08110C" }} /> Play now - {fees.playNext === 0 ? "Free" : `${fmtSol(fees.playNext)} SOL`}
              </button>
            </div>
          )
        ) : null}

        {error ? <div className="ide-card" style={{ padding: "11px 14px", borderColor: "rgba(255,107,107,0.3)", color: "var(--red)", fontSize: 13 }}>{error}</div> : null}
        <div style={{ height: 4 }} />
      </div>

      {!submitted ? (
        <div style={{ position: "relative", zIndex: 2, padding: "10px 14px calc(14px + env(safe-area-inset-bottom,0px))", borderTop: "1px solid var(--line)", background: "rgba(11,9,16,0.7)", backdropFilter: "blur(12px)" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 9 }}>
            <textarea
              aria-label="Message"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              rows={1}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
              placeholder={rule ? "Ask for a tweak or describe another rule…" : "Describe your rule…"}
              style={{ flex: 1, resize: "none", background: "var(--surface)", border: "1px solid var(--line-2)", borderRadius: 16, padding: "13px 15px", color: "var(--text)", fontSize: 15, fontFamily: "Outfit", outline: "none", maxHeight: 90 }}
            />
            <button aria-label="Send message" onClick={() => void send()} className="ide-btn" style={{ width: 48, height: 48, padding: 0, borderRadius: 15, flexShrink: 0 }} type="button"><Ico.send style={{ color: "#08110C" }} /></button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
