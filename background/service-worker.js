const DEFAULT_SETTINGS = {
  openaiApiKey: "",
  openaiModel: "gpt-4.1-mini",
  openaiReasoningEffort: "minimal",
  openaiVerbosity: "low",
  summaryCacheEnabled: true,
  systemPrompt: [
    "You summarize articles for a single user inside Feedbin.",
    "Prioritize what happened, why it matters, and any important nuance, dates, names, or numbers.",
    "Be compact but not vague.",
    "Do not mention that you are an AI assistant.",
    "Return plain text only."
  ].join(" ")
};

const OFFSCREEN_DOCUMENT_PATH = "offscreen/offscreen.html";
const SUMMARY_CACHE_STORAGE_KEY = "summaryCacheEntries";
const MAX_SUMMARY_CACHE_ENTRIES = 150;
const SUMMARY_CACHE_TTL_HOURS = 36;
const PREFETCH_REQUEST_CONTROLLERS = new Map();

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  const next = {};

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (typeof existing[key] === "undefined") {
      next[key] = value;
    }
  }

  if (Object.keys(next).length > 0) {
    await chrome.storage.local.set(next);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    return;
  }

  if (message.type === "summarizeArticle") {
    handleSummarizeArticle(message.payload)
      .then(result => sendResponse({ ok: true, result }))
      .catch(error => sendResponse({ ok: false, error: error.message || String(error) }));

    return true;
  }

  if (message.type === "testProvider") {
    handleTestProvider(message.payload)
      .then(result => sendResponse({ ok: true, result }))
      .catch(error => sendResponse({ ok: false, error: error.message || String(error) }));

    return true;
  }

  if (message.type === "prefetchArticle") {
    handlePrefetchArticle(message.payload)
      .then(result => sendResponse({ ok: true, result }))
      .catch(error => sendResponse({ ok: false, error: error.message || String(error) }));

    return true;
  }

  if (message.type === "checkCachedSummaries") {
    handleCheckCachedSummaries(message.payload)
      .then(result => sendResponse({ ok: true, result }))
      .catch(error => sendResponse({ ok: false, error: error.message || String(error) }));

    return true;
  }

  if (message.type === "cancelPrefetch") {
    cancelPrefetchRequest(message.payload);
    sendResponse({ ok: true, result: { cancelled: true } });
  }
});

async function handleSummarizeArticle(payload) {
  const settings = await getSettings();
  return runSummaryPipeline(payload, settings);
}

async function handleTestProvider(payload) {
  const settings = mergeSettings(payload || {});
  const openAIConfig = getOpenAIConfig(settings);
  const summaryText = await summarizeWithOpenAI(openAIConfig, {
    systemPrompt: settings.systemPrompt,
    prompt: [
      "Title: Extension test",
      "Source URL: https://feedbin.com/",
      "",
      "Article text:",
      "Feedbin shows one article in the reading pane. This extension adds a toolbar button that replaces the body with an LLM summary."
    ].join("\n")
  });

  return {
    provider: "openai",
    model: openAIConfig.model,
    summaryText
  };
}

async function handlePrefetchArticle(payload) {
  const settings = await getSettings();
  if (settings.summaryCacheEnabled === false) {
    return {
      skipped: true,
      reason: "cache-disabled"
    };
  }

  const requestId = String(payload?.requestId || "");
  const controller = new AbortController();
  if (requestId) {
    PREFETCH_REQUEST_CONTROLLERS.set(requestId, controller);
  }

  try {
    const result = await runSummaryPipeline(payload, settings, {
      signal: controller.signal
    });

    return {
      skipped: false,
      cacheHit: result.cacheHit,
      summaryText: result.summaryText
    };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        skipped: true,
        reason: "aborted"
      };
    }

    throw error;
  } finally {
    if (requestId) {
      PREFETCH_REQUEST_CONTROLLERS.delete(requestId);
    }
  }
}

async function handleCheckCachedSummaries(payload) {
  const settings = await getSettings();
  if (settings.summaryCacheEnabled === false) {
    return {
      cachedEntryIds: [],
      cachedSummaries: []
    };
  }

  const articles = Array.isArray(payload?.articles) ? payload.articles : [];
  if (!articles.length) {
    return {
      cachedEntryIds: [],
      cachedSummaries: []
    };
  }

  const cache = await readSummaryCache();
  const cachedEntryIds = [];
  const cachedSummaries = [];
  let didTouchCache = false;
  const now = Date.now();

  for (const article of articles) {
    const cacheKey = await buildSummaryCacheKeyForPayload(article, settings);
    const entry = cache[cacheKey];
    if (!entry) {
      continue;
    }

    entry.lastAccessedAt = now;
    cache[cacheKey] = entry;
    didTouchCache = true;

    const entryId = String(article?.entryId || "").trim();
    if (entryId) {
      cachedEntryIds.push(entryId);
      if (typeof entry.summaryText === "string" && entry.summaryText.trim()) {
        cachedSummaries.push({
          entryId,
          summaryText: entry.summaryText
        });
      }
    }
  }

  if (didTouchCache) {
    pruneSummaryCache(cache);
    await writeSummaryCache(cache);
  }

  return {
    cachedEntryIds,
    cachedSummaries
  };
}

