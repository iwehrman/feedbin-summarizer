// Injected once per page via chrome.scripting.executeScript.
// Manages a full-viewport Shadow DOM overlay for web page summarization.

const OVERLAY_HOST_ID = "__feedbinSummarizer__";

if (!window.__feedbinSummarizerInjected) {
  window.__feedbinSummarizerInjected = true;
  chrome.runtime.onMessage.addListener(handleMessage);
}

function handleMessage(message) {
  if (message?.target !== "pageSummarizer") return;
  switch (message.type) {
    case "showLoading":
      ensureOverlay();
      showOverlay();
      setLoading();
      break;
    case "showSummary":
      ensureOverlay();
      showOverlay();
      setSummary(message.result);
      break;
    case "showError":
      ensureOverlay();
      showOverlay();
      setError(message.error, message.showOptionsLink);
      break;
    case "hideSummary":
      hideOverlay();
      break;
  }
}

function getHost() {
  return document.getElementById(OVERLAY_HOST_ID);
}

function ensureOverlay() {
  if (getHost()) return;

  const host = document.createElement("div");
  host.id = OVERLAY_HOST_ID;
  host.setAttribute("data-darkreader-ignore", "");
  host.style.cssText = [
    "all: initial",
    "position: fixed",
    "inset: 0",
    "z-index: 2147483647",
    "display: flex",
    "overflow: auto",
    "background: #1a1a1a",
    "color-scheme: dark"
  ].join("; ");

  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
<style>
  :host { color-scheme: dark; }
  [hidden] { display: none !important; }
  *, *::before, *::after { box-sizing: border-box; }
  .page {
    display: flex;
    flex-direction: column;
    min-height: 100%;
    width: 100%;
    background: #1a1a1a;
    color: #d8d8d8;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 18px;
    line-height: 1.75;
  }
  .header {
    position: sticky;
    top: 0;
    background: #1a1a1a;
    border-bottom: 1px solid #2a2a2a;
    padding: 12px 20px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  }
  .close-btn {
    all: unset;
    cursor: pointer;
    color: #666;
    font-size: 20px;
    line-height: 1;
    flex-shrink: 0;
    padding: 0 4px;
  }
  .close-btn:hover { color: #e0e0e0; }
  .header-text {
    overflow: hidden;
    min-width: 0;
  }
  .header-title {
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #e0e0e0;
  }
  .header-hostname {
    font-size: 12px;
    color: #666;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .body {
    flex: 1;
    padding: 36px 24px 56px;
    max-width: 680px;
    width: 100%;
    margin: 0 auto;
    background: #1a1a1a;
  }
  p { margin: 0 0 1.2em; }
  p:last-child { margin-bottom: 0; }
  .loading {
    display: flex;
    align-items: center;
    gap: 12px;
    color: #888;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 15px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid #2a2a2a;
    border-top-color: #0cac47;
    border-radius: 50%;
    animation: spin 0.75s linear infinite;
    flex-shrink: 0;
  }
  .error-msg {
    color: #e06060;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 15px;
  }
  .options-link {
    display: inline-block;
    margin-top: 12px;
    color: #0cac47;
    text-decoration: none;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 14px;
  }
  .options-link:hover { text-decoration: underline; }
  .more-btn {
    all: unset;
    display: inline-block;
    margin-top: 1.4em;
    color: #0cac47;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 14px;
    cursor: pointer;
    opacity: 1;
    transition: opacity 140ms ease;
  }
  .more-btn:hover { text-decoration: underline; }
  .more-btn:disabled { opacity: 0.5; cursor: default; text-decoration: none; }
</style>
<div class="page">
  <div class="header">
    <button class="close-btn" id="close-btn" title="Close summary">&#x2715;</button>
    <div class="header-text">
      <div class="header-title" id="header-title"></div>
      <div class="header-hostname" id="header-hostname"></div>
    </div>
  </div>
  <div class="body">
    <div class="loading" id="loading-state"><div class="spinner"></div>Summarizing…</div>
    <div id="error-state" hidden>
      <p class="error-msg" id="error-msg"></p>
      <a class="options-link" id="options-link" hidden target="_blank">Open Settings</a>
    </div>
    <div id="result-state" hidden></div>
    <button class="more-btn" id="more-btn" hidden>More</button>
  </div>
</div>`;

  shadow.getElementById("close-btn").addEventListener("click", () => {
    host.style.display = "none";
    document.documentElement.style.overflow = "";
    chrome.runtime.sendMessage({ type: "pageSummarizerClose" }).catch(() => {});
  });

  shadow.getElementById("more-btn").addEventListener("click", handleMoreClick);

  document.documentElement.appendChild(host);
}

function handleMoreClick() {
  const shadow = getHost()?.shadowRoot;
  if (!shadow) return;
  const btn = shadow.getElementById("more-btn");
  btn.disabled = true;
  btn.textContent = "Loading…";
  chrome.runtime.sendMessage({ type: "pageSummarizerExpand" }, response => {
    if (!shadow) return;
    btn.disabled = false;
    btn.textContent = "More";
    if (response?.ok && response.result?.summaryText) {
      renderSummaryText(shadow, response.result.summaryText);
      btn.hidden = true;
    }
  });
}

function showOverlay() {
  const host = getHost();
  if (!host) return;
  host.style.display = "flex";
  document.documentElement.style.overflow = "hidden";
}

function hideOverlay() {
  const host = getHost();
  if (!host) return;
  host.style.display = "none";
  document.documentElement.style.overflow = "";
}

function setLoading() {
  const shadow = getHost().shadowRoot;
  shadow.getElementById("loading-state").hidden = false;
  shadow.getElementById("error-state").hidden = true;
  shadow.getElementById("result-state").hidden = true;
  shadow.getElementById("more-btn").hidden = true;
  shadow.getElementById("header-title").textContent = "Summarizing…";
  shadow.getElementById("header-hostname").textContent = "";
}

function renderSummaryText(shadow, summaryText) {
  const resultEl = shadow.getElementById("result-state");
  resultEl.innerHTML = "";
  const paragraphs = (summaryText || "").split(/\n\n+/).filter(p => p.trim());
  for (const para of paragraphs.length ? paragraphs : [summaryText || ""]) {
    const p = document.createElement("p");
    p.textContent = para.trim();
    resultEl.appendChild(p);
  }
}

function setSummary(result) {
  const shadow = getHost().shadowRoot;

  const titleEl = shadow.getElementById("header-title");
  const hostnameEl = shadow.getElementById("header-hostname");
  let hostname = "";
  try {
    hostname = result.sourceUrl ? new URL(result.sourceUrl).hostname : "";
  } catch {
    hostname = "";
  }
  titleEl.textContent = result.title || hostname;
  hostnameEl.textContent = result.title && hostname !== result.title ? hostname : "";

  renderSummaryText(shadow, result.summaryText);

  shadow.getElementById("loading-state").hidden = true;
  shadow.getElementById("error-state").hidden = true;
  shadow.getElementById("result-state").hidden = false;

  const moreBtn = shadow.getElementById("more-btn");
  moreBtn.hidden = false;
  moreBtn.disabled = false;
  moreBtn.textContent = "More";
}

function setError(message, showOptionsLink) {
  const shadow = getHost().shadowRoot;
  shadow.getElementById("error-msg").textContent = message || "Summarization failed.";
  const optionsLink = shadow.getElementById("options-link");
  if (showOptionsLink) {
    optionsLink.href = chrome.runtime.getURL("options/options.html");
    optionsLink.hidden = false;
  } else {
    optionsLink.hidden = true;
  }
  shadow.getElementById("loading-state").hidden = true;
  shadow.getElementById("error-state").hidden = false;
  shadow.getElementById("result-state").hidden = true;
  shadow.getElementById("more-btn").hidden = true;
  shadow.getElementById("header-title").textContent = "Could not summarize";
  shadow.getElementById("header-hostname").textContent = "";
}
