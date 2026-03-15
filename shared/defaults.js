export const DEFAULT_SETTINGS = Object.freeze({
  openaiModel: "gpt-4.1-mini",
  openaiReasoningEffort: "minimal",
  openaiVerbosity: "low",
  summaryCacheEnabled: true,
  prefetchDebugVisualizationEnabled: false,
  systemPrompt: [
    "You summarize articles for a single user inside Feedbin.",
    "Prioritize what happened, why it matters, and any important nuance, dates, names, or numbers.",
    "Be compact but not vague.",
    "Do not mention that you are an AI assistant.",
    "Return plain text only."
  ].join(" ")
});

export const SETTINGS_STORAGE_KEY = "settings";
export const FEEDBIN_STATE_STORAGE_KEY = "feedbinState";
export const SECRETS_STORAGE_KEY = "secrets";
export const SESSION_SECRETS_STORAGE_KEY = "sessionSecrets";
export const SUMMARY_CACHE_STORAGE_KEY = "summaryCacheEntries";

export const OPTIONS_PAGE_PATH = "options/options.html";
export const FEEDBIN_URL_PREFIX = "https://feedbin.com/";
export const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
export const OPENAI_API_ORIGIN = "https://api.openai.com";

export const MAX_SUMMARY_CACHE_ENTRIES = 150;
export const SUMMARY_CACHE_TTL_HOURS = 36;
export const SOURCE_FETCH_TIMEOUT_MS = 15000;
export const OPENAI_REQUEST_TIMEOUT_MS = 30000;

export const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS);
export const CONTENT_INVALIDATION_KEYS = new Set([
  "openaiModel",
  "openaiReasoningEffort",
  "openaiVerbosity",
  "summaryCacheEnabled",
  "prefetchDebugVisualizationEnabled",
  "systemPrompt"
]);

export const MASKED_KEY_PREVIEW = "••••••••••••";
