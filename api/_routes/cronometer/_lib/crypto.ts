// AES-GCM helpers matching the legacy Deno implementation (webPush.ts).
// Key derivation: SHA-256(CRONO_WEB_KEY) -> 256-bit AES-GCM key.
// Ciphertext format: "<base64 iv>.<base64 ciphertext>" (unchanged), so existing
// rows in cronometer_web_sessions keep decrypting after the port.
import { webcrypto } from "node:crypto";

const subtle = webcrypto.subtle;

async function getKey(): Promise<CryptoKey> {
  const raw = process.env.CRONO_WEB_KEY;
  if (!raw) throw new Error("CRONO_WEB_KEY not configured");
  const bytes = new TextEncoder().encode(raw);
  const hash = await subtle.digest("SHA-256", bytes);
  return subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

const b64 = {
  enc: (buf: ArrayBuffer | Uint8Array) => {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    return Buffer.from(u8).toString("base64");
  },
  dec: (s: string) => new Uint8Array(Buffer.from(s, "base64")),
};

export async function encryptJson(value: unknown): Promise<string> {
  const key = await getKey();
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const cipher = await subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  return `${b64.enc(iv)}.${b64.enc(cipher)}`;
}

export async function decryptJson<T = unknown>(blob: string): Promise<T> {
  const [ivB64, ctB64] = blob.split(".");
  if (!ivB64 || !ctB64) throw new Error("bad ciphertext");
  const key = await getKey();
  const plain = await subtle.decrypt(
    { name: "AES-GCM", iv: b64.dec(ivB64) },
    key,
    b64.dec(ctB64),
  );
  return JSON.parse(new TextDecoder().decode(plain));
}
