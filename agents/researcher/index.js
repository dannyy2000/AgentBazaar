import "dotenv/config";
import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import axios from "axios";
import { x402 } from "../../shared/x402.js";

const app = express();
app.use(express.json());

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PORT = process.env.RESEARCHER_PORT || 3001;
const DESTINATION = process.env.RESEARCHER_PUBLIC_KEY;
const PRICE = process.env.RESEARCHER_PRICE || "0.5";

// Tool: web search via DuckDuckGo (free, no API key)
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
    name: "web_search",
    description:
      "Search the web for current information about a topic. Use this for recent events, facts, and research.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
      },
      required: ["query"],
    },
  },
];

// Health check (no payment required)
app.get("/health", (req, res) => {
  res.json({
    agent: "Researcher",
    status: "online",
    price: `${PRICE} XLM per call`,
    destination: DESTINATION,
  });
});

// Main research endpoint — gated by x402
app.post(
  "/research",
  x402({ destination: DESTINATION, amount: PRICE, agentName: "researcher" }),
  async (req, res) => {
    const { task } = req.body;

    if (!task) {
      return res.status(400).json({ error: "Missing task in request body" });
    }

    console.log(`[Researcher] Task received: ${task}`);

    const messages = [{ role: "user", content: task }];

    // Agentic loop — Claude can call tools multiple times
    while (true) {
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system:
          "You are a specialized research agent. Your job is to research topics thoroughly and return clear, factual, well-structured findings. Use the web_search tool to find relevant information. Always cite what you found.",
        tools,
        messages,
      });

      if (response.stop_reason === "end_turn") {
        const text = response.content.find((b) => b.type === "text")?.text || "";
        console.log(`[Researcher] Done. Payment: ${req.payment.txHash}`);
        return res.json({ result: text, payment: req.payment });
      }

      if (response.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: response.content });

        const toolResults = [];
        for (const block of response.content) {
          if (block.type === "tool_use" && block.name === "web_search") {
            console.log(`[Researcher] Searching: ${block.input.query}`);
            const output = await webSearch(block.input.query);
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
  console.log(`Researcher Agent running on port ${PORT}`);
  console.log(`Wallet: ${DESTINATION}`);
  console.log(`Price: ${PRICE} XLM per call\n`);
});
