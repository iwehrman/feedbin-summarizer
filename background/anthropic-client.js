import {
  ANTHROPIC_API_ORIGIN,
  ANTHROPIC_API_VERSION,
  ANTHROPIC_MAX_OUTPUT_TOKENS,
  ANTHROPIC_MESSAGES_URL,
  ANTHROPIC_REQUEST_TIMEOUT_MS
} from "../shared/defaults.js";
import {
  createTimeoutSignal,
  sanitizeErrorMessage
} from "./security.js";

export async function summarizeWithAnthropic(anthropicConfig, input, signal) {
  validateAnthropicEndpoint();

  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    signal: createTimeoutSignal(signal, ANTHROPIC_REQUEST_TIMEOUT_MS),
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicConfig.apiKey,
      "anthropic-version": ANTHROPIC_API_VERSION,
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: anthropicConfig.model,
      max_tokens: anthropicConfig.maxOutputTokens || ANTHROPIC_MAX_OUTPUT_TOKENS,
      system: input.systemPrompt,
      messages: [
        {
          role: "user",
          content: input.prompt
        }
      ]
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(getAnthropicApiErrorMessage(payload, "Anthropic request failed."));
  }

  const text = extractAnthropicResponseText(payload);
  if (!text) {
    throw new Error("Anthropic returned no summary text.");
  }

  return text;
}

export function extractAnthropicResponseText(payload) {
  const textChunks = [];
  for (const contentItem of payload?.content || []) {
    if (contentItem?.type === "text" && typeof contentItem.text === "string") {
      textChunks.push(contentItem.text);
    }
  }

  return textChunks.join("\n").trim();
}

export function getAnthropicApiErrorMessage(payload, fallback) {
  const message =
    payload?.error?.message ||
    payload?.error?.type ||
    payload?.message ||
    fallback;

  return sanitizeErrorMessage(message, fallback);
}

export function validateAnthropicEndpoint() {
  const url = new URL(ANTHROPIC_MESSAGES_URL);
  if (url.origin !== ANTHROPIC_API_ORIGIN || url.pathname !== "/v1/messages") {
    throw new Error("Blocked unexpected Anthropic endpoint.");
  }
}
