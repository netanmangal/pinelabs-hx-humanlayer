import { v4 as uuidv4 } from "uuid";
import { HumanLayerClient } from "./client";
import { SessionError } from "./exceptions";

export type SessionStatus = "inactive" | "active" | "completed" | "failed";

export class Session {
  sessionId: string;
  name: string;
  metadata: Record<string, unknown>;
  status: SessionStatus = "inactive";
  startTime?: Date;
  endTime?: Date;

  // Stats
  totalTokens = 0;
  promptTokens = 0;
  completionTokens = 0;
  llmCalls = 0;
  toolCalls = 0;
  errors = 0;

  private client?: HumanLayerClient;

  constructor(name: string, metadata: Record<string, unknown> = {}) {
    this.sessionId = uuidv4();
    this.name = name;
    this.metadata = metadata;
  }

  bindClient(client: HumanLayerClient): void {
    this.client = client;
  }

  async start(): Promise<void> {
    if (this.status !== "inactive") {
      throw new SessionError(`Session already started (status: ${this.status})`);
    }
    this.status = "active";
    this.startTime = new Date();
    await this._sync();
  }

  async end(status: "completed" | "failed" = "completed"): Promise<void> {
    this.status = status;
    this.endTime = new Date();
    await this._sync();
    await this.client?.flush();
  }

  logEvent(event: object): void {
    if (!this.client) return;

    // Inject session_id into event
    const enriched = {
      ...(event as Record<string, unknown>),
      session_id: this.sessionId,
    };

    // Update stats based on event type
    const e = enriched as Record<string, unknown>;
    const eventType = e.event_type as string | undefined;
    if (eventType === "llm_end" || eventType === "llm_start") {
      if (eventType === "llm_end") {
        this.llmCalls++;
        const data = e.data as Record<string, unknown> | undefined;
        const metadata = data?.metadata as Record<string, unknown> | undefined;
        const usage = metadata?.token_usage as Record<string, unknown> | undefined;
        if (usage) {
          this.totalTokens += (usage.total_tokens as number) ?? 0;
          this.promptTokens += (usage.prompt_tokens as number) ?? 0;
          this.completionTokens += (usage.completion_tokens as number) ?? 0;
        }
      }
    } else if (eventType === "tool_end") {
      this.toolCalls++;
    } else if (
      eventType === "tool_error" ||
      eventType === "llm_error" ||
      eventType === "chain_error"
    ) {
      this.errors++;
    }

    this.client.enqueueEvent(enriched);
  }

  private async _sync(): Promise<void> {
    if (!this.client) return;
    await this.client.sendSession({
      session_id: this.sessionId,
      name: this.name,
      status: this.status,
      start_time: this.startTime?.toISOString(),
      end_time: this.endTime?.toISOString(),
      metadata: this.metadata,
      statistics: {
        total_tokens: this.totalTokens,
        prompt_tokens: this.promptTokens,
        completion_tokens: this.completionTokens,
        llm_calls: this.llmCalls,
        tool_calls: this.toolCalls,
        errors: this.errors,
      },
    });
  }
}

// Module-level current session
let _currentSession: Session | undefined;

export function getCurrentSession(): Session | undefined {
  return _currentSession;
}

export function setCurrentSession(session: Session | undefined): void {
  _currentSession = session;
}
