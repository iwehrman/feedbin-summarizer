import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMissingOutputError,
  extractResponseText,
  summarizeWithOpenAI
} from "../background/openai-client.js";
import { OPENAI_RESPONSES_URL } from "../shared/defaults.js";

test("extractResponseText supports both output_text and chunked output", () => {
  assert.equal(
    extractResponseText({ output_text: "Short summary" }),
    "Short summary"
  );

  assert.equal(
    extractResponseText({
      output: [
        {
          content: [
            { type: "output_text", text: "First paragraph." },
            { type: "output_text", text: "Second paragraph." }
          ]
        }
      ]
    }),
    "First paragraph.\nSecond paragraph."
  );
});

test("buildMissingOutputError explains reasoning-only truncation", () => {
  const message = buildMissingOutputError({
    incomplete_details: {
      reason: "max_output_tokens"
    },
    usage: {
      output_tokens_details: {
        reasoning_tokens: 256
      }
    },
    output: [
      { type: "reasoning" }
    ]
  }, "gpt-5.4-nano");

  assert.match(message, /entire output budget/i);
  assert.match(message, /gpt-5\.4-nano/i);
  assert.match(message, /256/);
});

test("summarizeWithOpenAI builds requests inside the worker and parses output text", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedOptions = null;

  globalThis.fetch = async (url, options) => {
    capturedUrl = String(url);
    capturedOptions = options;
    return {
      ok: true,
      async json() {
        return {
          output_text: "Compact summary."
        };
      }
    };
  };

  try {
    const summary = await summarizeWithOpenAI(
      {
        apiKey: "sk-secret_123456789",
        model: "gpt-5.4-mini",
        reasoningEffort: "none",
        verbosity: "low"
      },
      {
        systemPrompt: "Return plain text only.",
        prompt: "Article text goes here."
      }
    );

    assert.equal(summary, "Compact summary.");
    assert.equal(capturedUrl, OPENAI_RESPONSES_URL);
    assert.equal(capturedOptions.method, "POST");
    assert.equal(capturedOptions.headers.Authorization, "Bearer sk-secret_123456789");

    const body = JSON.parse(capturedOptions.body);
    assert.equal(body.model, "gpt-5.4-mini");
    assert.equal(body.instructions, "Return plain text only.");
    assert.deepEqual(body.reasoning, { effort: "none" });
    assert.deepEqual(body.text, { verbosity: "low" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("summarizeWithOpenAI sanitizes API errors", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    async json() {
      return {
        error: {
          message: "Rejected Bearer abc.def and sk-secret_123456789"
        }
      };
    }
  });

  try {
    await assert.rejects(
      summarizeWithOpenAI(
        {
          apiKey: "sk-secret_123456789",
          model: "gpt-5.4-mini",
          reasoningEffort: "",
          verbosity: ""
        },
        {
          systemPrompt: "Return plain text only.",
          prompt: "Body"
        }
      ),
      /Bearer REDACTED.*sk-REDACTED/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("summarizeWithOpenAI retries once for retryable API failures", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;

  globalThis.fetch = async () => {
    attempts += 1;
    if (attempts === 1) {
      return {
        ok: false,
        status: 429,
        async json() {
          return {
            error: {
              message: "Rate limited"
            }
          };
        }
      };
    }

    return {
      ok: true,
      async json() {
        return {
          output_text: "Retried summary."
        };
      }
    };
  };

  try {
    const summary = await summarizeWithOpenAI(
      {
        apiKey: "sk-secret_123456789",
        model: "gpt-5.4-mini",
        reasoningEffort: "none",
        verbosity: "low"
      },
      {
        systemPrompt: "Return plain text only.",
        prompt: "Body"
      }
    );

    assert.equal(summary, "Retried summary.");
    assert.equal(attempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
