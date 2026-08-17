# General (MUST FOLLOW)

- Always open **PRD.md** before working.
- Always confirm (in the work log / PR description) that you opened the required markdown documents.
- Always update the **Progress Tracker** when you finish a milestone.
- Always mark (tick) the corresponding milestone ONLY after user confirmation.
- Never create useless files that do not improve functionality, security, or project understanding.
- Never use fallbacks that hide issues or errors.
- Always open folder .claude/skills to find relevant skill to do the task
- Always use UTF-8 english language in ui and ux 
- Always respecting right spelling

# Naming: Tywish (commercial) vs tyche (internal)

The project has two names on purpose. **This is not an unfinished rename — do not
"complete" it.**

- **Tywish** is the commercial name. Use it for everything a player or the public sees:
  app and PWA title, wallet-approval dialog, on-screen brand, share copy, player-facing
  error text, the AI dealer persona, README and `docs/brand/**`.
- **`tyche`** is the internal codename. It stays in the `@tyche/*` package scope, the
  `TYCHE_*` env prefix, Docker project/containers/volumes, the Postgres `tyche_dev`
  database, the Rust crate and its `tyche.so` artifact, code identifiers (`useTyche`,
  `TycheError`, `TycheApp`), file and directory names, code comments, prompt-version ids,
  and PRD/PROGRESS_TRACKER/runbooks.

The commercial name has one source of truth: `BRAND_NAME` in `packages/config`. Import it
rather than writing the literal. The only deliberate duplicate is
`apps/web/public/manifest.webmanifest`, which is static JSON and cannot import.

**Never rename these** — they are deployed, persisted, or hash-verified:
`declare_id!` pubkeys and PDA seeds; the `tyche:m5.4:devnet-player:v1:` keypair-derivation
seed in `apps/worker/src/devnet-claim-prize.ts`; Squads on-chain memo strings;
`deployments/*.json` manifests; `tokenomicsGenesisConfig.ts`; browser localStorage keys
(`tyche.solana.wallet`, `tyche:pending-invite`, `tyche:draw-result-last-seen-turn`); and
the `<tyche_server_context>` / `<tyche_player_question>` prompt tags.

In brand narrative, **Tyche the Goddess** keeps her mythological name — she is the
character inside the game, not the product.
