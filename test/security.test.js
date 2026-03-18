import assert from "node:assert/strict";
import test from "node:test";

import {
  createHttpError,
  redactSecrets,
  sanitizeErrorMessage,
  withSingleRetry
} from "../background/security.js";

test("redactSecrets masks OpenAI-style keys and bearer tokens", () => {
  const input = "sk-secret_12345678 Authorization: Bearer top.secret-token";
  const redacted = redactSecrets(input);

  assert.equal(redacted.includes("sk-secret_12345678"), false);
  assert.equal(redacted.includes("top.secret-token"), false);
  assert.match(redacted, /sk-REDACTED/);
  assert.match(redacted, /Bearer REDACTED/);
});

test("sanitizeErrorMessage redacts secrets from thrown errors", () => {
  const error = new Error("OpenAI rejected Bearer abc.def and sk-real_12345678");
  assert.equal(
    sanitizeErrorMessage(error),
    "OpenAI rejected Bearer REDACTED and sk-REDACTED"
  );
});

test("withSingleRetry retries once for retryable HTTP and timeout failures", async () => {
  let attempts = 0;
  const result = await withSingleRetry(() => {
    attempts += 1;
    if (attempts === 1) {
      throw createHttpError("Too Many Requests", 429);
    }

    return "ok";
  }, { delayMs: 0, jitterMs: 0 });

  assert.equal(result, "ok");
  assert.equal(attempts, 2);
});

test("withSingleRetry does not retry non-retryable request failures", async () => {
  let attempts = 0;
  await assert.rejects(
    withSingleRetry(() => {
      attempts += 1;
      throw createHttpError("Bad Request", 400);
    }, { delayMs: 0, jitterMs: 0 }),
    /Bad Request/
  );

  assert.equal(attempts, 1);
});
