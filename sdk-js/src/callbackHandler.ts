import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { LLMResult } from "@langchain/core/outputs";
import type { ChainValues } from "@langchain/core/utils/types";
import { v4 as uuidv4 } from "uuid";
import { getCurrentSession } from "./session";

// Noise filter: these chain names produce redundant events
const FILTERED_CHAIN_NAMES = new Set([
  "RunnableSequence",
  "RunnableParallel",
  "RunnableLambda",
  "RunnablePassthrough",
  "RunnableMap",
]);

function truncate(value: unknown, maxLen = 1000): unknown {
  if (typeof value === "string") {
    return value.length > maxLen ? value.slice(0, maxLen) + "...[truncated]" : value;
  }
  return value;
}

function cleanData(obj: unknown, depth = 0): unknown {
  if (depth > 3) return "[nested]";
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") return truncate(obj);
  if (typeof obj === "number" || typeof obj === "boolean") return obj;
  if (Array.isArray(obj)) {
    return obj.slice(0, 20).map((item) => cleanData(item, depth + 1));
  }
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      result[k] = cleanData(v, depth + 1);
    }
    return result;
  }
  return String(obj);
}

function extractModelName(serialized: Record<string, unknown>): string | undefined {
  const id = serialized?.id;
  const lastId = Array.isArray(id) ? (id as string[]).slice(-1)[0] : undefined;
  return (
    (serialized?.model_name as string) ??
    (serialized?.model as string) ??
    lastId ??
    undefined
  );
}

function extractMessages(messages: unknown): unknown {
  if (!Array.isArray(messages)) return messages;
  return messages.map((msgGroup) => {
    if (Array.isArray(msgGroup)) {
      return msgGroup.map((m) => {
        if (m && typeof m === "object") {
          const msg = m as Record<string, unknown>;
          return {
            role: Array.isArray(msg.lc_id) ? (msg.lc_id as string[]).slice(-1)[0]?.toLowerCase().replace("message", "") ?? "unknown" : "unknown",
            content: truncate(msg.content ?? msg.text ?? ""),
          };
        }
        return m;
      });
    }
    return msgGroup;
  });
}

export class HumanLayerCallbackHandler extends BaseCallbackHandler {
  name = "HumanLayerCallbackHandler";
  private runId: string;

  constructor() {
    super();
    this.runId = uuidv4();
  }

  private _emit(
    eventType: string,
    component: string,
    data: Record<string, unknown>
  ) {
    const session = getCurrentSession();
    const event = {
      event_id: uuidv4(),
      run_id: this.runId,
      timestamp: new Date().toISOString(),
      event_type: eventType,
      component,
      data,
    };
    if (session) {
      session.logEvent(event);
    }
  }

  override async handleChatModelStart(
    llm: { id?: string[]; kwargs?: Record<string, unknown> },
    messages: unknown[][],
    runId: string,
    parentRunId?: string
  ): Promise<void> {
    this._emit("llm_start", "llm", {
      run_id: runId,
      parent_run_id: parentRunId,
      name: llm.id?.slice(-1)[0] ?? "unknown_llm",
      model: extractModelName(llm.kwargs ?? {}),
      input: cleanData(extractMessages(messages)),
      output: null,
      metadata: {},
    });
  }

  override async handleLLMStart(
    llm: { id?: string[]; kwargs?: Record<string, unknown> },
    prompts: string[],
    runId: string,
    parentRunId?: string
  ): Promise<void> {
    this._emit("llm_start", "llm", {
      run_id: runId,
      parent_run_id: parentRunId,
      name: llm.id?.slice(-1)[0] ?? "unknown_llm",
      model: extractModelName(llm.kwargs ?? {}),
      input: prompts.map((p) => truncate(p)),
      output: null,
      metadata: {},
    });
  }

