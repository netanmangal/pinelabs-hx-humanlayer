import axios, { AxiosInstance } from "axios";
import { HumanLayerConfig } from "./config";
import { APIError, ConfigurationError } from "./exceptions";

export class HumanLayerClient {
  private config: HumanLayerConfig;
  private http: AxiosInstance;
  private eventQueue: object[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private shuttingDown = false;

  constructor(config: HumanLayerConfig) {
    this.config = config;

    this.http = axios.create({
      baseURL: config.apiBaseUrl,
      headers: {
        "X-API-Key": config.apiKey,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    });

    this._startFlushLoop();
  }

  private _startFlushLoop() {
    this.flushTimer = setInterval(
      () => this._doFlush(),
      this.config.flushInterval * 1000
    );
    // Don't block process exit
    if (this.flushTimer.unref) this.flushTimer.unref();
  }

  private async _doFlush() {
    if (this.eventQueue.length === 0) return;

    const batch = this.eventQueue.splice(0, this.config.batchSize);
    try {
      await this.http.post("/api/ingest/events", { events: batch });
      if (this.config.debug) {
        console.log(`[HumanLayer] Flushed ${batch.length} events`);
      }
    } catch (err: any) {
      if (this.config.debug) {
        console.warn("[HumanLayer] Failed to flush events:", err.message);
      }
      // Re-queue dropped events at the front (best-effort)
      this.eventQueue.unshift(...batch);
      // Trim if over max
      if (this.eventQueue.length > this.config.maxQueueSize) {
        this.eventQueue.splice(0, this.eventQueue.length - this.config.maxQueueSize);
      }
    }
  }

  async verifyApiKey(): Promise<void> {
    if (!this.config.apiKey) {
      throw new ConfigurationError(
        "HUMANLAYER_API_KEY is not set. Provide it via init() or environment variable."
      );
    }
    try {
      await this.http.get("/api/ingest/verify");
    } catch (err: any) {
      const status = err.response?.status;
      throw new APIError(
        `API key verification failed: ${err.response?.data?.detail ?? err.message}`,
        status
      );
    }
  }

  enqueueEvent(event: object): void {
    if (this.shuttingDown) return;
    if (this.eventQueue.length >= this.config.maxQueueSize) {
      // Drop oldest
      this.eventQueue.shift();
    }
    this.eventQueue.push(event);
  }

  async sendSession(sessionData: object): Promise<void> {
    try {
      await this.http.post("/api/ingest/sessions", sessionData);
    } catch (err: any) {
      if (this.config.debug) {
        console.warn("[HumanLayer] Failed to send session:", err.message);
      }
    }
  }

  async createHitlEvent(
    toolName: string,
    toolInput: Record<string, unknown>,
    context: Record<string, unknown> | undefined,
    sessionId: string | undefined
  ): Promise<string> {
    const res = await this.http.post("/api/hitl/request", {
      tool_name: toolName,
      tool_input: toolInput,
      context: context ?? {},
      session_id: sessionId,
    });
    return res.data.event_id as string;
  }

  async getHitlDecision(
    eventId: string
  ): Promise<{ status: string; comment?: string }> {
    const res = await this.http.get(`/api/hitl/events/${eventId}/decision`);
    return res.data as { status: string; comment?: string };
  }

  async flush(): Promise<void> {
    await this._doFlush();
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    // Final flush
    while (this.eventQueue.length > 0) {
      await this._doFlush();
    }
  }
}
