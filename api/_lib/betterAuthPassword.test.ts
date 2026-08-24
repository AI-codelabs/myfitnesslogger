import { describe, expect, it } from "vitest";
import {
  hashBetterAuthPassword,
  verifyBetterAuthPassword,
} from "./betterAuthPassword";
import { verifyPassword as betterAuthVerify } from "@better-auth/utils/password";

describe("Better Auth password hashing", () => {
  it("matches Neon/Better Auth scrypt verify", async () => {
    const password = "Lift360-test-password";
    const hash = await hashBetterAuthPassword(password);
    expect(hash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(await verifyBetterAuthPassword(password, hash)).toBe(true);
    expect(await verifyBetterAuthPassword("wrong", hash)).toBe(false);
    expect(await betterAuthVerify(hash, password)).toBe(true);
    expect(await betterAuthVerify(hash, "wrong")).toBe(false);
  });
});
