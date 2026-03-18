import assert from "node:assert/strict";
import test from "node:test";

import {
  extractAnthropicResponseText,
  summarizeWithAnthropic
} from "../background/anthropic-client.js";
import { ANTHROPIC_MESSAGES_URL } from "../shared/defaults.js";

test("extractAnthropicResponseText pulls text blocks from content", () => {
  assert.equal(
    extractAnthropicResponseText({
      content: [
        { type: "text", text: "First paragraph." },
        { type: "thinking", thinking: "internal" },
        { type: "text", text: "Second paragraph." }
      ]
    }),
    "First paragraph.\nSecond paragraph."
  );
});

test("summarizeWithAnthropic builds requests inside the worker and parses text output", async () => {
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
          content: [
            { type: "text", text: "Compact summary." }
          ]
        };
      }
    };
  };

  try {
    const summary = await summarizeWithAnthropic(
      {
        apiKey: "sk-ant-api03-abcdef",
        model: "claude-haiku-4-5",
        maxOutputTokens: 2048
      },
      {
        systemPrompt: "Return plain text only.",
        prompt: "Article text goes here."
      }
    );

    assert.equal(summary, "Compact summary.");
    assert.equal(capturedUrl, ANTHROPIC_MESSAGES_URL);
    assert.equal(capturedOptions.method, "POST");
    assert.equal(capturedOptions.headers["x-api-key"], "sk-ant-api03-abcdef");
    assert.equal(capturedOptions.headers["anthropic-version"], "2023-06-01");
    assert.equal(capturedOptions.headers["anthropic-dangerous-direct-browser-access"], "true");

    const body = JSON.parse(capturedOptions.body);
    assert.equal(body.model, "claude-haiku-4-5");
    assert.equal(body.system, "Return plain text only.");
    assert.equal(body.max_tokens, 2048);
    assert.equal("thinking" in body, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("summarizeWithAnthropic sanitizes API errors", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    async json() {
      return {
        error: {
          message: "Rejected x-api-key sk-ant-api03-secret and Bearer top.secret-token"
        }
      };
    }
  });

  try {
    await assert.rejects(
      summarizeWithAnthropic(
        {
          apiKey: "sk-ant-api03-secret",
          model: "claude-haiku-4-5",
          maxOutputTokens: 2048
        },
        {
          systemPrompt: "Return plain text only.",
          prompt: "Body"
        }
      ),
      /sk-REDACTED.*Bearer REDACTED/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("summarizeWithAnthropic retries once for retryable API failures", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;

  globalThis.fetch = async () => {
    attempts += 1;
    if (attempts === 1) {
      return {
        ok: false,
        status: 503,
        async json() {
          return {
            error: {
              message: "Service unavailable"
            }
          };
        }
      };
    }

    return {
      ok: true,
      async json() {
        return {
          content: [
            { type: "text", text: "Retried anthropic summary." }
          ]
        };
      }
    };
  };

  try {
    const summary = await summarizeWithAnthropic(
      {
        apiKey: "sk-ant-api03-abcdef",
        model: "claude-haiku-4-5",
        maxOutputTokens: 2048
      },
      {
        systemPrompt: "Return plain text only.",
        prompt: "Body"
      }
    );

    assert.equal(summary, "Retried anthropic summary.");
    assert.equal(attempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
