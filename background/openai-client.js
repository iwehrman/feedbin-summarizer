import {
  OPENAI_API_ORIGIN,
  OPENAI_REQUEST_TIMEOUT_MS,
  OPENAI_RESPONSES_URL
} from "../shared/defaults.js";
import {
  createHttpError,
  createTimeoutSignal,
  sanitizeErrorMessage,
  withSingleRetry
} from "./security.js";

export async function summarizeWithOpenAI(openAIConfig, input, signal) {
  validateOpenAIEndpoint();

  return withSingleRetry(async () => {
    // Authorization headers are constructed only in the service worker.
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      signal: createTimeoutSignal(signal, OPENAI_REQUEST_TIMEOUT_MS),
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
      throw createHttpError(getApiErrorMessage(payload, "OpenAI request failed."), response.status);
    }

    const text = extractResponseText(payload);
    if (typeof text !== "string" || !text.trim()) {
      throw new Error(buildMissingOutputError(payload, openAIConfig.model));
    }

    return text.trim();
  }, { signal });
}

export function extractResponseText(payload) {
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

export function getApiErrorMessage(payload, fallback) {
  const message =
    payload?.error?.message ||
    payload?.error?.type ||
    payload?.message ||
    fallback;

  return sanitizeErrorMessage(message, fallback);
}

export function buildMissingOutputError(payload, model) {
  const incompleteReason = payload?.incomplete_details?.reason || "";
  const reasoningTokens = payload?.usage?.output_tokens_details?.reasoning_tokens;
  const hasReasoningOnlyOutput =
    Array.isArray(payload?.output) &&
    payload.output.length > 0 &&
    payload.output.every(item => item?.type === "reasoning");

  if (incompleteReason === "max_output_tokens" && hasReasoningOnlyOutput) {
    const details = [
      "OpenAI used the entire output budget before emitting summary text.",
      `Model: ${model}.`
    ];

    if (typeof reasoningTokens === "number") {
      details.push(`Reasoning tokens used: ${reasoningTokens}.`);
    }

    details.push("Try none or low reasoning effort, or a lower-latency model.");
    return details.join(" ");
  }

  return "OpenAI returned no summary text.";
}

export function validateOpenAIEndpoint() {
  const url = new URL(OPENAI_RESPONSES_URL);
  if (url.origin !== OPENAI_API_ORIGIN || url.pathname !== "/v1/responses") {
    throw new Error("Blocked unexpected OpenAI endpoint.");
  }
}
