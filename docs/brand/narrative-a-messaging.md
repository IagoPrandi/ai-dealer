# Tywish — Narrative A Messaging System

> **Version:** 1.2.0
> **Status:** Adopted — narrative spine confirmed by the owner on 2026-08-09. The mythic register (§3.1 / §4.7) was added on 2026-08-09 and revised the same day on the owner's direction: the god does answer wishes, and grants exactly one per round.
> **Last updated:** 2026-08-09
> **Scope:** Single source of truth for every public-facing sentence: X, Telegram, site, docs, video, creator kits, partner briefs.
> **Naming:** **Tywish** is the commercial name and the only one used in public communication. `tyche` is the internal engineering codename and appears only inside the repository. **Tyche the Goddess** keeps her mythological name — she is the character, not the product.
> **Language:** All public output is **English only**. This document is the reference; the copy inside it is production copy.
> **Parents:** [PRD.md](../../PRD.md) §3 · [guia-identidade-publica-tywish.md](../../guia-identidade-publica-tywish.md) · [nova-narrativa-jogo.md](../../nova-narrativa-jogo.md) · [PRD-TOKENOMICS-v2.8.md](../../PRD-TOKENOMICS-v2.8.md)

---

## 1. The position

**Enemy:** the house. Not its mathematics — its **pen**.

The real privilege of any house was never the edge. It was being the only party allowed to write the winning condition and the fine print, and to write them where no one else could read them in time.

**Thesis:** Tywish takes the pen out of the house's hand and gives it to the player. Every round, the winning condition is written, contested, and **frozen in public before the draw** — and explained after it.

This is what "built for and by the community, against the status quo" means concretely here. It is not an adjective about the team. It is a transfer of a specific power — rule authorship — evidenced every round by a frozen artifact and a public verdict.

### Why this position and not the alternatives

Two other framings were evaluated and rejected as the spine:

- **"Public rule"** (enemy = opacity) is the most defensible and absorbs criticism best, but it is abstract and slow to spread.
- **"Mutiny against the Goddess"** (enemy = chance) is the strongest content engine, but fighting *chance* is not fighting the *status quo*, and it risks implying randomness can be beaten — forbidden by [nova-narrativa-jogo.md](../../nova-narrativa-jogo.md) §5.

Narrative A was chosen because it is the most literal translation of the product's actual transfer of power: status quo with a face, a tool with a function, and a lever on one's own outcome. Its exposure is managed by §4 (guardrails) and §5 (prepared answer), which are not optional.

---

## 2. Canonical copy

Use these verbatim. Variations are allowed in body copy; these six lines are fixed.

| Use | Copy |
|---|---|
| Brand signature | **The house never needed loaded dice. It only needed the pen.** |
| One-line explanation | An on-chain game where the community writes and elects the winning condition — in public, frozen before the draw. |
| Product CTA | Write a rule. Get it elected. Face the draw. |
| Trust line | Public rule. Verifiable draw. Explained verdict. |
| Creator message | Write a rule anyone can read. Make the community back it. Watch it decide the round. |
| Short manifesto | Every house wins because it writes the rules. Here, you write them. |

### Approved secondary lines

- You didn't lose. You never got to read the rule.
- The dice are honest. The paperwork never was.
- Six numbers are luck. The rule is a decision — and it isn't ours to make alone.
- Frozen before the draw. Explained after it. That's the whole trick.
- Bring a rule anyone can read in one breath.

The mythic-register lines in §3.1 are additive to this section. They are an acquisition-layer vocabulary, never a replacement for the six fixed lines above.

---

## 3. Memetic grammar

Without this, Narrative A is a slogan. With it, it is a content engine. Every element below must be usable by a community member with no design skill and no permission request.

