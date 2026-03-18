import {
  ANTHROPIC_MODEL_OPTIONS,
  DEFAULT_SETTINGS,
  MAX_SUMMARY_CACHE_ENTRIES,
  OPENAI_MODEL_OPTIONS,
  PROVIDERS
} from "../shared/defaults.js";

export const OPENAI_REASONING_EFFORT_VALUES = ["", "none", "low", "medium", "high", "xhigh"];
export const OPENAI_VERBOSITY_VALUES = ["", "low", "medium", "high"];
const MIN_COMPLETE_VISIBLE_ARTICLE_CHARS = 1800;
const MIN_COMPLETE_VISIBLE_ARTICLE_WORDS = 260;
const LEGACY_OPENAI_MODEL_MAP = Object.freeze({
  "gpt-5-nano": "gpt-5.4-nano",
  "gpt-5-mini": "gpt-5.4-mini",
  "gpt-5": "gpt-5.4"
});
const LEGACY_OPENAI_REASONING_EFFORT_MAP = Object.freeze({
  minimal: "none"
});

export function normalizeSettings(rawSettings) {
  return {
    provider: normalizeChoice(rawSettings?.provider, PROVIDERS, DEFAULT_SETTINGS.provider),
    openaiModel: normalizeChoice(
      migrateOpenAIModel(rawSettings?.openaiModel),
      OPENAI_MODEL_OPTIONS,
      DEFAULT_SETTINGS.openaiModel
    ),
    openaiReasoningEffort: normalizeChoice(
      migrateOpenAIReasoningEffort(rawSettings?.openaiReasoningEffort),
      OPENAI_REASONING_EFFORT_VALUES,
      DEFAULT_SETTINGS.openaiReasoningEffort
    ),
    openaiVerbosity: normalizeChoice(rawSettings?.openaiVerbosity, OPENAI_VERBOSITY_VALUES, DEFAULT_SETTINGS.openaiVerbosity),
    anthropicModel: normalizeChoice(rawSettings?.anthropicModel, ANTHROPIC_MODEL_OPTIONS, DEFAULT_SETTINGS.anthropicModel),
    summaryCacheEnabled: typeof rawSettings?.summaryCacheEnabled === "boolean" ? rawSettings.summaryCacheEnabled : DEFAULT_SETTINGS.summaryCacheEnabled,
    prefetchDebugVisualizationEnabled: typeof rawSettings?.prefetchDebugVisualizationEnabled === "boolean"
      ? rawSettings.prefetchDebugVisualizationEnabled
      : DEFAULT_SETTINGS.prefetchDebugVisualizationEnabled,
    systemPrompt: normalizeString(rawSettings?.systemPrompt, DEFAULT_SETTINGS.systemPrompt, 4000)
  };
}

export function normalizeFeedbinState(rawState) {
  const next = {};

  for (const [feedId, enabled] of Object.entries(rawState?.summaryFeedPreferences || {})) {
    if (enabled === true) {
      next[String(feedId)] = true;
    }
  }

  return {
    summaryFeedPreferences: next
  };
}

export function buildLegacySettings(stored) {
  const legacySettings = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (typeof stored[key] !== "undefined") {
      legacySettings[key] = stored[key];
    }
  }

  return legacySettings;
}

export function didContentInvalidationChange(previousSettings, nextSettings) {
  if (
    previousSettings.provider !== nextSettings.provider ||
    previousSettings.summaryCacheEnabled !== nextSettings.summaryCacheEnabled ||
    previousSettings.systemPrompt !== nextSettings.systemPrompt
  ) {
    return true;
  }

  return !shallowEqual(
    getActiveProviderCacheConfig(previousSettings),
    getActiveProviderCacheConfig(nextSettings)
  );
}

export function buildSummaryPrompt({ title, sourceUrl, articleText }) {
  return [
    "Task: Summarize this article.",
    "",
    `Title: ${title || "Untitled"}`,
    `Source URL: ${sourceUrl || "Unknown"}`,
    "",
    "Article text:",
    articleText
  ].join("\n");
}

export function buildArticleCacheIdentity(payload) {
  const sourceUrl = normalizeSourceUrl(payload.sourceUrl || "");
  if (sourceUrl) {
    return `url:${sourceUrl}`;
  }

  if (payload.entryId) {
    return `entry:${payload.entryId}`;
  }

  return [
    "inline",
    payload.title || "",
    normalizeVisibleArticleText(payload.articleText || "")
  ].join(":");
}

