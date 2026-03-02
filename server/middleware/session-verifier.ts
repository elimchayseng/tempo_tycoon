import { parseEventLogs } from "viem";
import { publicClient, ALPHA_USD, parseAlphaUsd, formatAlphaUsd, shortAddress } from "../tempo-client.js";
import { Abis } from "viem/tempo";

export interface TransactionVerificationResult {
  verified: boolean;
  transaction?: {
    hash: string;
    from: string;
    to: string;
    amount: string;
    blockNumber: bigint;
    gasUsed: bigint;
  };
  error?: string;
}

export class SessionVerifier {

  /**
   * Verify that a transaction matches the expected parameters
   */
  async verifyTransaction(
    txHash: string,
    expectedFrom: string,
    expectedTo: string,
    expectedAmount: string
  ): Promise<TransactionVerificationResult> {
    try {
      console.log(`[session-verifier] Verifying transaction ${txHash}`);
      console.log(`[session-verifier] Expected: ${shortAddress(expectedFrom)} → ${shortAddress(expectedTo)} ($${expectedAmount})`);

      // Get transaction receipt
      const receipt = await publicClient.getTransactionReceipt({
        hash: txHash as `0x${string}`
      });

      if (!receipt) {
        return {
          verified: false,
          error: "Transaction receipt not found"
        };
      }

      // Check if transaction was successful
      if (receipt.status !== "success") {
        return {
          verified: false,
          error: "Transaction failed on blockchain"
        };
      }

      // Get the full transaction details
      const transaction = await publicClient.getTransaction({
        hash: txHash as `0x${string}`
      });

      if (!transaction) {
        return {
          verified: false,
          error: "Transaction details not found"
        };
      }

      // Parse expected amount to raw TIP-20 units for comparison
      const expectedRawAmount = parseAlphaUsd(expectedAmount);

      // Look for TransferWithMemo event in the logs
      let transferFound = false;
      let actualAmount: bigint | undefined;
      let actualFrom: string | undefined;
      let actualTo: string | undefined;

      for (const log of receipt.logs) {
        // Check if this is a Transfer event from the AlphaUSD contract
        if (log.address.toLowerCase() === ALPHA_USD.toLowerCase()) {
          try {
            // Decode the Transfer event
            const decodedLog = parseEventLogs({
              abi: Abis.tip20,
              logs: [log]
            })[0];

            if (decodedLog && decodedLog.eventName === 'Transfer') {
              const args = decodedLog.args as any;
              actualFrom = args.from;
              actualTo = args.to;
              actualAmount = args.amount;
              transferFound = true;
              break;
            }
          } catch (decodeError) {
            // Log parsing failed, continue to next log
            console.warn(`[session-verifier] Failed to decode log:`, decodeError);
          }
        }
      }

      if (!transferFound) {
        return {
          verified: false,
          error: "No AlphaUSD transfer event found in transaction"
        };
      }

      // Verify the transfer parameters
      if (actualFrom?.toLowerCase() !== expectedFrom.toLowerCase()) {
        return {
          verified: false,
          error: `From address mismatch: expected ${shortAddress(expectedFrom)}, got ${shortAddress(actualFrom || 'unknown')}`
        };
      }

      if (actualTo?.toLowerCase() !== expectedTo.toLowerCase()) {
        return {
          verified: false,
          error: `To address mismatch: expected ${shortAddress(expectedTo)}, got ${shortAddress(actualTo || 'unknown')}`
        };
      }

      if (actualAmount !== expectedRawAmount) {
        return {
          verified: false,
          error: `Amount mismatch: expected $${expectedAmount} (${expectedRawAmount.toString()}), got $${formatAlphaUsd(actualAmount!)} (${actualAmount?.toString()})`
        };
      }

      console.log(`[session-verifier] ✓ Transaction verified successfully`);
      console.log(`[session-verifier] Details: ${shortAddress(actualFrom)} → ${shortAddress(actualTo)} $${formatAlphaUsd(actualAmount)} (block #${receipt.blockNumber})`);

      return {
        verified: true,
        transaction: {
          hash: txHash,
          from: actualFrom,
          to: actualTo,
          amount: formatAlphaUsd(actualAmount),
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed,
        }
      };

    } catch (error) {
      console.error(`[session-verifier] Error verifying transaction ${txHash}:`, error);

      return {
        verified: false,
        error: `Verification failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Check if a transaction hash is valid format
   */
  isValidTransactionHash(txHash: string): boolean {
    return typeof txHash === 'string' &&
           txHash.startsWith('0x') &&
           txHash.length === 66 &&
           /^0x[0-9a-fA-F]{64}$/.test(txHash);
  }

  /**
   * Check if an address is valid format
   */
  isValidAddress(address: string): boolean {
    return typeof address === 'string' &&
           address.startsWith('0x') &&
           address.length === 42 &&
           /^0x[0-9a-fA-F]{40}$/.test(address);
  }
}