| Element | Definition | Rule of use |
|---|---|---|
| Collective noun | **Rulewriters** | Members are Rulewriters. Never "holders", never "community members" in headline copy. |
| Verb | **to rewrite** — "rewrite the round" | The brand name of the action. Applies to the round, never to the result or the draw. |
| Symbol | The blindfolded bust + a pen (✍) | The blindfold is the one-step remix: it can be applied to any character, object, or avatar. This is the WIF lesson — an operator, not an illustration. |
| Antagonist | **The House** | Always faceless and generic. Never a named company, operator, or person. See §4.2. |
| Ritual | **Rule of the Round** | Daily card: the elected rule, its author, the verdict. This is the recurring episode. |
| Proof stamp | Frozen-artifact hash + verification link | Attached to any piece that makes a factual claim about a round. |

### Controlled vocabulary

The narrative layer from [guia-identidade-publica-tywish.md](../../guia-identidade-publica-tywish.md) §5 stays in force and is additive to Narrative A. The Goddess is the character inside the game; the House is the antagonist outside it. They do not compete: the Goddess personifies chance and is impartial; the House personifies authorship of the rules and is what Tywish displaces.

| Objective concept | Public term | Note |
|---|---|---|
| Turn / round | Round | Keep the round identifier visible near it. |
| Guess | Sequence | |
| Proposed rule | Rule | "Challenge" remains valid in in-game narrative copy. |
| Approval vote | Backing | Show its effect on the rule card. |
| Elimination vote | Challenge (verb: to challenge a finalist) | |
| Active rule | Rule of the Round | Always show the full formal condition. |
| Draw | Draw | In proof context: "verifiable draw". |
| Result | Verdict | The verdict is computed, never decided by anyone. |

### Two voices

| Voice | Owns | Sounds like |
|---|---|---|
| **The Pen** (brand voice) | Memes, the antagonist, the daily round, invitations | Sharp, confident, funny, short. Picks a fight with a system, never with a person. |
| **Rule Keeper** (institutional voice) | Proof, treasury, incidents, corrections, policy | Flat, factual, unhurried. No theatre, no narrative framing over an operational failure. |

When something breaks, the Rule Keeper speaks. Using the antagonist framing to dramatise or soften an outage is prohibited.

### 3.1 Mythic register

The brand is named after a goddess, so the mythic register is continuity, not decoration. Its value is specific: *"propose a rule"* is a bureaucratic phrase, *"make a wish"* is a desire phrase that needs no onboarding. It converts the hardest ask in the product — authoring a rule — into the easiest sentence in the language.

**The premise is a god that answers wishes, hears everyone on the same terms, and grants exactly one per round.** This is not exaggeration that has to be defended later; it is a description of the mechanic, which is why it is stronger than exaggeration. What the register must protect is the *object* of the wish: what is granted is the **rule**, and the rule is granted in public before the draw.

#### Why the premise is literally true

| The claim | What makes it true | Proof |
|---|---|---|
| **A god that answers wishes** | Exactly one proposed rule is elected each round and becomes the binding winning condition of that round. The wish is granted, publicly, and the granting is recorded. | Elected rule + frozen artifact hash |
| **Only one** | One Rule of the Round, one frozen condition, one verdict. Every other wish waits for the next round. | Rule of the Round card |
| **Everyone on the same terms** | Every wish enters the same way: no queue, no fee to be heard, no private route to the pen, no fine print written where you cannot read it in time. And the draw is unknown to everyone at the moment the wish is frozen. | Public rule list + verifiable draw |

The third line is where the House actually loses. Its privilege was never the mathematics; it was being the only party whose wish was ever granted. Here the granting is open, and it happens once a round in front of everyone.

#### The one line that is not puffery

"Everyone has the same chance of winning" is not a subjective claim like *the best burger in the world*. It is a statement about how the game computes a result in a product where money is at stake — it is falsifiable, and under an elected alternative rule it is false, because sequences are not equivalent to one another under an arbitrary condition. It also self-classifies the product into the restricted-industry bucket described in §4.3.

The true version is sharper than the claim it replaces, and it keeps the whole emotional payload:

