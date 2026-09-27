import Image from "next/image";
import Link from "next/link";

import { BRAND_NAME } from "@tyche/config";

import { LandingIcon } from "./LandingIcon";
import { ProductVideo } from "./ProductVideo";
import "./landing.css";

const LOGO_SRC = "/illustrations/logo-deusa-vetorizada.svg?v=goddess-magenta-v1";

const NAVIGATION = [
  ["How it works", "#how"],
  ["Ways to win", "#earn"],
  ["JDR", "#jdr"],
  ["Transparency", "#verify"],
] as const;

const COMPARISON = [
  [
    "Someone with money and lawyers wrote the winning condition once, in fine print, and locked it.",
    "The winning condition is written and elected in public, before every draw.",
  ],
  ["You pick numbers. You wait. You hope.", "You pick numbers. You can also write how winning works."],
  [
    "The house’s edge was never the math — it’s that only the house got to write the rule.",
    "Anyone can write a rule. The community decides which one plays.",
  ],
] as const;

const RULE_CARDS = [
  { name: "Four is enough", text: "Match at least four drawn numbers.", code: "matches ≥ 4" },
  { name: "Same total", text: "Your six numbers add up to the same total as the draw.", code: "sum(guess) = sum(draw)" },
  { name: "Underdog", text: "Every selected number is lower than its drawn counterpart.", code: "guess[i] < draw[i]" },
] as const;

const PILLARS = [
  {
    icon: "edit",
    kicker: "Control",
    title: "Shape how winning works.",
    text: "You’re not stuck with the same winning condition forever, and neither is anyone else.",
  },
  {
    icon: "chat",
    kicker: "Creation, with AI",
    title: "Say it in plain words. The AI makes it real.",
    text: "Write your rule the way you’d say it out loud. The AI reads it, checks it, and turns it into something the game can execute and verify — the same way, every time, for everyone.",
  },
  {
    icon: "shield",
    kicker: "Transparency",
    title: "Know the rule before the result.",
    text: "The official rule is frozen before the draw, and the final result can be verified publicly.",
  },
] as const;

const VERIFY = [
  { icon: "lock", title: "Rules can’t change after the fact.", text: "The official Rule of the Round is frozen before the draw." },
  { icon: "dice", title: "The draw can be verified.", text: "Randomness and results are recorded through publicly verifiable on-chain infrastructure." },
  { icon: "coin", title: "The money can be followed.", text: "Prize pools, fee flows, and relevant distributions can be audited on-chain." },
  { icon: "check", title: "The same rule always gives the same verdict.", text: "Once frozen, the rule is executed deterministically." },
] as const;

const FOOTER = [
  {
    title: "Product",
    links: [["Play", "/play"], ["Current round", "/rounds"], ["Rules", "/rules"], ["Rewards", "/play/rewards"], ["Leaderboard", "/leaderboard"]],
  },
  {
    title: "Learn",
    links: [["How it works", "#how"], ["Ways to win", "#earn"], ["JDR", "#jdr"], ["Transparency", "#verify"]],
  },
  {
    title: "Verify",
    links: [["Round archive", "/rounds"], ["Community rules", "/rules"]],
  },
] as const;

