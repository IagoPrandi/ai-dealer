import pg from "pg";
import { createClient } from "redis";

import {
  ensureModelLoaded,
  resolveEscalationModel,
  resolveRuleAgentConfig,
  resolveTranslateToEnglish,
  type ModelWarmupResult,
  type RuleAgentConfig,
} from "./llm.js";
import {
  resolveGuardianConfig,
  type GuardianConfig,
} from "./guardian.js";

const { Pool } = pg;

export const DEALER_MODEL_READY_TTL_MS = 8 * 60 * 1_000;
const HEALTH_CHECK_TIMEOUT_MS = 5_000;

export interface DealerRuntime {
  agent: RuleAgentConfig;
  escalationModel: string;
  guardian: GuardianConfig;
  translateToEnglish: boolean;
}

type DealerRuntimeCache =
  | { error: unknown; kind: "error" }
  | { kind: "ready"; runtime: DealerRuntime };

interface ModelReadinessEntry {
  checkedAt: number | null;
  promise: null | Promise<ModelWarmupResult>;
  result: null | ModelWarmupResult;
}

let dealerRuntimeCache: DealerRuntimeCache | null = null;
const modelReadiness = new Map<string, ModelReadinessEntry>();
let dealerWarmupState: "idle" | "ready" | "warming" = "idle";
let dealerWarmupPromise: Promise<void> | null = null;

let shutdownController = new AbortController();
const requestControllers = new Set<AbortController>();
const shutdownTasks = new Set<() => Promise<void> | void>();
let shutdownPromise: Promise<void> | null = null;

type HealthPostgresPool = InstanceType<typeof Pool>;
const fallbackHealthPostgresPools = new Map<string, HealthPostgresPool>();

function createHealthRedisClient(redisUrl: string) {
  return createClient({
    socket: { connectTimeout: HEALTH_CHECK_TIMEOUT_MS },
    url: redisUrl,
  });
}

interface HealthRedisResource {
  client: ReturnType<typeof createHealthRedisClient>;
  connectPromise: Promise<unknown> | null;
}

const healthRedisResources = new Map<string, HealthRedisResource>();

export function getDealerRuntime(): DealerRuntime {
  if (!dealerRuntimeCache) {
    try {
      dealerRuntimeCache = {
        kind: "ready",
        runtime: {
          agent: resolveRuleAgentConfig(),
          escalationModel: resolveEscalationModel(),
          guardian: resolveGuardianConfig(),
          translateToEnglish: resolveTranslateToEnglish(),
        },
      };
    } catch (error) {
      dealerRuntimeCache = { error, kind: "error" };
    }
  }

  if (dealerRuntimeCache.kind === "error") {
    throw dealerRuntimeCache.error;
  }
  return dealerRuntimeCache.runtime;
}

export function resetDealerRuntimeForTests() {
  dealerRuntimeCache = null;
  modelReadiness.clear();
  dealerWarmupState = "idle";
  dealerWarmupPromise = null;
}

export async function ensureDealerModelReady(
  model: string,
  signal?: AbortSignal,
  nowMs = Date.now(),
): Promise<ModelWarmupResult> {
  const runtime = getDealerRuntime();
  const current = modelReadiness.get(model);
  if (current?.promise) {
    return current.promise;
  }
  if (
    current?.result &&
    current.checkedAt !== null &&
    nowMs - current.checkedAt < DEALER_MODEL_READY_TTL_MS
  ) {
    return current.result;
  }

  const entry: ModelReadinessEntry = current ?? {
    checkedAt: null,
    promise: null,
    result: null,
  };
  const promise = ensureModelLoaded(
    model,
    runtime.agent,
    180_000,
    signal,
  )
    .then((result) => {
      entry.checkedAt = nowMs;
      entry.result = result;
      return result;
    })
    .finally(() => {
      entry.promise = null;
    });
  entry.promise = promise;
  modelReadiness.set(model, entry);
  return promise;
}

export function storeDealerWarmup(promise: Promise<void>) {
  dealerWarmupState = "warming";
  const stored = promise.finally(() => {
    if (dealerWarmupPromise === stored) {
      dealerWarmupState = "ready";
      dealerWarmupPromise = null;
    }
  });
  dealerWarmupPromise = stored;
  return stored;
}

