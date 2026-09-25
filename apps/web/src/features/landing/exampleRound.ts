/**
 * Illustrative round used by the landing page demos. None of these values
 * come from a live turn; the page labels every place they appear as an example.
 */
export const EXAMPLE_PICKS: readonly number[] = [7, 18, 26, 44, 63, 91];
export const EXAMPLE_RULE_SENTENCE = "Win if at least four of my numbers appear in the draw.";
export const NUMBER_MIN = 1;
export const NUMBER_MAX = 100;
export const PICK_COUNT = 6;
export const MATCH_THRESHOLD = 4;

export type ExampleRule = {
  id: string;
  name: string;
  description: string;
  proposer: string;
  backers: number;
};

export const EXAMPLE_RULES: readonly ExampleRule[] = [
  { id: "four", name: "Four is enough", description: "Match at least four numbers in any order.", proposer: "7x...a91", backers: 214 },
  { id: "total", name: "Same total", description: "Your six numbers add up to the same total as the draw.", proposer: "Bq...3k7", backers: 131 },
  { id: "underdog", name: "Underdog", description: "Every selected number is lower than its drawn counterpart.", proposer: "4m...e02", backers: 88 },
];

/**
 * Builds a draw for the interactive demo that shares exactly
 * MATCH_THRESHOLD numbers with the visitor's picks, in shuffled order, so the
 * two rules visibly disagree on the same draw.
 */
export function buildDemoDraw(picks: readonly number[], random: () => number = Math.random): number[] {
  if (picks.length !== PICK_COUNT) {
    throw new Error(`A demo draw needs exactly ${PICK_COUNT} picks, got ${picks.length}.`);
  }
  const hits = shuffle(picks, random).slice(0, MATCH_THRESHOLD);
  const pool: number[] = [];
  for (let value = NUMBER_MIN; value <= NUMBER_MAX; value += 1) {
    if (!picks.includes(value)) pool.push(value);
  }
  const misses = shuffle(pool, random).slice(0, PICK_COUNT - MATCH_THRESHOLD);
  return shuffle([...hits, ...misses], random);
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const current = copy[index] as T;
    copy[index] = copy[swap] as T;
    copy[swap] = current;
  }
  return copy;
}

export function pad(value: number) {
  return String(value).padStart(2, "0");
}