export function LandingPage() {
  return (
    <div className="lp">
      <a className="lp-skip" href="#main">Skip to content</a>
      <div aria-hidden="true" className="lp-halftone" />

      <header className="lp-header">
        <div className="lp-wrap lp-header-row">
          <Link aria-label={`${BRAND_NAME} home`} className="lp-brand" href="/">
            <Image alt="" className="lp-brand-mark" height={34} src={LOGO_SRC} unoptimized width={34} />
            <span className="lp-brand-name">{BRAND_NAME}</span>
          </Link>
          <nav aria-label="Page sections" className="lp-nav">
            {NAVIGATION.map(([label, href]) => <a href={href} key={href}>{label}</a>)}
          </nav>
          <Link className="lp-pill" href="/play">Play now</Link>
        </div>
        <span aria-hidden="true" className="lp-progress" />
      </header>

      <main id="main">
        {/* 01 · Hero */}
        <section aria-labelledby="hero-title" className="lp-hero">
          <div aria-hidden="true" className="lp-rays" />
          <div className="lp-wrap lp-hero-inner">
            <div className="lp-hero-copy">
              <h1 className="lp-h1" id="hero-title">
                <span className="line">Break the bad luck.</span>
                <span className="line">Make your rules.</span>
              </h1>
              <p className="lp-hero-sub">
                Pick your numbers. Write how winning works. Watch the AI turn it into something the game can enforce.
              </p>
              <div className="lp-hero-actions">
                <Link className="lp-cta" href="/play">Play now<LandingIcon name="arrow" /></Link>
                <a className="lp-ghost" href="#how">See how it works ↓</a>
              </div>
              <ul className="lp-hero-proof">
                <li><LandingIcon name="lock" />Rule frozen before the draw</li>
                <li><LandingIcon name="dice" />Verifiable draw</li>
                <li><LandingIcon name="coin" />Traceable money</li>
              </ul>
            </div>
          </div>
        </section>

        {/* 02 · Problem */}
        <section aria-labelledby="problem-title" className="lp-section">
          <div className="lp-wrap">
            <div className="lp-section-head lp-reveal">
              <h2 className="lp-h2" id="problem-title">In every game of chance, someone already decided who wins.</h2>
            </div>
            <div className="lp-compare">
              <div aria-hidden="true" className="lp-compare-head">
                <span>Every other game of chance</span>
                <span>{BRAND_NAME}</span>
              </div>
              {COMPARISON.map(([them, us]) => (
                <div className="lp-compare-row lp-reveal" key={them}>
                  <div className="lp-cell them">
                    <LandingIcon name="close" />
                    <div><span className="lp-cell-label">Every other game of chance</span><p>{them}</p></div>
                  </div>
                  <div className="lp-cell us">
                    <LandingIcon name="check" />
                    <div><span className="lp-cell-label">{BRAND_NAME}</span><p>{us}</p></div>
                  </div>
                </div>
              ))}
            </div>
            <div className="lp-quote lp-reveal">
              <blockquote>The house never needed to load the dice. It just made sure it was the only one holding the pen.</blockquote>
              <p>You still don’t control the draw. But nobody controls the rule alone either — not the house, not a whale, not us.</p>
            </div>
          </div>
        </section>

        {/* 03 · Demo */}
        <section aria-labelledby="how-title" className="lp-section" id="how">
          <div className="lp-wrap">
            <div className="lp-section-head lp-reveal">
              <h2 className="lp-h2" id="how-title">One draw. More than one way to win.</h2>
              <p className="lp-lead">Watch one example round, start to finish. <strong>The AI turns what you wrote into something the game can enforce.</strong></p>
            </div>
            <ProductVideo />
          </div>
        </section>

        {/* 04 · Concept */}
        <section aria-labelledby="concept-title" className="lp-section">
          <div className="lp-wrap">
            <div className="lp-concept">
              <div className="lp-concept-copy lp-reveal">
                <p className="lp-eyebrow">Luck is spread on purpose</p>
                <h2 className="lp-h2" id="concept-title">A deep pocket can’t write every rule. Luck still decides between them.</h2>
                <p className="lp-lead">
                  Every round, several rules compete for the community’s backing. Which one becomes official is decided by votes,
                  not by whoever spent the most. And which sequence wins under that rule is still decided by a public, verifiable
                  draw — money can buy a proposal, it can’t buy the outcome.
                </p>
                <p className="lp-lead">
                  That’s the actual defense against the thing every other game of chance is vulnerable to:{" "}
                  <strong>a small number of large players quietly deciding the terms for everyone else.</strong> Here the terms
                  are public, contested every round, and settled by chance at the end.
                </p>
              </div>
              <div className="lp-rule-cards">
                {RULE_CARDS.map((card) => (
                  <article className="lp-rule-card lp-reveal" key={card.name}>
                    <span className="lp-tag muted">Example rule</span>
                    <h3>{card.name}</h3>
                    <p>{card.text}</p>
                    <code>{card.code}</code>
                  </article>
                ))}
                <Link className="lp-rule-card yours lp-reveal" href="/play/propose">
                  <span className="lp-tag yellow">Your turn</span>
                  <h3>Your rule</h3>
                  <p>Write another way to win.</p>
                  <code>Write it →</code>
                </Link>
              </div>
            </div>
            <p className="lp-closing lp-reveal">
              Luck decides between many rules — not one deep pocket. Every round can become a different game, and no one gets to pick which one alone.
            </p>
          </div>
        </section>

        {/* 05 · Pillars */}
        <section aria-labelledby="pillars-title" className="lp-section">
          <div className="lp-wrap">
            <div className="lp-section-head center lp-reveal">
              <p className="lp-eyebrow">Three pillars</p>
              <h2 className="lp-h2" id="pillars-title">The game is built around you, not around the house.</h2>
            </div>
            <div className="lp-pillars">
              {PILLARS.map((pillar, index) => (
                <article className={`lp-pillar lp-reveal${index === 1 ? " featured" : ""}`} key={pillar.kicker}>
                  <span className="lp-pillar-icon"><LandingIcon name={pillar.icon} /></span>
                  <span className="lp-pillar-kicker">{String(index + 1).padStart(2, "0")} · {pillar.kicker}</span>
                  <h3>{pillar.title}</h3>
                  <p>{pillar.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 06 · Ways to earn */}
        <section aria-labelledby="earn-title" className="lp-section" id="earn">
          <div className="lp-wrap">
            <div className="lp-section-head lp-reveal">
              <p className="lp-eyebrow">Ways to win</p>
              <h2 className="lp-h2" id="earn-title">There’s more than one way to come out ahead.</h2>
            </div>
            <div className="lp-earn">
              <article className="lp-earn-card featured lp-reveal">
                <div className="lp-earn-top"><span className="lp-earn-index">01</span><span className="lp-tag yellow">SOL</span></div>
                <h3>Win the game</h3>
                <p>Qualify under the original rule or the Rule of the Round.</p>
              </article>
              <article className="lp-earn-card lp-reveal">
                <div className="lp-earn-top"><span className="lp-earn-index">02</span><span className="lp-tag">JDR</span></div>
                <h3>Write rules</h3>
                <p>Creating a valid rule can earn JDR while the promotional campaign is active.</p>
                <div className="lp-earn-value">
                  <b>0.6</b>
                  <div><span>JDR</span><small>per confirmed eligible rule proposal</small></div>
                </div>
              </article>
              <article className="lp-earn-card lp-reveal">
                <div className="lp-earn-top"><span className="lp-earn-index">03</span><span className="lp-tag">JDR</span></div>
                <h3>Back ideas</h3>
                <p>Supporting rules can also earn JDR during the campaign.</p>
                <div className="lp-earn-value">
                  <b>0.09</b>
                  <div><span>JDR</span><small>per confirmed eligible support action</small></div>
                </div>
              </article>
              <article className="lp-earn-card lp-reveal">
                <div className="lp-earn-top"><span className="lp-earn-index">04</span><span className="lp-tag magenta">Bonus</span></div>
                <h3>Create the Rule of the Round</h3>
                <p>
                  If your rule becomes active and creates winners, its creator can receive an additional JDR reward, and the
                  players who backed it can share one too.
                </p>
              </article>
            </div>
            <div className="lp-earn-foot">
              <Link className="lp-link" href="/play/rewards">See full reward rules →</Link>
            </div>
          </div>
        </section>

        {/* 07 · JDR */}
        <section aria-labelledby="jdr-title" className="lp-section lp-jdr" id="jdr">
          <div aria-hidden="true" className="lp-rays" />
          <div className="lp-wrap">
            <div className="lp-section-head center lp-reveal">
              <p className="lp-eyebrow">JDR · the {BRAND_NAME} token</p>
              <h2 className="lp-h2" id="jdr-title">The money the game makes goes back to the people playing it.</h2>
              <p className="lp-lead">
                JDR is the token that connects participation to the {BRAND_NAME} economy. It has a fixed supply, it’s earned
                through eligible game activity, and it can be locked to share in the fees the game itself generates.
              </p>
            </div>
            <div className="lp-stats">
              <div className="lp-stat lp-reveal"><span className="lp-stat-value"><b>1</b><i>billion</i></span><span>Maximum JDR supply</span></div>
              <div className="lp-stat lp-reveal"><span className="lp-stat-value"><b>0</b><i>JDR</i></span><span>New JDR that can ever be minted after genesis</span></div>
              <div className="lp-stat lp-reveal"><span className="lp-stat-value"><b>200</b><i>million</i></span><span>Set aside at genesis to pay players during the campaign</span></div>
            </div>
            <ol aria-label="How locking works" className="lp-flow lp-reveal">
              <li><b>Lock JDR</b><span>Commit tokens for a period you choose.</span></li>
              <li aria-hidden="true" className="lp-flow-arrow"><LandingIcon name="arrow" /></li>
              <li><b>The game generates fees</b><span>Fees come from play itself.</span></li>
              <li aria-hidden="true" className="lp-flow-arrow"><LandingIcon name="arrow" /></li>
              <li><b>Your share of the fee pool</b><span>Depends on how much you lock and for how long.</span></li>
            </ol>
            <p className="lp-motto lp-reveal">Players create the economy. <em>Players receive the economy.</em></p>
            <p className="lp-note"><LandingIcon name="info" />JDR does not represent a guaranteed return. No promise of price or token appreciation is made.</p>
          </div>
        </section>

        {/* 08 · Transparency */}
        <section aria-labelledby="verify-title" className="lp-section" id="verify">
          <div className="lp-wrap">
            <div className="lp-section-head lp-reveal">
              <p className="lp-eyebrow">Transparency</p>
              <h2 className="lp-h2" id="verify-title">Don’t trust. Verify.</h2>
            </div>
            <div className="lp-verify">
              {VERIFY.map((block) => (
                <article className="lp-verify-card lp-reveal" key={block.title}>
                  <span className="lp-pillar-icon"><LandingIcon name={block.icon} /></span>
                  <div><h3>{block.title}</h3><p>{block.text}</p></div>
                </article>
              ))}
            </div>
            <div className="lp-verify-foot lp-reveal">
              <p>Public rule. Verifiable draw. Traceable money.</p>
              <Link className="lp-link" href="/rounds">Explore transparency →</Link>
            </div>
          </div>
        </section>

        {/* 09 · Manifesto */}
        <section aria-labelledby="manifesto-title" className="lp-section lp-manifesto">
          <Image alt="" aria-hidden="true" className="lp-manifesto-mark" height={640} src={LOGO_SRC} unoptimized width={640} />
          <div className="lp-wrap lp-reveal">
            <p className="lp-eyebrow">It doesn’t belong to the house</p>
            <h2 className="lp-h2" id="manifesto-title">The game doesn’t belong to the house. It belongs to whoever’s playing it.</h2>
            <div className="lp-manifesto-lines">
              <strong>Your numbers.</strong>
              <strong>Your rule.</strong>
              <strong>Your round.</strong>
            </div>
            <p>
              The AI just makes sure what you wrote can be enforced. Luck still decides who wins.{" "}
              <strong>Nobody — not the house, not a whale, not us — gets to write the rule alone.</strong>
            </p>
            <p>Every round is another chance to rewrite what’s possible.</p>
          </div>
        </section>

        {/* 10 · Final CTA */}
        <section aria-labelledby="final-title" className="lp-section lp-final">
          <div aria-hidden="true" className="lp-rays" />
          <div className="lp-wrap lp-reveal">
            <p className="lp-eyebrow">The next round is waiting</p>
            <h2 className="lp-h1" id="final-title">You write the rule. The house doesn’t.</h2>
            <p className="lp-final-sub">Choose your numbers. Write your way to win.</p>
            <div className="lp-hero-actions">
              <Link className="lp-cta" href="/play">Play {BRAND_NAME}<LandingIcon name="arrow" /></Link>
              <Link className="lp-ghost" href="/rounds">See the current round →</Link>
            </div>
          </div>
        </section>
      </main>

      {/* 11 · Footer */}
      <footer className="lp-footer">
        <div className="lp-wrap">
          <div className="lp-footer-grid">
            <div className="lp-footer-brand">
              <Link aria-label={`${BRAND_NAME} home`} className="lp-brand" href="/">
                <Image alt="" className="lp-brand-mark" height={34} src={LOGO_SRC} unoptimized width={34} />
                <span className="lp-brand-name">{BRAND_NAME}</span>
              </Link>
              <p>You write the rule. Not the house.</p>
            </div>
            {FOOTER.map((column) => (
              <nav aria-label={column.title} key={column.title}>
                <h2>{column.title}</h2>
                <ul>
                  {column.links.map(([label, href]) => (
                    <li key={label}>{href.startsWith("#") ? <a href={href}>{label}</a> : <Link href={href}>{label}</Link>}</li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
          <div className="lp-legal">
            Adults only. Availability subject to jurisdiction and eligibility. JDR does not represent a guaranteed return.
            Promotional campaigns depend on eligibility and available reserve. No promise of price or token appreciation is made
            anywhere on this page.
            <small>© {BRAND_NAME}</small>
          </div>
        </div>
      </footer>
    </div>
  );
}
