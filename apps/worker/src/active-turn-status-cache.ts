export interface ActiveTurnStatusLoadResult<T> {
  freshness: "fresh" | "stale";
  observedAt: string;
  source: "cache" | "rpc";
  value: T;
}

interface ActiveTurnStatusCacheOptions {
  freshForMs: number;
  maxStaleMs: number;
  now?: () => number;
}

/**
 * Coalesces bursts of read-only turn-status requests and keeps the last
 * successful observation available during a short RPC outage. Callers that
 * gate a transaction can require a fresh RPC read and never receive stale
 * state.
 */
export function createActiveTurnStatusLoader<T>(
  loadFresh: () => Promise<T>,
  options: ActiveTurnStatusCacheOptions,
) {
  const now = options.now ?? Date.now;
  let cached: { observedAtMs: number; value: T } | null = null;
  let inFlight: Promise<{ observedAtMs: number; value: T }> | null = null;

  async function readFresh() {
    if (!inFlight) {
      inFlight = loadFresh()
        .then((value) => {
          const observation = { observedAtMs: now(), value };
          cached = observation;
          return observation;
        })
        .finally(() => {
          inFlight = null;
        });
    }
    return inFlight;
  }

  return async function loadActiveTurnStatus({
    requireFresh = false,
  }: { requireFresh?: boolean } = {}): Promise<ActiveTurnStatusLoadResult<T>> {
    const cachedAgeMs = cached ? now() - cached.observedAtMs : Number.POSITIVE_INFINITY;
    if (!requireFresh && cached && cachedAgeMs <= options.freshForMs) {
      return {
        freshness: "fresh",
        observedAt: new Date(cached.observedAtMs).toISOString(),
        source: "cache",
        value: cached.value,
      };
    }

    try {
      const observation = await readFresh();
      return {
        freshness: "fresh",
        observedAt: new Date(observation.observedAtMs).toISOString(),
        source: "rpc",
        value: observation.value,
      };
    } catch (error) {
      const staleAgeMs = cached ? now() - cached.observedAtMs : Number.POSITIVE_INFINITY;
      if (!requireFresh && cached && staleAgeMs <= options.maxStaleMs) {
        return {
          freshness: "stale",
          observedAt: new Date(cached.observedAtMs).toISOString(),
          source: "cache",
          value: cached.value,
        };
      }
      throw error;
    }
  };
}
