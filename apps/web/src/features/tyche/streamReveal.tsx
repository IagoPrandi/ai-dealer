"use client";

/**
 * Agent streaming - style 1a "Terminal typewriter" (design_handoff_streaming_1a).
 *
 * Text enters a buffer and a single requestAnimationFrame loop reveals it at a
 * fixed 55 chars/s, so the cadence never follows the model's bursts. Blocks
 * appear in sequence: a card mounts when its first character is written, and the
 * next block starts 500ms after the previous one drains.
 *
 * A block is either *live* or complete:
 *
 *  - **live** - text is still arriving over the wire (the dealer answer stream).
 *    An empty buffer keeps the caret blinking instead of ending the block, and a
 *    buffer that runs far ahead may drain at up to 3x.
 *  - **complete** - the whole text was already known when the block was planned
 *    (compiler verdicts, interpretation cards, history). It always reveals at
 *    exactly 55 chars/s: there is no stream to catch up with, so applying the
 *    catch-up rule here would make every long message fly past at 165 chars/s.
 *
 * Messages that were already concluded never get a plan at all, so history and
 * reopened drafts render complete without re-animating.
 */

import { useEffect, useMemo, useRef, useState } from "react";

export const STREAM_CHARS_PER_SECOND = 55;
export const STREAM_START_DELAY_MS = 400;
export const STREAM_BLOCK_GAP_MS = 500;
/** Above this many buffered chars a live stream may drain at up to 3x, so text
 * the player already received is never held hostage by the fixed cadence. */
export const STREAM_CATCH_UP_THRESHOLD = 240;
export const STREAM_CATCH_UP_FACTOR = 3;

export interface StreamPlanBlock {
  key: string;
  /** True while more text may still arrive for this block. */
  live?: boolean;
  /** Body texts revealed back-to-back inside this block, in render order. */
  segments: string[];
}

export interface StreamPlan {
  blocks: StreamPlanBlock[];
  /**
   * Identity of the response being revealed. The reveal restarts only when this
   * changes, which is what lets a live block's text grow mid-animation.
   */
  id: string;
}

export interface StreamCursorPosition {
  chars: number;
  segment: number;
}

/** Chars received but not yet revealed in this block - the drain buffer. */
export function charsBufferedInBlock(
  block: StreamPlanBlock,
  cursor: StreamCursorPosition,
) {
  let buffered = 0;
  for (let seg = cursor.segment; seg < block.segments.length; seg += 1) {
    buffered +=
      (block.segments[seg]?.length ?? 0) -
      (seg === cursor.segment ? cursor.chars : 0);
  }
  return buffered;
}

/**
 * 55 chars/s. A live stream whose buffer ran far ahead drains at 3x; a complete
 * block never does, because its buffer is "ahead" by construction.
 */
export function streamDrainRate(buffered: number, live = false) {
  return live && buffered > STREAM_CATCH_UP_THRESHOLD
    ? STREAM_CHARS_PER_SECOND * STREAM_CATCH_UP_FACTOR
    : STREAM_CHARS_PER_SECOND;
}

/**
 * Reveals up to `count` chars, rolling across segment boundaries. Never crosses
 * a block boundary: the 500ms block gap belongs to the sequencer.
 */
export function advanceStreamCursor(
  block: StreamPlanBlock,
  cursor: StreamCursorPosition,
  count: number,
): { blockDone: boolean } & StreamCursorPosition {
  let { chars, segment } = cursor;
  let remaining = count;
  for (;;) {
    const length = block.segments[segment]?.length ?? 0;
    if (chars < length) {
      const take = Math.min(remaining, length - chars);
      chars += take;
      remaining -= take;
    }
    if (chars < length || segment >= block.segments.length - 1) {
      break;
    }
    segment += 1;
    chars = 0;
  }
  const lastIndex = block.segments.length - 1;
  // A live block is never "done": more text may still arrive for it.
  const blockDone =
    !block.live &&
    (lastIndex < 0 ||
      (segment === lastIndex &&
        chars >= (block.segments[lastIndex]?.length ?? 0)));
  return { blockDone, chars, segment };
}

