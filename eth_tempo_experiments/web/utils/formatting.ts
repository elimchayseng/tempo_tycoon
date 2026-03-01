// Utility functions for formatting and display

/**
 * Format a balance string to display as USD
 * @param balance - Raw balance as string (e.g., "1000000" for $1.00)
 * @returns Formatted balance (e.g., "$1.00")
 */
export function formatBalance(balance: string): string {
  const raw = BigInt(balance || "0");
  const whole = raw / 1_000_000n; // 6 decimals for TIP-20
  const frac = raw % 1_000_000n;
  const fracStr = frac.toString().padStart(6, "0").slice(0, 2);
  return `$${whole.toLocaleString()}.${fracStr}`;
}

/**
 * Shorten an address for display
 * @param address - Full address (e.g., "0x1234...abcd")
 * @returns Shortened address (e.g., "0x1234...abcd")
 */
export function shortAddr(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Capitalize first letter of string
 * @param str - Input string
 * @returns Capitalized string
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Validate amount input (basic client-side validation)
 * @param amount - Amount as string
 * @returns true if valid, false otherwise
 */
export function isValidAmount(amount: string): boolean {
  if (!amount || typeof amount !== 'string') return false;
  const num = parseFloat(amount);
  return !isNaN(num) && num > 0 && num <= 10000;
}

/**
 * Validate memo input (basic client-side validation)
 * @param memo - Memo string
 * @returns true if valid, false otherwise
 */
export function isValidMemo(memo: string): boolean {
  if (typeof memo !== 'string') return false;
  return memo.length > 0 && memo.length <= 31;
}