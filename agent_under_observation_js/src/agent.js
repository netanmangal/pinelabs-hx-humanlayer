import "dotenv/config";
import { ChatBedrockConverse } from "@langchain/aws";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import {
  PinelabsAgentToolkit,
  pinelabsEnvironment,
} from "@plural_pinelabs/agent-toolkit/langchain";
import humanlayer from "humanlayer-ai";

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

// Build system prompt with credentials injected so the agent can use them
function buildSystemPrompt() {
  const clientId = process.env.PINE_CLIENT_ID;
  const clientSecret = process.env.PINE_CLIENT_SECRET;

  return `You are a Pine Labs payment operations assistant responsible for
processing customer orders end-to-end. You operate as part of an EU AI Act-compliant
system, which means you MUST think out loud for every action you take.

MERCHANT CREDENTIALS (use these for every tool call):
  client_id: ${clientId}
  client_secret: ${clientSecret}

REQUIRED BEHAVIOR — Before EVERY tool call you must output:
  REASONING: [Why you are taking this specific action]
  PARAMETERS: [What values you're passing and why]
  EXPECTED OUTCOME: [What you expect the result to be]

After EVERY tool response you must output:
  OBSERVATION: [What the result tells you]
  VERIFICATION: [Does this match your expectation?]
  NEXT STEP: [What you will do next and why]

This chain-of-thought output is mandatory for:
- Human oversight (a human may intervene at any step)
- Audit trail (every decision must be explainable)
- EU AI Act compliance (Article 14: human oversight of high-risk AI)

Tool usage guide:
- createOrder: Pass ONLY these exact fields (no extras):
    client_id, client_secret, merchant_order_reference (alphanumeric/hyphens/underscores only, max 50 chars),
    order_amount: { "value": <integer paise>, "currency": "INR" },
    notes: <string>,
    purchase_details: { "customer": { "email_id": "...", "first_name": "..." } }
    NOTE: Do NOT pass allowed_payment_methods. Do NOT use customer_details key — it must be "customer".

- getOrder: Pass ONLY order_id (string). No other fields.
- cancelOrder: Pass ONLY order_id (string). No other fields.`;
}

const COMMERCE_PROMPT = `Process the following e-commerce order end-to-end:

CUSTOMER DETAILS:
  Name: netanmangal
  Email: imnetanmangal@gmail.com
  Amount: ₹500 (50000 paise)
  Reference: ORD-DEMO-${Date.now()}
  Description: Demo order — HumanLayer EU AI Act compliance showcase

TASK SEQUENCE:
1. CREATE ORDER
   Create a payment order for ₹500 for this customer.
   Think through each field carefully before calling the tool.
   This action will be reviewed by a human before execution.

2. VERIFY ORDER
   After the order is created, fetch its details using getOrder.
   Verify that the amount (₹500), customer email, and payment link are correct.
   Report any discrepancies.

3. CANCEL PAYMENT LINK
   Cancel the payment order.
   Before cancelling, explicitly state this is a test/demo run and no real
   payment should be collected. This action will also be reviewed by a human.

4. SUMMARY
   Provide a concise summary:
   - Order ID created
   - Amount verified
   - Payment link status after cancellation
   - Confirmation that the end-to-end workflow completed successfully

Remember: explain your reasoning at every step. Your thought process is being
captured for audit and compliance purposes.`;

// ---------------------------------------------------------------------------
// Main agent runner
// ---------------------------------------------------------------------------

async function runAgent() {
  console.log("=".repeat(60));
  console.log("🏪 HumanLayer × PineLabs Commerce Agent");
  console.log("   EU AI Act Compliance Demo");
  console.log("=".repeat(60));

  // 1. Initialize HumanLayer SDK — this starts event capture
  humanlayer.init({
    apiKey: process.env.HUMANLAYER_API_KEY,
    projectId: process.env.HUMANLAYER_PROJECT_ID || "pinelabs-commerce-agent",
    apiBaseUrl: process.env.HUMANLAYER_API_BASE_URL || "http://localhost:8001",
    debug: process.env.HUMANLAYER_DEBUG === "true",
    sessionName:
      process.env.AGENT_SESSION_NAME ||
      `commerce-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}`,
  });

  console.log("\n✅ HumanLayer initialized — events will be captured to dashboard");

  // 2. Initialize LLM — GPT-OSS 120B on Amazon Bedrock
  const model = new ChatBedrockConverse({
    model: "openai.gpt-oss-120b-1:0",
    region: process.env.AWS_REGION || "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
    temperature: 0.4,
    // Force verbose output for richer event traces
    verbose: true,
  });

  console.log("✅ LLM initialized — openai.gpt-oss-120b-1:0 via Amazon Bedrock");

  // 3. Initialize PineLabs toolkit
  const environment =
    process.env.PINELABS_ENV === "production"
      ? pinelabsEnvironment.PRODUCTION
      : pinelabsEnvironment.UAT;

  const pinelabs = new PinelabsAgentToolkit(
    environment,
    process.env.PINE_CLIENT_ID,
    process.env.PINE_CLIENT_SECRET
  );

  let tools = pinelabs.getTools();
  console.log(
    `✅ PineLabs toolkit initialized (${environment}) — tools: ${tools.map((t) => t.name).join(", ")}`
  );

  // 4. Wrap high-stakes tools with HITL approval
  //    createOrder and cancelOrder require human sign-off before execution
  //    getOrder is read-only — no approval needed
  tools = humanlayer.wrapTools(tools, {
    approvalRequired: ["createOrder", "cancelOrder"],
  });

  console.log(
    "✅ HITL enabled for: createOrder, cancelOrder (human approval required)"
  );

  // 5. Create the agent
  const agent = createReactAgent({
    llm: model,
    tools,
    messageModifier: buildSystemPrompt(),
  });

  console.log("\n" + "=".repeat(60));
  console.log("🚀 Starting agent run...");
  console.log(
    "📊 Monitor events at: http://localhost:3000/dashboard"
  );
  console.log(
    "🔍 Review HITL requests at: http://localhost:3000/hitl"
  );
  console.log("=".repeat(60) + "\n");

  // 6. Run the agent — callback handler captures all events
  const callbacks = [humanlayer.getCallbackHandler()];

  try {
    const result = await agent.invoke(
      {
        messages: [new HumanMessage(COMMERCE_PROMPT)],
      },
      { callbacks }
    );

    const lastMessage = result.messages[result.messages.length - 1];
    const output =
      typeof lastMessage?.content === "string"
        ? lastMessage.content
        : JSON.stringify(lastMessage?.content, null, 2);

    console.log("\n" + "=".repeat(60));
    console.log("✅ Agent completed successfully");
    console.log("=".repeat(60));
    console.log("\nFINAL OUTPUT:\n");
    console.log(output);
  } catch (err) {
    console.error("\n❌ Agent failed:", err.message);
    process.exitCode = 1;
  } finally {
    // Flush all remaining events to backend
    await humanlayer.shutdown();
    console.log("\n✅ All events flushed to HumanLayer. Check your dashboard.");
  }
}

runAgent();