export interface StreamPlanArgs {
  /** Messages below this index existed before the run and never re-animate. */
  baselineMessageCount: number;
  /** Questions of the clarification card opening now; null when none opens. */
  guidanceQuestions: null | readonly string[];
  interpretation: null | {
    needsClarification: boolean;
    normalizedText: string;
    officialInterpretation: string;
  };
  /** False when the snapshot carries the same object shown before the run. */
  interpretationIsNew: boolean;
  messages: readonly { text: string; who: "ai" | "user" }[];
  planId: string;
  rule: null | {
    normalizedText?: null | string;
    officialInterpretation?: null | string;
  };
  ruleIsNew: boolean;
  /** True while the last dealer message is still arriving over the wire. */
  streaming: boolean;
}

/** The rule card streams only its model-authored prose, in render order. */
export function ruleStreamSegments(rule: {
  normalizedText?: null | string;
  officialInterpretation?: null | string;
}) {
  return [rule.normalizedText, rule.officialInterpretation].filter(
    (segment): segment is string => Boolean(segment),
  );
}

/**
 * Orders one dealer response into typed blocks. Returns null when the snapshot
 * brought nothing new to animate.
 */
export function buildStreamPlan(args: StreamPlanArgs): null | StreamPlan {
  const blocks: StreamPlanBlock[] = [];
  const lastIndex = args.messages.length - 1;
  args.messages.forEach((message, index) => {
    if (index >= args.baselineMessageCount && message.who === "ai") {
      blocks.push({
        key: `msg:${index}`,
        // Only the newest message can still be growing.
        ...(args.streaming && index === lastIndex ? { live: true } : {}),
        segments: [message.text],
      });
    }
  });
  if (
    args.interpretation &&
    !args.interpretation.needsClarification &&
    args.interpretationIsNew
  ) {
    blocks.push({
      key: "interpretation",
      segments: [
        args.interpretation.normalizedText,
        args.interpretation.officialInterpretation,
      ],
    });
  }
  if (args.rule && args.ruleIsNew) {
    blocks.push({ key: "rule", segments: ruleStreamSegments(args.rule) });
  }
  // A question-less clarification card still gets a (zero-char) block, so it
  // enters the screen in sequence instead of popping while the bubble types.
  if (args.guidanceQuestions !== null) {
    blocks.push({ key: "guidance", segments: [...args.guidanceQuestions] });
  }
  return blocks.length > 0 ? { blocks, id: args.planId } : null;
}

type StreamPhase = "done" | "gap" | "idle" | "start" | "typing";

interface StreamRevealState {
  blockIndex: number;
  chars: number;
  /** Guards against reading a stale cursor when the plan just changed. */
  forPlanId: null | string;
  phase: StreamPhase;
  segment: number;
  /** Bumps on every reveal step, for the auto-scroll effect. */
  tick: number;
}

export interface StreamBlock {
  seg(index: number, full: string): { caret: boolean; text: string };
}

export interface StreamReveal {
  /** Non-null only while this block is being written (caret + live dot). */
  blockFor(key: string): null | StreamBlock;
  /** A card mounts when its first character is written, not before. */
  isBlockVisible(key: string): boolean;
  /** True when nothing is animating: no plan, or the plan fully drained. */
  settled: boolean;
  tick: number;
}

const IDLE_STATE: StreamRevealState = {
  blockIndex: 0,
  chars: 0,
  forPlanId: null,
  phase: "idle",
  segment: 0,
  tick: 0,
};

const EMPTY_BLOCK: StreamPlanBlock = { key: "", segments: [] };

