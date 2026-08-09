import path from "node:path";

import {
  config as loadDotenv,
  type DotenvConfigOptions,
  type DotenvConfigOutput,
} from "dotenv";

type DotenvLoader = (options: DotenvConfigOptions) => DotenvConfigOutput;
type EnvironmentTarget = Record<string, string>;

/**
 * Next.js resolves env files from the app directory, while Tyche keeps the
 * canonical local `.env` at the monorepo root. Load that file without
 * overriding variables injected by CI, Vercel, or Docker.
 */
export function loadWorkspaceEnvironment(
  workspaceRoot: string,
  options: {
    load?: DotenvLoader;
    processEnv?: EnvironmentTarget;
  } = {},
): void {
  const result = (options.load ?? loadDotenv)({
    path: path.join(workspaceRoot, ".env"),
    processEnv: options.processEnv ?? (process.env as EnvironmentTarget),
  });

  if (
    result.error &&
    (result.error as NodeJS.ErrnoException).code !== "ENOENT"
  ) {
    throw result.error;
  }
}