function cancelPrefetchRequest(payload) {
  const requestId = String(payload?.requestId || "");
  if (!requestId) {
    return;
  }

  const controller = PREFETCH_REQUEST_CONTROLLERS.get(requestId);
  if (!controller) {
    return;
  }

  controller.abort();
  PREFETCH_REQUEST_CONTROLLERS.delete(requestId);
}

async function getSettings() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  return mergeSettings(migrateLegacySettings(stored));
}

function mergeSettings(overrides) {
  return {
    ...DEFAULT_SETTINGS,
    ...overrides
  };
}

function getOpenAIConfig(settings) {
  if (!settings.openaiApiKey) {
    throw new Error("Missing OpenAI API key. Add it in the extension options.");
  }

  return {
    apiKey: settings.openaiApiKey,
    model: settings.openaiModel || DEFAULT_SETTINGS.openaiModel,
    reasoningEffort: normalizeChoice(settings.openaiReasoningEffort, ["minimal", "low", "medium", "high"], ""),
    verbosity: normalizeChoice(settings.openaiVerbosity, ["low", "medium", "high"], "")
  };
}

async function runSummaryPipeline(payload, settings, options = {}) {
  const signal = options.signal;
  const cacheEnabled = settings.summaryCacheEnabled !== false;
  const cacheKey = cacheEnabled ? await buildSummaryCacheKeyForPayload(payload, settings) : "";

  if (cacheKey) {
    const cachedSummary = await getCachedSummary(cacheKey);
    if (cachedSummary) {
      return {
        provider: "openai",
        model: settings.openaiModel || DEFAULT_SETTINGS.openaiModel,
        summaryText: cachedSummary.summaryText,
        contentSourceLabel: cachedSummary.contentSourceLabel || "Cached summary",
        sourceWarning: cachedSummary.sourceWarning || "",
        cacheHit: true
      };
    }
  }

  const openAIConfig = getOpenAIConfig(settings);
  throwIfAborted(signal);
  const sourceMaterial = await getSourceMaterial(payload, signal);
  const articleText = normalizeArticleText(sourceMaterial.articleText || "");

  if (!articleText) {
    throw new Error("No article text was available to summarize.");
  }

  const prompt = buildSummaryPrompt({
    title: payload?.title || "",
    sourceUrl: payload?.sourceUrl || "",
    articleText
  });

  const summaryText = await summarizeWithOpenAI(
    openAIConfig,
    {
      systemPrompt: settings.systemPrompt,
      prompt
    },
    signal
  );

  if (cacheKey) {
    await storeCachedSummary(cacheKey, {
      summaryText,
      contentSourceLabel: sourceMaterial.contentSourceLabel,
      sourceWarning: sourceMaterial.sourceWarning || ""
    }, SUMMARY_CACHE_TTL_HOURS);
  }

  return {
    provider: "openai",
    model: openAIConfig.model,
    summaryText,
    contentSourceLabel: sourceMaterial.contentSourceLabel,
    sourceWarning: sourceMaterial.sourceWarning || "",
    cacheHit: false
  };
}

function buildArticleCacheIdentity(payload) {
  const sourceUrl = normalizeSourceUrl(payload?.sourceUrl || "");
  if (sourceUrl) {
    return `url:${sourceUrl}`;
  }

  const entryId = String(payload?.entryId || "").trim();
  if (entryId) {
    return `entry:${entryId}`;
  }

  return [
    "inline",
    String(payload?.title || "").trim(),
    normalizeVisibleArticleText(payload?.articleText || "")
  ].join(":");
}

async function buildSummaryCacheKeyForPayload(payload, settings) {
  return buildSummaryCacheKey({
    articleIdentity: buildArticleCacheIdentity(payload),
    model: settings.openaiModel || DEFAULT_SETTINGS.openaiModel,
    reasoningEffort: normalizeChoice(settings.openaiReasoningEffort, ["minimal", "low", "medium", "high"], ""),
    verbosity: normalizeChoice(settings.openaiVerbosity, ["low", "medium", "high"], ""),
    systemPrompt: settings.systemPrompt || DEFAULT_SETTINGS.systemPrompt
  });
}

function normalizeArticleText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 24000);
}

