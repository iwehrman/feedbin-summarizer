import assert from "node:assert/strict";
import test from "node:test";

import {
  redactSecrets,
  sanitizeErrorMessage
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
