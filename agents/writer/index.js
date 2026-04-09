import "dotenv/config";
import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { x402 } from "../../shared/x402.js";

const app = express();
app.use(express.json());

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PORT = process.env.WRITER_PORT || 3003;
const DESTINATION = process.env.WRITER_PUBLIC_KEY;
const PRICE = process.env.WRITER_PRICE || "0.3";

// Health check
app.get("/health", (req, res) => {
  res.json({
    agent: "Writer",
    status: "online",
    price: `${PRICE} XLM per call`,
    destination: DESTINATION,
  });
});

// Main writing endpoint — gated by x402
app.post(
  "/write",
  x402({ destination: DESTINATION, amount: PRICE, agentName: "writer" }),
  async (req, res) => {
    const { task, context } = req.body;

    if (!task) {
      return res.status(400).json({ error: "Missing task in request body" });
    }

    console.log(`[Writer] Task received: ${task}`);

    const userMessage = context
      ? `Task: ${task}\n\nContext and research to work from:\n${context}`
      : task;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      system:
        "You are a specialized writing agent. Your job is to take research findings and analysis and synthesize them into a clear, engaging, well-structured final output. Write in a professional tone. Use headers, bullet points, and clear sections. Make complex information accessible and actionable.",
      messages: [{ role: "user", content: userMessage }],
    });

    const text = response.content.find((b) => b.type === "text")?.text || "";
    console.log(`[Writer] Done. Payment: ${req.payment.txHash}`);

    res.json({ result: text, payment: req.payment });
  }
);

app.listen(PORT, () => {
  console.log(`Writer Agent running on port ${PORT}`);
  console.log(`Wallet: ${DESTINATION}`);
  console.log(`Price: ${PRICE} XLM per call\n`);
});
