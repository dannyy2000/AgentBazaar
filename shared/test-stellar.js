import "dotenv/config";
import { getBalance } from "./stellar.js";

const wallets = [
  { name: "COORDINATOR", key: process.env.COORDINATOR_PUBLIC_KEY },
  { name: "RESEARCHER", key: process.env.RESEARCHER_PUBLIC_KEY },
  { name: "ANALYST", key: process.env.ANALYST_PUBLIC_KEY },
  { name: "WRITER", key: process.env.WRITER_PUBLIC_KEY },
];

console.log("Checking wallet balances...\n");

for (const wallet of wallets) {
  const balance = await getBalance(wallet.key);
  console.log(`${wallet.name}: ${balance} XLM`);
}
