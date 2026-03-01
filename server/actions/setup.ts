import { Actions, Abis } from "viem/tempo";
import { accountStore } from "../accounts.js";
import {
  publicClient,
  ALPHA_USD,
  CHAIN_CONFIG,
  TIP20_DECIMALS,
  formatUsdAmount,
  shortAddress,
} from "../tempo-client.js";
import {
  emitLog,
  emitAccounts,
  instrumentedCall,
  instrumentedReadContract,
} from "../instrumented-client.js";
import { annotations } from "../annotations.js";

const ACTION = "setup";

export async function setupAction() {
  // -----------------------------------------------------------------------
  // Step 1: Generate accounts
  // -----------------------------------------------------------------------
  emitLog({
    action: ACTION,
    type: "info",
    label: "Generating accounts...",
    data: {},
  });

  accountStore.generate();
  const accounts = accountStore.getAll();

  for (const acct of accounts) {
    emitLog({
      action: ACTION,
      type: "info",
      label: `${acct.label}: ${shortAddress(acct.address)}`,
      data: {
        full_address: acct.address,
        note: "private key generated locally",
      },
      indent: 1,
    });
  }

  emitLog({
    action: ACTION,
    type: "annotation",
    label: "KEY CONCEPT",
    data: {},
    annotations: annotations.setup.accounts,
  });

  // -----------------------------------------------------------------------
  // Step 2: Fund each account via faucet
  // -----------------------------------------------------------------------
  for (const acct of accounts) {
    emitLog({
      action: ACTION,
      type: "info",
      label: `Requesting faucet funds for ${acct.label}...`,
      data: {},
    });

    const viemAccount = accountStore.getAccount(acct.label);

    emitLog({
      action: ACTION,
      type: "rpc_call",
      label: `RPC: tempo_fundAddress(${shortAddress(acct.address)})`,
      data: {
        endpoint: CHAIN_CONFIG.rpcUrl,
      },
      indent: 1,
    });

    try {
      // fundSync waits for receipts — gives us confirmation data to log
      const receipts = await Actions.faucet.fundSync(publicClient, {
        account: viemAccount,
      });

      // The faucet funds multiple tokens; find the AlphaUSD receipt
      const alphaReceipt = receipts.find(
        (r: any) =>
          r.to?.toLowerCase() === ALPHA_USD.toLowerCase()
      );

      emitLog({
        action: ACTION,
        type: "rpc_result",
        label: `Faucet funded ${acct.label} — ${receipts.length} token(s)`,
        data: {
          tx_count: receipts.length,
          tokens_funded: receipts.map((r: any) => r.to),
          status: receipts.every((r: any) => r.status === "success")
            ? "all succeeded"
            : "some failed",
          block: alphaReceipt?.blockNumber?.toString() ?? "unknown",
        },
        indent: 1,
      });
    } catch (err) {
      emitLog({
        action: ACTION,
        type: "error",
        label: `Faucet failed for ${acct.label}`,
        data: {
          error: err instanceof Error ? err.message : String(err),
        },
        indent: 1,
      });
      // Continue with other accounts even if one fails
    }
  }

  emitLog({
    action: ACTION,
    type: "annotation",
    label: "KEY CONCEPT",
    data: {},
    annotations: annotations.setup.faucet,
  });

  // -----------------------------------------------------------------------
  // Step 3: Read back balances
  // -----------------------------------------------------------------------
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
    annotations: annotations.setup.balance,
  });

  // Broadcast updated account state
  emitAccounts(accountStore.toPublic());
}
