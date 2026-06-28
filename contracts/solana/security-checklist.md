# M2.2 Solana Program Security Checklist

## Risk Classification

**Critical.** The program creates SOL-holding vault PDAs, controls game state, and will eventually support prize accounting.

## Threat Model

- Protected assets: devnet SOL, turn state, guesses, rule proposals, votes, protocol authority.
- Entrypoints: all public Anchor instructions and future upgrade/deployment authority.
- Actors: players, bots, attackers, protocol authority, automation, wallet clients.
- Trust boundaries: wallet to program, authority to program, program to System Program, future oracle integrations.
- Top threats:
  - Fake or cross-turn accounts -> typed Anchor accounts, isolated PDA seeds, stored canonical bumps, relationship constraints.
  - Duplicate guesses or vote sequences -> deterministic `init` PDAs scoped by turn, player, rule, and vote sequence.
  - Invalid guesses or rules -> on-chain range, uniqueness, token-count, byte-length, hash, and preflight commitment validation.
  - Unauthorized lifecycle changes -> signer plus `has_one = authority` constraints.
  - Fee/accounting drift -> checked arithmetic and explicit treasury/prize split invariant.
- Assumptions: devnet-only during M2; Switchboard and payout paths are not active yet.

## Applied Controls

- [x] Typed Anchor accounts are used for program-owned state.
- [x] Every mutable user action requires a signer.
- [x] Authority-only instructions enforce `has_one = authority`.
- [x] Every PDA uses a distinct fixed prefix and canonical stored bump.
- [x] `init_if_needed` is not used.
- [x] Financial arithmetic uses checked operations.
- [x] System Program CPI target is typed and fixed.
- [x] Guess values are range checked and unique.
- [x] Rule text, token count, text hash, and preflight commitment are validated on-chain.
- [x] One guess and one vote per deterministic sequence PDA scope are enforced.
- [x] Turn action windows use the canonical Clock sysvar and seconds consistently.
- [x] Protocol pause state fails closed.
- [x] Release overflow checks are enabled.
- [x] No private keys, seed phrases, or deployment credentials are stored.

## High-Risk Decisions And Known Limitations

- The checked-in program id is a non-secret development placeholder. A credentialed devnet deployment must replace it with the actual deployment program id.
- Treasury and prize vault outflow instructions are intentionally not part of M2.2. Mainnet value flows remain prohibited until payout, claim, governance, and M9 readiness gates are implemented and audited.
- Switchboard VRF request and fulfillment instructions are outside M2.2. No draw or election randomness is accepted by this program version.
- Upgrade authority custody is not configured in source. Devnet deployment must document the authority; mainnet requires multisig and the M9 gates.
- A full local-validator/cluster instruction test suite requires Solana CLI and Anchor CLI, which are not installed in the current environment.