- Not: *everyone has the same chance to win.*
- Yes: **every wish is heard on the same terms — and the draw knows no names.**

#### Canonical mythic lines

| Use | Copy |
|---|---|
| The premise | **A god that answers one wish per round.** |
| The invitation | **Make a wish. Out loud. Before the draw.** |
| The scarcity | **Everyone may ask. One wish becomes law.** |
| The full round | **Every wish is heard. One is granted. The draw settles the rest.** |
| The equality | **No queue. No fee to be heard. No fine print. The draw knows no names.** |
| The antagonist | **The house had a god too. It just never took requests.** |

#### Two registers, one funnel

| Layer | Surfaces | Vocabulary |
|---|---|---|
| Acquisition | X, memes, video, creator kits, invitations | `wish` is the public synonym of a rule proposal |
| Product and proof | app, docs, bio, page titles, metadata, partner briefs, incident copy | the controlled vocabulary of §3, unchanged |

| Product term | Acquisition-layer synonym | Rule of use |
|---|---|---|
| Rule (proposed) | **Wish** | For the act of writing and submitting. What is asked for, and what is granted, is a winning condition — never a win. |
| Backing | **Back a wish** | The effect shown is still backing on the rule card. |
| Rule of the Round | **The wish that became law** | The formal condition is still displayed in full. |
| Rulewriters | *unchanged* | Never "wishers", never "believers", never "followers". |
| Verdict | *unchanged* | Never "the god's answer", never "the god's choice". |

#### Who is who

The register must not collapse three distinct figures into one. This is not a stylistic preference: merging them would make the public conclude that the AI decides who wins, which contradicts the verifiable draw and destroys the most expensive asset the narrative has.

| Figure | What it is | May be said to | May never be said to |
|---|---|---|---|
| **Tyche, the Goddess** | Personification of chance ([nova-narrativa-jogo.md](../../nova-narrativa-jogo.md) §6). Abstract, blindfolded, impartial. The figure who takes the wishes. | Hear every wish, grant the one the community elected, and settle the round. | Favour, recognise, or reward anyone; grant a win; control the dice — per [guia-identidade-publica-tywish.md](../../guia-identidade-publica-tywish.md), she personifies chance rather than controlling it. |
| **The AI** (rule compiler and runtime) | The scribe: it reads a wish, validates it, freezes it, and publishes the reasoning. | Read, validate, freeze, publish, execute. | Pick a winner, run or influence the draw, or decide a verdict. The verdict is computed; the randomness is external and verifiable. |
| **The House** | The antagonist: authorship of the rules, faceless and generic. | Be displaced. | Be named (§4.2), or be given a deity register — the House is not mythologised. |

The granting is a two-part act and both parts must stay visible: **the community elects the wish, the god grants what was elected.** A piece where the deity picks the wish on its own contradicts §1 — that is the House's privilege, not Tywish's.

#### Prohibited constructions

What is granted is the **rule**. Everything below breaks that boundary.

- A wish about the prize or the outcome: *wish to win*, *wish for the jackpot*, *ask the god for luck*, *your wish could make you rich*. A wish is always a winning condition.
- Any sentence where a deity or the AI favours a person: *the god smiled on X*, *chosen by the AI*, *blessed sequence*, *the god was on their side*. Granting a wish is public and singular; favour is personal and would be a lie.
- Equal-chance-of-winning claims: *everyone has the same chance*, *the same odds for all*, *a fair shot for everyone*. Use the equality line about standing and the draw instead.
- Framing a wish as improving its author's chance of winning. Wishes are elected and bind the whole round.
- Superlatives of fairness: *the fairest*, *the fairest game*. Fairness here is mechanical and provable — *frozen before the draw, explained after it* — not asserted.
- The deity electing the wish by itself, without the community. The election is the product.
- `God` or `AI god` on any classification surface. It is content rhetoric, under the same restriction as "House" in §4.3.

---

## 4. Guardrails

Narrative A is the highest-attraction and highest-exposure option of the three evaluated. These limits are mandatory and audited weekly.