  override async handleLLMEnd(
    output: LLMResult,
    runId: string,
    parentRunId?: string
  ): Promise<void> {
    const usage = output.llmOutput?.tokenUsage ?? output.llmOutput?.usage ?? {};
    const gen = output.generations?.[0]?.[0];
    const text = gen?.text ?? (gen as unknown as Record<string, unknown>)?.message;

    this._emit("llm_end", "llm", {
      run_id: runId,
      parent_run_id: parentRunId,
      name: "llm",
      output: cleanData(text),
      metadata: {
        token_usage: {
          total_tokens:
            (usage as Record<string, unknown>).totalTokens ??
            (usage as Record<string, unknown>).total_tokens ??
            0,
          prompt_tokens:
            (usage as Record<string, unknown>).promptTokens ??
            (usage as Record<string, unknown>).prompt_tokens ??
            0,
          completion_tokens:
            (usage as Record<string, unknown>).completionTokens ??
            (usage as Record<string, unknown>).completion_tokens ??
            0,
        },
      },
    });
  }

  override async handleLLMError(
    err: Error,
    runId: string,
    parentRunId?: string
  ): Promise<void> {
    this._emit("llm_error", "llm", {
      run_id: runId,
      parent_run_id: parentRunId,
      name: "llm",
      metadata: { error: err.message },
    });
  }

  override async handleToolStart(
    tool: { id?: string[]; name?: string },
    input: string,
    runId: string,
    parentRunId?: string
  ): Promise<void> {
    const toolName =
      tool.name ?? tool.id?.slice(-1)[0] ?? "unknown_tool";
    this._emit("tool_start", "tool", {
      run_id: runId,
      parent_run_id: parentRunId,
      name: toolName,
      input: cleanData(
        (() => {
          try {
            return JSON.parse(input);
          } catch {
            return input;
          }
        })()
      ),
      output: null,
      metadata: {},
    });
  }

  override async handleToolEnd(
    output: string,
    runId: string,
    parentRunId?: string
  ): Promise<void> {
    this._emit("tool_end", "tool", {
      run_id: runId,
      parent_run_id: parentRunId,
      name: "tool",
      output: cleanData(
        (() => {
          try {
            return JSON.parse(output);
          } catch {
            return output;
          }
        })()
      ),
      metadata: {},
    });
  }

  override async handleToolError(
    err: Error,
    runId: string,
    parentRunId?: string
  ): Promise<void> {
    this._emit("tool_error", "tool", {
      run_id: runId,
      parent_run_id: parentRunId,
      name: "tool",
      metadata: { error: err.message },
    });
  }

  override async handleChainStart(
    chain: { id?: string[] },
    inputs: ChainValues,
    runId: string,
    parentRunId?: string
  ): Promise<void> {
    const chainName = chain.id?.slice(-1)[0] ?? "chain";
    if (FILTERED_CHAIN_NAMES.has(chainName)) return;
    this._emit("chain_start", "chain", {
      run_id: runId,
      parent_run_id: parentRunId,
      name: chainName,
      input: cleanData(inputs),
      output: null,
      metadata: {},
    });
  }

  override async handleChainEnd(
    outputs: ChainValues,
    runId: string,
    parentRunId?: string
  ): Promise<void> {
    this._emit("chain_end", "chain", {
      run_id: runId,
      parent_run_id: parentRunId,
      name: "chain",
      output: cleanData(outputs),
      metadata: {},
    });
  }

  override async handleChainError(
    err: Error,
    runId: string,
    parentRunId?: string
  ): Promise<void> {
    this._emit("chain_error", "chain", {
      run_id: runId,
      parent_run_id: parentRunId,
      name: "chain",
      metadata: { error: err.message },
    });
  }

  override async handleAgentAction(
    action: { tool: string; toolInput: unknown; log: string },
    runId: string,
    parentRunId?: string
  ): Promise<void> {
    this._emit("agent_action", "agent", {
      run_id: runId,
      parent_run_id: parentRunId,
      name: action.tool,
      input: cleanData(action.toolInput),
      metadata: { agent_log: truncate(action.log) as string },
    });
  }

  override async handleAgentEnd(
    action: { returnValues: unknown; log: string },
    runId: string,
    parentRunId?: string
  ): Promise<void> {
    this._emit("agent_finish", "agent", {
      run_id: runId,
      parent_run_id: parentRunId,
      name: "agent",
      output: cleanData(action.returnValues),
      metadata: { agent_log: truncate(action.log) as string },
    });
  }
}
