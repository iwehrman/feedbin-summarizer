const sessionId = new URLSearchParams(location.search).get("sessionId");

const loadingEl = document.getElementById("loading-state");
const errorEl = document.getElementById("error-state");
const errorMsgEl = document.getElementById("error-message");
const optionsLinkEl = document.getElementById("options-link");
const resultEl = document.getElementById("result-state");
const titleEl = document.getElementById("result-title");
const linkEl = document.getElementById("result-link");
const bodyEl = document.getElementById("result-body");
const metaEl = document.getElementById("result-meta");

async function init() {
  optionsLinkEl.href = chrome.runtime.getURL("options/options.html");

  if (!sessionId) {
    showError("No summary session found.");
    return;
  }

  try {
    const result = await pollForSummary(sessionId);
    showResult(result);
  } catch (error) {
    const message = error?.message || "Summarization failed.";
    const isKeyMissing = /API key/i.test(message);
    showError(message, isKeyMissing);
  }
}

async function pollForSummary(sessionId) {
  const sessionKey = `pageSummary:${sessionId}`;
  const timeoutMs = 120000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const stored = await chrome.storage.session.get(sessionKey);
    const entry = stored[sessionKey];

    if (entry?.status === "done") {
      chrome.storage.session.remove(sessionKey).catch(() => {});
      return entry.result;
    }

    if (entry?.status === "error") {
      chrome.storage.session.remove(sessionKey).catch(() => {});
      throw new Error(entry.error);
    }

    // If there's no entry at all after a brief grace period, the session is gone.
    if (!entry && Date.now() - start > 5000) {
      throw new Error("Summary session not found. The extension may have restarted; please try again.");
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  throw new Error("Summarization timed out. Please try again.");
}

function showError(message, showOptionsLink = false) {
  loadingEl.hidden = true;
  errorMsgEl.textContent = message;

  if (showOptionsLink) {
    optionsLinkEl.hidden = false;
  }

  errorEl.hidden = false;
}

function showResult(result) {
  loadingEl.hidden = true;

  document.title = result.title ? `Summary: ${result.title}` : "Summary";
  titleEl.textContent = result.title || "Summary";

  if (result.sourceUrl) {
    try {
      linkEl.href = result.sourceUrl;
      linkEl.textContent = new URL(result.sourceUrl).hostname;
    } catch {
      linkEl.hidden = true;
    }
  } else {
    linkEl.hidden = true;
  }

  const paragraphs = (result.summaryText || "").split(/\n\n+/).filter(p => p.trim());
  if (!paragraphs.length) {
    paragraphs.push(result.summaryText || "");
  }

  bodyEl.innerHTML = "";
  for (const para of paragraphs) {
    const p = document.createElement("p");
    p.textContent = para.trim();
    bodyEl.appendChild(p);
  }

  const metaParts = [];
  if (result.provider) {
    metaParts.push(result.provider === "openai" ? "OpenAI" : "Anthropic");
  }
  if (result.model) {
    metaParts.push(result.model);
  }
  if (result.cacheHit) {
    metaParts.push("cached");
  }
  metaEl.textContent = metaParts.join(" · ");

  resultEl.hidden = false;
}

init();
