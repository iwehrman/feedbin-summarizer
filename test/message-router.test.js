import assert from "node:assert/strict";
import test from "node:test";

globalThis.chrome = {
  runtime: {
    getURL(path) {
      return `chrome-extension://test-extension/${path}`;
    }
  }
};

const { normalizeIncomingMessage } = await import("../background/message-router.js");

const optionsSender = {
  url: "chrome-extension://test-extension/options/options.html"
};

const contentSender = {
  url: "https://feedbin.com/",
  tab: { id: 7 }
};

test("options page can update settings without exposing secrets", () => {
  const request = normalizeIncomingMessage(
    {
      type: "updateOptionsSettings",
      payload: {
        openaiModel: "gpt-5-nano",
        openaiReasoningEffort: "minimal",
        openaiVerbosity: "low",
        summaryCacheEnabled: false,
        systemPrompt: "Return plain text."
      }
    },
    optionsSender
  );

  assert.equal(request.type, "updateOptionsSettings");
  assert.deepEqual(request.payload, {
    openaiModel: "gpt-5-nano",
    openaiReasoningEffort: "minimal",
    openaiVerbosity: "low",
    summaryCacheEnabled: false,
    systemPrompt: "Return plain text."
  });
});

test("content scripts cannot call options-only routes", () => {
  assert.throws(
    () => normalizeIncomingMessage({ type: "getOptionsState" }, contentSender),
    /Blocked message from an untrusted extension context/
  );
});

test("router rejects key exfiltration and generic proxy messages", () => {
  assert.throws(
    () => normalizeIncomingMessage({ type: "getApiKey" }, optionsSender),
    /Unsupported message type/
  );

  assert.throws(
    () => normalizeIncomingMessage({ type: "fetch", payload: { url: "https://example.com/" } }, contentSender),
    /Unsupported message type/
  );
});

test("content scripts can only submit validated article data", () => {
  const request = normalizeIncomingMessage(
    {
      type: "summarizeArticle",
      payload: {
        entryId: "123",
        title: "An article",
        sourceUrl: "https://example.com/article",
        articleText: "Full article text",
        preferVisibleArticleText: true
      }
    },
    contentSender
  );

  assert.equal(request.type, "summarizeArticle");
  assert.equal(request.payload.entryId, "123");
  assert.equal(request.payload.preferVisibleArticleText, true);
});

test("content scripts may submit a source URL even when visible article text is empty", () => {
  const request = normalizeIncomingMessage(
    {
      type: "summarizeArticle",
      payload: {
        entryId: "124",
        title: "Source-only article",
        sourceUrl: "https://example.com/full-story",
        articleText: "",
        preferVisibleArticleText: true
      }
    },
    contentSender
  );

  assert.equal(request.type, "summarizeArticle");
  assert.equal(request.payload.articleText, "");
  assert.equal(request.payload.sourceUrl, "https://example.com/full-story");
});
