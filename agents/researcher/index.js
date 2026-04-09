import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import axios from "axios";
import { x402 } from "../../shared/x402.js";

const app = express();
app.use(express.json());

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PORT = process.env.RESEARCHER_PORT || 3001;
const DESTINATION = process.env.RESEARCHER_PUBLIC_KEY;
const PRICE = process.env.RESEARCHER_PRICE || "0.5";

async function webSearch(query) {
  try {
    const res = await axios.get("https://api.duckduckgo.com/", {
      params: { q: query, format: "json", no_html: 1, skip_disambig: 1 },
      timeout: 8000,
    });
    const data = res.data;
    const results = [];
    if (data.AbstractText) results.push(`Summary: ${data.AbstractText}`);
    if (data.RelatedTopics?.length) {
      data.RelatedTopics.slice(0, 5).forEach((t) => {
        if (t.Text) results.push(`- ${t.Text}`);
      });
    }
    return results.length
      ? results.join("\n")
      : "No direct results found. Using general knowledge.";
  } catch {
    return "Search unavailable. Using general knowledge.";
  }
}

const tools = [
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web for current information about a topic.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query" },
        },
        required: ["query"],
      },
    },
  },
];

app.get("/health", (req, res) => {
  res.json({ agent: "Researcher", status: "online", price: `${PRICE} XLM per call`, destination: DESTINATION });
});

app.post(
  "/research",
  x402({ destination: DESTINATION, amount: PRICE, agentName: "researcher" }),
  async (req, res) => {
    const { task } = req.body;
    if (!task) return res.status(400).json({ error: "Missing task" });

    console.log(`[Researcher] Task: ${task}`);

    const messages = [
      {
        role: "system",
        content:
          "You are a specialized research agent. Research topics thoroughly and return clear, factual, well-structured findings. Use the web_search tool to find relevant information.",
      },
      { role: "user", content: task },
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
        console.log(`[Researcher] Done. Payment: ${req.payment.txHash}`);
        return res.json({ result: message.content, payment: req.payment });
      }

      for (const toolCall of message.tool_calls) {
        if (toolCall.function.name === "web_search") {
          const { query } = JSON.parse(toolCall.function.arguments);
          console.log(`[Researcher] Searching: ${query}`);
          const output = await webSearch(query);
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
  console.log(`Researcher Agent running on port ${PORT}`);
  console.log(`Wallet: ${DESTINATION}`);
  console.log(`Price: ${PRICE} XLM per call\n`);
});
