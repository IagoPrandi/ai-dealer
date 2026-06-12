"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Clock3,
  Home,
  Plus,
  Send,
  Sparkles,
  Trophy,
  UserRound,
  Users,
  Vote,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { IDEALER_ACTIVE_TURN_ID } from "../../solana/idealerProgram";

type AppScreen = "result" | "home" | "account";
const API_BASE_URL =
  process.env.NEXT_PUBLIC_IDEALER_API_URL ?? "http://localhost:3002";

interface Rule {
  id: string;
  title: string;
  summary: string;
  votes: number;
  creator: string;
  explanation: string;
}

interface ApiRuleProposal {
  proposer: string;
  ruleId: number;
  sanitizedText: string;
  title?: string;
}

const defaultRules: readonly Rule[] = [
  {
    id: "even-sum",
    title: "Closest even sum",
    summary: "The guess with the closest even total to the drawn total wins.",
    votes: 240,
    creator: "@luna.sol",
    explanation:
      "Every eligible guess is totaled. Only even totals qualify, and the closest total wins.",
  },
  {
    id: "highest-odd",
    title: "Highest odd wins",
    summary: "The guess containing the highest drawn odd number wins.",
    votes: 198,
    creator: "@oddball",
    explanation:
      "The highest odd number in the draw decides which eligible guess wins.",
  },
  {
    id: "perfect-mirror",
    title: "Perfect mirror",
    summary: "The most symmetrical number sequence wins.",
    votes: 165,
    creator: "@vrf.king",
    explanation:
      "Each guess is compared forward and backward. The most symmetrical sequence wins.",
  },
  {
    id: "underdog",
    title: "The underdog",
    summary: "The guess matching the fewest drawn numbers wins.",
    votes: 121,
    creator: "@reverse",
    explanation:
      "This rule reverses the usual objective: the fewest matching numbers wins.",
  },
  {
    id: "seven-club",
    title: "Seven club",
    summary: "The guess with the most multiples of seven wins.",
    votes: 96,
    creator: "@seven",
    explanation:
      "Multiples of seven are counted in each eligible guess. The highest count wins.",
  },
] as const;

const drawnNumbers = [7, 18, 23, 41, 49, 56] as const;

function formatCountdown(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds].map((value) =>
    value.toString().padStart(2, "0"),
  );
}

function useCountdown(initialSeconds: number) {
  const [remainingSeconds, setRemainingSeconds] = useState(initialSeconds);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRemainingSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  return formatCountdown(remainingSeconds);
}

