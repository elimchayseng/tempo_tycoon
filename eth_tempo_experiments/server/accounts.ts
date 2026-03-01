import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { ServerAccount } from "../shared/types.js";

// Use the shared ServerAccount type for consistency
type Account = ServerAccount;

const LABELS = ["Alice", "Bob", "Merchant", "Sponsor"] as const;

class AccountStore {
  private accounts: Map<string, Account> = new Map();

  generate() {
    this.accounts.clear();
    for (const label of LABELS) {
      const privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);
      this.accounts.set(label.toLowerCase(), {
        label,
        address: account.address,
        privateKey,
        balances: {},
      });
    }
  }

  get(label: string): Account | undefined {
    return this.accounts.get(label.toLowerCase());
  }

  getByAddress(address: string): Account | undefined {
    for (const account of this.accounts.values()) {
      if (account.address.toLowerCase() === address.toLowerCase()) {
        return account;
      }
    }
    return undefined;
  }

  getAll(): Account[] {
    return Array.from(this.accounts.values());
  }

  getAccount(label: string) {
    const acct = this.get(label);
    if (!acct) throw new Error(`Unknown account: ${label}`);
    return privateKeyToAccount(acct.privateKey);
  }

  updateBalance(label: string, token: string, balance: bigint) {
    const acct = this.get(label);
    if (acct) {
      acct.balances[token] = balance;
    }
  }

  isInitialized(): boolean {
    return this.accounts.size > 0;
  }

  toPublic() {
    return this.getAll().map((a) => ({
      label: a.label,
      address: a.address,
      balances: Object.fromEntries(
        Object.entries(a.balances).map(([k, v]) => [k, v.toString()])
      ),
    }));
  }
}

export const accountStore = new AccountStore();
