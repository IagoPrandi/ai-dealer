"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { address } from "@solana/kit";
import { RULE_MAX_TOKENS } from "@idealer/constants";
import { useSolanaClient, useWalletConnection } from "@solana/react-hooks";
import {
  deriveRoundAccounts,
  deriveSubmitGuessAccounts,
  IDEALER_PROGRAM_ID,
} from "../../solana/idealerProgram";

interface RoundRuleSummary {
  compiledArtifactHash: string | null;
  precompilationStatus: "failed" | "passed" | "pending";
  proposer: string;
  ruleId: number;
  ruleProposal: string;
  sanitizedText: string;
  state: "eligible" | "invalidated" | "proposed";
  title: string;
  tokenCount: number;
  validation: {
    decision: "INVALID" | "VALID";
    finalConfidence: number;
    model: string;
    reasonCodes: string[];
    reasonSummary: string;
    validatedAt: string;
    validationLogId: string;
  } | null;
  votes: number;
}

interface DrawSummary {
  drawResult: number[] | null;
  drawnAt: string | null;
  failureCode: number | null;
  randomnessAccount: string;
  randomnessSource: string | null;
  randomnessValue: string | null;
  requestedAt: string;
  settleSignature: string | null;
  status: "failed" | "fulfilled" | "requested";
  turnId: number;
}

interface RoundSummary {
  cycle: {
    durationHours: number;
    nextDurationHours: number;
    pattern: number[];
    stepIndex: number;
  };
  draw: DrawSummary | null;
  election: {
    activeRuleArtifactHash: string | null;
    activeRuleHash: string | null;
    activeRuleId: number | null;
    electedFinalistIndex: number;
    eligibleRuleIds: number[];
    eligibleRulePoolHash: string;
    finalistRuleIds: number[];
    finalistSetHash: string;
    randomFinalistHash: string;
    randomRuleIds: number[];
    randomnessAccount: string | null;
    randomnessSource: string | null;
    randomnessValue: string | null;
    requestedAt: string | null;
    settledAt: string | null;
    status: "locked" | "original_only" | "requested" | "settled";
    topVotedFinalistHash: string;
    topVotedRuleIds: number[];
  } | null;
  pool: {
    guessSol: number;
    guesses: number;
    indicativeSol: number;
    proposalSol: number;
    proposals: number;
  };
  rules: RoundRuleSummary[];
  status: "completed" | "current" | "upcoming";
  totalVotes: number;
  turnId: number;
}

interface GuessReceiptResponse {
  receipt?: {
    numbers: number[];
    signature: string;
    submittedAt: string;
  };
}

type LoadState = "loading" | "ready" | "error";
type GuessState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "missing" }
  | { status: "onchain" }
  | { status: "found"; numbers: number[]; signature: string }
  | { status: "error"; message: string };

const API_BASE_URL =
  process.env.NEXT_PUBLIC_IDEALER_API_URL ?? "http://localhost:3002";
const EXPLORER_BASE = "https://explorer.solana.com/address";
const STATUS_COPY: Record<RoundSummary["status"], string> = {
  completed: "This round is closed. Its rules, votes, and audit links stay available after rollover.",
  current: "This round is live. Numbers, rules, and votes update from indexed devnet state.",
  upcoming: "This round has not opened yet. It will accept guesses and rules once the cycle reaches it.",
};
const STATUS_LABEL: Record<RoundSummary["status"], string> = {
  completed: "Completed",
  current: "Live",
  upcoming: "Upcoming",
};

function formatTurnLabel(turnId: number) {
  return `TURN-${turnId.toString().padStart(4, "0")}`;
}

function truncateAddress(value: string) {
  return `${value.slice(0, 5)}...${value.slice(-5)}`;
}

function truncateHash(value: string) {
  return `${value.slice(0, 8)}...${value.slice(-8)}`;
}

function explorerLink(value: string) {
  return `${EXPLORER_BASE}/${value}?cluster=devnet`;
}