function buildSummaryPrompt({ title, sourceUrl, articleText }) {
  return [
    `Title: ${title || "Untitled"}`,
    `Source URL: ${sourceUrl || "Unknown"}`,
    "",
    "Article text:",
    articleText
  ].join("\n");
}

async function getSourceMaterial(payload, signal) {
  const sourceUrl = normalizeSourceUrl(payload?.sourceUrl || "");
  const visibleArticleText = normalizeVisibleArticleText(payload?.articleText || "");
  const preferVisibleArticleText = Boolean(payload?.preferVisibleArticleText);

  if (preferVisibleArticleText && visibleArticleText) {
    return {
      articleText: visibleArticleText,
      contentSourceLabel: "Feedbin full content",
      sourceWarning: ""
    };
  }

  if (sourceUrl) {
    try {
      const extracted = await fetchReadableSourceArticle(sourceUrl, signal);
      return {
        articleText: extracted.textContent,
        contentSourceLabel: "Full source page",
        sourceWarning: ""
      };
    } catch (error) {
      if (!visibleArticleText) {
        throw error;
      }

      return {
        articleText: visibleArticleText,
        contentSourceLabel: "Feedbin view",
        sourceWarning: error.message || String(error)
      };
    }
  }

  return {
    articleText: visibleArticleText,
    contentSourceLabel: "Feedbin view",
    sourceWarning: sourceUrl ? "" : "No source URL was available, so the summary used the text shown in Feedbin."
  };
}

async function fetchReadableSourceArticle(sourceUrl, signal) {
  throwIfAborted(signal);
  const url = new URL(sourceUrl);
  if (!/^https?:$/.test(url.protocol)) {
    throw new Error("Only HTTP and HTTPS source URLs can be fetched.");
  }

  const response = await fetch(url.href, {
    signal,
    redirect: "follow",
    headers: {
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1"
    }
  });

  if (!response.ok) {
    throw new Error(`The source page returned ${response.status} ${response.statusText}.`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
    throw new Error(`The source page returned ${contentType || "a non-HTML response"}, so it could not be extracted.`);
  }

  const html = await response.text();
  throwIfAborted(signal);
  const extracted = await extractReadableArticle({
    url: response.url || url.href,
    html
  });

  const textContent = normalizeArticleText(extracted?.textContent || "");
  if (!textContent) {
    throw new Error("The source page loaded, but no readable article text could be extracted.");
  }

  return {
    ...extracted,
    textContent
  };
}

let creatingOffscreenDocument;

async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);

  if ("getContexts" in chrome.runtime) {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [offscreenUrl]
    });

    if (existingContexts.length > 0) {
      return;
    }
  } else {
    const matchedClients = await clients.matchAll();
    if (matchedClients.some(client => client.url === offscreenUrl)) {
      return;
    }
  }

  if (creatingOffscreenDocument) {
    await creatingOffscreenDocument;
    return;
  }

  creatingOffscreenDocument = chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ["DOM_PARSER"],
    justification: "Parse fetched article HTML into readable text before summarizing it."
  });

  try {
    await creatingOffscreenDocument;
  } finally {
    creatingOffscreenDocument = null;
  }
}

async function extractReadableArticle(payload) {
  await ensureOffscreenDocument();

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        target: "offscreen",
        type: "extractReadableArticle",
        payload
      },
      response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!response) {
          reject(new Error("The article extractor did not respond."));
          return;
        }

        if (!response.ok) {
          reject(new Error(response.error || "The article extractor failed."));
          return;
        }

        resolve(response.result);
      }
    );
  });
}

function normalizeSourceUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    return /^https?:$/.test(url.protocol) ? url.href : "";
  } catch (_error) {
    return "";
  }
}

function normalizeVisibleArticleText(value) {
  const text = normalizeArticleText(value);
  const normalized = text.toLowerCase();

  if (!text) {
    return "";
  }

  if (
    normalized === "loading" ||
    normalized === "loading..." ||
    normalized === "loading full content" ||
    normalized === "loading full content..." ||
    /^loading\b/.test(normalized)
  ) {
    return "";
  }

  return text;
}

