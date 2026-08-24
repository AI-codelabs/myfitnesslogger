import { promisify } from "node:util";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const scryptAsync = promisify(scrypt);

/**
 * Same scrypt params Better Auth / Neon Auth use (`@better-auth/utils/password`).
 * Node's default `r` is 8; Better Auth uses 16 — hashes would not verify otherwise.
 */
const SCRYPT = {
  N: 16384,
  r: 16,
  p: 1,
  keylen: 64,
  maxmem: 128 * 16384 * 16 * 2,
} as const;

/** Better Auth stores passwords as `saltHex:keyHex`. */
export async function hashBetterAuthPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = (await scryptAsync(password.normalize("NFKC"), salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: SCRYPT.maxmem,
  })) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}

export async function verifyBetterAuthPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [salt, keyHex] = stored.split(":");
  if (!salt || !keyHex) return false;
  const key = (await scryptAsync(password.normalize("NFKC"), salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: SCRYPT.maxmem,
  })) as Buffer;
  const storedKey = Buffer.from(keyHex, "hex");
  if (storedKey.length !== key.length) return false;
  return timingSafeEqual(key, storedKey);
}
