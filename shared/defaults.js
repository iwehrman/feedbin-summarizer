export const DEFAULT_SETTINGS = Object.freeze({
  provider: "openai",
  openaiModel: "gpt-5.4-nano",
  openaiReasoningEffort: "none",
  openaiVerbosity: "low",
  anthropicModel: "claude-haiku-4-5",
  summaryCacheEnabled: true,
  prefetchDebugVisualizationEnabled: false,
  systemPrompt: [
    "Write short, direct, neutral paragraphs.",
    "Capture the main point, the key facts or arguments, and why the piece matters.",
    "Prioritize concrete details and implications.",
    "Skip filler, repetition, and minor examples.",
    "Return plain text only. No sections, headers, bullets, or lists. No markdown."
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
export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_API_ORIGIN = "https://api.anthropic.com";
export const ANTHROPIC_API_VERSION = "2023-06-01";

export const MAX_SUMMARY_CACHE_ENTRIES = 150;
export const SUMMARY_CACHE_TTL_DAYS = 7;
export const SOURCE_FETCH_TIMEOUT_MS = 15000;
export const OPENAI_REQUEST_TIMEOUT_MS = 30000;
export const ANTHROPIC_REQUEST_TIMEOUT_MS = 30000;
export const ANTHROPIC_MAX_OUTPUT_TOKENS = 2048;

export const PROVIDERS = Object.freeze(["openai", "anthropic"]);
export const OPENAI_MODEL_OPTIONS = Object.freeze([
  "gpt-5.4-nano",
  "gpt-5.4-mini",
  "gpt-5.4"
]);
export const ANTHROPIC_MODEL_OPTIONS = Object.freeze([
  "claude-haiku-4-5",
  "claude-sonnet-4-6"
]);
export const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS);

export const MASKED_KEY_PREVIEW = "••••••••••••";
