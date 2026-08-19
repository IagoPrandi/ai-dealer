import { expect, test } from "@playwright/test";

import { mockRulePreflight } from "./helpers/preflight";
import { mockShellData } from "./helpers/shell";

/**
 * The Home prompt promises a running start: whatever the player typed there is
 * already on its way when the composer opens. Nothing else on the Create screen
 * tells them the prompt was not sent, so a seed that silently lands as composer
 * text reads as the dealer ignoring them.
 *
 * This ran against `next dev`, where React double-invokes effects, which is
 * exactly the condition that used to consume the one-shot before the send.
 */
test("a prompt typed on Home is sent on arrival, without a second tap", async ({
  page,
}) => {
  await mockShellData(page);
  const preflightTexts: string[] = [];
  await mockRulePreflight(page, (body) => {
    preflightTexts.push(body.text);
    return {
      json: {
        interpretation: {
          addedOperationalClauses: [],
          clarificationQuestions: [],
          clarityNote: "",
          dealerMessage: "This is how I understand your rule.",
          englishText: body.text,
          guardianChecked: false,
          needsClarification: false,
          normalizedText: body.text,
          officialInterpretation:
            "The engine compares only the player's guess and the official draw.",
          sanitizedText: body.text,
          suggestedRewrites: [],
          title: "Rule interpretation",
          tokenCount: 12,
        },
      },
      status: 200,
    };
  });

  const prompt = "the sum of the six numbers has to be closest to 100";
  await page.goto("/play");
  await page
    .getByPlaceholder("e.g. the sum closest to 100 wins…")
    .fill(prompt);
  await page.getByTitle("Create rule").click();

  // A player bubble carrying the prompt is the send: only `send` appends one,
  // and opening the composer merely pre-fills the textarea. The wait is generous
  // because a cold dev server compiles the composer route on the way in.
  await expect(
    page.locator(".ide-bubble-user", { hasText: prompt }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue("");
  await expect
    .poll(() => preflightTexts)
    .toEqual([prompt]);
});