function PhoneChrome() {
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

function Dealer({ size = 38 }: { size?: number }) {
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

function ScreenHeader({
  onBack,
  title,
}: {
  onBack: () => void;
  title: string;
}) {
  return (
    <div className="platform-screen-header">
      <button aria-label="Back to current round" onClick={onBack} type="button">
        <ArrowLeft aria-hidden="true" size={22} />
      </button>
      <h1>{title}</h1>
    </div>
  );
}

function Confetti() {
  return (
    <div className="platform-confetti" aria-hidden="true">
      {Array.from({ length: 18 }, (_, index) => (
        <i key={index} />
      ))}
    </div>
  );
}

function ResultScreen({ goHome }: { goHome: () => void }) {
  const maxVotes = defaultRules[0]?.votes ?? 1;

  return (
    <section className="platform-screen platform-result-screen">
      <Confetti />
      <div className="platform-scroll">
        <ScreenHeader onBack={goHome} title="Result" />

        <article className="platform-win-card">
          <span className="platform-trophy-emoji" aria-hidden="true">
            🏆
          </span>
          <span>You won!</span>
          <h2>
            +0.92 <small>SOL</small>
          </h2>
          <p>Already credited · available to withdraw</p>
          <button type="button">
            <ArrowDownToLine aria-hidden="true" size={18} />
            Withdraw funds
          </button>
        </article>

        <div className="platform-result-meta">
          <strong>TURN #0007</strong>
          <span>
            <Users aria-hidden="true" size={14} />
            1,102 players
          </span>
        </div>

        <article className="platform-reference-card">
          <p className="platform-section-label">Drawn numbers</p>
          <ol className="platform-drawn-numbers">
            {drawnNumbers.map((number) => (
              <li key={number}>{number}</li>
            ))}
          </ol>
        </article>

        <p className="platform-section-label platform-outside-label">
          Selected rule
        </p>
        <article className="platform-winning-rule">
          <div>
            <span>
              <Trophy aria-hidden="true" size={17} />
            </span>
            <h2>{defaultRules[0]?.title}</h2>
          </div>
          <p>{defaultRules[0]?.summary}</p>
          <footer>
            <strong>
              <Vote aria-hidden="true" size={14} />
              {defaultRules[0]?.votes} votes
            </strong>
            <span>by {defaultRules[0]?.creator}</span>
          </footer>
        </article>

        <p className="platform-section-label platform-outside-label">
          Rules entered in the draw
        </p>
        <div className="platform-result-rule-list">
          {defaultRules.map((rule, index) => {
            const percent = Math.round((rule.votes / maxVotes) * 100);
            return (
              <article className={index === 0 ? "winner" : ""} key={rule.id}>
                <i style={{ width: `${percent}%` }} />
                <span>{index + 1}</span>
                <strong>{rule.title}</strong>
                {index === 0 ? <Trophy aria-hidden="true" size={14} /> : null}
                <b>{rule.votes}</b>
              </article>
            );
          })}
        </div>

        <button
          className="platform-ghost-button"
          onClick={goHome}
          type="button"
        >
          <Zap aria-hidden="true" size={17} />
          Back to current round
        </button>
      </div>
    </section>
  );
}

function RuleDetail({
  onClose,
  rank,
  rule,
}: {
  onClose: () => void;
  rank: number;
  rule: Rule;
}) {
  return (
    <div
      className="platform-rule-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <section
        aria-labelledby="platform-rule-title"
        aria-modal="true"
        className="platform-rule-sheet"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="platform-rule-handle" />
        <header>
          <strong>{rank}</strong>
          <span>
            <Vote aria-hidden="true" size={14} /> {rule.votes} votes
          </span>
          <button
            aria-label="Close rule details"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <h2 id="platform-rule-title">{rule.title}</h2>
        <p>{rule.summary}</p>
        <h3>How it works</h3>
        <p>{rule.explanation}</p>
        <div className="platform-rule-detail-grid">
          <span>
            <small>Created by</small>
            <strong>{rule.creator}</strong>
          </span>
          <span>
            <small>Creator reward</small>
            <strong>15% reserve-funded</strong>
          </span>
        </div>
      </section>
    </div>
  );
}

function HomeScreen({
  goAccount,
  goResult,
}: {
  goAccount: () => void;
  goResult: () => void;
}) {
  const [hours, minutes, seconds] = useCountdown(1 * 3600 + 47 * 60 + 12);
  const [expanded, setExpanded] = useState(false);
  const [activeRule, setActiveRule] = useState<Rule | null>(null);
  const [rules, setRules] = useState<Rule[]>(() => [...defaultRules]);
  const visibleRules = expanded ? rules : rules.slice(0, 3);
  const maxVotes = rules[0]?.votes ?? 1;

  useEffect(() => {
    const controller = new AbortController();

    void fetch(
      `${API_BASE_URL}/rule-proposals?turnId=${IDEALER_ACTIVE_TURN_ID}`,
      { signal: controller.signal },
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Rule feed returned HTTP ${response.status}.`);
        }
        return response.json() as Promise<{ proposals?: ApiRuleProposal[] }>;
      })
      .then((body) => {
        const apiRules = (body.proposals ?? []).map((proposal, index) => ({
          creator: `${proposal.proposer.slice(0, 5)}...${proposal.proposer.slice(-5)}`,
          explanation:
            "This devnet proposal passed server preflight and was committed on-chain.",
          id: `devnet-${proposal.ruleId}`,
          summary: proposal.sanitizedText,
          title: proposal.title ?? `Rule #${proposal.ruleId}`,
          votes: Math.max(1, 80 - index * 3),
        }));

        if (apiRules.length > 0) {
          setRules([...apiRules, ...defaultRules]);
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        console.error("Failed to load devnet rule proposals.", error);
      });

    return () => controller.abort();
  }, []);

  return (
    <section className="platform-screen platform-home-screen">
      <div className="platform-ambient" />
      <div className="platform-scroll">
        <header className="platform-topbar">
          <span>
            <Dealer size={34} />
            <strong>Idealer</strong>
          </span>
          <Link href="/play/wallet">
            <Wallet aria-hidden="true" size={17} />
            Connect
          </Link>
        </header>

        <button
          className="platform-last-result"
          onClick={goResult}
          type="button"
        >
          <span>Result · TURN #0007</span>
          <ArrowRight aria-hidden="true" size={18} />
          <i>
            <Trophy aria-hidden="true" size={21} />
          </i>
          <b>
            <strong>
              You won <em>+0.92 SOL</em>
            </strong>
            <small>
              Rule <b>Closest even sum</b> won · 1,102 players
            </small>
          </b>
        </button>

        <section
          className="platform-prize-hero"
          aria-labelledby="platform-prize-title"
        >
          <div className="platform-prize-glow" />
          <span className="platform-pill">
            <Clock3 aria-hidden="true" size={14} />
            Ends in{" "}
            <strong>
              {hours}:{minutes}:{seconds}
            </strong>
          </span>
          <p>Accumulated prize</p>
          <h1 id="platform-prize-title">
            <strong>24</strong>
            <b>.86</b>
            <small>SOL</small>
          </h1>
          <footer>
            <span className="platform-pill">
              <Users aria-hidden="true" size={14} /> 1,284 playing
            </span>
            <span className="platform-pill">
              <Sparkles aria-hidden="true" size={14} /> 13 rules
            </span>
          </footer>
        </section>

        <Link className="platform-primary-button" href="/play/pick">
          <Zap aria-hidden="true" size={18} />
          Play now · 0.01 SOL
        </Link>

        <article className="platform-prompt-card">
          <header>
            <span className="platform-chat-avatar" aria-hidden="true">
              <Dealer size={30} />
            </span>
            <div>
              <strong>Dealer chat</strong>
              <small>Cost 0.02 SOL</small>
            </div>
            <em>
              <Sparkles aria-hidden="true" size={12} /> AI rule
            </em>
          </header>
          <div>
            <input
              aria-label="Rule idea"
              placeholder="Write a free-form rule idea..."
            />
            <Link aria-label="Create rule" href="/play/propose">
              <Send aria-hidden="true" size={19} />
            </Link>
          </div>
        </article>

        <header className="platform-rules-heading">
          <h2>The rules</h2>
          <span>most voted</span>
        </header>

        <div className="platform-vote-bars">
          {visibleRules.map((rule, index) => {
            const percent = Math.round((rule.votes / maxVotes) * 100);
            return (
              <button
                key={rule.id}
                onClick={() => setActiveRule(rule)}
                type="button"
              >
                <i style={{ width: `${percent}%` }} />
                <span>{index + 1}</span>
                <b>
                  <strong>{rule.title}</strong>
                  <small>{rule.summary}</small>
                </b>
                <em>
                  <strong>{rule.votes}</strong>
                  <small>{percent}%</small>
                </em>
              </button>
            );
          })}
        </div>

        <button
          className="platform-ghost-button"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          {expanded ? "Collapse rules" : `View all ${rules.length} rules`}
          <ChevronDown
            aria-hidden="true"
            className={expanded ? "up" : ""}
            size={18}
          />
        </button>
      </div>

      <nav className="platform-nav" aria-label="Primary navigation">
        <button className="active" type="button">
          <Home aria-hidden="true" size={21} />
          Round
        </button>
        <Link aria-label="Create rule" href="/play/propose">
          <Plus aria-hidden="true" size={25} />
        </Link>
        <button onClick={goAccount} type="button">
          <UserRound aria-hidden="true" size={21} />
          Account
        </button>
      </nav>

      {activeRule ? (
        <RuleDetail
          onClose={() => setActiveRule(null)}
          rank={rules.findIndex((rule) => rule.id === activeRule.id) + 1}
          rule={activeRule}
        />
      ) : null}
    </section>
  );
}

