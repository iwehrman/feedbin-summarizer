import {
  FEEDBIN_URL_PREFIX,
  OPTIONS_PAGE_PATH
} from "../shared/defaults.js";

const OPTIONS_PAGE_URL = chrome.runtime.getURL(OPTIONS_PAGE_PATH);

export function normalizeIncomingMessage(message, sender) {
  if (!message || typeof message !== "object") {
    throw new Error("Invalid message.");
  }

  if (message.target === "offscreen") {
    return null;
  }

  const senderKind = getSenderKind(sender);
  const type = typeof message.type === "string" ? message.type : "";

  switch (type) {
    case "getOptionsState":
    case "clearOpenAIKey":
    case "testOpenAIConnection":
      ensureSender(senderKind, "options");
      return { type, payload: {}, senderKind, sender };
    case "updateOptionsSettings":
      ensureSender(senderKind, "options");
      return { type, payload: validateSettingsPayload(message.payload), senderKind, sender };
    case "saveOpenAIKey":
      ensureSender(senderKind, "options");
      return { type, payload: validateSaveKeyPayload(message.payload), senderKind, sender };
    case "getFeedbinState":
      ensureSender(senderKind, "content");
      return { type, payload: {}, senderKind, sender };
    case "setFeedSummaryPreference":
      ensureSender(senderKind, "content");
      return { type, payload: validateFeedPreferencePayload(message.payload), senderKind, sender };
    case "summarizeArticle":
      ensureSender(senderKind, "content");
      return { type, payload: validateArticlePayload(message.payload), senderKind, sender };
    case "prefetchArticle":
      ensureSender(senderKind, "content");
      return { type, payload: validatePrefetchPayload(message.payload), senderKind, sender };
    case "checkCachedSummaries":
      ensureSender(senderKind, "content");
      return { type, payload: validateCheckCachedSummariesPayload(message.payload), senderKind, sender };
    case "cancelPrefetch":
      ensureSender(senderKind, "content");
      return { type, payload: validateCancelPrefetchPayload(message.payload), senderKind, sender };
    default:
      throw new Error("Unsupported message type.");
  }
}

function getSenderKind(sender) {
  if (sender?.url && sender.url.startsWith(OPTIONS_PAGE_URL)) {
    return "options";
  }

  if (sender?.tab?.id >= 0 && sender?.url && sender.url.startsWith(FEEDBIN_URL_PREFIX)) {
    return "content";
  }

  return "unknown";
}

function ensureSender(actual, expected) {
  if (actual !== expected) {
    throw new Error("Blocked message from an untrusted extension context.");
  }
}

function validateSettingsPayload(payload) {
  const source = ensurePlainObject(payload, "settings payload");
  return {
    openaiModel: optionalString(source.openaiModel, 120),
    openaiReasoningEffort: optionalChoice(source.openaiReasoningEffort, ["", "minimal", "low", "medium", "high"]),
    openaiVerbosity: optionalChoice(source.openaiVerbosity, ["", "low", "medium", "high"]),
    summaryCacheEnabled: typeof source.summaryCacheEnabled === "boolean" ? source.summaryCacheEnabled : true,
    systemPrompt: optionalString(source.systemPrompt, 4000)
  };
}

function validateSaveKeyPayload(payload) {
  const source = ensurePlainObject(payload, "save key payload");
  return {
    // The options page may submit a fresh key, but no message type is allowed to
    // request the saved key back from the worker.
    openaiApiKey: requiredString(source.openaiApiKey, 400)
  };
}

function validateFeedPreferencePayload(payload) {
  const source = ensurePlainObject(payload, "feed preference payload");
  return {
    feedId: validateFeedId(source.feedId),
    enabled: Boolean(source.enabled)
  };
}

function validateArticlePayload(payload) {
  const source = ensurePlainObject(payload, "article payload");
  return {
    entryId: requiredString(source.entryId, 120),
    title: optionalString(source.title, 500),
    sourceUrl: optionalString(source.sourceUrl, 2000),
    articleText: optionalString(source.articleText, 60000),
    preferVisibleArticleText: Boolean(source.preferVisibleArticleText)
  };
}

function validatePrefetchPayload(payload) {
  const normalized = validateArticlePayload(payload);
  normalized.requestId = requiredString(payload?.requestId, 200);
  return normalized;
}

function validateCheckCachedSummariesPayload(payload) {
  const source = ensurePlainObject(payload, "cache check payload");
  if (!Array.isArray(source.articles) || source.articles.length > 20) {
    throw new Error("Invalid cache check payload.");
  }

  return {
    articles: source.articles.map(article => ({
      entryId: requiredString(article?.entryId, 120),
      title: optionalString(article?.title, 500),
      sourceUrl: optionalString(article?.sourceUrl, 2000),
      articleText: optionalString(article?.articleText, 60000)
    }))
  };
}

function validateCancelPrefetchPayload(payload) {
  const source = ensurePlainObject(payload, "cancel prefetch payload");
  return {
    requestId: requiredString(source.requestId, 200)
  };
}

function ensurePlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label}.`);
  }

  return value;
}

function requiredString(value, maxLength) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error("Invalid string field.");
  }

  return normalized;
}

function optionalString(value, maxLength) {
  const normalized = String(value || "").trim();
  return normalized.slice(0, maxLength);
}

function optionalChoice(value, allowedValues) {
  const normalized = String(value || "").trim().toLowerCase();
  return allowedValues.includes(normalized) ? normalized : "";
}

function validateFeedId(value) {
  const normalized = requiredString(value, 80);
  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) {
    throw new Error("Invalid feed identifier.");
  }

  return normalized;
}
