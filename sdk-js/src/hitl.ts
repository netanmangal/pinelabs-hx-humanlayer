import { HITLRejectedError, HITLTimeoutError, NotInitializedError } from "./exceptions";
import { HumanLayerClient } from "./client";
import { getCurrentSession } from "./session";

let _client: HumanLayerClient | undefined;
let _debug = false;

export function _setHitlClient(client: HumanLayerClient, debug: boolean): void {
  _client = client;
  _debug = debug;
}

export async function requestApproval(
  toolName: string,
  toolInput: Record<string, unknown>,
  context?: Record<string, unknown>,
  timeout = 300
): Promise<boolean> {
  if (!_client) {
    // Graceful degradation: if SDK not init, allow execution
    console.warn(
      "[HumanLayer] HITL requested but SDK not initialized — allowing by default"
    );
    return true;
  }

  const sessionId = getCurrentSession()?.sessionId;

  console.log(
    `\n[HumanLayer] 🔍 HITL approval required for: ${toolName}`
  );
  console.log(`[HumanLayer] Tool input: ${JSON.stringify(toolInput, null, 2)}`);
  console.log(`[HumanLayer] Waiting for human decision (timeout: ${timeout}s)...`);

  let eventId: string;
  try {
    eventId = await _client.createHitlEvent(toolName, toolInput, context, sessionId);
  } catch (err: any) {
    console.warn(
      `[HumanLayer] Failed to create HITL event: ${err.message} — allowing by default`
    );
    return true;
  }

  console.log(`[HumanLayer] HITL event created: ${eventId}`);
  console.log(`[HumanLayer] Review and approve/reject in the HumanLayer dashboard.`);

  const startTime = Date.now();
  const pollIntervalMs = 1500;

  return new Promise<boolean>((resolve, reject) => {
    const intervalId = setInterval(async () => {
      const elapsed = (Date.now() - startTime) / 1000;

      if (elapsed >= timeout) {
        clearInterval(intervalId);
        reject(new HITLTimeoutError(eventId, timeout));
        return;
      }

      try {
        const decision = await _client!.getHitlDecision(eventId);

        if (decision.status === "approved") {
          clearInterval(intervalId);
          console.log(`[HumanLayer] ✅ Approved: ${toolName}`);
          resolve(true);
        } else if (decision.status === "rejected") {
          clearInterval(intervalId);
          console.log(
            `[HumanLayer] ❌ Rejected: ${toolName}${decision.comment ? ` — ${decision.comment}` : ""}`
          );
          reject(new HITLRejectedError(toolName, decision.comment));
        }
        // status === "pending" → keep polling
      } catch (err: any) {
        if (_debug) {
          console.warn(`[HumanLayer] Poll error: ${err.message}`);
        }
      }
    }, pollIntervalMs);
  });
}

export interface WrapToolsOptions {
  approvalRequired: string[];
}

// Works with LangChain.js StructuredTool / DynamicStructuredTool
export function wrapTools<T extends { name: string; invoke: (input: unknown) => Promise<unknown> }>(
  tools: T[],
  options: WrapToolsOptions
): T[] {
  const requiredSet = new Set(options.approvalRequired);

  return tools.map((tool) => {
    if (!requiredSet.has(tool.name)) return tool;

    const originalInvoke = tool.invoke.bind(tool);

    const wrappedInvoke = async (input: unknown) => {
      const toolInput: Record<string, unknown> =
        typeof input === "object" && input !== null
          ? (input as Record<string, unknown>)
          : { input };

      try {
        await requestApproval(tool.name, toolInput);
      } catch (err: any) {
        if (err.name === "HITLRejectedError" || err.name === "HITLTimeoutError") {
          return `Tool execution blocked: ${err.message}`;
        }
        throw err;
      }

      return originalInvoke(input);
    };

    // Return a proxy with replaced invoke
    return new Proxy(tool, {
      get(target, prop) {
        if (prop === "invoke") return wrappedInvoke;
        return (target as Record<string | symbol, unknown>)[prop as string];
      },
    }) as T;
  });
}
