# AgentBazaar

**AgentBazaar** is an autonomous agent-to-agent marketplace built on Stellar. It solves one of the biggest limitations in AI today: agents that can reason but cannot pay. In AgentBazaar, a Coordinator Agent receives a complex task, breaks it into subtasks, discovers specialized agents on-chain via a Soroban smart contract registry, pays them per HTTP call using x402 micropayments in XLM, and aggregates the results — all autonomously.

Every agent is powered by a real Claude AI model. Every payment is a real Stellar transaction. No mocks, no hardcoded responses.

Built for the [Stellar Agents x x402 x Stripe MPP Hackathon](https://dorahacks.io/hackathon/stellar-agents-x402-stripe-mpp/detail).

---

## The Problem

Most AI agents today can reason, plan, and act — but they hit a hard stop the moment they need to pay for something. Access to a premium data source, a specialized tool, or another agent's compute requires a human in the loop to handle billing. This makes true agent autonomy impossible.

AgentBazaar removes that wall. Agents can now discover, negotiate, pay for, and consume other agents' services entirely on their own — using Stellar as the payment rail.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          USER / CLIENT                          │
│                  POST /task  { task: "..." }                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     COORDINATOR AGENT                           │
│                        (Port 3000)                              │
│                                                                 │
│  1. Receives task from user                                     │
│  2. Uses Claude Sonnet to plan & break into subtasks            │
│  3. Reads Soroban registry to discover agents + prices          │
│  4. For each subtask:                                           │
│     a. Sends XLM payment to agent wallet via Stellar            │
│     b. Attaches tx hash to HTTP request (x402)                  │
│     c. Calls agent endpoint                                     │
│     d. Receives result                                          │
│  5. Uses Claude to aggregate all results                        │
│  6. Returns final answer to user                                │
│                                                                 │
│  Wallet: GCBPDMOBZITE5APP7...   Balance: 10,000 XLM (testnet)  │
└──────┬──────────────────────────────────────────────┬──────────┘
       │                                              │
       │ pays 0.5 XLM + calls                         │ pays 0.3 XLM + calls
       │                                              │
       ▼                                              ▼
┌──────────────────────┐              ┌───────────────────────────┐
│   RESEARCHER AGENT   │              │      WRITER AGENT         │
│      (Port 3001)     │              │       (Port 3003)         │
│                      │              │                           │
│  x402 middleware     │              │  x402 middleware          │
│  verifies payment    │              │  verifies payment         │
│  before responding   │              │  before responding        │
│                      │              │                           │
│  Claude Haiku +      │              │  Claude Haiku             │
│  DuckDuckGo search   │              │  Synthesizes research     │
│  tool                │              │  + analysis into final    │
│                      │              │  polished output          │
│  Returns: raw        │              │                           │
│  research findings   │              │  Returns: final report    │
└──────────────────────┘              └───────────────────────────┘
       │
       │ pays 0.5 XLM + calls
       ▼
┌──────────────────────┐
│    ANALYST AGENT     │
│      (Port 3002)     │
│                      │
│  x402 middleware     │
│  verifies payment    │
│  before responding   │
│                      │
│  Claude Haiku        │
│  Deep analysis:      │
│  patterns, risks,    │
│  opportunities       │
│                      │
│  Returns: structured │
│  analysis report     │
└──────────────────────┘
```

---

## x402 Payment Flow

x402 is an HTTP payment protocol. It extends the standard HTTP `402 Payment Required` status code into a real payment gate using Stellar micropayments.

```
COORDINATOR                    RESEARCHER AGENT                  STELLAR TESTNET
     │                               │                                │
     │  POST /research               │                                │
     │  (no payment header)          │                                │
     │ ─────────────────────────────>│                                │
     │                               │                                │
     │  402 Payment Required         │                                │
     │  { amount: 0.5 XLM,           │                                │
     │    destination: GAXC... }     │                                │
     │ <─────────────────────────────│                                │
     │                               │                                │
     │  Send 0.5 XLM payment ────────────────────────────────────────>│
     │                               │                                │
     │  tx confirmed (hash: abc123)  │                                │
     │ <──────────────────────────────────────────────────────────────│
     │                               │                                │
     │  POST /research               │                                │
     │  X-Payment: abc123            │                                │
     │ ─────────────────────────────>│                                │
     │                               │  Verify tx: abc123 ──────────>│
     │                               │  ✓ Correct destination         │
     │                               │  ✓ Correct amount              │
     │                               │  ✓ Not already used            │
     │                               │  ✓ Recent timestamp            │
     │                               │ <──────────────────────────────│
     │                               │                                │
     │  200 OK { result: "..." }     │                                │
     │ <─────────────────────────────│                                │
```

Key properties of the x402 implementation:
- **Replay protection** — every transaction hash is marked as used after verification. The same tx cannot unlock two requests.
- **Freshness check** — transactions older than 5 minutes are rejected, preventing payment recycling.
- **Amount validation** — agent verifies the exact XLM amount matches its registered price.
- **Destination check** — agent verifies the payment came to its own wallet, not another agent's.

---

## Soroban Registry Contract

The agent registry is a Soroban smart contract deployed on Stellar testnet. It acts as the on-chain directory of all available agents.

**What it stores per agent:**
```
{
  name: "researcher",
  endpoint: "http://localhost:3001/research",
  price: "0.5",
  asset: "XLM",
  wallet: "GAXCVITVVHZO4OX3...",
  owner: "GCBPDMOBZITE5APP7..."
}
```

**Why this matters:**
The Coordinator does not have hardcoded agent URLs. It reads the registry at runtime to discover what agents are available and at what price. This makes the marketplace open — anyone can deploy a new agent and register it on-chain.

---

## Agents

### Coordinator (Port 3000)
- Powered by **Claude Sonnet** (strongest reasoning for planning)
- Receives user task and uses Claude to decompose it into subtasks
- Reads Soroban registry to discover available agents
- Sends real Stellar payments before calling each agent
- Aggregates all agent results into a final coherent answer
- Has its own Stellar wallet with spending capability

### Researcher (Port 3001) — 0.5 XLM per call
- Powered by **Claude Haiku** with a `web_search` tool
- Uses DuckDuckGo API for live web queries
- Runs an agentic loop — can call search multiple times before responding
- Returns structured research findings

### Analyst (Port 3002) — 0.5 XLM per call
- Powered by **Claude Haiku** with an `analyze_data` tool
- Accepts research data as input
- Outputs structured analysis: Key Findings, Patterns, Risks, Opportunities, Conclusion
- Runs an agentic loop for multi-step analysis

### Writer (Port 3003) — 0.3 XLM per call
- Powered by **Claude Haiku**
- Takes research + analysis as context
- Synthesizes everything into a clean, polished, human-readable final report
- Uses headers, bullet points, and professional tone

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js v20 (ESM) |
| AI Models | Anthropic Claude Sonnet (coordinator), Claude Haiku (agents) |
| Blockchain | Stellar Testnet |
| Smart Contracts | Soroban (Stellar's WASM-based contract platform) |
| Payment Protocol | x402 (HTTP-native micropayments) |
| HTTP Framework | Express.js |
| Stellar SDK | @stellar/stellar-sdk |
| Anthropic SDK | @anthropic-ai/sdk |

---

## Project Structure

```
agentbazaar/
├── agents/
│   ├── coordinator/
│   │   └── index.js        # Orchestrator — plans, pays, aggregates
│   ├── researcher/
│   │   └── index.js        # Research agent — search + Claude Haiku
│   ├── analyst/
│   │   └── index.js        # Analysis agent — insights + Claude Haiku
│   └── writer/
│       └── index.js        # Writing agent — synthesis + Claude Haiku
├── contracts/
│   └── registry/           # Soroban agent registry contract (Rust)
├── shared/
│   ├── stellar.js          # Stellar helpers (send, verify, balance)
│   ├── x402.js             # x402 Express middleware
│   ├── setup-wallets.js    # Generate Stellar keypairs
│   ├── fund-wallets.js     # Fund wallets via Friendbot (testnet)
│   └── test-stellar.js     # Check wallet balances
├── .env.example            # Environment variable template
├── package.json
└── README.md
```

---

## Setup

### Prerequisites
- Node.js v18+
- An Anthropic API key ([console.anthropic.com](https://console.anthropic.com))

### 1. Clone and install
```bash
git clone https://github.com/dannyy2000/AgentBazaar.git
cd AgentBazaar
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```

Fill in your `ANTHROPIC_API_KEY` in `.env`.

### 3. Generate Stellar wallets
```bash
node shared/setup-wallets.js
```

Copy the output into your `.env` file (the `*_SECRET_KEY` and `*_PUBLIC_KEY` fields).

### 4. Fund wallets on testnet
```bash
node shared/fund-wallets.js
```

This calls Stellar Friendbot to give each wallet 10,000 XLM on testnet for free.

### 5. Start all agents
```bash
# In separate terminals, or use a process manager like pm2
node agents/researcher/index.js
node agents/analyst/index.js
node agents/writer/index.js
node agents/coordinator/index.js
```

### 6. Submit a task
```bash
curl -X POST http://localhost:3000/task \
  -H "Content-Type: application/json" \
  -d '{"task": "Research the current state of AI agents and summarize the key trends"}'
```

---

## API Reference

### Coordinator
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/task` | Submit a task for autonomous processing |
| GET | `/health` | Check coordinator status |

### Specialized Agents (all require X-Payment header)
| Agent | Method | Endpoint | Body |
|-------|--------|----------|------|
| Researcher | POST | `/research` | `{ task }` |
| Analyst | POST | `/analyze` | `{ task, data }` |
| Writer | POST | `/write` | `{ task, context }` |

All specialized agent endpoints return `402 Payment Required` without a valid `X-Payment` header containing a confirmed Stellar transaction hash.

---

## Payment Economics

| Agent | Price | Role |
|-------|-------|------|
| Researcher | 0.5 XLM | Per research call |
| Analyst | 0.5 XLM | Per analysis call |
| Writer | 0.3 XLM | Per writing call |
| **Total per full task** | **1.3 XLM** | End-to-end |

At current testnet rates this is negligible. On mainnet with USDC, each full task would cost a fraction of a cent.

---

## Hackathon Submission

- **Track:** Stellar Agents x x402 x Stripe MPP
- **Stellar Network:** Testnet (all transactions verifiable on [Stellar Expert](https://stellar.expert/explorer/testnet))
- **Key Innovation:** True agent-to-agent economic coordination — agents autonomously hire, pay, and consume other agents using Stellar micropayments and x402, with an on-chain Soroban registry as the service directory
