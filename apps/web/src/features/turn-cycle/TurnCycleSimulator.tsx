"use client";

import { TURN_DURATION_CYCLE_HOURS } from "@idealer/constants";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

const ACCELERATED_PHASE_INTERVAL_MS = 900;
const PHASE_PROGRESS = [0, 75, 96.7, 100] as const;

type TurnPhase = "Open" | "Voting closed" | "Late entry" | "Draw";

interface SimulationEvent {
  id: string;
  detail: string;
}

const PHASES: readonly TurnPhase[] = ["Open", "Voting closed", "Late entry", "Draw"];

function getCycleDuration(index: number) {
  const duration = TURN_DURATION_CYCLE_HOURS[index];

  if (duration === undefined) {
    throw new Error(`Invalid turn cycle index: ${index}`);
  }

  return duration;
}

function getPhase(index: number) {
  const phase = PHASES[index];

  if (phase === undefined) {
    throw new Error(`Invalid turn phase index: ${index}`);
  }

  return phase;
}

function getPhaseProgress(index: number) {
  const progress = PHASE_PROGRESS[index];

  if (progress === undefined) {
    throw new Error(`Invalid turn phase progress index: ${index}`);
  }

  return progress;
}

function formatDurationSeconds(totalSeconds: number) {
  const roundedSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(roundedSeconds / 3600);
  const minutes = Math.floor((roundedSeconds % 3600) / 60);
  const seconds = roundedSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }

  return `${minutes.toString().padStart(2, "0")}m ${seconds.toString().padStart(2, "0")}s`;
}

function formatMilestoneOffset(durationHours: number, progress: number) {
  return formatDurationSeconds(durationHours * 3600 * progress);
}

function getMilestoneState(phaseIndex: number, milestoneIndex: number) {
  if (phaseIndex > milestoneIndex) {
    return "Completed";
  }

  if (phaseIndex === milestoneIndex) {
    return "Current";
  }

  return "Upcoming";
}

