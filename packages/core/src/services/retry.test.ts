import { describe, expect, it } from "vitest";

import { parseRetryAfterHeaderMs, retryAsync } from "./retry";

describe("retryAsync", () => {
  it("retries until the operation succeeds", async () => {
    let attempts = 0;
    const result = await retryAsync(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error("temporary failure");
        }
        return "ok";
      },
      {
        attempts: 4,
        minDelayMs: 0,
        maxDelayMs: 0,
        jitter: 0,
        shouldRetry: () => true,
      },
    );

    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("stops retrying when shouldRetry returns false", async () => {
    let attempts = 0;
    await expect(
      retryAsync(
        async () => {
          attempts += 1;
          throw new Error("bad request");
        },
        {
          attempts: 4,
          minDelayMs: 0,
          maxDelayMs: 0,
          jitter: 0,
          shouldRetry: () => false,
        },
      ),
    ).rejects.toThrow("bad request");

    expect(attempts).toBe(1);
  });
});

describe("parseRetryAfterHeaderMs", () => {
  it("parses retry-after seconds", () => {
    expect(parseRetryAfterHeaderMs("2")).toBe(2000);
  });

  it("returns undefined for invalid values", () => {
    expect(parseRetryAfterHeaderMs("not-a-number")).toBeUndefined();
    expect(parseRetryAfterHeaderMs("")).toBeUndefined();
  });
});
