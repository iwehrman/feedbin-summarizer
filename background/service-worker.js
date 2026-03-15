import {
  DEFAULT_SETTINGS,
  FEEDBIN_STATE_STORAGE_KEY,
  SECRETS_STORAGE_KEY,
  SETTINGS_KEYS,
  SETTINGS_STORAGE_KEY,
  SOURCE_FETCH_TIMEOUT_MS,
  SUMMARY_CACHE_STORAGE_KEY,
  SUMMARY_CACHE_TTL_HOURS
} from "../shared/defaults.js";
import {
  buildLegacySettings,
  buildSummaryCacheKeyForPayload,
  buildSummaryPrompt,
  didContentInvalidationChange,
  getCachedSummaryFromCache,
  normalizeArticleText,
  normalizeChoice,
  normalizeFeedbinState,
  normalizeSettings,
  normalizeSourceUrl,
  normalizeString,
  normalizeVisibleArticleText,
  pruneSummaryCache,
  shallowEqual,
  storeCachedSummaryInCache
} from "./service-worker-core.js";
import {
  normalizeIncomingMessage
} from "./message-router.js";
import {
  summarizeWithOpenAI
} from "./openai-client.js";
import {
  clearOpenAIKey,
  getOpenAIKey,
  getSecretStatus,
  initializeSecretManager,
  primeSecretCache,
  saveOpenAIKey
} from "./secret-manager.js";
import {
  createTimeoutSignal,
  isAbortError,
  sanitizeErrorMessage,
  throwIfAborted
} from "./security.js";

const OFFSCREEN_DOCUMENT_PATH = "offscreen/offscreen.html";
const PREFETCH_REQUEST_CONTROLLERS = new Map();
const IN_FLIGHT_SUMMARY_REQUESTS = new Map();
const FEEDBIN_TAB_URLS = ["https://feedbin.com/*"];

const startupPromise = initializeExtensionState();

chrome.runtime.onInstalled.addListener(() => {
  void initializeExtensionState();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target === "offscreen") {
    return;
  }

  handleIncomingMessage(message, sender)
    .then(result => sendResponse({ ok: true, result }))
    .catch(error => sendResponse({ ok: false, error: sanitizeErrorMessage(error) }));

  return true;
});

async function handleIncomingMessage(message, sender) {
  await startupPromise;
  const request = normalizeIncomingMessage(message, sender);
  if (!request) {
    return { ignored: true };
  }

  switch (request.type) {
    case "getOptionsState":
      return buildOptionsState();
    case "updateOptionsSettings":
      return handleUpdateOptionsSettings(request.payload);
    case "saveOpenAIKey":
      return handleSaveOpenAIKey(request.payload);
    case "clearOpenAIKey":
      return handleClearOpenAIKey();
    case "testOpenAIConnection":
      return handleTestOpenAIConnection();
    case "getFeedbinState":
      return getFeedbinState();
    case "setFeedSummaryPreference":
      return handleSetFeedSummaryPreference(request.payload);
    case "summarizeArticle":
      return handleSummarizeArticle(request.payload, sender);
    case "prefetchArticle":
      return handlePrefetchArticle(request.payload);
    case "checkCachedSummaries":
      return handleCheckCachedSummaries(request.payload);
    case "cancelPrefetch":
      cancelPrefetchRequest(request.payload.requestId);
      return { cancelled: true };
    default:
      throw new Error("Unsupported message type.");
  }
}

async function initializeExtensionState() {
  // Lock extension storage down before any content script has a chance to touch it.
  await initializeSecretManager();
  await migrateLegacyStorage();
  await ensureStoredSettings();
  await primeSecretCache();
}

async function buildOptionsState() {
  const settings = await getUserSettings();
  const secretStatus = await getSecretStatus();

  return {
    settings,
    keyStatus: secretStatus
  };
}

async function handleUpdateOptionsSettings(payload) {
  const currentSettings = await getUserSettings();
  const nextSettings = normalizeSettings({
    ...currentSettings,
    ...payload
  });

  await chrome.storage.local.set({
    [SETTINGS_STORAGE_KEY]: nextSettings
  });

  if (didContentInvalidationChange(currentSettings, nextSettings)) {
    await broadcastToFeedbinTabs({
      type: "settingsUpdated"
    });
  }

  return {
    settings: nextSettings
  };
}

