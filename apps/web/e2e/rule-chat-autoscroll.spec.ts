import { expect, test } from "@playwright/test";

import { mockRulePreflight } from "./helpers/preflight";
import { mockShellData } from "./helpers/shell";

/**
 * The rule-creation cards are the tall content on this screen and they arrive in
 * two steps the transcript's state changes cannot see: each card mounts behind
 * the reveal gate and then streams its own text in. Combined with the deliberate
 * upward scroll that pins a long answer's first line — which used to register as
 * the player scrolling away and disabled auto-scroll from then on — the newest
 * line ended up under the composer with nothing to bring it into view.
 */

function hashBytes(seed: number) {
  return Array.from({ length: 32 }, (_, index) => (seed + index) % 256);
}

// Long enough that pinning its first line scrolls the container UP by well over
// the 48px "player scrolled away" threshold.
const LONG_INTERPRETATION = [
  "Got it - a guess wins only when its first number is 10 and its second number is 12.",
  "The remaining four guessed numbers are unconstrained: they may be any unique values",
  "from 1 to 100 other than 10 and 12, and their order among themselves does not change",
  "the outcome. The official draw is never inspected, so the result of this condition is",
  "fixed before the draw happens and every guess that starts with 10 and 12 wins it.",
  "Because there are 100 possibilities for the first number and 99 for the second, the",
  "chance that a random guess satisfies this condition is roughly 1 in 9,900 overall.",
].join(" ");

function interpretation(text: string) {
  return {
    interpretation: {
      addedOperationalClauses: [],
      clarificationQuestions: [],
      clarityNote: "",
      dealerMessage: LONG_INTERPRETATION,
      englishText: text,
      guardianChecked: false,
      needsClarification: false,
      normalizedText: text,
      officialInterpretation: LONG_INTERPRETATION,
      sanitizedText: text,
      suggestedRewrites: [],
      title: "Rule interpretation",
      tokenCount: 12,
    },
  };
}

test("the newest rule-creation content is scrolled into view after a long dealer answer", async ({
  page,
}) => {
  await mockShellData(page);
  await mockRulePreflight(page, (body) => ({
    json: interpretation(body.text),
    status: 200,
  }));

  await page.goto("/play/propose");
  await page
    .getByLabel("Message", { exact: true })
    .fill(
      "A guess wins when its first number is 10 and its second number is 12, regardless of the remaining four numbers.",
    );
  await page.getByRole("button", { name: "Send message" }).click();

  // The interpretation card carries the action the player has to reach.
  // The whole answer plus the card streams in character by character, so this
  // waits on the reveal drain loop rather than on the network.
  const confirm = page.getByRole("button", { name: "Confirm and generate" });
  await expect(confirm).toBeVisible({ timeout: 60_000 });

  // Let the reveal drain loop finish streaming the card in.
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const el = document.querySelector(".ide-scroll");
          return el ? el.scrollHeight - el.scrollTop - el.clientHeight : -1;
        }),
      { timeout: 15_000 },
    )
    .toBeLessThanOrEqual(4);

  // And the button is genuinely inside the scrollport, not merely rendered.
  const reachable = await page.evaluate(() => {
    const scroller = document.querySelector(".ide-scroll");
    const button = [...document.querySelectorAll("button")].find((candidate) =>
      candidate.textContent?.includes("Confirm and generate"),
    );
    if (!scroller || !button) {
      return null;
    }
    const view = scroller.getBoundingClientRect();
    const box = button.getBoundingClientRect();
    return box.top >= view.top && box.bottom <= view.bottom;
  });
  expect(reachable).toBe(true);
});
