import { describe, expect, it } from "vitest";

import { decryptJson, encryptJson, sha256Hex } from "./crypto";

describe("crypto utils", () => {
  it("encrypts and decrypts JSON payloads", () => {
    process.env.ENCRYPTION_KEY =
      "test-encryption-key-12345678901234567890123456789012";
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgres://localhost/test";
    process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

    const payload = { foo: "bar", count: 12 };
    const encrypted = encryptJson(payload);
    expect(encrypted).toContain(":");
    const decrypted = decryptJson<typeof payload>(encrypted);
    expect(decrypted).toEqual(payload);
  });

  it("produces deterministic sha256 hash", () => {
    const one = sha256Hex("avatar");
    const two = sha256Hex("avatar");
    expect(one).toBe(two);
    expect(one).toHaveLength(64);
  });
});

