import "dotenv/config";
import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { x402 } from "../../shared/x402.js";

const app = express();
app.use(express.json());

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PORT = process.env.ANALYST_PORT || 3002;
const DESTINATION = process.env.ANALYST_PUBLIC_KEY;
const PRICE = process.env.ANALYST_PRICE || "0.5";

const tools = [
  {
    name: "analyze_data",
    description:
      "Perform structured analysis on provided data or text. Returns key insights, patterns, risks, and opportunities.",
    input_schema: {
      type: "object",
      properties: {
        data: { type: "string", description: "The data or text to analyze" },
        focus: {
          type: "string",
          description:
            "What to focus the analysis on (e.g. risks, opportunities, sentiment, trends)",
        },
      },
      required: ["data", "focus"],
    },
  },
];

async function analyzeData({ data, focus }) {
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: `You are a deep analytical engine. Analyze the provided data with a focus on: ${focus}.
Return structured insights with clear sections: Key Findings, Patterns, Risks, Opportunities, and Conclusion.`,
    messages: [{ role: "user", content: data }],
  });
  return response.content.find((b) => b.type === "text")?.text || "";
}

// Health check
app.get("/health", (req, res) => {
  res.json({
    agent: "Analyst",
    status: "online",
    price: `${PRICE} XLM per call`,
    destination: DESTINATION,
  });
});

// Main analysis endpoint — gated by x402
app.post(
  "/analyze",
  x402({ destination: DESTINATION, amount: PRICE, agentName: "analyst" }),
  async (req, res) => {
    const { task, data } = req.body;

    if (!task) {
      return res.status(400).json({ error: "Missing task in request body" });
    }

    console.log(`[Analyst] Task received: ${task}`);

    const messages = [
      {
        role: "user",
        content: data ? `Task: ${task}\n\nData to analyze:\n${data}` : task,
      },
    ];

    // Agentic loop
    while (true) {
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system:
          "You are a specialized analysis agent. Your job is to deeply analyze information and extract meaningful insights. Use the analyze_data tool to process data, identify patterns, assess risks, and surface opportunities. Be precise and structured.",
        tools,
        messages,
      });

      if (response.stop_reason === "end_turn") {
        const text = response.content.find((b) => b.type === "text")?.text || "";
        console.log(`[Analyst] Done. Payment: ${req.payment.txHash}`);
        return res.json({ result: text, payment: req.payment });
      }

      if (response.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: response.content });

        const toolResults = [];
        for (const block of response.content) {
          if (block.type === "tool_use" && block.name === "analyze_data") {
            console.log(`[Analyst] Analyzing with focus: ${block.input.focus}`);
            const output = await analyzeData(block.input);
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: output,
            });
          }
        }
        messages.push({ role: "user", content: toolResults });
      } else {
        break;
      }
    }
  }
);

app.listen(PORT, () => {
  console.log(`Analyst Agent running on port ${PORT}`);
  console.log(`Wallet: ${DESTINATION}`);
  console.log(`Price: ${PRICE} XLM per call\n`);
});
