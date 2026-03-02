import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createLogger } from "../../shared/logger.js";
import { getZooAccountByRole, getAllZooAccounts } from "../zoo-accounts.js";
import { publicClient, ALPHA_USD } from "../tempo-client.js";
import { accountStore } from "../accounts.js";
import { Abis } from "viem/tempo";
import { AgentRunner } from "../../agents/agent-runner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const log = createLogger('zoo-shared');

/** Refresh on-chain balances for all zoo accounts into the account store */
export async function refreshZooBalances() {
  const zooAccounts = getAllZooAccounts();
  for (const acct of zooAccounts) {
    try {
      const raw = await publicClient.readContract({
        address: ALPHA_USD,
        abi: Abis.tip20,
        functionName: "balanceOf",
        args: [acct.address],
      }) as bigint;
      accountStore.updateBalance(acct.label, ALPHA_USD, raw);
    } catch (err) {
      log.warn(`Failed to fetch balance for ${acct.label}:`, err);
    }
  }
}

/** Load and process zoo registry from config/zoo_map.json */
export function loadZooRegistry() {
  try {
    const zooMapPath = join(__dirname, '../../config/zoo_map.json');
    const zooMapContent = readFileSync(zooMapPath, 'utf-8');
    const zooMap = JSON.parse(zooMapContent);

    const zooMasterAccount = getZooAccountByRole('zooMaster');
    const merchantAccount = getZooAccountByRole('merchantA');

    if (zooMasterAccount) {
      zooMap.zoo_info.facilitator_address = zooMasterAccount.address;
    }

    if (merchantAccount && zooMap.merchants && zooMap.merchants.length > 0) {
      zooMap.merchants[0].wallet_address = merchantAccount.address;
    }

    zooMap.zoo_info.updated_at = new Date().toISOString();

    return zooMap;
  } catch (error) {
    log.error('Error loading zoo registry:', error);
    throw new Error('Failed to load zoo registry');
  }
}

/** Global AgentRunner instance — shared across all zoo route modules */
let _agentRunner: AgentRunner | null = null;

export function getAgentRunner(): AgentRunner | null {
  return _agentRunner;
}

export function setAgentRunner(runner: AgentRunner | null) {
  _agentRunner = runner;
}
