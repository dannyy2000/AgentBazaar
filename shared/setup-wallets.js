import * as StellarSdk from "@stellar/stellar-sdk";
import { Keypair } from "@stellar/stellar-sdk";
import https from "https";

const agents = ["COORDINATOR", "RESEARCHER", "ANALYST", "WRITER"];

async function fundAccount(publicKey) {
  return new Promise((resolve, reject) => {
    const url = `https://friendbot.stellar.org?addr=${publicKey}`;
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(JSON.parse(data)));
      })
      .on("error", reject);
  });
}

console.log("Generating Stellar testnet wallets...\n");

for (const agent of agents) {
  const keypair = Keypair.random();
  console.log(`${agent}_SECRET_KEY=${keypair.secret()}`);
  console.log(`${agent}_PUBLIC_KEY=${keypair.publicKey()}`);
  console.log("");
}

console.log(
  "Copy the above into your .env file, then run: node shared/fund-wallets.js"
);
