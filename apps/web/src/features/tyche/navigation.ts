import type { Screen } from "./context";

export const PLAY_SCREEN_PATHS: Readonly<Partial<Record<Screen, string>>> = {
  claims: "/play/claims",
  create: "/play/propose",
  guesses: "/play/guesses",
  home: "/play",
  invite: "/play/invite",
  myrules: "/play/my-rules",
  play: "/play/pick",
  profile: "/play/account",
  rewards: "/play/rewards",
  share: "/play/share",
  vote: "/play/rules",
};

const PATH_PLAY_SCREENS = new Map(
  Object.entries(PLAY_SCREEN_PATHS).map(([screen, path]) => [path, screen as Screen]),
);

export function getPlayScreenPath(screen: Screen) {
  return PLAY_SCREEN_PATHS[screen] ?? null;
}

export function getScreenForPlayPath(pathname: string) {
  return PATH_PLAY_SCREENS.get(pathname) ?? null;
}