### 4.1 Never claim a probability advantage

The privilege being displaced is **the pen, not the mathematics**. The draw is random, verifiable, and no rule can make a player likelier to match numbers.

- Prohibited: "beat the house's odds", "better odds than a lottery", "the edge is yours now", "stack the game in your favour".
- Correct: "You don't control the draw. You help decide what counts as winning."

This is both a factual accuracy requirement and a direct rule from [nova-narrativa-jogo.md](../../nova-narrativa-jogo.md) §5.

### 4.2 Never name or attack a real operator

"The House" is always a faceless institution. Naming a lottery, casino, exchange, or platform creates defamation exposure and platform-enforcement risk, and it converts a broad grievance into a narrow feud.

Fine Print examples must be generic or drawn from publicly documented, uncontested facts, and must never assert wrongdoing by an identifiable party.

### 4.3 Never describe Tywish as a casino or betting product

In bio, site metadata, page titles, docs, app manifests, store listings, and partner briefs, the product description is a **game of rules** / **on-chain social game**. "House" is content rhetoric and belongs in posts, not in classification surfaces.

Rationale: X classifies gambling products — explicitly including lotteries — under restricted industries, which constrains reach and monetisation paths. Self-describing into that bucket is unforced.

### 4.4 Zero compensated content

No one is paid — in JDR, SOL, fiat, NFTs, allowlist spots, or product access — to post, reply, repost, or mention Tywish. No affiliate deals, no ambassador programmes, no post-to-earn mechanics, no engagement quests that pay per post.

This is a hard external constraint, not a preference:

- **2026-01-15** — X revised its developer API policy to prohibit apps that reward users for posting (the "InfoFi" category) and revoked API access. Kaito sunset Yaps; the Yapper account (≈157k members) was banned.
- **2026-02-19** — X prohibited paid partnerships for gambling products, explicitly including lotteries, covering affiliate deals, ambassador programmes, and *disclosed compensated organic posts*.

**What is allowed and is the actual programme:** the `Initial Campaign Reserve Vault` pays JDR for **in-game actions** — `0.6` per rule proposal, `0.09` per backing vote, `0.2`/`0.3` inviter/invitee, `22.5%` first-round bonus, `22.5%` active-rule creator and elected-rule voter pools ([PRD-TOKENOMICS-v2.8.md](../../PRD-TOKENOMICS-v2.8.md) §5). That is a game reward, on-chain and auditable, not compensation for publication.

> **Operating sentence:** the reserve pays you to write rules, not to shill.

**Recognition is free and unlimited:** creator spotlights, the Rule Hall, credit lines, and reposts are not compensation and stay outside the prohibition. Recognition, not payment, is the social currency here — and per the reference cases it reliably produces better content than indiscriminate rewards.

### 4.5 Eligibility on every acquisition surface

Adults only, approved jurisdictions. Every entry point — bio link, landing page, Telegram pin, video description — carries the eligibility statement. No acquisition copy may target or appeal to minors.

### 4.6 No financial promises

No price target, no market-cap goal, no "inevitability", no ticker spam, no coordination of buying or trending. Price, volume, and market cap are external variables reported in a separate panel; they are never a content KPI and never a call to action.

### 4.7 Mythic register limits

These apply to every piece using the vocabulary of §3.1 and are audited on the same weekly cycle.