export function TurnCycleSimulator() {
  const [cycleIndex, setCycleIndex] = useState(0);
  const [turnNumber, setTurnNumber] = useState(1);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [isAccelerated, setIsAccelerated] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [activity, setActivity] = useState<readonly SimulationEvent[]>([
    { id: "event-initial", detail: "Turn 1 opened at cycle step 1/4." }
  ]);
  const eventSequence = useRef(0);

  const currentDuration = getCycleDuration(cycleIndex);
  const nextCycleIndex = (cycleIndex + 1) % TURN_DURATION_CYCLE_HOURS.length;
  const nextDuration = getCycleDuration(nextCycleIndex);
  const phase = getPhase(phaseIndex);
  const progress = getPhaseProgress(phaseIndex);
  const remainingSeconds = currentDuration * 3600 * (1 - progress / 100);

  const milestoneRows = useMemo(
    () => [
      {
        label: "Turn opens",
        offset: "0%",
        time: "00m 00s",
        state: getMilestoneState(phaseIndex, 0)
      },
      {
        label: "Voting closes",
        offset: "75%",
        time: formatMilestoneOffset(currentDuration, 0.75),
        state: getMilestoneState(phaseIndex, 1)
      },
      {
        label: "Guesses close",
        offset: "96.7%",
        time: formatMilestoneOffset(currentDuration, 0.967),
        state: getMilestoneState(phaseIndex, 2)
      },
      {
        label: "Draw and rollover",
        offset: "100%",
        time: formatMilestoneOffset(currentDuration, 1),
        state: getMilestoneState(phaseIndex, 3)
      }
    ],
    [currentDuration, phaseIndex]
  );

  function addActivity(detail: string) {
    eventSequence.current += 1;
    setActivity((current) => [
      { id: `simulation-${eventSequence.current}`, detail },
      ...current
    ]);
  }

  function rollToNextTurn() {
    const upcomingTurn = turnNumber + 1;
    const upcomingCycleIndex = (cycleIndex + 1) % TURN_DURATION_CYCLE_HOURS.length;

    setTurnNumber(upcomingTurn);
    setCycleIndex(upcomingCycleIndex);
    setPhaseIndex(0);
    addActivity(
      `Turn ${upcomingTurn} opened at cycle step ${upcomingCycleIndex + 1}/${TURN_DURATION_CYCLE_HOURS.length}.`
    );
  }

  function advancePhase() {
    if (phaseIndex === PHASES.length - 1) {
      rollToNextTurn();
      return;
    }

    const nextPhaseIndex = phaseIndex + 1;
    setPhaseIndex(nextPhaseIndex);
    addActivity(`Turn ${turnNumber}: ${getPhase(nextPhaseIndex)}.`);
  }

  useEffect(() => {
    if (!isAccelerated || !isRunning) {
      return;
    }

    const interval = window.setInterval(advancePhase, ACCELERATED_PHASE_INTERVAL_MS);

    return () => window.clearInterval(interval);
  });

  function toggleAcceleratedMode() {
    setIsAccelerated((current) => {
      if (current) {
        setIsRunning(false);
      }

      return !current;
    });
  }

  function resetSimulation() {
    setCycleIndex(0);
    setTurnNumber(1);
    setPhaseIndex(0);
    setIsRunning(false);
    setActivity([{ id: "event-reset", detail: "Simulation reset to turn 1, cycle step 1/4." }]);
  }

  return (
    <main className="cycle-shell">
      <header className="picker-header">
        <Link className="back-link" href="/play">
          Live round
        </Link>
        <div>
          <p className="eyebrow">Prototype scheduler</p>
          <strong>Simulated turn cycle</strong>
        </div>
      </header>

      <div className="cycle-content">
        <section className="cycle-summary" aria-labelledby="cycle-title">
          <div className="cycle-summary-heading">
            <div>
              <p className="eyebrow">Turn {turnNumber}</p>
              <h1 id="cycle-title">{phase}</h1>
              <p>
                Step {cycleIndex + 1}/{TURN_DURATION_CYCLE_HOURS.length}. Current turn is{" "}
                {currentDuration}h; next turn is {nextDuration}h.
              </p>
            </div>
            <div className="cycle-countdown">
              <span>Time to draw</span>
              <strong className="numeric">{formatDurationSeconds(remainingSeconds)}</strong>
            </div>
          </div>

          <div
            aria-label={`${progress}% of current turn elapsed`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={progress}
            className="cycle-progress"
            role="progressbar"
          >
            <span style={{ width: `${progress}%` }} />
          </div>

          <ol className="cycle-strip" aria-label="Turn duration cycle">
            {TURN_DURATION_CYCLE_HOURS.map((duration, index) => (
              <li aria-current={index === cycleIndex ? "step" : undefined} key={`${duration}-${index}`}>
                <span>Step {index + 1}</span>
                <strong>{duration}h</strong>
              </li>
            ))}
          </ol>
        </section>

        <section className="simulation-controls" aria-labelledby="controls-title">
          <div className="section-heading">
            <p className="eyebrow">Simulation controls</p>
            <span>{isAccelerated ? "Accelerated mode" : "Manual mode"}</span>
          </div>
          <h2 id="controls-title">Test every phase without waiting hours.</h2>
          <div className="simulation-toggle-row">
            <button
              aria-pressed={isAccelerated}
              className={isAccelerated ? "simulation-toggle active" : "simulation-toggle"}
              onClick={toggleAcceleratedMode}
              type="button"
            >
              Accelerated simulation
            </button>
            <button
              className="secondary-action"
              disabled={!isAccelerated}
              onClick={() => setIsRunning((current) => !current)}
              type="button"
            >
              {isRunning ? "Pause accelerated run" : "Start accelerated run"}
            </button>
          </div>
          <div className="simulation-actions">
            <button className="secondary-action" onClick={advancePhase} type="button">
              Advance phase
            </button>
            <button className="secondary-action" onClick={() => setPhaseIndex(2)} type="button">
              Jump to late entry
            </button>
            <button className="secondary-action" onClick={rollToNextTurn} type="button">
              Next turn
            </button>
            <button className="secondary-action" onClick={resetSimulation} type="button">
              Reset
            </button>
          </div>
        </section>

        {phase === "Late entry" ? (
          <section className="late-entry-panel" aria-labelledby="late-entry-title">
            <p className="eyebrow">Late entry edge state</p>
            <h2 id="late-entry-title">Guess submission is closed near the draw.</h2>
            <p>
              Follow this result or prepare for the next {nextDuration}h turn. Voting and new
              guesses are no longer accepted.
            </p>
          </section>
        ) : null}

        <section className="cycle-timeline" aria-labelledby="cycle-timeline-title">
          <div className="section-heading">
            <p className="eyebrow">Proportional timing</p>
            <span>{currentDuration}h turn</span>
          </div>
          <h2 id="cycle-timeline-title">Lifecycle milestones</h2>
          <ol>
            {milestoneRows.map((milestone) => (
              <li className={milestone.state.toLowerCase()} key={milestone.label}>
                <div>
                  <strong>{milestone.label}</strong>
                  <span>{milestone.offset} of turn</span>
                </div>
                <div>
                  <strong>{milestone.time}</strong>
                  <span>{milestone.state}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="cycle-activity" aria-labelledby="cycle-activity-title">
          <div className="section-heading">
            <p className="eyebrow">Simulation activity</p>
            <span>Newest first</span>
          </div>
          <h2 id="cycle-activity-title">Turn events</h2>
          <ul className="activity-list">
            {activity.map((event) => (
              <li key={event.id}>
                <strong>{event.detail}</strong>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
