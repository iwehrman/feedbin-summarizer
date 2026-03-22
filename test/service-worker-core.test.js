import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSummaryCacheKeyForPayload,
  buildSummaryPrompt,
  didContentInvalidationChange,
  getCachedSummaryFromCache,
  normalizeSettings,
  normalizeVisibleArticleText,
  pruneSummaryCache,
  shouldPreferVisibleArticleText,
  storeCachedSummaryInCache
} from "../background/service-worker-core.js";

test("normalizeSettings applies defaults and sanitizes values", () => {
  const settings = normalizeSettings({
    provider: "ANTHROPIC",
    openaiModel: "  gpt-5-nano  ",
    openaiReasoningEffort: "minimal",
    openaiVerbosity: "HIGH",
    anthropicModel: " claude-haiku-4-5 ",
    summaryCacheEnabled: false,
    systemPrompt: "  Return plain text.  "
  });

  assert.deepEqual(settings, {
    provider: "anthropic",
    openaiModel: "gpt-5.4-nano",
    openaiReasoningEffort: "none",
    openaiVerbosity: "high",
    anthropicModel: "claude-haiku-4-5",
    summaryCacheEnabled: false,
    prefetchDebugVisualizationEnabled: false,
    systemPrompt: "Return plain text."
  });
});

test("normalizeSettings migrates legacy OpenAI model names and unsupported reasoning effort", () => {
  const settings = normalizeSettings({
    provider: "openai",
    openaiModel: "gpt-5-mini",
    openaiReasoningEffort: "minimal",
    openaiVerbosity: "low",
    anthropicModel: "claude-haiku-4-5",
    summaryCacheEnabled: true,
    systemPrompt: "Return plain text."
  });

  assert.equal(settings.openaiModel, "gpt-5.4-mini");
  assert.equal(settings.openaiReasoningEffort, "none");
});

test("normalizeSettings rewrites blank OpenAI reasoning and verbosity to current defaults", () => {
  const settings = normalizeSettings({
    provider: "openai",
    openaiModel: "gpt-5.4-mini",
    openaiReasoningEffort: "",
    openaiVerbosity: "",
    anthropicModel: "claude-haiku-4-5",
    summaryCacheEnabled: true,
    systemPrompt: "Return plain text."
  });

  assert.equal(settings.openaiReasoningEffort, "none");
  assert.equal(settings.openaiVerbosity, "low");
});

test("didContentInvalidationChange only tracks content-affecting settings", () => {
  assert.equal(
    didContentInvalidationChange(
      {
        provider: "openai",
        openaiModel: "gpt-4.1-mini",
        openaiReasoningEffort: "none",
        openaiVerbosity: "low",
        anthropicModel: "claude-haiku-4-5",
        summaryCacheEnabled: true,
        systemPrompt: "A"
      },
      {
        provider: "openai",
        openaiModel: "gpt-4.1-mini",
        openaiReasoningEffort: "none",
        openaiVerbosity: "low",
        anthropicModel: "claude-sonnet-4-6",
        summaryCacheEnabled: true,
        systemPrompt: "A"
      }
    ),
    false
  );

  assert.equal(
    didContentInvalidationChange(
      {
        provider: "openai",
        openaiModel: "gpt-4.1-mini",
        openaiReasoningEffort: "none",
        openaiVerbosity: "low",
        anthropicModel: "claude-haiku-4-5",
        summaryCacheEnabled: true,
        systemPrompt: "A"
      },
      {
        provider: "anthropic",
        openaiModel: "gpt-5.4-nano",
        openaiReasoningEffort: "none",
        openaiVerbosity: "low",
        anthropicModel: "claude-haiku-4-5",
        summaryCacheEnabled: true,
        systemPrompt: "A"
      }
    ),
    true
  );
});

test("normalizeVisibleArticleText strips loading placeholders", () => {
  assert.equal(normalizeVisibleArticleText("Loading full content..."), "");
  assert.equal(normalizeVisibleArticleText("Loading"), "");
  assert.equal(normalizeVisibleArticleText("Real article text"), "Real article text");
});