async function handleSaveOpenAIKey(payload) {
  await saveOpenAIKey(payload.openaiApiKey);
  return {
    keyStatus: await getSecretStatus()
  };
}

async function handleClearOpenAIKey() {
  await clearOpenAIKey();
  return {
    keyStatus: await getSecretStatus()
  };
}

async function handleTestOpenAIConnection() {
  const settings = await getUserSettings();
  const openAIConfig = await getOpenAIConfig(settings);
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

async function handleSetFeedSummaryPreference(payload) {
  const feedbinState = await getFeedbinState();
  const nextPreferences = { ...feedbinState.summaryFeedPreferences };

  if (payload.enabled) {
    nextPreferences[payload.feedId] = true;
  } else {
    delete nextPreferences[payload.feedId];
  }

  await chrome.storage.local.set({
    [FEEDBIN_STATE_STORAGE_KEY]: {
      summaryFeedPreferences: nextPreferences
    }
  });

  await broadcastToFeedbinTabs({
    type: "feedPreferencesUpdated",
    payload: {
      summaryFeedPreferences: nextPreferences
    }
  });

  return {
    summaryFeedPreferences: nextPreferences
  };
}

async function handleSummarizeArticle(payload, sender) {
  const tabId = sender?.tab?.id;
  if (typeof tabId !== "number" || !payload.entryId) {
    return runSummaryPipeline(payload, await getUserSettings());
  }

  const requestKey = `${tabId}:${payload.entryId}`;
  if (IN_FLIGHT_SUMMARY_REQUESTS.has(requestKey)) {
    return IN_FLIGHT_SUMMARY_REQUESTS.get(requestKey);
  }

  const requestPromise = (async () => {
    const settings = await getUserSettings();
    return runSummaryPipeline(payload, settings);
  })().finally(() => {
    IN_FLIGHT_SUMMARY_REQUESTS.delete(requestKey);
  });

  IN_FLIGHT_SUMMARY_REQUESTS.set(requestKey, requestPromise);
  return requestPromise;
}

async function handlePrefetchArticle(payload) {
  const settings = await getUserSettings();
  if (settings.summaryCacheEnabled === false) {
    return {
      skipped: true,
      reason: "cache-disabled"
    };
  }

  const requestId = payload.requestId;
  const controller = new AbortController();
  PREFETCH_REQUEST_CONTROLLERS.set(requestId, controller);

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
    PREFETCH_REQUEST_CONTROLLERS.delete(requestId);
  }
}

