# Tyche — Channels, Cadence and Content Calendar (Weeks 1–8)

> **Version:** 1.1.0
> **Status:** Adopted — operational plan derived from the confirmed narrative. Revised on 2026-08-09 to carry the mythic register.
> **Last updated:** 2026-08-09
> **Narrative source:** [narrative-a-messaging.md](narrative-a-messaging.md) — every piece below inherits its guardrails, including the mythic register (§3.1) and its limits (§4.7)
> **Stage assumption:** weeks 1–4 pre-launch (product closed); weeks 5–8 launch and live rounds
> **Language:** English only, all channels
> **Budget:** zero paid media, zero paid creators, zero compensated posts — by requirement and by platform policy

---

## 1. Constraints that shaped this plan

Three external facts rule out the default "token-funded social campaign" playbook:

| Finding | Date | Consequence |
|---|---|---|
| X prohibits apps that reward users for posting ("InfoFi"); API access revoked. Kaito sunset Yaps, token fell ~17%, Yapper account (≈157k members) banned. | 2026-01-15 | No "post about Tyche, receive JDR" mechanic exists in a safe form. |
| X prohibits paid partnerships for gambling products, **explicitly including lotteries** — covering affiliates, ambassadors, and disclosed compensated organic posts. | 2026-02-19 | Paying creators for content, in JDR or anything else, violates policy. Uncompensated organic mentions remain fine. |
| Sybil farming is the dominant failure mode of per-wallet reward programmes; the defence that works is time-weighted scoring, not volume. | 2026 | Referral-heavy growth amplifies a risk this project already carries around per-wallet election capture. |

**Resolution:** the token-funded campaign is an **in-product** programme, and it already exists and is correctly designed. The `Initial Campaign Reserve Vault` pays JDR for game actions — proposing a rule, backing one, referring a player who actually plays — not for publishing. Social effort is rewarded with **recognition**, which is free, unlimited, and outside the prohibition.

> **Operating sentence:** *the reserve pays you to write rules, not to shill.*

---

## 2. Channel architecture

Every channel has one job and one KPI. A channel without a distinct job is not opened.

| Channel | Opens | Job | Why this channel | Primary KPI |
|---|---|---|---|---|
| **X** | Week 1 | Discovery and public building | Where the Solana-native audience lives. The current ranker pairs Thunder (in-network) with Phoenix Retrieval (out-of-network by learned similarity), so topical coherence and a real reply graph matter more than raw volume. | Follows per 1k impressions |
| **Telegram** | Week 1 | Core and coordination | De facto standard for Solana communities, mobile-native — matching the mobile-first DApp. Home of the Rule Workshop. | Weekly active members |
| **Site + docs** | Week 1 | Source of truth | The only owned surface: contract, supply, eligibility gate, treasury page, rule archive, verification links. Carries the proof pillar and the jurisdiction gate. | Site → community conversion |
| **In-product JDR rewards** | Week 5 | The token-funded campaign | Rewards game actions, not posts. The compliant form of paying in the project's own token. | Unique rule proposers per round |
| **Discord** | Week 5+, conditional | Organised production | Opens only at ≥20 recurring contributors who need roles, files, and briefs. An empty Discord is negative proof. | Completed contributions |
| **Vertical video** (YouTube Shorts / TikTok) | Week 6+ | Translation for non-crypto | External reach layer. Gambling-content restrictions apply: the video is about writing rules, never about winning money. | Shares |

**Deliberately not opened:** institutional Reddit (poor return for a small team, high hostility to token projects), Instagram (wrong audience), and any paid channel whatsoever.

**Sequencing rationale:** X + Telegram + site first, everything else on evidence of demand. Opening six channels on day one with one team splits attention and produces six dead rooms — the visible failure mode across the reference cases.

---

## 3. Editorial pillars

