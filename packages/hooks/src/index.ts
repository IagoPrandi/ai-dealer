export type HookCriticality = "critical" | "operational" | "analytics";

export interface LifecycleHook<TPayload> {
  name: string;
  criticality: HookCriticality;
  handle(payload: TPayload): Promise<void>;
}
