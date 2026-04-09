import "dotenv/config";
import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import axios from "axios";
import { sendPayment, getBalance } from "../../shared/stellar.js";

const app = express();
app.use(express.json());

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PORT = process.env.COORDINATOR_PORT || 3000;
const COORDINATOR_SECRET = process.env.COORDINATOR_SECRET_KEY;
const COORDINATOR_PUBLIC = process.env.COORDINATOR_PUBLIC_KEY;

// Agent registry — mirrors what lives in the Soroban contract on-chain
const AGENT_REGISTRY = {
  researcher: {
    name: "Researcher",
    endpoint: `http://localhost:${process.env.RESEARCHER_PORT || 3001}/research`,
    price: process.env.RESEARCHER_PRICE || "0.5",
    wallet: process.env.RESEARCHER_PUBLIC_KEY,
    description: "Searches the web and gathers factual research on any topic",
  },
  analyst: {
    name: "Analyst",
    endpoint: `http://localhost:${process.env.ANALYST_PORT || 3002}/analyze`,
    price: process.env.ANALYST_PRICE || "0.5",
    wallet: process.env.ANALYST_PUBLIC_KEY,
    description:
      "Analyzes data and research findings to extract insights, patterns, risks, and opportunities",
  },
  writer: {
    name: "Writer",
    endpoint: `http://localhost:${process.env.WRITER_PORT || 3003}/write`,
    price: process.env.WRITER_PRICE || "0.3",
    wallet: process.env.WRITER_PUBLIC_KEY,
    description:
      "Synthesizes research and analysis into a polished, well-structured final report",
  },
};

// Pay an agent via Stellar and call its endpoint with the tx hash (x402)
async function callAgent(agentKey, body) {
  const agent = AGENT_REGISTRY[agentKey];
  if (!agent) throw new Error(`Unknown agent: ${agentKey}`);

  console.log(`\n[Coordinator] Paying ${agent.name} ${agent.price} XLM...`);

  const txHash = await sendPayment({
    senderSecret: COORDINATOR_SECRET,
    destination: agent.wallet,
    amount: agent.price,
    memo: agentKey,
  });

  console.log(`[Coordinator] Payment confirmed: ${txHash}`);
  console.log(`[Coordinator] Calling ${agent.name}...`);

  const response = await axios.post(agent.endpoint, body, {
    headers: {
      "Content-Type": "application/json",
      "X-Payment": txHash,
    },
    timeout: 60000,
  });

  console.log(`[Coordinator] ${agent.name} responded successfully`);
  return { result: response.data.result, txHash };
}

// Tool definitions — Claude Sonnet uses these to decide which agents to hire
const tools = [
  {
    name: "call_researcher",
    description: AGENT_REGISTRY.researcher.description,
    input_schema: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "The specific research task to perform",
        },
      },
      required: ["task"],
    },
  },
  {
    name: "call_analyst",
    description: AGENT_REGISTRY.analyst.description,
    input_schema: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "The analysis task to perform",
        },
        data: {
          type: "string",
          description: "The research data or text to analyze",
        },
      },
      required: ["task", "data"],
    },
  },
  {
    name: "call_writer",
    description: AGENT_REGISTRY.writer.description,
    input_schema: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "The writing task to perform",
        },
        context: {
          type: "string",
          description: "All research and analysis to base the writing on",
        },
      },
      required: ["task", "context"],
    },
  },
];

// Health check
app.get("/health", async (req, res) => {
  const balance = await getBalance(COORDINATOR_PUBLIC);
  res.json({
    agent: "Coordinator",
    status: "online",
    wallet: COORDINATOR_PUBLIC,
    balance: `${balance} XLM`,
    availableAgents: Object.keys(AGENT_REGISTRY),
  });
});

// List all available agents (mirrors the Soroban registry)
app.get("/agents", (req, res) => {
  res.json({ agents: AGENT_REGISTRY });
});

// Main task endpoint
app.post("/task", async (req, res) => {
  const { task } = req.body;

  if (!task) {
    return res.status(400).json({ error: "Missing task in request body" });
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`[Coordinator] New task: ${task}`);
  console.log(`${"=".repeat(60)}`);

  const messages = [{ role: "user", content: task }];
  const paymentLog = [];

  try {
    // Agentic loop — Claude decides which agents to hire and in what order
    while (true) {
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: `You are the Coordinator Agent in AgentBazaar — an autonomous marketplace where AI agents hire and pay other agents to complete tasks.

You have access to three specialized agents you can hire:
- call_researcher: for gathering information and research
- call_analyst: for analyzing data and extracting insights
- call_writer: for synthesizing everything into a final polished report

For each user task, you must:
1. Decide which agents are needed and in what order
2. Call them using the tools (each call triggers a real Stellar XLM payment)
3. Pass relevant context between agents (research findings to analyst, everything to writer)
4. After all agents have responded, synthesize a final answer

Always use at least the researcher and writer. Use the analyst when the task requires deep insight or pattern recognition.
Be decisive — plan and execute efficiently.`,
        tools,
        messages,
      });

      if (response.stop_reason === "end_turn") {
        const finalText =
          response.content.find((b) => b.type === "text")?.text || "";

        console.log(`\n[Coordinator] Task complete.`);
        console.log(
          `[Coordinator] Total payments made: ${paymentLog.length} transactions`
        );

        return res.json({
          result: finalText,
          payments: paymentLog,
          totalSpent: `${paymentLog
            .reduce((sum, p) => sum + parseFloat(p.amount), 0)
            .toFixed(1)} XLM`,
        });
      }

      if (response.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: response.content });

        const toolResults = [];

        for (const block of response.content) {
          if (block.type !== "tool_use") continue;

          let agentKey;
          let body;

          if (block.name === "call_researcher") {
            agentKey = "researcher";
            body = { task: block.input.task };
          } else if (block.name === "call_analyst") {
            agentKey = "analyst";
            body = { task: block.input.task, data: block.input.data };
          } else if (block.name === "call_writer") {
            agentKey = "writer";
            body = { task: block.input.task, context: block.input.context };
          }

          const { result, txHash } = await callAgent(agentKey, body);

          paymentLog.push({
            agent: agentKey,
            amount: AGENT_REGISTRY[agentKey].price,
            txHash,
            stellarExplorer: `https://stellar.expert/explorer/testnet/tx/${txHash}`,
          });

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result,
          });
        }

        messages.push({ role: "user", content: toolResults });
      } else {
        break;
      }
    }
  } catch (err) {
    console.error(`[Coordinator] Error:`, err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, async () => {
  const balance = await getBalance(COORDINATOR_PUBLIC);
  console.log(`Coordinator Agent running on port ${PORT}`);
  console.log(`Wallet: ${COORDINATOR_PUBLIC}`);
  console.log(`Balance: ${balance} XLM\n`);
});