| Pillar | Share | Purpose | Example (production copy) |
|---|---:|---|---|
| **The Pen** | 25% | Sharing and conflict | "The house had a god too. It just never took requests." |
| **Rule of the Round** | 25% | Ritual and return | Card: the wish that became law + author + verdict |
| **Build in public** | 20% | Dwell and trust | "Day 9: the draw stalled on an RPC rate limit. Here's the log and the fix." |
| **Proof** | 15% | Saves and credibility | Frozen artifact hash, VRF proof, explained verdict |
| **Rulewriters (UGC)** | 10% | Recognition and follows | Creator spotlight, Rule Hall |
| **Invitation / action** | 5% | Conversion | "Make a wish. Out loud. Before the draw." — a poll whose outcome actually changes something; a Space; a challenge |

Every post belongs to exactly one pillar and is logged as such. Pillar performance is compared by median, not by best case.

### Where the mythic register is used

The register of [narrative-a-messaging.md](narrative-a-messaging.md) §3.1 — *a god that answers one wish per round* — is the acquisition vocabulary of this plan. `Wish` is the public synonym of a rule proposal, and it is the word used in the invitation and the daily ritual, because it removes the onboarding cost of the phrase "propose a rule".

| Surface | Register |
|---|---|
| The Pen, Invitation, Rule of the Round, UGC, vertical video | Mythic register permitted and preferred |
| Proof posts, Build in public | Plain language; the register may frame, never carry the factual claim |
| Site metadata, page titles, bio, docs headers, app manifests, partner briefs | Prohibited — classification surfaces, §4.3 and §4.7.6 |
| Incidents, corrections, treasury, policy | Prohibited — the Rule Keeper speaks, §4.7.8 |

What is granted is always the **rule**, never the win, and the election stays visible in the copy: the community elects, the god grants what was elected. No piece claims equal odds of winning; equality is stated about standing and the draw.

---

## 4. Cadence and why

**Baseline: 3 original posts/day, spaced 3–5 hours, plus 15–20 substantive replies/day.**

| Choice | Justification |
|---|---|
| 3 originals/day | The ranker applies author diversity and de-duplication. The 4th near-identical post cannibalises rather than adds. Three is the floor that sustains presence without triggering repetition penalties. |
| 3–5 h spacing | A recency filter drops old posts; spreading covers more session windows with the same effort. |
| 15–20 replies/day | Thunder serves in-network content and Phoenix needs similarity signals. Replies build the relational graph that feeds both. It is the most underrated lever and the only free one. |
| 4–6/day during events only | Permitted only when each post has a distinct function (announce, proof, reaction, verdict). Never as standing cadence. |
| Zero negative signals | Blocks, mutes, reports, and "not interested" carry heavy weight. This is what forbids ticker spam, misleading hooks, and financial promises — not taste. |

**Test it, don't believe it.** Run two-week blocks at 2, 3, and 4 originals/day with mix and posting times held constant. Stop increasing when the marginal post lowers average reach or conversion, or raises unfollow/mute rate.

### Post structure

1. **First line:** a conflict, a result, or a specific question. Never a greeting.
2. **Proof:** image, rule card, hash, transaction, or artifact.
3. **Short context:** why it matters, one sentence.
4. **Low-friction action:** choose, explain, write, or compare. Not "like and RT".

---

## 5. Weeks 1–4 — pre-launch

Product is closed. The goal is to have a narrative, a demonstrated tool, and a creator core **before** there is anything to sell.

### Week 1 — Plant the enemy

*Goal: the sentence exists, the antagonist exists, the source of truth exists, the baseline exists.*

| Day | Originals | Content |
|---|---|---|
| 1 | 3 | Manifesto post ("The house never needed loaded dice. It only needed the pen.") + a 5-post thread explaining the game in plain language. Founder visible and named. |
| 2 | 3 | **Fine Print** #1 — a rule written by someone else that you only discover after you lose. Generic, never naming a company. Closing line: "The house had a god too. It just never took requests." |
| 3 | 3 | How a round works, in three screens. Site v1 goes live. |
| 4 | 3 | Fine Print #2 + the first invitation in the mythic register: **"Make a wish. Out loud. Before the draw."** — a wish is a winning condition anyone can read in one breath. |
| 5 | 3 | What "frozen before the draw" actually means, with the artifact concept shown: every wish is heard, one is granted, and it is granted in writing before anyone knows the numbers. |
| 6–7 | 3/day | Rulewriters call: Telegram opens, hand-invited. |

