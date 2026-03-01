import { decodeEventLog, fromHex } from "viem";
import { Abis } from "viem/tempo";
import { accountStore } from "../accounts.js";
import {
  publicClient,
  ALPHA_USD,
  CHAIN_CONFIG,
  formatUsdAmount,
  shortAddress,
} from "../tempo-client.js";
import { emitLog } from "../instrumented-client.js";
import { annotations } from "../annotations.js";

const ACTION = "history";

export async function historyAction(params: { account: string }) {
  const { account } = params;

  // -----------------------------------------------------------------------
  // Step 1: Validate account exists
  // -----------------------------------------------------------------------
  const targetAcct = accountStore.get(account);
  if (!targetAcct) throw new Error(`Unknown account: ${account}`);

  emitLog({
    action: ACTION,
    type: "info",
    label: `Reading transaction history for ${targetAcct.label}`,
    data: {
      account: `${targetAcct.label} (${shortAddress(targetAcct.address)})`,
      contract: ALPHA_USD,
      note: "Searching for TransferWithMemo events where this account was sender or recipient",
    },
  });

  // -----------------------------------------------------------------------
  // Step 2: Get current block number for range
  // -----------------------------------------------------------------------
  const currentBlock = await publicClient.getBlockNumber();
  const fromBlock = BigInt(currentBlock) - 10000n; // Look back ~10,000 blocks

  emitLog({
    action: ACTION,
    type: "rpc_call",
    label: "RPC: eth_getLogs — querying TransferWithMemo events",
    data: {
      contract: ALPHA_USD,
      event: "TransferWithMemo(address indexed from, address indexed to, uint256 value, bytes32 indexed memo)",
      filter: `from=${targetAcct.label} OR to=${targetAcct.label}`,
      block_range: `${fromBlock.toString()} to ${currentBlock.toString()} (latest ~10,000 blocks)`,
      note: "The memo field is INDEXED, enabling efficient filtering by memo value",
    },
    indent: 1,
  });

  // -----------------------------------------------------------------------
  // Step 3: Query TransferWithMemo events - both sent and received
  // -----------------------------------------------------------------------

  // Get events where this account was the sender
  const sentEvents = await publicClient.getLogs({
    address: ALPHA_USD,
    event: {
      type: "event",
      name: "TransferWithMemo",
      inputs: [
        { type: "address", name: "from", indexed: true },
        { type: "address", name: "to", indexed: true },
        { type: "uint256", name: "value" },
        { type: "bytes32", name: "memo", indexed: true },
      ],
    },
    args: {
      from: targetAcct.address,
    },
    fromBlock,
    toBlock: "latest",
  });

  // Get events where this account was the recipient
  const receivedEvents = await publicClient.getLogs({
    address: ALPHA_USD,
    event: {
      type: "event",
      name: "TransferWithMemo",
      inputs: [
        { type: "address", name: "from", indexed: true },
        { type: "address", name: "to", indexed: true },
        { type: "uint256", name: "value" },
        { type: "bytes32", name: "memo", indexed: true },
      ],
    },
    args: {
      to: targetAcct.address,
    },
    fromBlock,
    toBlock: "latest",
  });

  // -----------------------------------------------------------------------
  // Step 4: Process and decode all events
  // -----------------------------------------------------------------------
  const allEvents = [...sentEvents, ...receivedEvents];

  // Remove duplicates (in case an account sent to itself) and sort by block number
  const uniqueEvents = Array.from(
    new Map(allEvents.map(event => [event.transactionHash, event])).values()
  ).sort((a, b) => {
  // Use BigInt() constructor on everything to force harmony
  const blockA = BigInt(a.blockNumber ?? 0);
  const blockB = BigInt(b.blockNumber ?? 0);
  
  if (blockA !== blockB) {
    return blockA > blockB ? 1 : -1;
  }

  const indexA = BigInt(a.logIndex ?? 0);
  const indexB = BigInt(b.logIndex ?? 0);
  
  return indexA > indexB ? 1 : -1;
});

  emitLog({
    action: ACTION,
    type: "rpc_result",
    label: `Found ${uniqueEvents.length} TransferWithMemo events`,
    data: {
      total_events: uniqueEvents.length,
      sent_events: sentEvents.length,
      received_events: receivedEvents.length,
      unique_events: uniqueEvents.length,
      block_range_scanned: `${fromBlock.toString()} to ${currentBlock.toString()}`,
    },
    indent: 1,
  });

  if (uniqueEvents.length === 0) {
    emitLog({
      action: ACTION,
      type: "info",
      label: `No transaction history found for ${targetAcct.label}`,
      data: {
        suggestion: "Try running some transfers first (Send Payment or Batch Payroll)",
      },
    });
    return;
  }

  // -----------------------------------------------------------------------
  // Step 5: Decode and format transaction history
  // -----------------------------------------------------------------------
  const transactions = uniqueEvents.map((event, index) => {
    // 1. Decode the event data
    const decoded = decodeEventLog({
      abi: Abis.tip20,
      data: event.data,
      topics: event.topics,
    });

    // 2. DEFENSIVE CHECK: Ensure args exist before destructuring
    const args = decoded.args as any || {};

    // Use fallbacks for every single value to prevent 'undefined'
    const from = args.from ?? "0x0000000000000000000000000000000000000000";
    const to = args.to ?? "0x0000000000000000000000000000000000000000";
    const value = args.value ?? 0n; // Fallback to 0n (BigInt)
    const memo = args.memo ?? "0x0";

    // Determine if this was sent or received
    const wasSent = from.toLowerCase() === targetAcct.address.toLowerCase();
    const direction = wasSent ? "SENT" : "RECV";
    const sign = wasSent ? "-" : "+";

    // Get the other party's account info
    const otherAddress = wasSent ? to : from;
    const otherAccount = accountStore.getByAddress(otherAddress);
    const otherLabel = otherAccount?.label || shortAddress(otherAddress);
    const arrow = wasSent ? "→" : "←";

    // Decode memo from bytes32 to string - avoid fromHex to prevent BigInt issues
    let decodedMemo: string;
    try {
      if (memo && memo !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
        // Simple approach: try to decode as UTF-8, fall back to hex
        const memoBytes = memo.replace(/0+$/, '');
        decodedMemo = memoBytes.length > 2 ? memoBytes : "empty";
      } else {
        decodedMemo = "empty";
      }
    } catch {
      decodedMemo = memo || "error";
    }

    return {
      index: index + 1,
      direction,
      sign,
      amount: formatUsdAmount(value), // This should return a string
      arrow,
      otherParty: String(otherLabel),
      memo: String(decodedMemo),
      blockNumber: event.blockNumber ? parseInt(event.blockNumber.toString()) : 0,
      txHash: String(event.transactionHash || "0x..."),
      from: String(shortAddress(from)),
      to: String(shortAddress(to)),
    };
  });

  emitLog({
    action: ACTION,
    type: "info",
    label: `Transaction history for ${targetAcct.label}`,
    data: {
      count: transactions.length,
      note: "Transaction details logged separately to avoid BigInt serialization issues"
    },
  });

  // -----------------------------------------------------------------------
  // Step 6: Show detailed breakdown
  // -----------------------------------------------------------------------
  emitLog({
    action: ACTION,
    type: "info",
    label: "Detailed transaction breakdown",
    data: {
      account_filter: `${targetAcct.label} (${shortAddress(targetAcct.address)})`,
      transactions: transactions.map(tx => ({
        [`Transaction #${tx.index}`]: {
          type: tx.direction,
          amount: `${tx.sign}$${tx.amount}`,
          counterparty: tx.otherParty,
          memo: `"${tx.memo}"`,
          block: tx.blockNumber.toString(),
          tx_hash: tx.txHash,
          from: tx.from,
          to: tx.to,
          explorer: `${CHAIN_CONFIG.explorerUrl}/tx/${tx.txHash}`,
        },
      })),
    },
    indent: 1,
  });

  // -----------------------------------------------------------------------
  // Step 7: Calculate summary statistics
  // -----------------------------------------------------------------------
  const sentTxs = transactions.filter(tx => tx.direction === "SENT");
  const receivedTxs = transactions.filter(tx => tx.direction === "RECV");

  const totalSent = sentTxs.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
  const totalReceived = receivedTxs.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
  const netChange = totalReceived - totalSent;

  emitLog({
    action: ACTION,
    type: "info",
    label: "Transaction summary",
    data: {
      total_transactions: transactions.length,
      sent_count: sentTxs.length,
      received_count: receivedTxs.length,
      total_sent: `$${totalSent.toFixed(2)}`,
      total_received: `$${totalReceived.toFixed(2)}`,
      net_change: `${netChange >= 0 ? '+' : ''}$${netChange.toFixed(2)}`,
      unique_memos: [...new Set(transactions.map(tx => tx.memo))].length,
    },
    indent: 1,
  });

  emitLog({
    action: ACTION,
    type: "annotation",
    label: "KEY CONCEPT",
    data: {},
    annotations: annotations.history.concept,
  });

  // -----------------------------------------------------------------------
  // Step 8: Demonstrate memo filtering capability
  // -----------------------------------------------------------------------
  const uniqueMemos = [...new Set(transactions.map(tx => tx.memo))].filter(memo => memo.length > 0);

  if (uniqueMemos.length > 0) {
    emitLog({
      action: ACTION,
      type: "info",
      label: "Memo-based filtering demonstration",
      data: {
        note: "Because memo is INDEXED, you can filter transactions by specific memo values efficiently",
        unique_memos_found: uniqueMemos,
        example_query: `Filter for all transactions with memo "PAYROLL-001" across all accounts`,
        use_case: "Exchanges can query all deposits for a specific customer ID without scanning every transfer",
      },
      indent: 1,
    });
  }
}