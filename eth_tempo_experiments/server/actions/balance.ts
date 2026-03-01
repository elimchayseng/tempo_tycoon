import { Abis } from "viem/tempo";
import { accountStore } from "../accounts.js";
import {
  publicClient,
  ALPHA_USD,
  TIP20_DECIMALS,
  formatUsdAmount,
  shortAddress,
} from "../tempo-client.js";
import { emitLog, emitAccounts } from "../instrumented-client.js";
import { annotations } from "../annotations.js";

const ACTION = "balance";

export async function balanceAction() {
  if (!accountStore.isInitialized()) {
    throw new Error("Accounts not initialized. Run Setup first.");
  }

  const accounts = accountStore.getAll();

  emitLog({
    action: ACTION,
    type: "info",
    label: "Reading balances via TIP-20 contract...",
    data: {
      contract: ALPHA_USD,
      standard: "TIP-20 (extends ERC-20)",
      function: "balanceOf(address) → uint256",
    },
  });

  for (const acct of accounts) {
    emitLog({
      action: ACTION,
      type: "rpc_call",
      label: `RPC: eth_call → balanceOf(${shortAddress(acct.address)})`,
      data: {
        to: ALPHA_USD,
        function: `balanceOf(${acct.address})`,
      },
      indent: 1,
    });

    try {
      const balance = await publicClient.readContract({
        address: ALPHA_USD,
        abi: Abis.tip20,
        functionName: "balanceOf",
        args: [acct.address],
      });

      const raw = balance as bigint;
      accountStore.updateBalance(acct.label, ALPHA_USD, raw);

      emitLog({
        action: ACTION,
        type: "rpc_result",
        label: `${acct.label}: ${raw.toLocaleString()} raw = $${formatUsdAmount(raw)}`,
        data: {
          account: acct.label,
          address: shortAddress(acct.address),
          raw_balance: raw.toString(),
          formatted: `$${formatUsdAmount(raw)}`,
          decimals: TIP20_DECIMALS,
        },
        indent: 1,
      });
    } catch (err) {
      emitLog({
        action: ACTION,
        type: "error",
        label: `Failed to read balance for ${acct.label}`,
        data: { error: err instanceof Error ? err.message : String(err) },
        indent: 1,
      });
    }
  }

  emitLog({
    action: ACTION,
    type: "annotation",
    label: "KEY CONCEPT",
    data: {},
    annotations: [
      "This is a standard ERC-20 balanceOf call — TIP-20 extends ERC-20, so all existing ERC-20 tooling works out of the box.",
    ],
  });

  // Broadcast updated account state
  emitAccounts(accountStore.toPublic());
}