async function summarizeWithOpenAI(openAIConfig, input, signal) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAIConfig.apiKey}`
    },
    body: JSON.stringify({
      store: false,
      model: openAIConfig.model,
      instructions: input.systemPrompt,
      input: input.prompt,
      reasoning: openAIConfig.reasoningEffort ? { effort: openAIConfig.reasoningEffort } : undefined,
      text: openAIConfig.verbosity ? { verbosity: openAIConfig.verbosity } : undefined
    })
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "OpenAI request failed"));
  }

  const text = extractResponseText(payload);

  if (typeof text !== "string" || !text.trim()) {
    throw new Error(buildMissingOutputError(payload, openAIConfig));
  }

  return text.trim();
}

function extractResponseText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  const textChunks = [];

  for (const outputItem of payload?.output || []) {
    for (const contentItem of outputItem?.content || []) {
      if (contentItem?.type === "output_text" && typeof contentItem.text === "string") {
        textChunks.push(contentItem.text);
      }
    }
  }

  return textChunks.join("\n").trim();
}

function normalizeChoice(value, allowedValues, fallback) {
  const normalized = String(value || "").trim().toLowerCase();
  return allowedValues.includes(normalized) ? normalized : fallback;
}

function migrateLegacySettings(settings) {
  const next = { ...settings };
  if (typeof next.summaryCacheEnabled === "undefined") {
    next.summaryCacheEnabled = true;
  }

  return next;
}

function buildMissingOutputError(payload, openAIConfig) {
  const incompleteReason = payload?.incomplete_details?.reason || "";
  const reasoningTokens = payload?.usage?.output_tokens_details?.reasoning_tokens;
  const hasReasoningOnlyOutput =
    Array.isArray(payload?.output) &&
    payload.output.length > 0 &&
    payload.output.every(item => item?.type === "reasoning");

  if (incompleteReason === "max_output_tokens" && hasReasoningOnlyOutput) {
    const details = [
      `OpenAI used the entire output budget before emitting summary text.`,
      `Model: ${openAIConfig.model}.`
    ];

    if (typeof reasoningTokens === "number") {
      details.push(`Reasoning tokens used: ${reasoningTokens}.`);
    }

    details.push("Try setting Reasoning effort to Minimal or using a non-reasoning model like gpt-4.1-nano.");

    return details.join(" ");
  }

  return "OpenAI returned no summary text.";
}

function throwIfAborted(signal) {
  if (!signal?.aborted) {
    return;
  }

  const error = new Error("Request aborted.");
  error.name = "AbortError";
  throw error;
}

function isAbortError(error) {
  return Boolean(error) && (error.name === "AbortError" || /aborted/i.test(String(error.message || error)));
}

async function buildSummaryCacheKey(parts) {
  const payload = JSON.stringify(parts);
  const bytes = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `v2:${bytesToHex(digest)}`;
}

function bytesToHex(buffer) {
  return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function getCachedSummary(cacheKey) {
  const cache = await readSummaryCache();
  const entry = cache[cacheKey];

  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    delete cache[cacheKey];
    await writeSummaryCache(cache);
    return null;
  }

  entry.lastAccessedAt = Date.now();
  cache[cacheKey] = entry;
  await writeSummaryCache(cache);

  return entry;
}

async function storeCachedSummary(cacheKey, summaryPayload, ttlHours) {
  const cache = await readSummaryCache();
  const now = Date.now();

  cache[cacheKey] = {
    summaryText: summaryPayload.summaryText,
    contentSourceLabel: summaryPayload.contentSourceLabel || "",
    sourceWarning: summaryPayload.sourceWarning || "",
    createdAt: now,
    lastAccessedAt: now,
    expiresAt: now + ttlHours * 60 * 60 * 1000
  };

  pruneSummaryCache(cache);
  await writeSummaryCache(cache);
}

async function readSummaryCache() {
  const stored = await chrome.storage.local.get(SUMMARY_CACHE_STORAGE_KEY);
  const raw = stored[SUMMARY_CACHE_STORAGE_KEY];
  const cache = raw && typeof raw === "object" ? { ...raw } : {};
  pruneSummaryCache(cache);
  return cache;
}

async function writeSummaryCache(cache) {
  await chrome.storage.local.set({
    [SUMMARY_CACHE_STORAGE_KEY]: cache
  });
}

function pruneSummaryCache(cache) {
  const now = Date.now();

  for (const [cacheKey, entry] of Object.entries(cache)) {
    if (!entry || typeof entry.summaryText !== "string" || entry.expiresAt <= now) {
      delete cache[cacheKey];
    }
  }

  const cacheEntries = Object.entries(cache);
  if (cacheEntries.length <= MAX_SUMMARY_CACHE_ENTRIES) {
    return;
  }

  cacheEntries
    .sort((left, right) => {
      const leftStamp = left[1]?.lastAccessedAt || left[1]?.createdAt || 0;
      const rightStamp = right[1]?.lastAccessedAt || right[1]?.createdAt || 0;
      return leftStamp - rightStamp;
    })
    .slice(0, cacheEntries.length - MAX_SUMMARY_CACHE_ENTRIES)
    .forEach(([cacheKey]) => {
      delete cache[cacheKey];
    });
}

function getApiErrorMessage(payload, fallback) {
  const message =
    payload?.error?.message ||
    payload?.error?.type ||
    payload?.message ||
    fallback;

  return typeof message === "string" ? message : fallback;
}
