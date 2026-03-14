const API_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]{8,}\b/g;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9._-]+\b/gi;

export function redactSecrets(value) {
  return String(value || "")
    .replace(API_KEY_PATTERN, "sk-REDACTED")
    .replace(BEARER_TOKEN_PATTERN, "Bearer REDACTED");
}

export function sanitizeErrorMessage(error, fallback = "Request failed.") {
  const message = typeof error === "string"
    ? error
    : error?.message || fallback;

  return redactSecrets(message).trim() || fallback;
}

export function logWarning(context, error) {
  console.warn(`${context}: ${sanitizeErrorMessage(error)}`);
}

export function isAbortError(error) {
  return Boolean(error) && (error.name === "AbortError" || /abort|timeout/i.test(String(error.message || error)));
}

export function throwIfAborted(signal) {
  if (!signal?.aborted) {
    return;
  }

  throw createAbortError(signal.reason);
}

export function createTimeoutSignal(parentSignal, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(createAbortError("The request timed out."));
  }, timeoutMs);

  const clear = () => {
    clearTimeout(timer);
    if (parentSignal) {
      parentSignal.removeEventListener("abort", abortFromParent);
    }
  };

  const abortFromParent = () => {
    controller.abort(createAbortError(parentSignal.reason || "The request was aborted."));
  };

  if (parentSignal) {
    if (parentSignal.aborted) {
      clearTimeout(timer);
      controller.abort(createAbortError(parentSignal.reason || "The request was aborted."));
      return controller.signal;
    }

    parentSignal.addEventListener("abort", abortFromParent, { once: true });
  }

  controller.signal.addEventListener("abort", clear, { once: true });
  return controller.signal;
}

function createAbortError(reason) {
  const error = new Error(typeof reason === "string" ? reason : "The request was aborted.");
  error.name = "AbortError";
  return error;
}