export function useStreamReveal(plan: null | StreamPlan): StreamReveal {
  const [state, setState] = useState<StreamRevealState>(IDLE_STATE);
  // The drain loop reads the plan through a ref so a live block's text can grow
  // between frames without restarting the animation.
  const planRef = useRef<null | StreamPlan>(plan);
  planRef.current = plan;
  const planId = plan?.id ?? null;

  useEffect(() => {
    const planned = planRef.current;
    if (!planId || !planned || planned.blocks.length === 0) {
      setState(IDLE_STATE);
      return undefined;
    }
    const blockAt = (index: number) =>
      planRef.current?.blocks[index] ?? EMPTY_BLOCK;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Reduced motion: every block renders complete at once, no caret. The
      // static live dot stays as the "writing" indicator.
      setState({ ...IDLE_STATE, forPlanId: planId, phase: "done" });
      return undefined;
    }

    let blockIndex = 0;
    let segment = 0;
    let chars = 0;
    let tick = 0;
    let phase: StreamPhase = "start";
    let acc = 0;
    let last = performance.now();
    let waitUntil = last + STREAM_START_DELAY_MS;
    let raf = 0;

    const commit = () =>
      setState({ blockIndex, chars, forPlanId: planId, phase, segment, tick });

    const frame = (now: number) => {
      if (phase === "start" || phase === "gap") {
        if (now >= waitUntil) {
          if (phase === "gap") {
            blockIndex += 1;
            segment = 0;
            chars = 0;
          }
          phase = "typing";
          acc = 0;
          last = now;
          tick += 1;
          commit();
        }
      } else if (phase === "typing") {
        const block = blockAt(blockIndex);
        const buffered = charsBufferedInBlock(block, { chars, segment });
        if (buffered === 0 && block.live) {
          // Stream open, nothing buffered: hold with the caret blinking, and
          // bank no time credit - otherwise a long stall would dump the next
          // burst on screen all at once.
          acc = 0;
          last = now;
        } else if (buffered === 0) {
          const blocks = planRef.current?.blocks.length ?? 0;
          if (blockIndex >= blocks - 1) {
            phase = "done";
          } else {
            phase = "gap";
            waitUntil = now + STREAM_BLOCK_GAP_MS;
          }
          tick += 1;
          commit();
        } else {
          // Rate-limited drain: accumulate elapsed-time credit and reveal whole
          // characters from it - never one timer per character.
          acc += ((now - last) * streamDrainRate(buffered, block.live)) / 1000;
          last = now;
          const step = Math.floor(acc);
          if (step > 0) {
            acc -= step;
            const advanced = advanceStreamCursor(
              block,
              { chars, segment },
              step,
            );
            chars = advanced.chars;
            segment = advanced.segment;
            tick += 1;
            commit();
          }
        }
      }
      if (phase !== "done") {
        raf = requestAnimationFrame(frame);
      }
    };

    commit();
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [planId]);

  const keyIndex = useMemo(
    () => new Map((plan?.blocks ?? []).map((block, index) => [block.key, index])),
    [plan],
  );

  return useMemo<StreamReveal>(() => {
    // A plan whose cursor has not been initialised yet behaves like the
    // pre-start delay, so finished text never flashes before animating.
    const current = state.forPlanId === planId ? state : null;
    const settled = !planId || current?.phase === "done";
    return {
      blockFor(key) {
        if (settled || !current || current.phase !== "typing") {
          return null;
        }
        if (keyIndex.get(key) !== current.blockIndex) {
          return null;
        }
        const { chars, segment } = current;
        return {
          seg(index, full) {
            if (index < segment) {
              return { caret: false, text: full };
            }
            if (index > segment) {
              return { caret: false, text: "" };
            }
            return { caret: true, text: full.slice(0, chars) };
          },
        };
      },
      isBlockVisible(key) {
        if (settled) {
          return true;
        }
        const index = keyIndex.get(key);
        if (index === undefined) {
          return true;
        }
        if (!current || current.phase === "start") {
          return false;
        }
        return index <= current.blockIndex;
      },
      settled,
      tick: current?.tick ?? 0,
    };
  }, [keyIndex, planId, state]);
}

/**
 * One streamed text segment. Inside an animating block it renders the revealed
 * slice with the block caret glued to the last character; everywhere else it
 * renders the full text, so history needs no special casing.
 */
export function StreamText({
  block,
  seg = 0,
  text,
}: {
  block: null | StreamBlock;
  seg?: number;
  text: string;
}) {
  if (!block) {
    return <>{text}</>;
  }
  const shown = block.seg(seg, text);
  return (
    <>
      {shown.text}
      {shown.caret ? (
        <span aria-hidden="true" className="ide-stream-caret" />
      ) : null}
    </>
  );
}

/** The 7x7 square that pulses next to a block label while it is written. */
export function StreamLiveDot({ block }: { block: null | StreamBlock }) {
  if (!block) {
    return null;
  }
  return <span aria-hidden="true" className="ide-stream-dot" />;
}