export function RoundPage({ turnId: rawTurnId }: { turnId: string }) {
  const client = useSolanaClient();
  const { connected, wallet } = useWalletConnection();
  const turnId = Number(rawTurnId);
  const isValidTurnId = Number.isInteger(turnId) && turnId > 0;

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [round, setRound] = useState<RoundSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [auditAddresses, setAuditAddresses] = useState<{
    prizeVault: string;
    turnState: string;
  } | null>(null);
  const [onChainPoolSol, setOnChainPoolSol] = useState<number | null>(null);
  const [onChainPoolError, setOnChainPoolError] = useState(false);
  const [guess, setGuess] = useState<GuessState>({ status: "idle" });
  const [linkCopied, setLinkCopied] = useState(false);

  const walletAddress = wallet?.account.address.toString();

  useEffect(() => {
    if (!isValidTurnId) {
      setLoadState("error");
      setLoadError("This round link is not a valid turn id.");
      return;
    }

    const controller = new AbortController();
    setLoadState("loading");

    void fetch(`${API_BASE_URL}/rounds/${turnId}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Round API returned HTTP ${response.status}.`);
        }
        const body = (await response.json()) as { round?: RoundSummary };
        if (!body.round) {
          throw new Error("Round API response did not include round data.");
        }
        setRound(body.round);
        setLoadState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setLoadError(
          error instanceof Error ? error.message : "Could not load round.",
        );
        setLoadState("error");
      });

    return () => controller.abort();
  }, [isValidTurnId, turnId]);

  useEffect(() => {
    if (!isValidTurnId) {
      return;
    }

    let active = true;

    void deriveRoundAccounts({ turnId }).then((accounts) => {
      if (!active) {
        return;
      }
      setAuditAddresses({
        prizeVault: accounts.prizeVault.toString(),
        turnState: accounts.turnState.toString(),
      });

      void client.runtime.rpc
        .getBalance(accounts.prizeVault, { commitment: "confirmed" })
        .send()
        .then((balance) => {
          if (!active) {
            return;
          }
          setOnChainPoolSol(Number(balance.value) / 1_000_000_000);
        })
        .catch(() => {
          if (active) {
            setOnChainPoolError(true);
          }
        });
    });

    return () => {
      active = false;
    };
  }, [client, isValidTurnId, turnId]);

  useEffect(() => {
    if (!isValidTurnId || !connected || !walletAddress) {
      setGuess({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    setGuess({ status: "loading" });

    void (async () => {
      try {
        const player = address(walletAddress);
        const accounts = await deriveSubmitGuessAccounts({ player, turnId });
        const onChainGuess = await client.runtime.rpc
          .getAccountInfo(accounts.playerGuess, {
            commitment: "confirmed",
            encoding: "base64",
          })
          .send();

        const response = await fetch(
          `${API_BASE_URL}/guess-receipts?turnId=${turnId}&player=${walletAddress}`,
          { signal: controller.signal },
        );

        if (response.ok) {
          const body = (await response.json()) as GuessReceiptResponse;
          if (body.receipt) {
            setGuess({
              numbers: body.receipt.numbers,
              signature: body.receipt.signature,
              status: "found",
            });
            return;
          }
        }

        setGuess(onChainGuess.value ? { status: "onchain" } : { status: "missing" });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setGuess({
          message:
            error instanceof Error
              ? error.message
              : "Could not load your guess for this round.",
          status: "error",
        });
      }
    })();

    return () => controller.abort();
  }, [client, connected, isValidTurnId, turnId, walletAddress]);

  const leadingRule = useMemo(() => {
    if (!round || round.rules.length === 0) {
      return null;
    }
    return round.rules.reduce((leader, rule) =>
      rule.votes > leader.votes ? rule : leader,
    );
  }, [round]);

  async function copyRoundLink() {
    if (typeof window === "undefined") {
      return;
    }
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2_000);
    } catch {
      setLinkCopied(false);
    }
  }

  return (
    <main className="voting-shell round-shell">
      <header className="picker-header">
        <Link className="back-link" href="/play">
          Live round
        </Link>
        <div className="voting-header-copy">
          <div>
            <p className="eyebrow">Public round</p>
            <strong>{isValidTurnId ? formatTurnLabel(turnId) : "Round"}</strong>
          </div>
          {round ? (
            <div className="voting-countdown">
              <span>Status</span>
              <strong className="numeric">{STATUS_LABEL[round.status]}</strong>
            </div>
          ) : null}
        </div>
      </header>

      {loadState === "loading" ? (
        <div className="voting-content">
          <article className="guess-status-card idle" aria-live="polite">
            <strong>Loading round</strong>
            <p>Reading indexed devnet state for {formatTurnLabel(turnId)}.</p>
          </article>
        </div>
      ) : null}

      {loadState === "error" ? (
        <div className="voting-content">
          <article className="guess-status-card failed" role="alert">
            <strong>Round unavailable</strong>
            <p>{loadError ?? "Could not load this round."}</p>
            <Link className="vote-action" href="/play">
              Back to live round
            </Link>
          </article>
        </div>
      ) : null}

      {loadState === "ready" && round ? (
        <div className="voting-content">
          <section className="voting-summary round-summary">
            <div>
              <p className="eyebrow">Turn</p>
              <h1>{formatTurnLabel(round.turnId)}</h1>
              <p>{STATUS_COPY[round.status]}</p>
            </div>
            <dl className="round-stat-grid">
              <div>
                <dt>Cycle step</dt>
                <dd>
                  {round.cycle.stepIndex + 1} of {round.cycle.pattern.length}
                </dd>
              </div>
              <div>
                <dt>Turn duration</dt>
                <dd>{round.cycle.durationHours}h</dd>
              </div>
              <div>
                <dt>Next duration</dt>
                <dd>{round.cycle.nextDurationHours}h</dd>
              </div>
              <div>
                <dt>Cycle pattern</dt>
                <dd>{round.cycle.pattern.map((hours) => `${hours}h`).join(" -> ")}</dd>
              </div>
            </dl>
          </section>

          <section className="voting-summary round-pool">
            <div>
              <p className="eyebrow">Prize pool</p>
              <h1>
                {onChainPoolSol !== null
                  ? `${onChainPoolSol.toFixed(4)} SOL`
                  : `${round.pool.indicativeSol.toFixed(4)} SOL`}
              </h1>
              <p>
                {onChainPoolSol !== null
                  ? "On-chain prize vault balance read live from devnet."
                  : onChainPoolError
                    ? "On-chain prize vault balance is unavailable; showing the indicative pool from indexed devnet fees."
                    : "Indicative pool derived from indexed devnet fees while the on-chain balance loads."}
              </p>
            </div>
            <dl className="round-stat-grid">
              <div>
                <dt>Indicative (indexed fees)</dt>
                <dd>{round.pool.indicativeSol.toFixed(4)} SOL</dd>
              </div>
              <div>
                <dt>Guesses</dt>
                <dd>{round.pool.guesses}</dd>
              </div>
              <div>
                <dt>Proposals</dt>
                <dd>{round.pool.proposals}</dd>
              </div>
              <div>
                <dt>Total votes</dt>
                <dd>{round.totalVotes}</dd>
              </div>
            </dl>
          </section>

          <article
            className={`guess-status-card ${
              guess.status === "found" || guess.status === "onchain"
                ? "confirmed"
                : guess.status === "error"
                  ? "failed"
                  : "idle"
            }`}
            aria-live="polite"
          >
            <strong>Your guess</strong>
            {guess.status === "idle" ? (
              <p>Connect a devnet wallet to see your guess for this round.</p>
            ) : null}
            {guess.status === "loading" ? (
              <p>Checking your on-chain guess for {formatTurnLabel(turnId)}.</p>
            ) : null}
            {guess.status === "missing" ? (
              <p>No guess submitted from this wallet for this round.</p>
            ) : null}
            {guess.status === "onchain" ? (
              <p>
                A guess account exists on-chain for this wallet, but its numbers
                are not indexed for this round.
              </p>
            ) : null}
            {guess.status === "found" ? (
              <>
                <p>Submitted numbers: {guess.numbers.join(", ")}</p>
                {guess.signature ? (
                  <a
                    href={`https://explorer.solana.com/tx/${guess.signature}?cluster=devnet`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    View submission transaction
                  </a>
                ) : null}
              </>
            ) : null}
            {guess.status === "error" ? <p>{guess.message}</p> : null}
            {!connected ? (
              <Link className="vote-action" href="/play/wallet">
                Connect wallet
              </Link>
            ) : null}
          </article>

          <section className="voting-summary round-draw">
            <p className="eyebrow">Draw &amp; result</p>
            {round.draw === null ? (
              <>
                <h2>Draw not available yet</h2>
                <p>
                  This round has no published draw. The verifiable draw is
                  requested once the turn ends.
                </p>
              </>
            ) : null}

            {round.draw?.status === "requested" ? (
              <>
                <h2>Draw requested</h2>
                <p>
                  Waiting for verifiable randomness to be revealed. Drawn
                  numbers appear here once the draw is settled on-chain.
                </p>
                <dl className="round-stat-grid">
                  <div>
                    <dt>Randomness account</dt>
                    <dd>
                      <a
                        href={explorerLink(round.draw.randomnessAccount)}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {truncateAddress(round.draw.randomnessAccount)}
                      </a>
                    </dd>
                  </div>
                </dl>
              </>
            ) : null}

            {round.draw?.status === "failed" ? (
              <>
                <h2>Draw failed</h2>
                <p>
                  The randomness request failed (code {round.draw.failureCode}).
                  A new draw can be requested without affecting guesses, rules,
                  or the prize pool.
                </p>
              </>
            ) : null}

            {round.draw?.status === "fulfilled" && round.draw.drawResult ? (
              <>
                <h2>Drawn numbers</h2>
                <ol className="round-draw-numbers">
                  {round.draw.drawResult.map((number, index) => (
                    <li key={`${number}-${index}`}>{number}</li>
                  ))}
                </ol>
                <dl className="round-stat-grid">
                  <div>
                    <dt>Randomness source</dt>
                    <dd>
                      {round.draw.randomnessSource ? (
                        <a
                          href={explorerLink(round.draw.randomnessSource)}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {truncateAddress(round.draw.randomnessSource)}
                        </a>
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Settle transaction</dt>
                    <dd>
                      {round.draw.settleSignature ? (
                        <a
                          href={`https://explorer.solana.com/tx/${round.draw.settleSignature}?cluster=devnet`}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {truncateAddress(round.draw.settleSignature)}
                        </a>
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                </dl>
                {round.draw.randomnessValue ? (
                  <p className="round-draw-proof">
                    Randomness proof: <code>{round.draw.randomnessValue}</code>
                  </p>
                ) : null}
              </>
            ) : null}
          </section>

          <section className="voting-summary round-election">
            <p className="eyebrow">Rule election</p>
            {round.election === null ? (
              <>
                <h2>Election not locked yet</h2>
                <p>
                  Eligible rules are locked at the election cutoff after
                  precompilation. The audit record appears here once the worker
                  publishes it.
                </p>
              </>
            ) : (
              <>
                <h2>
                  {round.election.status === "settled"
                    ? "Rule of the Hour settled"
                    : round.election.status === "original_only"
                      ? "Original-only turn"
                      : round.election.status === "requested"
                        ? "Election randomness requested"
                        : "Eligible pool locked"}
                </h2>
                <p>
                  {round.election.activeRuleId
                    ? `Active alternative rule: #${round.election.activeRuleId}.`
                    : "No active alternative rule was elected for this turn."}
                </p>
                <dl className="round-stat-grid">
                  <div>
                    <dt>Top finalists</dt>
                    <dd>
                      {round.election.topVotedRuleIds.length > 0
                        ? round.election.topVotedRuleIds
                            .map((ruleId) => `#${ruleId}`)
                            .join(", ")
                        : "None"}
                    </dd>
                  </div>
                  <div>
                    <dt>Random finalists</dt>
                    <dd>
                      {round.election.randomRuleIds.length > 0
                        ? round.election.randomRuleIds
                            .map((ruleId) => `#${ruleId}`)
                            .join(", ")
                        : "None"}
                    </dd>
                  </div>
                  <div>
                    <dt>Finalist set hash</dt>
                    <dd>
                      <code>{truncateHash(round.election.finalistSetHash)}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Eligible pool hash</dt>
                    <dd>
                      <code>
                        {truncateHash(round.election.eligibleRulePoolHash)}
                      </code>
                    </dd>
                  </div>
                  <div>
                    <dt>Randomness source</dt>
                    <dd>
                      {round.election.randomnessSource ? (
                        <a
                          href={explorerLink(round.election.randomnessSource)}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {truncateAddress(round.election.randomnessSource)}
                        </a>
                      ) : round.election.randomnessAccount ? (
                        <a
                          href={explorerLink(round.election.randomnessAccount)}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {truncateAddress(round.election.randomnessAccount)}
                        </a>
                      ) : (
                        "Pending"
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Elected finalist index</dt>
                    <dd>{round.election.electedFinalistIndex}</dd>
                  </div>
                </dl>
              </>
            )}
          </section>

          <section className="rule-voting-list" aria-label="Round rules">
            {round.rules.length === 0 ? (
              <article className="voting-rule-card">
                <p className="rule-explanation">
                  No rules were indexed for this round yet.
                </p>
              </article>
            ) : (
              round.rules.map((rule) => {
                const isLeading = leadingRule?.ruleId === rule.ruleId;
                return (
                  <article
                    aria-labelledby={`round-rule-${rule.ruleId}`}
                    className={
                      isLeading ? "voting-rule-card leading" : "voting-rule-card"
                    }
                    key={rule.ruleId}
                  >
                    <div className="voting-card-heading">
                      <div>
                        <p className="eyebrow">
                          {isLeading ? "Leading rule" : "Proposed rule"}
                        </p>
                        <h2 id={`round-rule-${rule.ruleId}`}>{rule.title}</h2>
                      </div>
                      <strong className="vote-total">{rule.votes} votes</strong>
                    </div>
                    <p className="rule-original-text">"{rule.sanitizedText}"</p>
                    <dl className="rule-metadata">
                      <div>
                        <dt>Status</dt>
                        <dd>{rule.state}</dd>
                      </div>
                      <div>
                        <dt>Precompile</dt>
                        <dd>{rule.precompilationStatus}</dd>
                      </div>
                      <div>
                        <dt>Validation</dt>
                        <dd>
                          {rule.validation
                            ? `${rule.validation.decision} (${Math.round(
                                rule.validation.finalConfidence * 100,
                              )}%)`
                            : "Pending"}
                        </dd>
                      </div>
                      <div>
                        <dt>Creator</dt>
                        <dd>{truncateAddress(rule.proposer)}</dd>
                      </div>
                      <div>
                        <dt>Tokens</dt>
                        <dd>{rule.tokenCount}/{RULE_MAX_TOKENS}</dd>
                      </div>
                      <div>
                        <dt>Account</dt>
                        <dd>
                          <a
                            href={explorerLink(rule.ruleProposal)}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {truncateAddress(rule.ruleProposal)}
                          </a>
                        </dd>
                      </div>
                    </dl>
                    {rule.validation ? (
                      <p className="rule-explanation">
                        {rule.validation.reasonSummary}
                      </p>
                    ) : null}
                  </article>
                );
              })
            )}
          </section>

          <section className="voting-summary round-audit">
            <p className="eyebrow">Audit</p>
            <h2>On-chain references</h2>
            <ul className="round-audit-list">
              <li>
                <span>Program</span>
                <a
                  href={explorerLink(IDEALER_PROGRAM_ID.toString())}
                  rel="noreferrer"
                  target="_blank"
                >
                  {truncateAddress(IDEALER_PROGRAM_ID.toString())}
                </a>
              </li>
              <li>
                <span>Turn state</span>
                {auditAddresses ? (
                  <a
                    href={explorerLink(auditAddresses.turnState)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {truncateAddress(auditAddresses.turnState)}
                  </a>
                ) : (
                  <span>Deriving...</span>
                )}
              </li>
              <li>
                <span>Prize vault</span>
                {auditAddresses ? (
                  <a
                    href={explorerLink(auditAddresses.prizeVault)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {truncateAddress(auditAddresses.prizeVault)}
                  </a>
                ) : (
                  <span>Deriving...</span>
                )}
              </li>
            </ul>
          </section>

          <button
            className="primary-action round-share-button"
            onClick={copyRoundLink}
            type="button"
          >
            {linkCopied ? "Round link copied" : "Copy round link"}
          </button>
        </div>
      ) : null}
    </main>
  );
}