async function handleCheckCachedSummaries(payload) {
  const settings = await getUserSettings();
  if (settings.summaryCacheEnabled === false) {
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

  for (const article of payload.articles) {
    const cacheKey = await buildSummaryCacheKeyForPayload(article, settings);
    const entry = cache[cacheKey];
    if (!entry) {
      continue;
    }

    entry.lastAccessedAt = now;
    cache[cacheKey] = entry;
    didTouchCache = true;
    cachedEntryIds.push(article.entryId);

    if (typeof entry.summaryText === "string" && entry.summaryText.trim()) {
      cachedSummaries.push({
        entryId: article.entryId,
        summaryText: entry.summaryText
      });
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

function cancelPrefetchRequest(requestId) {
  const controller = PREFETCH_REQUEST_CONTROLLERS.get(String(requestId || ""));
  if (!controller) {
    return;
  }

  controller.abort();
  PREFETCH_REQUEST_CONTROLLERS.delete(String(requestId || ""));
}

async function getUserSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
  return normalizeSettings(stored[SETTINGS_STORAGE_KEY]);
}

async function getFeedbinState() {
  const stored = await chrome.storage.local.get(FEEDBIN_STATE_STORAGE_KEY);
  return normalizeFeedbinState(stored[FEEDBIN_STATE_STORAGE_KEY]);
}

async function ensureStoredSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
  if (!stored[SETTINGS_STORAGE_KEY]) {
    await chrome.storage.local.set({
      [SETTINGS_STORAGE_KEY]: DEFAULT_SETTINGS
    });
    return;
  }

  const normalized = normalizeSettings(stored[SETTINGS_STORAGE_KEY]);
  if (!shallowEqual(stored[SETTINGS_STORAGE_KEY], normalized)) {
    await chrome.storage.local.set({
      [SETTINGS_STORAGE_KEY]: normalized
    });
  }
}

async function migrateLegacyStorage() {
  const legacyKeys = ["openaiApiKey", ...SETTINGS_KEYS, "summaryFeedPreferences"];
  const stored = await chrome.storage.local.get([
    SETTINGS_STORAGE_KEY,
    FEEDBIN_STATE_STORAGE_KEY,
    SECRETS_STORAGE_KEY,
    ...legacyKeys
  ]);

  const nextSettings = stored[SETTINGS_STORAGE_KEY] || buildLegacySettings(stored);
  const nextFeedbinState = stored[FEEDBIN_STATE_STORAGE_KEY] || {
    summaryFeedPreferences: stored.summaryFeedPreferences || {}
  };
  const nextSecrets = stored[SECRETS_STORAGE_KEY] || {
    openaiApiKey: normalizeString(stored.openaiApiKey, "", 400)
  };

  await chrome.storage.local.set({
    [SETTINGS_STORAGE_KEY]: normalizeSettings(nextSettings),
    [FEEDBIN_STATE_STORAGE_KEY]: normalizeFeedbinState(nextFeedbinState),
    [SECRETS_STORAGE_KEY]: {
      openaiApiKey: String(nextSecrets.openaiApiKey || "").trim()
    }
  });

  const removableKeys = legacyKeys.filter(key => typeof stored[key] !== "undefined");
  if (removableKeys.length) {
    await chrome.storage.local.remove(removableKeys);
  }
}

async function broadcastToFeedbinTabs(message) {
  const tabs = await chrome.tabs.query({ url: FEEDBIN_TAB_URLS });
  await Promise.allSettled(
    tabs
      .filter(tab => typeof tab.id === "number")
      .map(tab => chrome.tabs.sendMessage(tab.id, message))
  );
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
        model: settings.openaiModel,
        summaryText: cachedSummary.summaryText,
        contentSourceLabel: cachedSummary.contentSourceLabel || "Cached summary",
        sourceWarning: cachedSummary.sourceWarning || "",
        cacheHit: true
      };
    }
  }

  const openAIConfig = await getOpenAIConfig(settings);
  throwIfAborted(signal);

  const sourceMaterial = await getSourceMaterial(payload, signal);
  const articleText = normalizeArticleText(sourceMaterial.articleText || "");
  if (!articleText) {
    throw new Error("No article text was available to summarize.");
  }

  const summaryText = await summarizeWithOpenAI(
    openAIConfig,
    {
      systemPrompt: settings.systemPrompt,
      prompt: buildSummaryPrompt({
        title: payload.title,
        sourceUrl: payload.sourceUrl,
        articleText
      })
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

async function getOpenAIConfig(settings) {
  const apiKey = await getOpenAIKey();
  if (!apiKey) {
    throw new Error("No OpenAI API key is configured. Add it in the extension options.");
  }

  return {
    apiKey,
    model: settings.openaiModel || DEFAULT_SETTINGS.openaiModel,
    reasoningEffort: normalizeChoice(settings.openaiReasoningEffort, ["", "minimal", "low", "medium", "high"], ""),
    verbosity: normalizeChoice(settings.openaiVerbosity, ["", "low", "medium", "high"], "")
  };
}

async function getSourceMaterial(payload, signal) {
  const sourceUrl = normalizeSourceUrl(payload.sourceUrl || "");
  const visibleArticleText = normalizeVisibleArticleText(payload.articleText || "");

  if (payload.preferVisibleArticleText && visibleArticleText) {
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
        sourceWarning: sanitizeErrorMessage(error)
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
    signal: createTimeoutSignal(signal, SOURCE_FETCH_TIMEOUT_MS),
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

        if (!response?.ok) {
          reject(new Error(response?.error || "The article extractor failed."));
          return;
        }

        resolve(response.result);
      }
    );
  });
}

async function getCachedSummary(cacheKey) {
  const cache = await readSummaryCache();
  const entry = getCachedSummaryFromCache(cache, cacheKey);
  if (!entry) {
    await writeSummaryCache(cache);
    return null;
  }

  await writeSummaryCache(cache);
  return entry;
}

async function storeCachedSummary(cacheKey, summaryPayload, ttlHours) {
  const cache = await readSummaryCache();
  storeCachedSummaryInCache(cache, cacheKey, summaryPayload, ttlHours);
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
