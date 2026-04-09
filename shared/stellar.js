import * as StellarSdk from "@stellar/stellar-sdk";
import "dotenv/config";

const server = new StellarSdk.Horizon.Server(
  process.env.STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org"
);

const networkPassphrase = StellarSdk.Networks.TESTNET;

export async function sendPayment({ senderSecret, destination, amount, memo }) {
  const senderKeypair = StellarSdk.Keypair.fromSecret(senderSecret);
  const senderAccount = await server.loadAccount(senderKeypair.publicKey());

  const transaction = new StellarSdk.TransactionBuilder(senderAccount, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      StellarSdk.Operation.payment({
        destination,
        asset: StellarSdk.Asset.native(),
        amount: amount.toString(),
      })
    )
    .addMemo(StellarSdk.Memo.text(memo || "agentbazaar"))
    .setTimeout(30)
    .build();

  transaction.sign(senderKeypair);

  const result = await server.submitTransaction(transaction);
  return result.hash;
}

export async function verifyPayment({ txHash, expectedDestination, expectedAmount }) {
  const tx = await server.transactions().transaction(txHash).call();

  if (!tx.successful) {
    throw new Error("Transaction was not successful");
  }

  // Check transaction is recent (within last 5 minutes)
  const txTime = new Date(tx.created_at).getTime();
  const now = Date.now();
  if (now - txTime > 5 * 60 * 1000) {
    throw new Error("Transaction is too old");
  }

  // Load operations to verify payment details
  const ops = await server.operations().forTransaction(txHash).call();
  const paymentOp = ops.records.find((op) => op.type === "payment");

  if (!paymentOp) {
    throw new Error("No payment operation found in transaction");
  }

  if (paymentOp.to !== expectedDestination) {
    throw new Error(`Payment sent to wrong address. Expected ${expectedDestination}`);
  }

  const paidAmount = parseFloat(paymentOp.amount);
  const required = parseFloat(expectedAmount);

  if (paidAmount < required) {
    throw new Error(`Insufficient payment. Required ${required} XLM, got ${paidAmount} XLM`);
  }

  return { paidAmount, from: paymentOp.from };
}

export async function getBalance(publicKey) {
  const account = await server.loadAccount(publicKey);
  const xlmBalance = account.balances.find((b) => b.asset_type === "native");
  return parseFloat(xlmBalance?.balance || "0");
}
