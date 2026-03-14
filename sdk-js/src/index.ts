import "dotenv/config";
import { buildConfig, HumanLayerConfig } from "./config";
import { HumanLayerClient } from "./client";
import { HumanLayerCallbackHandler } from "./callbackHandler";
import { Session, getCurrentSession, setCurrentSession } from "./session";
import { _setHitlClient, requestApproval, wrapTools, WrapToolsOptions } from "./hitl";
import {
  HumanLayerError,
  ConfigurationError,
  APIError,
  NotInitializedError,
  SessionError,
  HITLRejectedError,
  HITLTimeoutError,
} from "./exceptions";

// Module-level state
let _client: HumanLayerClient | undefined;
let _config: HumanLayerConfig | undefined;
let _callbackHandler: HumanLayerCallbackHandler | undefined;
let _defaultSession: Session | undefined;
let _initialized = false;

export function init(
  overrides: Partial<HumanLayerConfig> & { apiKey?: string; projectId?: string } = {}
): void {
  const apiKey = overrides.apiKey ?? process.env.HUMANLAYER_API_KEY ?? "";
  const projectId = overrides.projectId ?? process.env.HUMANLAYER_PROJECT_ID ?? "";

  if (!apiKey) {
    throw new ConfigurationError(
      "apiKey is required. Pass it to init() or set HUMANLAYER_API_KEY env var."
    );
  }
  if (!projectId) {
    throw new ConfigurationError(
      "projectId is required. Pass it to init() or set HUMANLAYER_PROJECT_ID env var."
    );
  }

  _config = buildConfig({ ...overrides, apiKey, projectId });
  _client = new HumanLayerClient(_config);
  _callbackHandler = new HumanLayerCallbackHandler();

  // Create and start default session
  const sessionName =
    (overrides as Record<string, unknown>).sessionName as string | undefined ??
    process.env.AGENT_SESSION_NAME ??
    `${projectId}-${Date.now()}`;
  _defaultSession = new Session(sessionName, { projectId });
  _defaultSession.bindClient(_client);
  setCurrentSession(_defaultSession);

  // Wire HITL
  _setHitlClient(_client, _config.debug);

  // Patch LangChain runnables for auto-instrumentation
  _patchLangChain();

  _initialized = true;

  if (_config.debug) {
    console.log(
      `[HumanLayer] Initialized — project: ${projectId}, session: ${sessionName}`
    );
  }

  // Start session async (fire-and-forget)
  _defaultSession.start().catch((err) => {
    if (_config?.debug) {
      console.warn("[HumanLayer] Session start failed:", err.message);
    }
  });

  // Graceful shutdown on process exit
  process.on("exit", () => {
    // Synchronous-safe: just flush what we can
    if (_client && _defaultSession) {
      _defaultSession
        .end("completed")
        .catch(() => {})
        .finally(() => _client?.shutdown().catch(() => {}));
    }
  });
  process.on("SIGINT", () => {
    shutdown().finally(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    shutdown().finally(() => process.exit(0));
  });
}

export async function shutdown(): Promise<void> {
  if (!_initialized || !_client) return;
  try {
    await _defaultSession?.end("completed");
  } catch { /* ignore */ }
  await _client.shutdown();
  _initialized = false;
}

export async function flush(): Promise<void> {
  await _client?.flush();
}

export function getCallbackHandler(): HumanLayerCallbackHandler {
  if (!_callbackHandler) {
    throw new NotInitializedError();
  }
  return _callbackHandler;
}

export function isInitialized(): boolean {
  return _initialized;
}

export { requestApproval };

export function wrapToolsWithHITL<T extends { name: string; invoke: (input: unknown) => Promise<unknown> }>(
  tools: T[],
  options: WrapToolsOptions
): T[] {
  return wrapTools(tools, options);
}

// Alias matching Python SDK API
export { wrapToolsWithHITL as wrapTools };

// Re-export classes and errors
export {
  HumanLayerCallbackHandler,
  HumanLayerConfig,
  Session,
  getCurrentSession,
  setCurrentSession,
  HumanLayerError,
  ConfigurationError,
  APIError,
  NotInitializedError,
  SessionError,
  HITLRejectedError,
  HITLTimeoutError,
};

// Auto-instrumentation: patch Runnable.invoke to inject our callback handler
function _patchLangChain(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Runnable } = require("@langchain/core/runnables");
    if (!Runnable || !Runnable.prototype) return;

    const originalInvoke = Runnable.prototype.invoke;
    if (originalInvoke.__humanlayer_patched) return;

    Runnable.prototype.invoke = async function (
      input: unknown,
      options: Record<string, unknown> = {}
    ) {
      const handler = _callbackHandler;
      if (!handler) return originalInvoke.call(this, input, options);

      const callbacks: unknown[] = [
        ...((options.callbacks as unknown[]) ?? []),
      ];
      const alreadyInjected = callbacks.some(
        (cb) => cb instanceof HumanLayerCallbackHandler
      );
      if (!alreadyInjected) {
        callbacks.push(handler);
      }
      return originalInvoke.call(this, input, { ...options, callbacks });
    };

    Runnable.prototype.invoke.__humanlayer_patched = true;

    if (_config?.debug) {
      console.log("[HumanLayer] Auto-instrumented LangChain Runnable.invoke");
    }
  } catch {
    // @langchain/core not available — skip
  }
}

// Default export for convenience
const humanlayer = {
  init,
  shutdown,
  flush,
  getCallbackHandler,
  isInitialized,
  requestApproval,
  wrapTools: wrapToolsWithHITL,
  Session,
  HumanLayerCallbackHandler,
  HumanLayerError,
  ConfigurationError,
  APIError,
  NotInitializedError,
  SessionError,
  HITLRejectedError,
  HITLTimeoutError,
};

export default humanlayer;
