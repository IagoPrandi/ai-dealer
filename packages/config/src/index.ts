// The project carries two names. `tyche` is the internal codename: it stays in
// the npm scope, the TYCHE_* env prefix, the Docker project, the Rust crate and
// every deployed or signed artifact, so no runtime or on-chain identifier moves.
// `Tywish` is the commercial name and the only one a player ever sees.
export const workspaceConfig = {
  internalName: "tyche",
  dockerComposeProjectName: "tyche",
  environmentVariablePrefix: "TYCHE_"
} as const;

/**
 * The commercial name. Every player-visible surface reads this instead of a
 * literal so the brand has one source of truth. The static PWA manifest
 * (apps/web/public/manifest.webmanifest) cannot import it and duplicates the
 * value deliberately.
 */
export const BRAND_NAME = "Tywish";
