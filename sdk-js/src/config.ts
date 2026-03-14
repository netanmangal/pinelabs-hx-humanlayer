export const DEFAULT_API_BASE_URL = "http://localhost:8001";

export interface HumanLayerConfig {
  apiKey: string;
  projectId: string;
  apiBaseUrl: string;
  environment: string;
  enabled: boolean;
  debug: boolean;
  flushInterval: number; // seconds
  batchSize: number;
  maxQueueSize: number;
}

export function buildConfig(
  overrides: Partial<HumanLayerConfig> & { apiKey: string; projectId: string }
): HumanLayerConfig {
  return {
    apiKey: overrides.apiKey ?? process.env.HUMANLAYER_API_KEY ?? "",
    projectId: overrides.projectId ?? process.env.HUMANLAYER_PROJECT_ID ?? "",
    apiBaseUrl:
      overrides.apiBaseUrl ??
      process.env.HUMANLAYER_API_BASE_URL ??
      DEFAULT_API_BASE_URL,
    environment: overrides.environment ?? process.env.NODE_ENV ?? "development",
    enabled: overrides.enabled ?? true,
    debug:
      overrides.debug ??
      (process.env.HUMANLAYER_DEBUG ?? "false").toLowerCase() === "true",
    flushInterval: overrides.flushInterval ?? 5,
    batchSize: overrides.batchSize ?? 50,
    maxQueueSize: overrides.maxQueueSize ?? 500,
  };
}
