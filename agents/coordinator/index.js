import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import axios from "axios";
import { sendPayment, getBalance } from "../../shared/stellar.js";

const app = express();
app.use(express.json());

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

const tools = [
  {
    type: "function",
    function: {
      name: "call_researcher",
      description: AGENT_REGISTRY.researcher.description,
      parameters: {
        type: "object",
        properties: {
          task: { type: "string", description: "The specific research task" },
        },
        required: ["task"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "call_analyst",
      description: AGENT_REGISTRY.analyst.description,
      parameters: {
        type: "object",
        properties: {
          task: { type: "string", description: "The analysis task" },
          data: { type: "string", description: "The research data to analyze" },
        },
        required: ["task", "data"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "call_writer",
      description: AGENT_REGISTRY.writer.description,
      parameters: {
        type: "object",
        properties: {
          task: { type: "string", description: "The writing task" },
          context: { type: "string", description: "All research and analysis to base the writing on" },
        },
        required: ["task", "context"],
      },
    },
  },
];

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

app.get("/agents", (req, res) => {
  res.json({ agents: AGENT_REGISTRY });
});

app.post("/task", async (req, res) => {
  const { task } = req.body;
  if (!task) return res.status(400).json({ error: "Missing task" });

  console.log(`\n${"=".repeat(60)}`);
  console.log(`[Coordinator] New task: ${task}`);
  console.log(`${"=".repeat(60)}`);

  const messages = [
    {
      role: "system",
      content: `You are the Coordinator Agent in AgentBazaar — an autonomous marketplace where AI agents hire and pay other agents to complete tasks on Stellar.

You have three specialized agents you can hire:
- call_researcher: gathers information and research on any topic
- call_analyst: analyzes data and extracts deep insights
- call_writer: synthesizes everything into a polished final report

For each task:
1. Always call call_researcher first to gather information
2. Call call_analyst with the research findings for deep insights
3. Call call_writer with all context to produce the final report
4. Return the writer's output as your final answer

Each tool call triggers a real Stellar XLM payment to that agent. Be decisive and efficient.`,
    },
    { role: "user", content: task },
  ];

  const paymentLog = [];

  try {
    while (true) {
      const response = await client.chat.completions.create({
        model: "gpt-4o",
        messages,
        tools,
        tool_choice: "auto",
      });

      const message = response.choices[0].message;
      messages.push(message);

      if (!message.tool_calls || message.tool_calls.length === 0) {
        console.log(`\n[Coordinator] Task complete. ${paymentLog.length} payments made.`);
        return res.json({
          result: message.content,
          payments: paymentLog,
          totalSpent: `${paymentLog.reduce((sum, p) => sum + parseFloat(p.amount), 0).toFixed(1)} XLM`,
        });
      }

      for (const toolCall of message.tool_calls) {
        const name = toolCall.function.name;
        const input = JSON.parse(toolCall.function.arguments);

        let agentKey;
        let body;

        if (name === "call_researcher") {
          agentKey = "researcher";
          body = { task: input.task };
        } else if (name === "call_analyst") {
          agentKey = "analyst";
          body = { task: input.task, data: input.data };
        } else if (name === "call_writer") {
          agentKey = "writer";
          body = { task: input.task, context: input.context };
        }

        const { result, txHash } = await callAgent(agentKey, body);

        paymentLog.push({
          agent: agentKey,
          amount: AGENT_REGISTRY[agentKey].price,
          txHash,
          stellarExplorer: `https://stellar.expert/explorer/testnet/tx/${txHash}`,
        });

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });
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
