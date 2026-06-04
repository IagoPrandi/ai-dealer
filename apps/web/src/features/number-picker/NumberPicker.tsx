"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MVP_FEES_SOL } from "@idealer/constants";

const MAX_SELECTION_COUNT = 6;
const NUMBER_OPTIONS = Array.from({ length: 100 }, (_, index) => index + 1);

type PickerStep = "selecting" | "review" | "success";

function formatNumber(value: number) {
  return value.toString().padStart(2, "0");
}

function getRandomSelection() {
  const pool = [...NUMBER_OPTIONS];
  const selected: number[] = [];

  while (selected.length < MAX_SELECTION_COUNT) {
    const index = Math.floor(Math.random() * pool.length);
    const [value] = pool.splice(index, 1);
    if (typeof value !== "number") {
      throw new Error("Random selection pool was exhausted unexpectedly.");
    }
    selected.push(value);
  }

  return selected.sort((a, b) => a - b);
}

function SelectedNumberTray({
  selectedNumbers,
  onRemove
}: {
  selectedNumbers: readonly number[];
  onRemove: (value: number) => void;
}) {
  const emptySlots = MAX_SELECTION_COUNT - selectedNumbers.length;

  return (
    <div className="selection-tray" aria-label="Selected numbers">
      {selectedNumbers.map((number) => (
        <button
          aria-label={`Remove ${formatNumber(number)}`}
          className="selected-number"
          key={number}
          onClick={() => onRemove(number)}
          type="button"
        >
          {formatNumber(number)}
        </button>
      ))}
      {Array.from({ length: emptySlots }, (_, index) => (
        <span className="selected-placeholder" key={`empty-${index}`}>
          --
        </span>
      ))}
    </div>
  );
}

export function NumberPicker() {
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [step, setStep] = useState<PickerStep>("selecting");
  const hasCompleteSelection = selectedNumbers.length === MAX_SELECTION_COUNT;
  const validationMessage = hasCompleteSelection
    ? "Ready to review your guess."
    : `Choose ${MAX_SELECTION_COUNT - selectedNumbers.length} more number${
        MAX_SELECTION_COUNT - selectedNumbers.length === 1 ? "" : "s"
      }.`;

  const sortedSelection = useMemo(
    () => [...selectedNumbers].sort((a, b) => a - b),
    [selectedNumbers]
  );

  function toggleNumber(value: number) {
    setStep("selecting");
    setSelectedNumbers((current) => {
      if (current.includes(value)) {
        return current.filter((number) => number !== value);
      }

      if (current.length >= MAX_SELECTION_COUNT) {
        return current;
      }

      return [...current, value].sort((a, b) => a - b);
    });
  }

  function removeNumber(value: number) {
    setStep("selecting");
    setSelectedNumbers((current) => current.filter((number) => number !== value));
  }

  function clearSelection() {
    setStep("selecting");
    setSelectedNumbers([]);
  }

  function randomizeSelection() {
    setStep("selecting");
    setSelectedNumbers(getRandomSelection());
  }

  if (step === "success") {
    return (
      <main className="picker-shell success-shell">
        <section className="picker-panel success-panel" aria-labelledby="guess-success-title">
          <p className="eyebrow">Guess submitted</p>
          <h1 id="guess-success-title">Your simulated guess is locked.</h1>
          <p>
            This prototype state confirms the number flow before wallet approval and real on-chain
            submission are added.
          </p>
          <SelectedNumberTray selectedNumbers={sortedSelection} onRemove={() => undefined} />
          <div className="picker-actions">
            <Link className="secondary-link-action" href="/play">
              Back to live round
            </Link>
            <button
              className="primary-action"
              onClick={() => {
                setStep("selecting");
                setSelectedNumbers([]);
              }}
              type="button"
            >
              Pick again
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="picker-shell">
      <header className="picker-header">
        <Link className="back-link" href="/play">
          Live round
        </Link>
        <div>
          <p className="eyebrow">Turn TURN-0008</p>
          <strong>Pick 6 numbers</strong>
        </div>
      </header>

      <section className="picker-panel" aria-labelledby="number-picker-title">
        <div className="picker-title-row">
          <div>
            <p className="eyebrow">Number picker</p>
            <h1 id="number-picker-title">Choose six unique numbers.</h1>
          </div>
          <span>{selectedNumbers.length}/6</span>
        </div>

        <div className="sticky-selection">
          <SelectedNumberTray selectedNumbers={sortedSelection} onRemove={removeNumber} />
          <p
            className={hasCompleteSelection ? "selection-message ready" : "selection-message"}
            id="number-picker-status"
          >
            {validationMessage}
          </p>
        </div>

        {step === "review" ? (
          <section className="review-panel" aria-labelledby="guess-review-title">
            <p className="eyebrow">Review guess</p>
            <h2 id="guess-review-title">Confirm these numbers before simulated submission.</h2>
            <SelectedNumberTray selectedNumbers={sortedSelection} onRemove={removeNumber} />
            <dl className="review-costs">
              <div>
                <dt>Entry fee</dt>
                <dd>{MVP_FEES_SOL.guessSubmission.toFixed(2)} SOL</dd>
              </div>
              <div>
                <dt>Network fee</dt>
                <dd>Shown by wallet later</dd>
              </div>
            </dl>
            <div className="picker-actions">
              <button className="secondary-action" onClick={() => setStep("selecting")} type="button">
                Edit numbers
              </button>
              <button className="primary-action" onClick={() => setStep("success")} type="button">
                Submit simulation
              </button>
            </div>
          </section>
        ) : (
          <>
            <div className="picker-tools" aria-label="Selection tools">
              <button className="secondary-action" onClick={randomizeSelection} type="button">
                Randomize
              </button>
              <button className="secondary-action" onClick={clearSelection} type="button">
                Clear
              </button>
            </div>

            <div className="number-grid" aria-describedby="number-picker-status">
              {NUMBER_OPTIONS.map((number) => {
                const isSelected = selectedNumbers.includes(number);
                const isDisabled = !isSelected && selectedNumbers.length >= MAX_SELECTION_COUNT;

                return (
                  <button
                    aria-pressed={isSelected}
                    className="number-tile"
                    disabled={isDisabled}
                    key={number}
                    onClick={() => toggleNumber(number)}
                    type="button"
                  >
                    {formatNumber(number)}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </section>

      {step !== "review" ? (
        <nav className="picker-bottom-bar" aria-label="Number picker actions">
          <button className="secondary-action" onClick={randomizeSelection} type="button">
            Randomize
          </button>
          <button
            className="primary-action"
            disabled={!hasCompleteSelection}
            onClick={() => setStep("review")}
            type="button"
          >
            Review guess
          </button>
        </nav>
      ) : null}
    </main>
  );
}