Also this week:

- **Site v1 live:** what the game is, supply, mint revoked, eligibility gate, rule archive, and the **treasury page** — published, not promoted.
- **Map 100 adjacent accounts and 10 communities.** Replies start on day 1 at 15/day.
- **Telegram open**, manual invitations only, target 30 founding Rulewriters.
- **Dashboard and baseline live before the first post.** Without week-1 baseline, weeks 2–4 are uninterpretable.

### Week 2 — Show the pen

*Goal: the public uses the tool before a product exists. Highest-return week in the plan.*

**Open Wish Call (daily).** Post a theme; anyone replies with a wish in natural language — a way of winning they would want to exist; **we run it through the real AI Rule Compiler** and reply with the compiled artifact, the clarity verdict, and the difficulty classification. (Product-layer name: rule proposal. `Wish` is the acquisition-layer word, per §3.1.)

Why this is the centrepiece:

- it demonstrates the pen and proves it at the same time;
- it makes the premise literal before the product exists: every wish is heard, and it is answered in public with a compiled artifact;
- it returns instant, personalised output — the strongest reason to reply that a pre-launch account can offer;
- it produces UGC where the *user* is the author, which is what actually decentralises production;
- it generates one shareable card per participant at zero marginal cost;
- it is not compensated content, so it stays clear of §4.4 of the messaging doc.

**Register discipline in this format:** every wish gets a reply — being heard is the promise, and it is one this week can keep in full. What the compiler returns is a validated condition, never an opinion about the author's chances, and the reply never suggests a wish would make its author likelier to win.

Also this week:

- **Two real polls with published consequences** (e.g. which rule becomes the launch showcase). Decorative polls are banned.
- **First creator spotlights** — recognition, never payment.
- **Rule Workshop** in Telegram, weekly slot established.
- Replies to 20/day.
- **Cadence:** 3 originals/day + the daily compile thread.

### Week 3 — The public dry run

*Goal: one announced event with a verifiable delivery.*

- **The First Round** — run a complete devnet round as a spectator event: open call for wishes, community election, VRF draw, published verdict. This is a demonstration, not a beta opening. The narrative beat of the week is the moment of granting: **one wish becomes law**, on screen, before the numbers exist.
- **Two Spaces:** one before (how a wish gets frozen into law) and one after (the verdict).
- **Creator kit released:** templates, the blindfolded-bust mark, remix licence terms, the mythic-register line set, and an explicit do/don't sheet carrying the §4 guardrails and the §4.7 register limits — the granted-rule boundary, no personal favour, no equal-odds claim.
- **Publish the post-mortem** of anything that breaks. Under this narrative, an exposed failure is proof; a hidden one is the house.
- **Cadence:** 4–6 posts/day on event days, each with a distinct function; back to 3 otherwise.

### Week 4 — Consolidate and inoculate

*Goal: turn what worked into series; neutralise the predictable counter-attack.*

- **Public retrospective:** what grew, what died, medians per format and per pillar.
- **Archive the worst 10% of formats. Turn the best 10% into named series.**
- **Publish "Who is the house here?"** — one factual post covering supply, revoked mint, the 200M player reserve, the 800M as protocol reserve capital under the same formula, and the custody status. Once, without defensiveness, linking to the treasury page. Answer once, link thereafter.
- **Announce the next chapter:** the launch window. No price, no target, no countdown to a number.
- **Discord decision** based on the real contributor count.
- **Cadence:** back to 3 originals/day.

---

## 6. Weeks 5–8 — extension to mainnet live

