import { describe, expect, it } from "vitest";
import {
  getCachedAccessToken,
  setCachedAccessToken,
} from "@/lib/authToken";

describe("authToken cache", () => {
  it("caches JWTs only", () => {
    setCachedAccessToken(null);
    expect(getCachedAccessToken()).toBeNull();

    setCachedAccessToken("ivOAQGQHK4aGFpv94hRIBiL5DDQ0UJQh");
    expect(getCachedAccessToken()).toBeNull();

    const jwt =
      "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.signature";
    setCachedAccessToken(jwt);
    expect(getCachedAccessToken()).toBe(jwt);

    setCachedAccessToken(null);
    expect(getCachedAccessToken()).toBeNull();
  });
});
