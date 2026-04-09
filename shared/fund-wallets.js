import "dotenv/config";
import https from "https";

const wallets = [
  { name: "COORDINATOR", key: process.env.COORDINATOR_PUBLIC_KEY },
  { name: "RESEARCHER", key: process.env.RESEARCHER_PUBLIC_KEY },
  { name: "ANALYST", key: process.env.ANALYST_PUBLIC_KEY },
  { name: "WRITER", key: process.env.WRITER_PUBLIC_KEY },
];

async function fundAccount(name, publicKey) {
  return new Promise((resolve, reject) => {
    console.log(`Funding ${name} (${publicKey})...`);
    const url = `https://friendbot.stellar.org?addr=${publicKey}`;
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          const result = JSON.parse(data);
          if (result.hash || result._links) {
            console.log(`✓ ${name} funded with 10,000 XLM on testnet\n`);
          } else {
            console.log(`✗ ${name} funding failed:`, result);
          }
          resolve(result);
        });
      })
      .on("error", reject);
  });
}

for (const wallet of wallets) {
  if (!wallet.key) {
    console.error(`Missing public key for ${wallet.name}. Check your .env`);
    process.exit(1);
  }
  await fundAccount(wallet.name, wallet.key);
}

console.log("All wallets funded. Ready to build.");
