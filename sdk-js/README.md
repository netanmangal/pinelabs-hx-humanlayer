# humanlayer-ai

**EU AI Act-compliant human oversight SDK for LangChain.js agents.**

Gives your AI agents:
- 📡 **Event tracing** — every LLM call, tool execution, and agent decision is captured
- 🔍 **Audit trail** — full session history for compliance and debugging
- ✋ **Human-in-the-loop (HITL)** — require human approval before high-stakes tool calls
- 🚫 **Intervention** — humans can reject agent actions in real-time
- 📊 **Dashboard** — live monitoring via the HumanLayer web UI

Designed for the **EU AI Act** requirements: Article 9 (risk management), Article 14 (human oversight), Article 17 (quality management).

---

## Installation

```bash
npm install humanlayer-ai
```

## Quick Start

```javascript
import humanlayer from "humanlayer-ai";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

// 1. Initialize — connects to your HumanLayer backend
humanlayer.init({
  apiKey: process.env.HUMANLAYER_API_KEY,      // from dashboard → Settings
  projectId: "my-commerce-agent",
  apiBaseUrl: "http://localhost:8001",
});

// 2. Wrap high-stakes tools with HITL approval
let tools = getMyTools();
tools = humanlayer.wrapTools(tools, {
  approvalRequired: ["sendEmail", "deleteRecord", "createOrder"],
});

// 3. Get the callback handler (auto-captures all events)
const callbacks = [humanlayer.getCallbackHandler()];

// 4. Run your agent normally — all events stream to the dashboard
const agent = createReactAgent({ llm: new ChatOpenAI(), tools });
await agent.invoke({ messages: [{ role: "user", content: "..." }] }, { callbacks });

// 5. Flush remaining events on shutdown
await humanlayer.shutdown();
```

## HITL Flow

When a wrapped tool is called:
1. Agent execution **pauses**
2. A HITL event appears in the HumanLayer dashboard
3. A human reviews the tool name, input parameters, and agent context
4. Human clicks **Approve** → agent continues
5. Human clicks **Reject** → tool returns an error message, agent decides next step

```javascript
// Manual approval (without wrapping)
try {
  await humanlayer.requestApproval("deleteAllRecords", { table: "users" });
  // only reaches here if approved
  await deleteAllRecords();
} catch (err) {
  if (err.name === "HITLRejectedError") {
    console.log("Rejected:", err.comment);
  }
}
```

## API Reference

```typescript
humanlayer.init(config)              // Initialize SDK
humanlayer.shutdown()                // Flush events and end session
humanlayer.flush()                   // Force flush queued events
humanlayer.getCallbackHandler()      // LangChain BaseCallbackHandler
humanlayer.isInitialized()           // Check if init() was called
humanlayer.wrapTools(tools, opts)    // Wrap tools with HITL approval
humanlayer.requestApproval(...)      // Manual HITL approval gate
```

## Configuration

```typescript
humanlayer.init({
  apiKey: "adr_...",           // Required — your HumanLayer API key
  projectId: "my-agent",       // Required — project identifier
  apiBaseUrl: "http://...",    // Default: http://localhost:8001
  debug: false,                // Enable debug logging
  flushInterval: 5,            // Event flush interval in seconds
  sessionName: "run-001",      // Custom session name (optional)
});
```

Environment variables:
```
HUMANLAYER_API_KEY=adr_...
HUMANLAYER_PROJECT_ID=my-agent
HUMANLAYER_API_BASE_URL=http://localhost:8001
HUMANLAYER_DEBUG=false
AGENT_SESSION_NAME=my-session  # optional override
```

## Use with PineLabs

```javascript
import humanlayer from "humanlayer-ai";
import { PinelabsAgentToolkit, pinelabsEnvironment } from "@plural_pinelabs/agent-toolkit/langchain";
import { ChatBedrockConverse } from "@langchain/aws";

humanlayer.init({ apiKey: "adr_...", projectId: "pinelabs-agent" });

const pinelabs = new PinelabsAgentToolkit(
  pinelabsEnvironment.UAT,
  process.env.PINE_CLIENT_ID,
  process.env.PINE_CLIENT_SECRET,
);

// Require human approval before creating or cancelling orders
const tools = humanlayer.wrapTools(pinelabs.getTools(), {
  approvalRequired: ["createOrder", "cancelOrder"],
});

const agent = createReactAgent({
  llm: new ChatBedrockConverse({ model: "openai.gpt-oss-120b-1:0", region: "us-east-1" }),
  tools,
});

const callbacks = [humanlayer.getCallbackHandler()];
await agent.invoke({ messages: [...] }, { callbacks });
await humanlayer.shutdown();
```

## License

MIT
