export const DEFAULT_SETTINGS = Object.freeze({
  openaiModel: "gpt-4.1-mini",
  openaiReasoningEffort: "minimal",
  openaiVerbosity: "low",
  summaryCacheEnabled: true,
  prefetchDebugVisualizationEnabled: false,
  systemPrompt: [
    "Return plain text only.",
    "Be direct, concise, and neutral.",
    "Do not mention being an AI assistant.",
    "Write short paragraphs in simple prose.",
    "No headings, bullets, or lists.",
    "Capture the main point, the most important facts or arguments, and why the piece matters.",
    "Prioritize new information, concrete details, and implications.",
    "Skip filler, repetition, scene-setting, and minor examples.",
    "If the article is opinion or analysis, summarize the thesis and key reasoning.",
    "If it is reported news, summarize what happened, who is involved, and the implications.",
    "If important uncertainty or missing context remains, note it briefly.",
    "Do not quote unless a quote is itself the main point."
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
