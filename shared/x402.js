import { verifyPayment } from "./stellar.js";

// In-memory store to prevent replay attacks (tx hash reuse)
const usedTransactions = new Set();

/**
 * x402 middleware factory
 * Wraps an Express route with Stellar payment verification.
 *
 * Flow:
 *  1. Request comes in with no X-Payment header → 402 with payment instructions
 *  2. Client pays on Stellar and retries with X-Payment: <txHash>
 *  3. Middleware verifies tx on-chain, then passes to agent handler
 *
 * @param {object} options
 * @param {string} options.destination  - Agent's Stellar public key
 * @param {string} options.amount       - Required XLM amount per call
 * @param {string} options.agentName    - Human-readable agent name
 */
export function x402(options) {
  const { destination, amount, agentName } = options;

  return async (req, res, next) => {
    const txHash = req.headers["x-payment"];

    // No payment header → return 402 with instructions
    if (!txHash) {
      return res.status(402).json({
        error: "Payment Required",
        message: `This agent requires ${amount} XLM per call`,
        paymentRequired: {
          amount,
          asset: "XLM",
          destination,
          network: "testnet",
          memo: agentName,
          instructions:
            "Send a Stellar payment to the destination address, then retry this request with the transaction hash in the X-Payment header",
        },
      });
    }

    // Replay attack check
    if (usedTransactions.has(txHash)) {
      return res.status(402).json({
        error: "Payment Already Used",
        message: "This transaction hash has already been used. Please submit a new payment.",
      });
    }

    // Verify on Stellar
    try {
      const { paidAmount, from } = await verifyPayment({
        txHash,
        expectedDestination: destination,
        expectedAmount: amount,
      });

      // Mark tx as used
      usedTransactions.add(txHash);

      // Attach payment info to request for logging
      req.payment = { txHash, paidAmount, from };

      console.log(
        `[x402] Payment verified for ${agentName}: ${paidAmount} XLM from ${from} | tx: ${txHash}`
      );

      next();
    } catch (err) {
      return res.status(402).json({
        error: "Payment Verification Failed",
        message: err.message,
      });
    }
  };
}