function AccountScreen({
  goHome,
  goResult,
}: {
  goHome: () => void;
  goResult: () => void;
}) {
  return (
    <section className="platform-screen platform-account-screen">
      <div className="platform-ambient" />
      <div className="platform-scroll">
        <ScreenHeader onBack={goHome} title="My account" />
        <div className="platform-account-identity">
          <span>V</span>
          <div>
            <strong>@you.sol</strong>
            <small>4sF9k2…aQ7x</small>
          </div>
        </div>
        <button
          className="platform-account-result"
          onClick={goResult}
          type="button"
        >
          <Trophy aria-hidden="true" size={22} />
          <span>
            <strong>You won TURN #0007</strong>
            <small>+0.92 SOL · tap to see the result</small>
          </span>
          <ArrowRight aria-hidden="true" size={18} />
        </button>
        <article className="platform-balance-card">
          <p>Available to withdraw</p>
          <h2>
            0.92 <small>SOL</small>
          </h2>
          <button type="button">
            <ArrowDownToLine aria-hidden="true" size={18} />
            Withdraw to wallet
          </button>
        </article>
        <div className="platform-account-stats">
          <article>
            <Sparkles aria-hidden="true" size={18} />
            <strong>3</strong>
            <span>rules created</span>
          </article>
          <article>
            <Trophy aria-hidden="true" size={18} />
            <strong>6.21 SOL</strong>
            <span>total received</span>
          </article>
        </div>
        <Link className="platform-ghost-button" href="/play/wallet">
          <Wallet aria-hidden="true" size={17} />
          Manage connected wallet
        </Link>
      </div>
      <nav className="platform-nav" aria-label="Primary navigation">
        <button onClick={goHome} type="button">
          <Home aria-hidden="true" size={21} />
          Round
        </button>
        <Link aria-label="Create rule" href="/play/propose">
          <Plus aria-hidden="true" size={25} />
        </Link>
        <button className="active" type="button">
          <UserRound aria-hidden="true" size={21} />
          Account
        </button>
      </nav>
    </section>
  );
}

export function MobileLiveRoundHub() {
  const [screen, setScreen] = useState<AppScreen>("result");

  return (
    <main className="platform-stage">
      <div className="platform-phone-shell">
        <PhoneChrome />
        {screen === "result" ? (
          <ResultScreen goHome={() => setScreen("home")} />
        ) : null}
        {screen === "home" ? (
          <HomeScreen
            goAccount={() => setScreen("account")}
            goResult={() => setScreen("result")}
          />
        ) : null}
        {screen === "account" ? (
          <AccountScreen
            goHome={() => setScreen("home")}
            goResult={() => setScreen("result")}
          />
        ) : null}
      </div>
    </main>
  );
}
