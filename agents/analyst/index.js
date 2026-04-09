import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import { x402 } from "../../shared/x402.js";

const app = express();
app.use(express.json());

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PORT = process.env.ANALYST_PORT || 3002;
const DESTINATION = process.env.ANALYST_PUBLIC_KEY;
const PRICE = process.env.ANALYST_PRICE || "0.5";

const tools = [
  {
    type: "function",
    function: {
      name: "analyze_data",
      description:
        "Perform structured analysis on provided data. Returns key insights, patterns, risks, and opportunities.",
      parameters: {
        type: "object",
        properties: {
          data: { type: "string", description: "The data or text to analyze" },
          focus: {
            type: "string",
            description: "What to focus the analysis on (e.g. risks, opportunities, trends)",
          },
        },
        required: ["data", "focus"],
      },
    },
  },
];

async function analyzeData({ data, focus }) {
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a deep analytical engine. Analyze the provided data with a focus on: ${focus}. Return structured insights with sections: Key Findings, Patterns, Risks, Opportunities, and Conclusion.`,
      },
      { role: "user", content: data },
    ],
  });
  return response.choices[0].message.content;
}

app.get("/health", (req, res) => {
  res.json({ agent: "Analyst", status: "online", price: `${PRICE} XLM per call`, destination: DESTINATION });
});

app.post(
  "/analyze",
  x402({ destination: DESTINATION, amount: PRICE, agentName: "analyst" }),
  async (req, res) => {
    const { task, data } = req.body;
    if (!task) return res.status(400).json({ error: "Missing task" });

    console.log(`[Analyst] Task: ${task}`);

    const messages = [
      {
        role: "system",
        content:
          "You are a specialized analysis agent. Deeply analyze information and extract meaningful insights. Use the analyze_data tool to process data, identify patterns, assess risks, and surface opportunities.",
      },
      {
        role: "user",
        content: data ? `Task: ${task}\n\nData:\n${data}` : task,
      },
    ];

    while (true) {
      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        tools,
        tool_choice: "auto",
      });

      const message = response.choices[0].message;
      messages.push(message);

      if (!message.tool_calls || message.tool_calls.length === 0) {
        console.log(`[Analyst] Done. Payment: ${req.payment.txHash}`);
        return res.json({ result: message.content, payment: req.payment });
      }

      for (const toolCall of message.tool_calls) {
        if (toolCall.function.name === "analyze_data") {
          const input = JSON.parse(toolCall.function.arguments);
          console.log(`[Analyst] Analyzing with focus: ${input.focus}`);
          const output = await analyzeData(input);
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: output,
          });
        }
      }
    }
  }
);

app.listen(PORT, () => {
  console.log(`Analyst Agent running on port ${PORT}`);
  console.log(`Wallet: ${DESTINATION}`);
  console.log(`Price: ${PRICE} XLM per call\n`);
});