export async function buildSummaryCacheKeyForPayload(payload, settings) {
  const provider = normalizeChoice(settings.provider, PROVIDERS, DEFAULT_SETTINGS.provider);
  return buildSummaryCacheKey({
    articleIdentity: buildArticleCacheIdentity(payload),
    provider,
    providerConfig: getActiveProviderCacheConfig(settings),
    systemPrompt: settings.systemPrompt || DEFAULT_SETTINGS.systemPrompt
  });
}

export function getActiveProviderCacheConfig(settings) {
  const provider = normalizeChoice(settings?.provider, PROVIDERS, DEFAULT_SETTINGS.provider);
  if (provider === "anthropic") {
    return {
      model: normalizeChoice(settings?.anthropicModel, ANTHROPIC_MODEL_OPTIONS, DEFAULT_SETTINGS.anthropicModel)
    };
  }

  return {
    model: normalizeChoice(
      migrateOpenAIModel(settings?.openaiModel),
      OPENAI_MODEL_OPTIONS,
      DEFAULT_SETTINGS.openaiModel
    ),
    reasoningEffort: normalizeChoice(
      migrateOpenAIReasoningEffort(settings?.openaiReasoningEffort),
      OPENAI_REASONING_EFFORT_VALUES,
      DEFAULT_SETTINGS.openaiReasoningEffort
    ),
    verbosity: normalizeChoice(settings?.openaiVerbosity, OPENAI_VERBOSITY_VALUES, "")
  };
}

export function migrateOpenAIModel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return LEGACY_OPENAI_MODEL_MAP[normalized] || normalized;
}

export function migrateOpenAIReasoningEffort(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return LEGACY_OPENAI_REASONING_EFFORT_MAP[normalized] || normalized;
}

export async function buildSummaryCacheKey(parts) {
  const payload = JSON.stringify(parts);
  const bytes = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `v3:${bytesToHex(digest)}`;
}

export function bytesToHex(buffer) {
  return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function getCachedSummaryFromCache(cache, cacheKey, now = Date.now()) {
  const entry = cache[cacheKey];
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= now) {
    delete cache[cacheKey];
    return null;
  }

  entry.lastAccessedAt = now;
  cache[cacheKey] = entry;
  return entry;
}

export function storeCachedSummaryInCache(cache, cacheKey, summaryPayload, ttlDays, now = Date.now()) {
  cache[cacheKey] = {
    summaryText: summaryPayload.summaryText,
    contentSourceLabel: summaryPayload.contentSourceLabel || "",
    sourceWarning: summaryPayload.sourceWarning || "",
    createdAt: now,
    lastAccessedAt: now,
    expiresAt: now + ttlDays * 24 * 60 * 60 * 1000
  };

  pruneSummaryCache(cache, now);
}

export function pruneSummaryCache(cache, now = Date.now(), maxEntries = MAX_SUMMARY_CACHE_ENTRIES) {
  for (const [cacheKey, entry] of Object.entries(cache)) {
    if (!entry || typeof entry.summaryText !== "string" || entry.expiresAt <= now) {
      delete cache[cacheKey];
    }
  }

  const cacheEntries = Object.entries(cache);
  if (cacheEntries.length <= maxEntries) {
    return;
  }

  cacheEntries
    .sort((left, right) => {
      const leftStamp = left[1]?.lastAccessedAt || left[1]?.createdAt || 0;
      const rightStamp = right[1]?.lastAccessedAt || right[1]?.createdAt || 0;
      return leftStamp - rightStamp;
    })
    .slice(0, cacheEntries.length - maxEntries)
    .forEach(([cacheKey]) => {
      delete cache[cacheKey];
    });
}

export function normalizeArticleText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 24000);
}

export function normalizeVisibleArticleText(value) {
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

export function shouldPreferVisibleArticleText(value) {
  const text = normalizeVisibleArticleText(value);
  if (!text) {
    return false;
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const endsWithEllipsis = /(?:\.\.\.|…)\s*$/.test(text);

  if (endsWithEllipsis) {
    return false;
  }

  return text.length >= MIN_COMPLETE_VISIBLE_ARTICLE_CHARS || wordCount >= MIN_COMPLETE_VISIBLE_ARTICLE_WORDS;
}

export function normalizeSourceUrl(value) {
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

export function normalizeChoice(value, allowedValues, fallback) {
  const normalized = String(value || "").trim().toLowerCase();
  return allowedValues.includes(normalized) ? normalized : fallback;
}

export function normalizeString(value, fallback, maxLength) {
  const normalized = String(value || "").trim();
  return normalized ? normalized.slice(0, maxLength) : fallback;
}

export function shallowEqual(left, right) {
  const leftKeys = Object.keys(left || {});
  const rightKeys = Object.keys(right || {});
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every(key => left[key] === right[key]);
}
