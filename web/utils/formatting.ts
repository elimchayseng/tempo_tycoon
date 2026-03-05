// Utility functions for formatting and display

/**
 * Format a balance string to display as USD
 * @param balance - Raw balance as string (e.g., "1000000" for $1.00)
 * @returns Formatted balance (e.g., "$1.00")
 */
/**
 * Format a raw AlphaUSD balance (TIP-20, 6 decimals) for display.
 * @param balance - Raw balance as string (e.g., "1000000" for $1.00)
 * @returns Formatted balance (e.g., "$1.00 AUSD")
 */
export function formatAlphaUsdBalance(balance: string): string {
  const raw = BigInt(balance || "0");
  const whole = raw / 1_000_000n; // 6 decimals for TIP-20
  const frac = raw % 1_000_000n;
  const fracStr = frac.toString().padStart(6, "0").slice(0, 2);
  return `$${whole.toLocaleString()}.${fracStr} AUSD`;
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

/**
 * Map agent IDs to animal emojis
 */
export const ANIMAL_EMOJI: Record<string, string> = {
  guest_1: "👨",
  guest_2: "👩",
  guest_3: "🧑",
};

/**
 * Build the standardized guest label: `Guest: 0xABCD...1234 🦁`
 * @param agentId - e.g. "guest_1"
 * @param address - optional wallet address
 */
export function formatGuestLabel(agentId: string, address?: string): string {
  const emoji = ANIMAL_EMOJI[agentId] ?? "🧑";
  if (address) {
    return `Guest: ${shortAddr(address)} ${emoji}`;
  }
  return `Guest: ${agentId} ${emoji}`;
}

/**
 * Get combined emoji string and display name from an items array
 */
export function cartDisplayInfo(items: Array<{ name: string; quantity: number }>): { emojis: string; displayName: string } {
  const emojis = items.map(i => productEmoji(i.name)).join('');
  const displayName = items.map(i => i.name).join(' + ');
  return { emojis, displayName };
}

/**
 * Get the emoji for a product name
 */
export function productEmoji(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("hotdog") || lower.includes("hot dog")) return "🌭";
  if (lower.includes("burger") || lower.includes("hamburger")) return "🍔";
  if (lower.includes("soda") || lower.includes("drink")) return "🥤";
  if (lower.includes("popcorn")) return "🍿";
  if (lower.includes("nacho")) return "🧀";
  if (lower.includes("ice cream") || lower.includes("icecream")) return "🍦";
  if (lower.includes("pretzel")) return "🥨";
  if (lower.includes("pizza")) return "🍕";
  if (lower.includes("fries") || lower.includes("french")) return "🍟";
  if (lower.includes("cotton candy")) return "🍬";
  if (lower.includes("water") || lower.includes("bottle")) return "💧";
  if (lower.includes("coffee")) return "☕";
  return "🍽️";
}