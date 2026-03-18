const API_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]{8,}\b/g;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9._-]+\b/gi;
const RETRYABLE_STATUS_CODES = new Set([408, 429]);
const DEFAULT_RETRY_DELAY_MS = 900;
const DEFAULT_RETRY_JITTER_MS = 250;

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

export function isTimeoutAbortError(error) {
  return isAbortError(error) && error?.abortKind === "timeout";
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
    controller.abort(createAbortError("The request timed out.", "timeout"));
  }, timeoutMs);

  const clear = () => {
    clearTimeout(timer);
    if (parentSignal) {
      parentSignal.removeEventListener("abort", abortFromParent);
    }
  };

  const abortFromParent = () => {
    controller.abort(createAbortError(parentSignal.reason || "The request was aborted.", "aborted"));
  };

  if (parentSignal) {
    if (parentSignal.aborted) {
      clearTimeout(timer);
      controller.abort(createAbortError(parentSignal.reason || "The request was aborted.", "aborted"));
      return controller.signal;
    }

    parentSignal.addEventListener("abort", abortFromParent, { once: true });
  }

  controller.signal.addEventListener("abort", clear, { once: true });
  return controller.signal;
}

export function createHttpError(reason, status) {
  const error = new Error(typeof reason === "string" ? reason : "The request failed.");
  error.status = typeof status === "number" ? status : 0;
  return error;
}

export function isRetryableRequestError(error, signal) {
  if (signal?.aborted) {
    return false;
  }

  const status = Number(error?.status || 0);
  if (RETRYABLE_STATUS_CODES.has(status) || status >= 500) {
    return true;
  }

  if (isTimeoutAbortError(error)) {
    return true;
  }

  return error instanceof TypeError;
}

export async function withSingleRetry(task, options = {}) {
  const signal = options.signal;
  const delayMs = typeof options.delayMs === "number" ? options.delayMs : DEFAULT_RETRY_DELAY_MS;
  const jitterMs = typeof options.jitterMs === "number" ? options.jitterMs : DEFAULT_RETRY_JITTER_MS;
  const shouldRetry = options.shouldRetry || isRetryableRequestError;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    throwIfAborted(signal);

    try {
      return await task(attempt);
    } catch (error) {
      if (attempt > 0 || !shouldRetry(error, signal)) {
        throw error;
      }

      const delay = delayMs + (jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0);
      await waitForDelay(delay, signal);
    }
  }

  throw new Error("Retry handling failed unexpectedly.");
}

function createAbortError(reason, abortKind = "aborted") {
  const error = new Error(typeof reason === "string" ? reason : "The request was aborted.");
  error.name = "AbortError";
  error.abortKind = abortKind;
  return error;
}

function waitForDelay(delayMs, signal) {
  if (!delayMs) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);

    const onAbort = () => {
      cleanup();
      reject(createAbortError(signal?.reason || "The request was aborted.", "aborted"));
    };

    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };

    if (signal) {
      if (signal.aborted) {
        cleanup();
        reject(createAbortError(signal.reason || "The request was aborted.", "aborted"));
        return;
      }

      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}
