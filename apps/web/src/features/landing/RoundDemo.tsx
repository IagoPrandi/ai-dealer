"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";

import { Ico } from "../tyche/shared";
import {
  EXAMPLE_PICKS,
  EXAMPLE_RULES,
  EXAMPLE_RULE_SENTENCE,
  MATCH_THRESHOLD,
  NUMBER_MAX,
  NUMBER_MIN,
  PICK_COUNT,
  buildDemoDraw,
  pad,
} from "./exampleRound";
import { useTypewriter } from "./useTypewriter";

const STEPS = [
  "Pick your numbers",
  "Write a rule",
  "The AI makes it enforceable",
  "The community elects",
  "Face the draw",
] as const;

const NUMBERS = Array.from({ length: NUMBER_MAX - NUMBER_MIN + 1 }, (_, index) => index + NUMBER_MIN);
const ROLL_MS = 1400;

type DrawState = { phase: "idle" } | { phase: "rolling" } | { phase: "done"; draw: number[] };

/**
 * "Watch a round happen": a self-contained, client-only walkthrough of one
 * example round. Nothing here talks to the API or a wallet; the final step
 * hands the visitor to the real round.
 */
export function RoundDemo() {
  const baseId = useId();
  const [step, setStep] = useState(0);
  const [visited, setVisited] = useState(0);
  const [picks, setPicks] = useState<number[]>([...EXAMPLE_PICKS]);
  const [backed, setBacked] = useState<string | null>(null);
  const [draw, setDraw] = useState<DrawState>({ phase: "idle" });

  const goTo = (next: number) => {
    setStep(next);
    setVisited((current) => Math.max(current, next));
  };

  const togglePick = (value: number) => {
    setDraw({ phase: "idle" });
    setPicks((current) => {
      if (current.includes(value)) return current.filter((item) => item !== value);
      if (current.length >= PICK_COUNT) return current;
      return [...current, value].sort((a, b) => a - b);
    });
  };

  const quickPick = () => {
    setDraw({ phase: "idle" });
    const pool = [...NUMBERS];
    const next: number[] = [];
    while (next.length < PICK_COUNT) {
      const [value] = pool.splice(Math.floor(Math.random() * pool.length), 1);
      if (value !== undefined) next.push(value);
    }
    setPicks(next.sort((a, b) => a - b));
  };

  const runDraw = () => {
    setDraw({ phase: "rolling" });
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => setDraw({ phase: "done", draw: buildDemoDraw(picks) }), reduced ? 0 : ROLL_MS);
  };

  const replay = () => {
    setPicks([...EXAMPLE_PICKS]);
    setBacked(null);
    setDraw({ phase: "idle" });
    setVisited(0);
    setStep(0);
  };

  const missing = PICK_COUNT - picks.length;

  return (
    <div className="lp-demo">
      <ol aria-label="Round steps" className="lp-steps" role="tablist">
        {STEPS.map((title, index) => (
          <li key={title} role="presentation">
            <button
              aria-controls={`${baseId}-panel`}
              aria-selected={step === index}
              className={`lp-step${index < visited && step !== index ? " done" : ""}`}
              disabled={index > visited + 1 || (index > 0 && missing > 0)}
              id={`${baseId}-tab-${index}`}
              onClick={() => goTo(index)}
              role="tab"
              type="button"
            >
              <span className="lp-step-num">{index < visited && step !== index ? <Ico.check width={15} height={15} /> : pad(index + 1)}</span>
              <span className="lp-step-title">{title}</span>
            </button>
          </li>
        ))}
      </ol>

      <div aria-labelledby={`${baseId}-tab-${step}`} className="lp-panel" id={`${baseId}-panel`} role="tabpanel">
        <div className="lp-panel-body" key={step}>
          <div>
            <span className="lp-panel-kicker">Step {pad(step + 1)} / {pad(STEPS.length)} · example round</span>
            <h3 className="lp-panel-title">{STEPS[step]}</h3>
          </div>

          {step === 0 ? (
            <>
              <div className="lp-chip-row" aria-live="polite">
                {Array.from({ length: PICK_COUNT }, (_, index) => {
                  const value = picks[index];
                  return value === undefined
                    ? <span className="lp-chip empty" key={`empty-${index}`}>—</span>
                    : <span className="lp-chip picked" key={value}>{pad(value)}</span>;
                })}
              </div>
              <div aria-label="Numbers 1 to 100" className="lp-grid" role="group">
                {NUMBERS.map((value) => {
                  const selected = picks.includes(value);
                  return (
                    <button
                      aria-label={`Number ${value}`}
                      aria-pressed={selected}
                      disabled={!selected && missing === 0}
                      key={value}
                      onClick={() => togglePick(value)}
                      type="button"
                    >
                      {pad(value)}
                    </button>
                  );
                })}
              </div>
              <div className="lp-pick-tools">
                <button className="lp-ghost small" onClick={quickPick} type="button"><Ico.dice />Quick pick</button>
                <span className="lp-panel-hint">Tap a number to swap it out</span>
              </div>
            </>
          ) : null}

          {step === 1 ? <WriteStep /> : null}
          {step === 2 ? <FreezeStep /> : null}

          {step === 3 ? (
            <>
              <p className="lp-panel-text">
                Several rules are proposed every round. The community backs the ones it likes. One becomes the <strong>Rule of the Round.</strong>
              </p>
              <ElectionList backed={backed} onBack={(id) => setBacked((current) => (current === id ? null : id))} />
            </>
          ) : null}

          {step === 4 ? <DrawStep draw={draw} onDraw={runDraw} picks={picks} /> : null}

          <div className="lp-panel-foot">
            {step === 0 && missing > 0 ? (
              <button className="lp-ghost" disabled type="button">{missing} {missing === 1 ? "number" : "numbers"} left</button>
            ) : null}
            {step === 0 && missing === 0 ? <NextButton label="Write a rule" onClick={() => goTo(1)} /> : null}
            {step === 1 ? <NextButton label="Submit rule" onClick={() => goTo(2)} /> : null}
            {step === 2 ? <NextButton label="Send it to the vote" onClick={() => goTo(3)} /> : null}
            {step === 3 ? <NextButton label="Go to the draw" onClick={() => goTo(4)} /> : null}
            {step === 4 ? (
              <button className="lp-ghost small" onClick={replay} type="button">Replay the demo</button>
            ) : null}
            {step === 4 && draw.phase === "done" ? (
              <Link className="lp-cta" href="/play">Play the real round<Ico.arrow /></Link>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function NextButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="lp-ghost" onClick={onClick} type="button">
      {label}
      <Ico.arrow width={18} height={18} />
    </button>
  );
}

function WriteStep() {
  const typed = useTypewriter(EXAMPLE_RULE_SENTENCE, 28);
  return (
    <>
      <p className="lp-panel-text">Say how winning should work, the way you would say it out loud.</p>
      <div className="lp-mini-card">
        <div className="lp-mini-head">
          <strong>Create your rule</strong>
          <span className="lp-tag">with AI</span>
        </div>
        <div className="lp-composer">
          <div aria-label="Example rule" className="lp-mini-input">{typed}<span aria-hidden="true" className="lp-caret" /></div>
        </div>
      </div>
    </>
  );
}

function FreezeStep() {
  return (
    <>
      <p className="lp-panel-text">
        You wrote a sentence. The AI reads it, checks it makes sense, and freezes it into a rule the game can verify —
        automatically, the same way for everyone. No one can write a rule and quietly get a different one enforced.
      </p>
      <div className="lp-ai-flow">
        <div className="lp-bubble-user">{EXAMPLE_RULE_SENTENCE}</div>
        <span aria-hidden="true" className="lp-ai-arrow"><Ico.arrow /></span>
        <div className="lp-frozen">
          <span className="lp-stamp"><Ico.lock />Frozen</span>
          <span className="lp-frozen-name">Four is enough</span>
          <p className="lp-frozen-desc">A guess wins when at least {MATCH_THRESHOLD} of its {PICK_COUNT} numbers appear anywhere in the draw.</p>
          <code className="lp-frozen-code">matches(guess, draw) ≥ {MATCH_THRESHOLD}</code>
        </div>
      </div>
      <ul className="lp-checks">
        {["Read the sentence", "Checked it makes sense", "Frozen before the draw, the same for everyone"].map((line, index) => (
          <li key={line} style={{ "--i": index } as React.CSSProperties}><Ico.check />{line}</li>
        ))}
      </ul>
    </>
  );
}

function ElectionList({ backed, onBack }: { backed: string | null; onBack: (id: string) => void }) {
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setFilled(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const rows = EXAMPLE_RULES.map((rule) => ({ ...rule, total: rule.backers + (backed === rule.id ? 1 : 0) }));
  const top = Math.max(...rows.map((row) => row.total));
  const elected = rows.find((row) => row.total === top)?.id;

  return (
    <div className="lp-vote-list">
      {rows.map((rule, index) => (
        <div className={`lp-vote${filled && rule.id === elected ? " elected" : ""}`} key={rule.id}>
          <span className="lp-step-num">{pad(index + 1)}</span>
          <div>
            <div className="lp-vote-name">
              {rule.name}
              {filled && rule.id === elected ? <span className="lp-tag yellow">Rule of the Round</span> : null}
            </div>
            <p className="lp-vote-desc">{rule.description}</p>
            <div className="lp-bar"><span style={{ width: filled ? `${(rule.total / top) * 100}%` : "0%" }} /></div>
            <div className="lp-vote-meta">
              <span>Proposed by {rule.proposer}</span>
              <span>backed by <b>{rule.total}</b> players</span>
            </div>
          </div>
          <button aria-pressed={backed === rule.id} className="lp-back" onClick={() => onBack(rule.id)} type="button">
            {backed === rule.id ? "Backed" : "▲ Back it"}
          </button>
        </div>
      ))}
    </div>
  );
}

function DrawStep({ draw, onDraw, picks }: { draw: DrawState; onDraw: () => void; picks: readonly number[] }) {
  const matched = draw.phase === "done" ? draw.draw.filter((value) => picks.includes(value)).length : 0;
  const exact = draw.phase === "done" && draw.draw.every((value, index) => picks[index] === value);

  return (
    <>
      <div>
        <span className="lp-mini-label">Your numbers</span>
        <div className="lp-chip-row" style={{ marginTop: 10 }}>
          {picks.map((value) => (
            <span className={`lp-chip ${draw.phase === "done" && draw.draw.includes(value) ? "hit" : "picked"}`} key={value}>{pad(value)}</span>
          ))}
        </div>
      </div>
      <div>
        <span className="lp-mini-label">The draw</span>
        <div aria-live="polite" className="lp-draw-row" style={{ marginTop: 10 }}>
          {draw.phase === "done"
            ? draw.draw.map((value, index) => (
                <span
                  className={`lp-chip ${picks.includes(value) ? "hit" : "drawn"}`}
                  key={value}
                  style={{ animationDelay: `${index * 140}ms` }}
                >
                  {pad(value)}
                </span>
              ))
            : Array.from({ length: PICK_COUNT }, (_, index) => (
                <span aria-hidden="true" className={`lp-chip ${draw.phase === "rolling" ? "rolling" : "empty"}`} key={index} style={{ animationDelay: `${index * 40}ms` }}>
                  ?
                </span>
              ))}
        </div>
      </div>

      {draw.phase === "idle" ? (
        <div>
          <button className="lp-cta" onClick={onDraw} type="button">Draw<Ico.dice /></button>
        </div>
      ) : null}
      {draw.phase === "rolling" ? <p className="lp-panel-hint">Drawing…</p> : null}

      {draw.phase === "done" ? (
        <>
          <div className="lp-results">
            <div className={`lp-result ${exact ? "win" : "lose"}`} style={{ "--delay": "900ms" } as React.CSSProperties}>
              <span className="lp-result-kicker">Original rule</span>
              <span className="lp-result-rule">Exact sequence</span>
              <span className="lp-result-out">{exact ? "Winner" : "No win"}</span>
              <span className="lp-result-note">all {PICK_COUNT} in order</span>
            </div>
            <div className={`lp-result ${matched >= MATCH_THRESHOLD ? "win" : "lose"}`} style={{ "--delay": "1100ms" } as React.CSSProperties}>
              <span className="lp-result-kicker">Rule of the Round</span>
              <span className="lp-result-rule">Match {MATCH_THRESHOLD}+</span>
              <span className="lp-result-out">{matched >= MATCH_THRESHOLD ? "Winner" : "No win"}</span>
              <span className="lp-result-note">{matched} of {PICK_COUNT} matched</span>
            </div>
          </div>
          <p className="lp-same-draw">Same draw. Different ways to win.</p>
        </>
      ) : null}
    </>
  );
}
