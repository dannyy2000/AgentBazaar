import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import { x402 } from "../../shared/x402.js";

const app = express();
app.use(express.json());

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PORT = process.env.WRITER_PORT || 3003;
const DESTINATION = process.env.WRITER_PUBLIC_KEY;
const PRICE = process.env.WRITER_PRICE || "0.3";

app.get("/health", (req, res) => {
  res.json({ agent: "Writer", status: "online", price: `${PRICE} XLM per call`, destination: DESTINATION });
});

app.post(
  "/write",
  x402({ destination: DESTINATION, amount: PRICE, agentName: "writer" }),
  async (req, res) => {
    const { task, context } = req.body;
    if (!task) return res.status(400).json({ error: "Missing task" });

    console.log(`[Writer] Task: ${task}`);

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a specialized writing agent. Take research findings and analysis and synthesize them into a clear, engaging, well-structured final report. Use headers, bullet points, and a professional tone. Make complex information accessible and actionable.",
        },
        {
          role: "user",
          content: context
            ? `Task: ${task}\n\nContext and research:\n${context}`
            : task,
        },
      ],
    });

    const text = response.choices[0].message.content;
    console.log(`[Writer] Done. Payment: ${req.payment.txHash}`);
    res.json({ result: text, payment: req.payment });
  }
);

app.listen(PORT, () => {
  console.log(`Writer Agent running on port ${PORT}`);
  console.log(`Wallet: ${DESTINATION}`);
  console.log(`Price: ${PRICE} XLM per call\n`);
});
