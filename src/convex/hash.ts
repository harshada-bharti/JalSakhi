/**
 * Prototype-grade hashing / token helpers for JalSakhi staff accounts.
 * Convex mutations cannot use Node crypto, so this is a simple,
 * dependency-free scramble — adequate for a demo, not production auth.
 */
const SALT = "jalsakhi-v1";

function scramble(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(16).padStart(13, "0");
}

/** Hash a staff password before storing it. */
export function hashPassword(password: string): string {
  return `js1$${scramble(`${SALT}:${password}`)}$${scramble(`${password}:${SALT}`)}`;
}

/** Check a staff password against the stored hash. */
export function verifyPassword(password: string, stored: string): boolean {
  if (!stored) return false;
  return hashPassword(password) === stored;
}

/** Generate a random-looking session token (non-cryptographic, prototype only). */
export function makeToken(seed: string): string {
  return `js-${scramble(`${Date.now()}-${seed}`)}${scramble(`${seed}-${Date.now()}`)}`.slice(0, 48);
}