test("shouldPreferVisibleArticleText only trusts substantial, non-truncated visible text", () => {
  assert.equal(shouldPreferVisibleArticleText("Brief overview of the article..."), false);
  assert.equal(shouldPreferVisibleArticleText(""), false);
  assert.equal(
    shouldPreferVisibleArticleText(
      Array.from({ length: 320 }, () => "word").join(" ")
    ),
    true
  );
});

test("buildSummaryPrompt produces the expected prompt envelope", () => {
  const prompt = buildSummaryPrompt({
    title: "An article",
    sourceUrl: "https://example.com/story",
    articleText: "Body text"
  });

  assert.equal(
    prompt,
    "Task: Summarize this article.\nThe article title is already visible to the reader. Do not restate it unless needed for clarity.\n\nTitle: An article\nSource URL: https://example.com/story\n\nArticle text:\nBody text"
  );
});

test("buildSummaryPrompt can request an expanded summary", () => {
  const prompt = buildSummaryPrompt({
    title: "An article",
    sourceUrl: "https://example.com/story",
    articleText: "Body text",
    summaryMode: "expanded",
    existingSummaryText: "Short first summary."
  });

  assert.equal(
    prompt,
    "Task: Expand on the existing summary of this article.\nReturn only additional details that add useful context or substance.\nDo not repeat points already covered in the existing summary.\n\nTitle: An article\nSource URL: https://example.com/story\n\nExisting summary:\nShort first summary.\n\nArticle text:\nBody text"
  );
});

test("buildSummaryCacheKeyForPayload is stable and changes when settings change", async () => {
  const payload = {
    entryId: "entry-1",
    title: "An article",
    sourceUrl: "https://example.com/story",
    articleText: "Body text"
  };
  const settings = normalizeSettings({
    provider: "anthropic",
    openaiModel: "gpt-4.1-mini",
    openaiReasoningEffort: "none",
    openaiVerbosity: "low",
    anthropicModel: "claude-haiku-4-5",
    summaryCacheEnabled: true,
    systemPrompt: "Return plain text."
  });

  const keyA = await buildSummaryCacheKeyForPayload(payload, settings);
  const keyB = await buildSummaryCacheKeyForPayload(payload, settings);
  const keyC = await buildSummaryCacheKeyForPayload(payload, {
    ...settings,
    anthropicModel: "claude-sonnet-4-6"
  });
  const keyD = await buildSummaryCacheKeyForPayload({
    ...payload,
    summaryMode: "expanded",
    existingSummaryText: "Short first summary."
  }, settings);
  const keyE = await buildSummaryCacheKeyForPayload({
    ...payload,
    summaryMode: "expanded",
    existingSummaryText: "Different first summary."
  }, settings);

  assert.equal(keyA, keyB);
  assert.notEqual(keyA, keyC);
  assert.notEqual(keyA, keyD);
  assert.notEqual(keyD, keyE);
  assert.match(keyA, /^v3:[a-f0-9]{64}$/);
});

test("cache helpers respect TTL, update access time, and prune oldest entries", () => {
  const now = Date.UTC(2026, 2, 14, 12, 0, 0);
  const cache = {};

  storeCachedSummaryInCache(cache, "fresh", {
    summaryText: "Summary A",
    contentSourceLabel: "Full source page",
    sourceWarning: ""
  }, 7, now);

  const freshEntry = getCachedSummaryFromCache(cache, "fresh", now + 1000);
  assert.equal(freshEntry.summaryText, "Summary A");
  assert.equal(cache.fresh.lastAccessedAt, now + 1000);

  const expired = {
    stale: {
      summaryText: "Old",
      createdAt: now - 5000,
      lastAccessedAt: now - 5000,
      expiresAt: now - 1
    }
  };
  assert.equal(getCachedSummaryFromCache(expired, "stale", now), null);
  assert.equal("stale" in expired, false);

  const overflow = {
    a: { summaryText: "A", createdAt: 1, lastAccessedAt: 1, expiresAt: now + 10000 },
    b: { summaryText: "B", createdAt: 2, lastAccessedAt: 2, expiresAt: now + 10000 },
    c: { summaryText: "C", createdAt: 3, lastAccessedAt: 3, expiresAt: now + 10000 }
  };
  pruneSummaryCache(overflow, now, 2);
  assert.deepEqual(Object.keys(overflow).sort(), ["b", "c"]);
});
