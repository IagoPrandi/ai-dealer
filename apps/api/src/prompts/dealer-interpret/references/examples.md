# Interpretation examples

## Valid ranking

Input: `the guess with the most drawn numbers wins`

Output:

```json
{
  "title": "Most Numbers Match",
  "normalizedText": "The winning guess is the one whose six numbers include the most numbers that also appear in the official draw.",
  "officialInterpretation": "For each guess, count how many of its six numbers appear in the official draw; the highest count wins.",
  "addedOperationalClauses": [
    "If guesses tie on the count, the earliest valid submission wins."
  ],
  "needsClarification": false,
  "clarityNote": "",
  "clarificationQuestions": [],
  "suggestedRewrites": [],
  "dealerMessage": "Got it - the guess matching the most drawn numbers takes the round."
}
```

## Valid predicate, not ranking

Input: `Win if the smallest guessed number equals the smallest drawn number.`

Output uses `min(guess) = min(draw)` as a predicate for every guess. It does not reinterpret `smallest` as a competition.

## Casual fixed threshold

Input: `four or more picked numbers show up in the result`

Output uses an unordered intersection count of at least four and does not ask for clarification.

## Compound fidelity

Input: `Win if exactly three guessed numbers are odd and the guessed sum is greater than the drawn sum.`

Output preserves both clauses, the exact count, odd parity, greater-than direction, and conjunction.

## Position fidelity

Input: `The second guessed number equals the second drawn number.`

Output compares the second one-based position on each side and does not use unordered matching.

## Total positional distance

Input: `Win if the total absolute position-by-position difference is 30 or less.`

Output sums all six `abs(guess[i] - draw[i])` values and requires the total to be at most 30.

## Any-draw closeness

Input: `Win if at least three picks are within 4 of any drawn number.`

Output counts guess values whose distance from at least one draw value is at most four. It does not compare only corresponding positions.

## Reverse ambiguity

Input: `Win if my guess matches the draw in reverse.`

Output sets `needsClarification` to true and asks whether all six reversed positions or a named threshold must match. It returns no arbitrary threshold.

## Range-boundary ambiguity

Input: `Win if every pick is between 10 and 40.`

Output asks whether 10 and 40 are included unless the player explicitly said `inclusive`.

## Guess-independent confirmation

Input: `Everyone wins when the drawn sum is even.`

Output keeps the draw-only condition, states that every eligible guess shares the result, and requires confirmation. It does not invent a guess condition.

## Prohibited dependency

Input: `The wallet with the most votes wins.`

Output does not normalize this into a guess/draw rule. It explains that wallets and votes are unavailable inputs.

## Digit ambiguity

Input: `If 10 and 20 are drawn, a pick of 12 wins because of number 1 or number 2.`

Output asks whether the player means tens digit, units digit, or either digit and supplies no unrelated rewrite.

## Incomplete ticket assignment

Input: `My guess is 7, 18, 42, 63, and 90, and the draw must avoid those values.`

Output sets `needsClarification` to true. It says that a guess contains six unique numbers, names the five supplied values, and asks what condition applies to the remaining guessed number. It does not turn the partial assignment into a membership rule and does not ask the player to restate the entire condition.