| Week | Focus | Deliverables |
|---|---|---|
| **5** | Launch | Eligibility gate live, verification guide published, first real round. **Rule of the Round** becomes the permanent daily ritual, published as *the wish that became law* with its author and verdict. Open Discord if week-4 criteria were met. |
| **6** | JDR campaign | The reserve enters the story: `0.6` per proposal, `0.09` per backing vote, referral rewards. **Publish the anti-Sybil policy alongside it** — referral qualifies only when the invitee completes a paid action; no emphasis on invite volume; no leaderboard by invite count. Register limit: the reserve pays for wishes written and backed, never for wishes granted — no copy may tie a reward to winning. |
| **7** | Creator economy | Active-rule creator reward (`22.5%`); Rule Hall of Fame — the archive of granted wishes and who wrote them; authorship stories. Vertical video opens as the translation layer, carrying the register and never the prize. |
| **8** | Proof at scale | Publish the first `EpochCalculationManifest` and Merkle root with an explicit invitation to reproduce the calculation independently. The proof pillar at its strongest. |

**Referral caution (week 6).** Referral rewards are the highest Sybil-risk surface in the reserve, and the project already carries a per-wallet election-capture risk. Referrals are promoted as a way to bring in someone who will actually play, never as a volume game. No campaign copy may frame invites as a yield.

---

## 7. Metrics

Price, volume, and market cap live in a **separate panel**. They are context and external variables — never a content KPI, never a target in copy.

### Content KPIs

| Metric | Formula | What it reveals |
|---|---|---|
| Follows per 1k impressions | new followers / (impressions / 1000) | Real reach efficiency |
| Amplification | (reposts + quotes + shares) / impressions | Third-party distribution capacity |
| Profile conversion | profile visits / impressions | Clarity of the first line |
| Unique weekly UGC creators | accounts publishing original Tyche content | Whether production is actually decentralising |
| Community/official reach ratio | estimated member reach / official reach | Dependence on the main account |
| Activation | new members contributing within 7 days / new members | Whether onboarding creates participants |
| 30-day retention | active on day 30 / entry cohort | Durability |
| Net followers | follows − unfollows | Growth without hiding rejection |

### Product KPIs (week 5+)

- Unique rule proposers per round
- Unique voters per round
- Round-over-round return rate
- Share of rounds with an elected alternative rule

### Per-post log

Date/time · pillar · format · subject · impressions at 1h/6h/24h/7d · replies, reposts, quotes, likes, bookmarks · profile visits · follows · blocks/mutes/reports where available.

**Winner definition:** a post beats the impression median **and** holds conversion above median. A viral post that brought views but no followers is archived, not replicated.

---

## 8. Verification

How to know this is working rather than merely looking busy:

1. **Dashboard before the first post.** Non-negotiable — it is the only baseline that will ever exist.
2. **Frequency A/B/C blocks** (2/3/4 originals per day, two weeks each, mix and timing constant). Compare impressions per post, net followers per day, follows per 1k impressions, and unfollow/mute rate.
3. **Median review by format and pillar** at the end of weeks 2 and 4.
4. **Publication checklist** ([guia-identidade-publica-tyche.md](../../guia-identidade-publica-tyche.md) §11) on every piece.
5. **Weekly guardrail audit** ([narrative-a-messaging.md](narrative-a-messaging.md) §6): no probability-advantage claim, no named operator, no casino self-description, no compensated post, no price promise, no unproven round claim — plus the §4.7 register pass: what was granted was the rule, the election stayed visible, no personal favour, no equal-odds claim, and the register never reached a classification surface or an incident post.
6. **The organicity test:** if the official account goes silent for seven days, does the community keep writing rules, debating, and welcoming newcomers? Run it for real in week 8. That answer — not follower count — is the actual measure of "built for and by the community".

---

## 9. Open dependencies

These are outside this document and block parts of the plan:

- **Treasury page content** (`docs/treasury.md` and its public rendering) — needs owner sign-off before week 1, since it is a public disclosure.
- **Public verification / rule-archive surface** in `apps/web` — should reuse the artifacts, hashes, and verdicts the product already emits rather than build new proof machinery.
- **Legal review** of communication targeting, eligibility, and campaign mechanics in the target jurisdictions before any real-value launch.
- **Mainnet custody decision** (§3.3.2 of the tokenomics PRD) — determines whether week 4's prepared answer is a disclosure or, in the stronger case, a story about the house giving up its own pen.
