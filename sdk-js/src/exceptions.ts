export class HumanLayerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HumanLayerError";
  }
}

export class ConfigurationError extends HumanLayerError {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export class APIError extends HumanLayerError {
  statusCode?: number;
  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "APIError";
    this.statusCode = statusCode;
  }
}

export class NotInitializedError extends HumanLayerError {
  constructor() {
    super(
      "HumanLayer SDK is not initialized. Call humanlayer.init() before using any SDK functions."
    );
    this.name = "NotInitializedError";
  }
}

export class SessionError extends HumanLayerError {
  constructor(message: string) {
    super(message);
    this.name = "SessionError";
  }
}

export class HITLRejectedError extends HumanLayerError {
  toolName: string;
  comment?: string;
  constructor(toolName: string, comment?: string) {
    super(
      `Tool execution rejected by human: ${toolName}${comment ? ` — ${comment}` : ""}`
    );
    this.name = "HITLRejectedError";
    this.toolName = toolName;
    this.comment = comment;
  }
}

export class HITLTimeoutError extends HumanLayerError {
  eventId: string;
  timeout: number;
  constructor(eventId: string, timeout: number) {
    super(
      `HITL approval timed out after ${timeout}s for event ${eventId}`
    );
    this.name = "HITLTimeoutError";
    this.eventId = eventId;
    this.timeout = timeout;
  }
}
