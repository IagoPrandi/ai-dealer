/**
 * A resilient reader for server-sent event streams.
 *
 * The wire format is plain SSE, but we read it with `fetch` rather than
 * `EventSource` for three reasons the rule preflight resume flow depends on:
 *
 *  1. `EventSource` only replays `Last-Event-ID` from a connection it opened
 *     itself. After a page reload it is a brand new object and sends nothing,
 *     which is exactly the case resume exists for — so the cursor has to travel
 *     in the query string anyway.
 *  2. `EventSource` never exposes a status code, so an expired job (404) is
 *     indistinguishable from a flaky network, and it would reconnect forever.
 *  3. A `fetch` reader is testable under `node --test`, which matters because
 *     the reconnect policy below is the riskiest part of the feature.
 */

export interface SseFrame {
  data: string;
  event: string;
  id: null | string;
}

/** The server no longer knows this stream. Terminal: do not reconnect. */
export class SseStreamExpiredError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "SseStreamExpiredError";
    this.status = status;
  }
}

/** Gave up reconnecting. The work may still be alive server-side. */
export class SseStreamDisconnectedError extends Error {
  readonly attempts: number;

  constructor(attempts: number, message: string) {
    super(message);
    this.name = "SseStreamDisconnectedError";
    this.attempts = attempts;
  }
}

/**
 * Stateful SSE line parser. Handles `\r\n`, multi-line `data:`, and `:` comment
 * heartbeats. Per the spec, `id` is sticky across frames until reassigned.
 */
export function createSseParser() {
  let buffer = "";
  let data: string[] = [];
  let event = "message";
  let id: null | string = null;

  const parseLine = (line: string, out: SseFrame[]) => {
    if (line === "") {
      if (data.length > 0) {
        out.push({ data: data.join("\n"), event, id });
      }
      data = [];
      event = "message";
      return;
    }
    if (line.startsWith(":")) {
      return;
    }
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const rawValue = colon === -1 ? "" : line.slice(colon + 1);
    const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;
    if (field === "data") {
      data.push(value);
    } else if (field === "event") {
      event = value;
    } else if (field === "id" && !value.includes("\0")) {
      id = value;
    }
  };

  return {
    /** Flushes a trailing frame that the stream ended without a blank line. */
    end(): SseFrame[] {
      const out: SseFrame[] = [];
      if (buffer) {
        parseLine(buffer, out);
        buffer = "";
      }
      parseLine("", out);
      return out;
    },
    push(chunk: string): SseFrame[] {
      const out: SseFrame[] = [];
      buffer += chunk.replace(/\r\n?/gu, "\n");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        parseLine(line, out);
      }
      return out;
    },
  };
}

export interface ReadSseStreamOptions {
  backoffMs?: (attempt: number) => number;
  cursor?: null | string;
  fetchImpl?: typeof fetch;
  maxAttempts?: number;
  onFrame: (frame: SseFrame) => "continue" | "stop";
  onOpen?: () => void;
  onReconnecting?: (attempt: number) => void;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
  /** Base URL without a cursor; the reader appends its own resume position. */
  url: string;
}

const DEFAULT_MAX_ATTEMPTS = 6;

function defaultBackoffMs(attempt: number) {
  return Math.min(500 * 2 ** attempt, 8_000);
}

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function withCursor(url: string, cursor: null | string) {
  if (!cursor) {
    return url;
  }
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}cursor=${encodeURIComponent(cursor)}`;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * Reads the stream to a terminal frame, reconnecting from the last seen id.
 *
 * Resolves when `onFrame` returns "stop". Rejects with SseStreamExpiredError if
 * the server says the stream is gone, or SseStreamDisconnectedError once the
 * reconnect budget runs out.
 */
export async function readSseStream(options: ReadSseStreamOptions) {
  const backoffMs = options.backoffMs ?? defaultBackoffMs;
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const sleep = options.sleep ?? defaultSleep;

  let cursor = options.cursor ?? null;
  let attempt = 0;

  while (true) {
    if (attempt > 0) {
      options.onReconnecting?.(attempt);
      await sleep(backoffMs(attempt - 1));
      if (options.signal?.aborted) {
        throw new DOMException("The stream was aborted.", "AbortError");
      }
    }

    let response: Response;
    try {
      response = await fetchImpl(withCursor(options.url, cursor), {
        cache: "no-store",
        headers: {
          accept: "text/event-stream",
          // Sent as well as the query cursor so the stream still resumes if a
          // future intermediary strips the query but keeps headers.
          ...(cursor ? { "last-event-id": cursor } : {}),
        },
        ...(options.signal ? { signal: options.signal } : {}),
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      attempt += 1;
      if (attempt >= maxAttempts) {
        throw new SseStreamDisconnectedError(
          attempt,
          "Lost the connection to the dealer and could not reconnect.",
        );
      }
      continue;
    }

    if (response.status === 204) {
      // Nothing further to send: the server considers this reader current.
      return;
    }
    if (response.status >= 400 && response.status < 500) {
      throw new SseStreamExpiredError(
        response.status,
        `The stream is no longer available (HTTP ${response.status}).`,
      );
    }
    if (!response.ok || !response.body) {
      attempt += 1;
      if (attempt >= maxAttempts) {
        throw new SseStreamDisconnectedError(
          attempt,
          "Lost the connection to the dealer and could not reconnect.",
        );
      }
      continue;
    }

    options.onOpen?.();

    // The retry budget is spent per attempt that makes no forward progress.
    // Resetting it merely because a connection opened would let a server that
    // accepts and immediately closes keep the reader looping forever.
    const cursorAtAttemptStart = cursor;

    const parser = createSseParser();
    const decoder = new TextDecoder();
    const reader = response.body.getReader();

    const handle = (frames: SseFrame[]) => {
      for (const frame of frames) {
        // Advance the cursor before dispatching, so a throw inside the handler
        // still leaves the resume position correct.
        if (frame.id) {
          cursor = frame.id;
        }
        if (options.onFrame(frame) === "stop") {
          return true;
        }
      }
      return false;
    };

    try {
      let stopped = false;
      while (!stopped) {
        const { done, value } = await reader.read();
        stopped = handle(parser.push(decoder.decode(value, { stream: !done })));
        if (stopped) {
          break;
        }
        if (done) {
          stopped = handle(parser.end());
          break;
        }
      }
      if (stopped) {
        return;
      }
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }

    // The body ended without a terminal frame: that is the mid-run drop.
    if (cursor !== cursorAtAttemptStart) {
      // New events did arrive, so the run is alive and the budget is refunded.
      attempt = 0;
    }
    attempt += 1;
    if (attempt >= maxAttempts) {
      throw new SseStreamDisconnectedError(
        attempt,
        "Lost the connection to the dealer and could not reconnect.",
      );
    }
  }
}
