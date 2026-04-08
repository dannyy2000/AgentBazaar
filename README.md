# AgentBazaar

AgentBazaar is an autonomous agent-to-agent marketplace built on Stellar. A coordinator agent receives a complex task, breaks it into subtasks, discovers specialized agents registered on-chain via a Soroban smart contract, pays them per call using x402 micropayments in XLM, and aggregates the results.

## How It Works

1. User submits a task to the Coordinator Agent
2. Coordinator breaks the task into subtasks using Claude AI
3. Coordinator reads the on-chain agent registry (Soroban) to discover available agents and their prices
4. Coordinator pays each specialized agent per HTTP call via x402 on Stellar testnet
5. Each agent (also powered by Claude AI) completes its subtask and returns results
6. Coordinator aggregates all results and returns the final answer

## Agents

- **Coordinator** — Orchestrates the entire task, plans subtasks, hires and pays agents
- **Researcher** — Performs web research and information gathering
- **Analyst** — Analyzes data and extracts insights
- **Writer** — Synthesizes and formats the final output

## Tech Stack

- **Node.js** — Runtime
- **Anthropic Claude API** — Powers every agent (real AI, no mocks)
- **Stellar SDK** — Wallet management and transactions
- **x402** — HTTP payment protocol for per-call agent payments
- **Soroban** — On-chain agent registry and escrow smart contract
- **Express** — HTTP server for each agent

## Setup

1. Clone the repo
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and fill in your keys:
   ```bash
   cp .env.example .env
   ```
4. Generate and fund Stellar testnet wallets:
   ```bash
   node shared/setup-wallets.js
   node shared/fund-wallets.js
   ```
5. Start all agents and run a task (see docs)

## Hackathon

Built for the [Stellar Agents x x402 x Stripe MPP Hackathon](https://dorahacks.io/hackathon/stellar-agents-x402-stripe-mpp/detail)