1. **What is granted is the rule.** A wish is a winning condition — never the prize, the outcome, or luck, and never framed as improving its author's chance of winning. Granting the rule is accurate; implying a granted win is a §4.1 violation, not a style issue.
2. **Granting is public and singular, never personal.** Permitted: *hears every wish, grants the one elected, freezes it, publishes it, settles the round*. Prohibited: *favours, blesses, smiles on, sides with, rewards* any player.
3. **The election stays in the copy.** The community elects; the god grants what was elected. A deity that chooses the wish alone reverses §1.
4. **No equal-chance-of-winning claim.** Equality is stated about standing and the draw — every wish heard on the same terms, and the draw knows no names — never about odds of winning.
5. **The AI is never the author of the draw.** No piece may place the AI, or any deity figure, between the randomness and the result.
6. **The register stays out of classification surfaces** — bio, site metadata, page titles, docs headers, app manifests, store listings, partner briefs. Same boundary as §4.3.
7. **No superlative of fairness.** Replace with the factual claim: frozen before the draw, explained after it, with the hash.
8. **The Rule Keeper never uses it.** Incidents, corrections, treasury, and policy are spoken plainly, per §3 Two voices.

---

## 5. The prepared answer

Narrative A invites exactly one predictable question: **"who's the house here?"** It gets a ready, factual answer, published once — not an editorial pillar, and never a defensive posture.

The facts, per [PRD-TOKENOMICS-v2.8.md](../../PRD-TOKENOMICS-v2.8.md):

- Supply is **1,000,000,000 JDR, minted once, mint authority revoked**. No account, multisig, upgrade, or vote can create another token. Freeze authority is `None` — no one can freeze a holder's account.
- **200,000,000 (20%)** are pre-funded at genesis in the programme-controlled `Initial Campaign Reserve Vault` and exist to pay players. The founder and the multisig do not approve individual rewards; the programme settles them against proven eligible actions (§3.6).
- **800,000,000 (80%)** are **protocol treasury reserve capital** under multisig custody — not a founder allocation. The treasury position uses the **same locked-token-seconds formula, the same epoch rules, and the same immediate-unlock semantics as every other holder. It receives no multiplier, no priority, and no private fee route** (§3.4). Its claims can only pay the published `Treasury SOL Vault`; a caller cannot redirect them.
- What remains disclosable is **custody, not ownership**: the devnet rehearsal uses a founder-controlled `2-of-3` multisig, which §3.3.1 requires to be described as *single-owner multi-key custody* — the founder holds enough keys to meet the threshold. **Mainnet custody is a separate, still-open decision** (§3.3.2 describes the planned `3-of-5` with independently controlled members D and E).

**Publication format:** a treasury page in the public docs from week 1 — published, not promoted — plus one factual post in week 4. Answer once, link thereafter. Do not re-litigate it in replies.

**The upside case:** if mainnet launches with independently controlled signers, that transition is the strongest content this narrative can carry — the house giving up its own pen, with a transaction to prove it.

---

## 6. Pre-publication checklist

Applied to every piece, in addition to [guia-identidade-publica-tywish.md](../../guia-identidade-publica-tywish.md) §11 (truth, comprehension, context, coherence, proof):

1. Does it claim, imply, or joke about a probability advantage? → reject.
2. Does it name a real operator, platform, or person as the antagonist? → reject.
3. Does it describe Tywish as a casino, betting, or gambling product? → reject.
4. Is anyone being compensated, in any form, for posting it or for reacting to it? → reject.
5. Does it promise price, return, or inevitability? → reject.
6. Does it make a factual claim about a round without a hash or verification link? → add the proof or cut the claim.
7. If it is about a failure, is the Rule Keeper speaking plainly rather than the brand voice being clever? → rewrite.
8. If it uses the mythic register: is what gets granted the rule — or has it slipped into a granted win, a personal favour, or an equal-odds claim? → rewrite per §3.1 and §4.7.
9. If it uses the mythic register: is the election still visible, and could a reader conclude that the AI or a deity decides who wins? → rewrite; the community elects and the draw is external and verifiable.

---

## 7. What this document does not authorise

- No mainnet launch, genesis, or token distribution decision.
- No public disclosure beyond what the PRDs already establish as fact.
- No legal or jurisdictional determination. Communication targeting, eligibility gating, and campaign mechanics still require legal review in the target jurisdictions before any real-value launch, per [PRD-TOKENOMICS-v2.8.md](../../PRD-TOKENOMICS-v2.8.md) and the eligibility rules.