export function getDealerReadiness(): "ready" | "unconfigured" | "warming" {
  try {
    getDealerRuntime();
  } catch {
    return "unconfigured";
  }
  return dealerWarmupState === "warming" ? "warming" : "ready";
}

export function getDealerWarmupPromise() {
  return dealerWarmupPromise;
}

export function registerShutdownTask(task: () => Promise<void> | void) {
  shutdownTasks.add(task);
  return () => shutdownTasks.delete(task);
}

export function trackRequest(controller: AbortController) {
  if (shutdownController.signal.aborted) {
    controller.abort(shutdownController.signal.reason);
    return () => undefined;
  }
  requestControllers.add(controller);
  return () => requestControllers.delete(controller);
}

export function getShutdownSignal(): AbortSignal {
  return shutdownController.signal;
}

export function runShutdown(): Promise<void> {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  shutdownPromise = (async () => {
    const reason = new DOMException("The API is shutting down.", "AbortError");
    shutdownController.abort(reason);
    for (const controller of requestControllers) {
      controller.abort(reason);
    }
    requestControllers.clear();

    const failures: unknown[] = [];
    for (const task of [...shutdownTasks]) {
      try {
        await task();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, "API shutdown tasks failed.");
    }
  })();
  return shutdownPromise;
}

function withTimeout<T>(promise: Promise<T>, operation: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`${operation} timed out.`));
    }, HEALTH_CHECK_TIMEOUT_MS);
    timeout.unref();
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function getFallbackHealthPostgresPool(databaseUrl: string) {
  const existing = fallbackHealthPostgresPools.get(databaseUrl);
  if (existing) {
    return existing;
  }
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: HEALTH_CHECK_TIMEOUT_MS,
  });
  fallbackHealthPostgresPools.set(databaseUrl, pool);
  return pool;
}

export async function checkPostgresHealth(
  databaseUrl: string,
  sharedPool: HealthPostgresPool | null,
): Promise<"error" | "ok"> {
  const pool = sharedPool ?? getFallbackHealthPostgresPool(databaseUrl);
  try {
    await withTimeout(pool.query("select 1"), "Postgres health query");
    return "ok";
  } catch {
    return "error";
  }
}

function getHealthRedisResource(redisUrl: string) {
  const existing = healthRedisResources.get(redisUrl);
  if (existing) {
    return existing;
  }
  const client = createHealthRedisClient(redisUrl);
  // node-redis emits connection errors as events even when connect()/ping()
  // reject. The health result carries the failure; this listener prevents an
  // otherwise-unhandled EventEmitter error from terminating the API.
  client.on("error", () => undefined);
  const resource = { client, connectPromise: null };
  healthRedisResources.set(redisUrl, resource);
  return resource;
}

export async function checkRedisHealth(
  redisUrl: string,
): Promise<"error" | "ok"> {
  const resource = getHealthRedisResource(redisUrl);
  try {
    if (!resource.client.isOpen) {
      if (!resource.connectPromise) {
        resource.connectPromise = resource.client.connect().then(() => undefined);
      }
      const connection = resource.connectPromise;
      try {
        await withTimeout(connection, "Redis health connection");
      } finally {
        if (resource.connectPromise === connection) {
          resource.connectPromise = null;
        }
      }
    }
    await withTimeout(resource.client.ping(), "Redis health ping");
    return "ok";
  } catch {
    return "error";
  }
}

export async function closeHealthResources() {
  const closes: Promise<unknown>[] = [];
  for (const pool of fallbackHealthPostgresPools.values()) {
    closes.push(pool.end());
  }
  fallbackHealthPostgresPools.clear();

  for (const resource of healthRedisResources.values()) {
    if (resource.client.isOpen) {
      closes.push(
        withTimeout(resource.client.close(), "Redis health close").catch(() => {
          resource.client.destroy();
        }),
      );
    } else {
      resource.client.destroy();
    }
  }
  healthRedisResources.clear();
  await Promise.all(closes);
}

export async function resetLifespanForTests() {
  await closeHealthResources();
  resetDealerRuntimeForTests();
  requestControllers.clear();
  shutdownTasks.clear();
  shutdownController = new AbortController();
  shutdownPromise = null;
}
