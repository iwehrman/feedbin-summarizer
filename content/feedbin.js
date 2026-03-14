(() => {
  const SUMMARY_BUTTON_ID = "feedbin-summarizer-toolbar-button";
  const SUMMARY_BUTTON_WRAP_CLASS = "feedbin-summarizer-button-wrap";
  const ACTIVE_ENTRY_SELECTOR = ".entry-content.current";
  const CONTENT_SELECTOR = ".content-styles";
  const TITLE_SELECTOR = "header.entry-header h1";
  const SOURCE_LINK_SELECTOR = "#source_link";
  const TOOLBAR_BUTTONS_SELECTOR = ".entry-toolbar .entry-buttons";
  const EXTRACT_FORM_SELECTOR = '[data-behavior="toggle_extract"]';
  const FEED_CLASS_PATTERN = /\bentry-feed-(\d+)\b/;
  const FEED_LIST_SELECTOR = ".feeds-target.feed-list";
  const FEED_ITEM_SELECTOR = `${FEED_LIST_SELECTOR} [data-feed-id]`;
  const ENTRY_LIST_SELECTOR = "ul.entries-target";
  const ENTRY_ROW_SELECTOR = `${ENTRY_LIST_SELECTOR} li.entry-summary`;
  const ENTRY_ROW_LINK_SELECTOR = ".entry-summary-link";
  const PREFETCH_LIMIT = 3;
  const PREFETCH_SELECTION_WAIT_MS = 4000;
  const PREFETCHED_SUMMARY_LIMIT = 12;
  const PREPARING_SWAP_CLASS = "feedbin-summarizer-preparing-swap";

  const state = {
    activeSummary: null,
    pendingRequest: null,
    refreshTimer: null,
    summaryFeedPreferences: {},
    preferencesLoaded: false,
    lastViewedEntryId: "",
    lastAutoAttemptEntryId: "",
    suppressExtractPreferenceUpdate: false,
    pendingFeedSelection: null,
    activePrefetchSignature: "",
    activePrefetchRequestId: "",
    activePrefetchFeedId: "",
    prefetchQueueToken: 0,
    unreadFeedPrefetchSignature: "",
    unreadFeedPrefetchRequestId: "",
    unreadFeedPrefetchToken: 0,
    prefetchedSummaries: new Map(),
    pendingPrefetchedEntryId: "",
    pendingPrefetchedSwapTimer: null
  };

  boot();

  function boot() {
    loadFeedbinState();
    scheduleRefresh();

    const observer = new MutationObserver(() => {
      if (shouldRefreshImmediately()) {
        window.clearTimeout(state.refreshTimer);
        refreshUi();
        return;
      }

      scheduleRefresh();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "aria-hidden"]
    });

    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
    document.addEventListener("click", handleFeedSelectionIntent, true);
    document.addEventListener("keydown", handleFeedSelectionKeyboardIntent, true);
    document.addEventListener("pointerdown", handleEntrySelectionIntent, true);
  }

  function scheduleRefresh() {
    window.clearTimeout(state.refreshTimer);
    state.refreshTimer = window.setTimeout(refreshUi, 80);
  }

  function shouldRefreshImmediately() {
    if (!state.preferencesLoaded) {
      return false;
    }

    const context = getActiveEntryContext();
    if (!context || !context.feedId || context.isExtractActive) {
      return false;
    }

    if (!state.summaryFeedPreferences[context.feedId]) {
      return false;
    }

    if (state.activeSummary && state.activeSummary.entryId === context.entryId) {
      return false;
    }

    return Boolean(getPrefetchedSummary(context.entryId));
  }

  function refreshUi() {
    const context = getActiveEntryContext();
    if (!context) {
      state.lastViewedEntryId = "";
      state.lastAutoAttemptEntryId = "";
      clearPendingRequest();
      clearPendingPrefetchedSwap();
      if (state.activeSummary) {
        restoreSummary(state.activeSummary);
      }
      managePrefetchQueue(null);
      manageUnreadFeedPrefetch(null);
      return;
    }

    if (state.lastViewedEntryId !== context.entryId) {
      state.lastViewedEntryId = context.entryId;
      state.lastAutoAttemptEntryId = "";
    }

    if (state.pendingPrefetchedEntryId && state.pendingPrefetchedEntryId !== context.entryId) {
      clearPendingPrefetchedSwap();
    }

    if (state.pendingRequest && state.pendingRequest.entryId !== context.entryId) {
      clearPendingRequest();
    }

    if (state.activeSummary && state.activeSummary.entryId !== context.entryId) {
      restoreSummary(state.activeSummary);
    }

    if (
      state.activeSummary &&
      state.activeSummary.entryId === context.entryId &&
      state.activeSummary.bodyNode !== context.bodyNode
    ) {
      state.activeSummary = null;
    }

    if (context.isExtractActive && state.activeSummary && state.activeSummary.entryId === context.entryId) {
      restoreSummary(state.activeSummary);
    }

    if (
      context.isExtractActive &&
      state.pendingRequest &&
      state.pendingRequest.entryId === context.entryId &&
      !state.pendingRequest.startedWithExtract
    ) {
      clearPendingRequest();
    }

    const toolbarButtons = context.toolbarButtons || ensureFallbackToolbar(context);
    if (!toolbarButtons) {
      return;
    }

    for (const staleWrap of document.querySelectorAll(`.${SUMMARY_BUTTON_WRAP_CLASS}`)) {
      if (!toolbarButtons.contains(staleWrap)) {
        staleWrap.remove();
      }
    }

    let wrap = toolbarButtons.querySelector(`.${SUMMARY_BUTTON_WRAP_CLASS}`);
    if (!wrap) {
      wrap = buildToolbarButtonWrap();

      if (context.extractButtonWrap && context.extractButtonWrap.parentElement === toolbarButtons) {
        context.extractButtonWrap.insertAdjacentElement("afterend", wrap);
      } else {
        toolbarButtons.appendChild(wrap);
      }
    }

    const button = wrap.querySelector(`#${SUMMARY_BUTTON_ID}`);
    button.dataset.entryId = context.entryId;
    attachExtractPreferenceBridge(context);
    syncButtonState(button, context);
    maybeAutoApplySummary(context, button);
    managePrefetchQueue(context);
    manageUnreadFeedPrefetch(context);
  }

  function buildToolbarButtonWrap() {
    const wrap = document.createElement("div");
    wrap.className = `entry-button-wrap ${SUMMARY_BUTTON_WRAP_CLASS}`;

    const button = document.createElement("button");
    button.id = SUMMARY_BUTTON_ID;
    button.type = "button";
    button.className = "entry-button feedbin-summarizer-toolbar-button";
    button.title = "Summarize article";
    button.setAttribute("aria-label", "Summarize article");
    button.innerHTML = `
      <svg viewBox="0 0 14 16" class="feedbin-summarizer-toolbar-icon feedbin-summarizer-toolbar-icon-off" aria-hidden="true">
        <path style="fill: rgb(246, 246, 246) !important;" d="M11 14.5V16H3v-1.5zm1.5-1.5V3A1.5 1.5 0 0 0 11 1.5H3A1.5 1.5 0 0 0 1.5 3v10A1.5 1.5 0 0 0 3 14.5V16l-.154-.004A3 3 0 0 1 0 13V3A3 3 0 0 1 2.846.004L3 0h8l.154.004A3 3 0 0 1 14 3v10a3 3 0 0 1-2.846 2.996L11 16v-1.5a1.5 1.5 0 0 0 1.5-1.5"></path>
        <path style="fill: rgb(246, 246, 246) !important;" d="M7 4.25v1.5H3.5a.75.75 0 0 1 0-1.5zM10.5 4.25a.75.75 0 0 1 0 1.5h-2v-1.5zM8.75 7.25a.75.75 0 0 1 0 1.5H3.5a.75.75 0 0 1 0-1.5z"></path>
      </svg>
      <svg viewBox="0 0 14 16" class="feedbin-summarizer-toolbar-icon feedbin-summarizer-toolbar-icon-on" aria-hidden="true">
        <path style="fill: rgb(7, 172, 71) !important;" d="M11 0a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3V3a3 3 0 0 1 3-3zM3.5 7.25a.75.75 0 0 0 0 1.5h5.25a.75.75 0 0 0 0-1.5zm0-3a.75.75 0 0 0 0 1.5H7v-1.5zm5 1.5h2a.75.75 0 0 0 0-1.5h-2z"></path>
      </svg>
    `;
    button.addEventListener("click", handleSummarizeClick, true);

    wrap.appendChild(button);
    return wrap;
  }

  async function handleSummarizeClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const button = event.currentTarget;
    const context = getActiveEntryContext();
    if (!context) {
      return;
    }

    if (state.activeSummary && state.activeSummary.entryId === context.entryId) {
      restoreSummary(state.activeSummary);
      persistSummaryPreference(context.feedId, false);
      syncButtonState(button, context);
      return;
    }

    const prefetchedSummary = context.isExtractActive ? "" : getPrefetchedSummary(context.entryId);
    if (prefetchedSummary) {
      persistSummaryPreference(context.feedId, true);
      rememberFeedSelection(context.feedId);
      renderSummary(context, prefetchedSummary, createSummaryState(context));
      syncButtonState(button, context);
      return;
    }

    persistSummaryPreference(context.feedId, true);
    rememberFeedSelection(context.feedId);
    await triggerSummary(button, context);
  }

  async function triggerSummary(button, context) {
    if (!context) {
      return;
    }

    const articleText = extractArticleText(context.bodyNode);
    if (!articleText) {
      console.error("Feedbin Summarizer: no article text was available to summarize.");
      return;
    }

    setButtonLoading(button, true);
    const requestId = `${context.entryId}:${Date.now()}`;
    state.pendingRequest = {
      entryId: context.entryId,
      requestId,
      button,
      startedWithExtract: context.isExtractActive
    };

    try {
      const response = await sendMessage({
        type: "summarizeArticle",
        payload: {
          entryId: context.entryId,
          title: context.title,
          sourceUrl: context.sourceUrl,
          articleText,
          preferVisibleArticleText: context.isExtractActive
        }
      });

      let latestContext = getActiveEntryContext();
      if (
        !state.pendingRequest ||
        state.pendingRequest.requestId !== requestId ||
        !latestContext ||
        latestContext.entryId !== context.entryId
      ) {
        return;
      }

      const summaryState = createSummaryState(latestContext);

      if (latestContext.isExtractActive) {
        latestContext = await deactivateExtractForSummary(latestContext, requestId);
        if (!latestContext) {
          clearPendingPrefetchedSwap();
          return;
        }
      }

      storePrefetchedSummary(context.entryId, response.result.summaryText);
      renderSummary(latestContext, response.result.summaryText, summaryState);
    } catch (error) {
      clearPendingPrefetchedSwap();
      console.error("Feedbin Summarizer:", error);
    } finally {
      if (state.pendingRequest && state.pendingRequest.requestId === requestId) {
        clearPendingRequest();
        const latestContext = getActiveEntryContext();
        if (latestContext && latestContext.entryId === context.entryId) {
          syncButtonState(button, latestContext);
        }
      }
    }
  }

  function getActiveEntryContext() {
    const currentEntry = document.querySelector(ACTIVE_ENTRY_SELECTOR);
    if (!(currentEntry instanceof HTMLElement)) {
      return null;
    }

    const entryWrapper = currentEntry.closest("[data-entry-id]") || currentEntry.parentElement;
    const entryId = entryWrapper?.getAttribute("data-entry-id") || "";
    const bodyNode = currentEntry.querySelector(CONTENT_SELECTOR);
    if (!(bodyNode instanceof HTMLElement)) {
      return null;
    }

    const titleNode = currentEntry.querySelector(TITLE_SELECTOR);
    const sourceLink = currentEntry.querySelector(SOURCE_LINK_SELECTOR);
    const extractForm = findExtractForm(entryId);
    const extractButton = extractForm?.querySelector("button");
    const toolbarButtons = extractForm?.closest(TOOLBAR_BUTTONS_SELECTOR) || document.querySelector(TOOLBAR_BUTTONS_SELECTOR);

    return {
      entryId,
      feedId: extractFeedId(entryWrapper, currentEntry),
      currentEntry,
      entryWrapper,
      bodyNode,
      title: cleanText(titleNode?.innerText || ""),
      sourceUrl: sourceLink?.href || "",
      isExtractActive: Boolean(extractButton?.classList.contains("active")),
      extractButton,
      extractButtonWrap: extractForm?.closest(".entry-button-wrap") || null,
      toolbarButtons: toolbarButtons instanceof HTMLElement ? toolbarButtons : null
    };
  }

  function findExtractForm(entryId) {
    if (entryId) {
      const escaped = escapeSelectorValue(entryId);
      const exact = document.querySelector(`.entry-toolbar ${EXTRACT_FORM_SELECTOR}[data-entry-id="${escaped}"]`);
      if (exact) {
        return exact;
      }
    }

    return document.querySelector(`.entry-toolbar ${EXTRACT_FORM_SELECTOR}`);
  }

  function ensureFallbackToolbar(context) {
    let fallback = context.currentEntry.querySelector(".feedbin-summarizer-toolbar-fallback");
    if (!fallback) {
      fallback = document.createElement("div");
      fallback.className = "feedbin-summarizer-toolbar-fallback";
      context.bodyNode.insertAdjacentElement("beforebegin", fallback);
    }

    return fallback;
  }

  function createSummaryState(context) {
    return {
      entryId: context.entryId,
      originalHtml: context.bodyNode.innerHTML,
      originalText: extractArticleText(context.bodyNode)
    };
  }

  function activateSummaryState(context, summaryState = createSummaryState(context)) {
    if (state.activeSummary && state.activeSummary.entryId !== summaryState.entryId) {
      restoreSummary(state.activeSummary);
    }

    if (state.activeSummary && state.activeSummary.entryId === summaryState.entryId) {
      state.activeSummary.bodyNode = context.bodyNode;
      return state.activeSummary;
    }

    state.activeSummary = {
      entryId: summaryState.entryId,
      bodyNode: context.bodyNode,
      originalHtml: summaryState.originalHtml,
      originalText: summaryState.originalText
    };

    return state.activeSummary;
  }

  function renderSummary(context, summaryText, summaryState) {
    activateSummaryState(context, summaryState);
    context.bodyNode.innerHTML = buildSummaryHtml(summaryText);
    if (state.pendingPrefetchedEntryId === context.entryId) {
      clearPendingPrefetchedSwap();
    }
  }

  function restoreSummary(summary) {
    if (!summary) {
      return;
    }

    if (summary.bodyNode) {
      summary.bodyNode.innerHTML = summary.originalHtml;
    }

    if (state.activeSummary === summary) {
      state.activeSummary = null;
    }
  }

  function extractArticleText(bodyNode) {
    if (state.activeSummary && state.activeSummary.bodyNode === bodyNode) {
      return state.activeSummary.originalText;
    }

    const clone = bodyNode.cloneNode(true);
    for (const element of clone.querySelectorAll("script, style, noscript, iframe, svg, canvas, button, input, textarea, select, form, nav, footer")) {
      element.remove();
    }

    return cleanText(clone.innerText || "");
  }

  function buildSummaryHtml(summaryText) {
    const normalized = decodeEscapedNewlines(String(summaryText || "")).trim();
    if (!normalized) {
      return "<p></p>";
    }

    const blocks = normalized.split(/\n\s*\n+/).map(block => block.trim()).filter(Boolean);
    const htmlParts = [];

    for (const block of blocks) {
      const lines = block.split("\n").map(line => line.trim()).filter(Boolean);
      if (!lines.length) {
        continue;
      }

      if (lines.every(line => /^[-*\u2022]\s+/.test(line))) {
        const items = lines
          .map(line => `<li>${escapeHtml(line.replace(/^[-*\u2022]\s+/, ""))}</li>`)
          .join("");
        htmlParts.push(`<ul>${items}</ul>`);
        continue;
      }

      if (lines.every(line => /^\d+\.\s+/.test(line))) {
        const items = lines
          .map(line => `<li>${escapeHtml(line.replace(/^\d+\.\s+/, ""))}</li>`)
          .join("");
        htmlParts.push(`<ol>${items}</ol>`);
        continue;
      }

      htmlParts.push(`<p>${lines.map(escapeHtml).join("<br>")}</p>`);
    }

    return htmlParts.join("");
  }

  function decodeEscapedNewlines(value) {
    return value
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n\\n/g, "\n\n")
      .replace(/\\n/g, "\n");
  }

  function syncButtonState(button, context) {
    const isActive =
      Boolean(state.activeSummary) &&
      state.activeSummary.entryId === context.entryId;
    const isLoading = button.classList.contains("is-loading");

    button.classList.toggle("is-active", isActive);
    button.disabled = isLoading;

    if (isLoading) {
      return;
    }

    button.title = isActive ? "Show original article" : "Summarize article";
    button.setAttribute("aria-label", isActive ? "Show original article" : "Summarize article");
  }

  function setButtonLoading(button, isLoading) {
    button.classList.toggle("is-loading", isLoading);

    if (isLoading) {
      button.disabled = true;
      button.title = "Summarizing article";
      button.setAttribute("aria-label", "Summarizing article");
      return;
    }

    button.disabled = false;
    button.title = "Summarize article";
    button.setAttribute("aria-label", "Summarize article");
  }

  function clearPendingRequest() {
    if (!state.pendingRequest) {
      return;
    }

    setButtonLoading(state.pendingRequest.button, false);
    state.pendingRequest = null;
  }

  async function deactivateExtractForSummary(context, requestId) {
    if (!context.isExtractActive) {
      return context;
    }

    if (!(context.extractButton instanceof HTMLElement)) {
      throw new Error("Full Content is enabled, but its toolbar button could not be found.");
    }

    state.suppressExtractPreferenceUpdate = true;
    try {
      context.extractButton.click();
    } finally {
      state.suppressExtractPreferenceUpdate = false;
    }

    const updatedContext = await waitForEntryContext(
      context.entryId,
      requestId,
      candidate => !candidate.isExtractActive
    );

    if (!updatedContext) {
      throw new Error("The article changed before Full Content could be turned off.");
    }

    return updatedContext;
  }

  async function waitForEntryContext(entryId, requestId, predicate, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      if (!state.pendingRequest || state.pendingRequest.requestId !== requestId) {
        return null;
      }

      const context = getActiveEntryContext();
      if (!context || context.entryId !== entryId) {
        return null;
      }

      if (predicate(context)) {
        return context;
      }

      await new Promise(resolve => window.setTimeout(resolve, 60));
    }

    return null;
  }

  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      // Content scripts are intentionally limited to article metadata and summary
      // results. Secret reads and OpenAI requests stay inside the service worker.
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!response) {
          reject(new Error("No response from the background worker."));
          return;
        }

        if (!response.ok) {
          reject(new Error(response.error || "Request failed."));
          return;
        }

        resolve(response);
      });
    });
  }

  function cleanText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeSelectorValue(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }

    return String(value).replace(/["\\]/g, "\\$&");
  }

  function handleFeedSelectionIntent(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
      return;
    }

    const feedItem = target.closest(FEED_ITEM_SELECTOR);
    if (!(feedItem instanceof HTMLElement)) {
      return;
    }

    rememberFeedSelection(feedItem.getAttribute("data-feed-id") || "");
  }

  function handleFeedSelectionKeyboardIntent(event) {
    if (!(event.target instanceof Element)) {
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    const feedItem = event.target.closest(FEED_ITEM_SELECTOR);
    if (!(feedItem instanceof HTMLElement)) {
      return;
    }

    rememberFeedSelection(feedItem.getAttribute("data-feed-id") || "");
  }

  function handleEntrySelectionIntent(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
      return;
    }

    const row = target.closest(ENTRY_ROW_SELECTOR);
    if (!(row instanceof HTMLElement)) {
      return;
    }

    const entryId = row.getAttribute("data-entry-id") || "";
    const feedId = extractFeedId(row, row) || extractRowFeedId(row);
    if (!entryId || !feedId || !state.preferencesLoaded || !state.summaryFeedPreferences[feedId]) {
      clearPendingPrefetchedSwap();
      return;
    }

    if (!getPrefetchedSummary(entryId)) {
      clearPendingPrefetchedSwap();
      return;
    }

    preparePrefetchedSwap(entryId);
  }

  function rememberFeedSelection(feedId) {
    cancelPrefetchQueue();
    state.pendingFeedSelection = {
      feedId: String(feedId || ""),
      token: Date.now()
    };
    scheduleRefresh();
  }

  async function loadFeedbinState() {
    try {
      const response = await sendMessage({
        type: "getFeedbinState"
      });
      state.summaryFeedPreferences = normalizeFeedPreferences(response.result.summaryFeedPreferences);
      state.preferencesLoaded = true;
      scheduleRefresh();
    } catch (error) {
      console.warn("Feedbin Summarizer: failed to load feed preferences.", error);
      state.summaryFeedPreferences = {};
      state.preferencesLoaded = true;
    }
  }

  function normalizeFeedPreferences(rawValue) {
    const next = {};
    if (!rawValue || typeof rawValue !== "object") {
      return next;
    }

    for (const [feedId, enabled] of Object.entries(rawValue)) {
      if (enabled === true) {
        next[String(feedId)] = true;
      }
    }

    return next;
  }

  function extractFeedId(entryWrapper, currentEntry) {
    const directFeedId =
      entryWrapper?.getAttribute("data-feed-id") ||
      currentEntry?.getAttribute("data-feed-id") ||
      "";

    if (directFeedId) {
      return directFeedId;
    }

    const combinedClassName = `${entryWrapper?.className || ""} ${currentEntry?.className || ""}`;
    const match = combinedClassName.match(FEED_CLASS_PATTERN);
    return match ? match[1] : "";
  }

  function attachExtractPreferenceBridge(context) {
    if (!(context.extractButton instanceof HTMLElement)) {
      return;
    }

    if (context.extractButton.dataset.feedbinSummarizerBound === "true") {
      return;
    }

    context.extractButton.dataset.feedbinSummarizerBound = "true";
    context.extractButton.addEventListener(
      "click",
      () => {
        if (state.suppressExtractPreferenceUpdate) {
          return;
        }

        persistSummaryPreference(context.feedId, false);
      },
      true
    );
  }

  function maybeAutoApplySummary(context, button) {
    if (!state.preferencesLoaded || !context.feedId || !state.summaryFeedPreferences[context.feedId]) {
      return;
    }

    if (state.activeSummary && state.activeSummary.entryId === context.entryId) {
      return;
    }

    if (state.lastAutoAttemptEntryId === context.entryId) {
      return;
    }

    state.lastAutoAttemptEntryId = context.entryId;
    if (!context.isExtractActive) {
      const prefetchedSummary = getPrefetchedSummary(context.entryId);
      if (prefetchedSummary) {
        renderSummary(context, prefetchedSummary, createSummaryState(context));
        syncButtonState(button, context);
        return;
      }
    }

    void triggerSummary(button, context);
  }

  function persistSummaryPreference(feedId, enabled) {
    if (!feedId) {
      return;
    }

    if (enabled) {
      state.summaryFeedPreferences[feedId] = true;
    } else {
      delete state.summaryFeedPreferences[feedId];
    }

    sendMessage({
      type: "setFeedSummaryPreference",
      payload: {
        feedId,
        enabled
      }
    })
      .then(response => {
        state.summaryFeedPreferences = normalizeFeedPreferences(response.result.summaryFeedPreferences);
        scheduleRefresh();
      })
      .catch(error => {
        console.warn("Feedbin Summarizer: failed to save feed preferences.", error);
      });
  }

  function managePrefetchQueue(context) {
    const selectedFeedId = getSelectedFeedId();
    if (!selectedFeedId) {
      cancelPrefetchQueue();
      return;
    }

    if (state.activePrefetchFeedId && state.activePrefetchFeedId !== selectedFeedId) {
      cancelPrefetchQueue();
    }

    if (!state.preferencesLoaded) {
      return;
    }

    if (!state.summaryFeedPreferences[selectedFeedId]) {
      if (state.activePrefetchFeedId === selectedFeedId) {
        cancelPrefetchQueue();
      }
      return;
    }

    const pendingSelection = state.pendingFeedSelection;
    if (!pendingSelection || pendingSelection.feedId !== selectedFeedId) {
      return;
    }

    const rows = Array.from(document.querySelectorAll(ENTRY_ROW_SELECTOR));
    if (!rows.length) {
      if (Date.now() - pendingSelection.token > PREFETCH_SELECTION_WAIT_MS) {
        state.pendingFeedSelection = null;
        state.activePrefetchSignature = "";
        state.activePrefetchFeedId = "";
      }
      return;
    }

    const candidates = getPrefetchCandidates(rows, selectedFeedId, context);
    const signature = `${selectedFeedId}:${candidates.map(candidate => candidate.entryId).join(",")}`;
    if (!candidates.length) {
      state.pendingFeedSelection = null;
      state.activePrefetchSignature = "";
      state.activePrefetchFeedId = "";
      return;
    }

    if (signature === state.activePrefetchSignature && state.activePrefetchFeedId === selectedFeedId) {
      return;
    }

    state.activePrefetchSignature = signature;
    state.activePrefetchFeedId = selectedFeedId;
    const queueToken = ++state.prefetchQueueToken;
    void runPrefetchQueue(selectedFeedId, candidates, queueToken);
  }

  function getSelectedFeedId() {
    const selectedFeedLink = document.querySelector(`${FEED_LIST_SELECTOR} .feed-link.selected`);
    const selectedFeedItem =
      selectedFeedLink?.closest("[data-feed-id]") ||
      document.querySelector(`${FEED_LIST_SELECTOR} [data-feed-id].selected`);

    return selectedFeedItem?.getAttribute("data-feed-id") || "";
  }

  function getPrefetchCandidates(rows, selectedFeedId, context) {
    const candidates = [];

    for (const row of rows) {
      const candidate = extractPrefetchCandidate(row, selectedFeedId);
      if (!candidate) {
        continue;
      }

      if (context && candidate.entryId === context.entryId) {
        continue;
      }

      if (state.pendingRequest && candidate.entryId === state.pendingRequest.entryId) {
        continue;
      }

      if (state.activeSummary && candidate.entryId === state.activeSummary.entryId) {
        continue;
      }

      if (getPrefetchedSummary(candidate.entryId)) {
        continue;
      }

      candidates.push(candidate);
    }

    return candidates;
  }

  function manageUnreadFeedPrefetch(context) {
    if (!state.preferencesLoaded) {
      return;
    }

    const rows = Array.from(document.querySelectorAll(ENTRY_ROW_SELECTOR));
    if (!rows.length) {
      cancelUnreadFeedPrefetchQueue();
      return;
    }

    const selectedFeedId = getSelectedFeedId();
    const candidates = getUnreadFeedPrefetchCandidates(rows, context, selectedFeedId);
    const signature = candidates.map(candidate => `${candidate.feedId}:${candidate.entryId}`).join(",");

    if (!signature) {
      cancelUnreadFeedPrefetchQueue();
      return;
    }

    if (signature === state.unreadFeedPrefetchSignature) {
      return;
    }

    cancelUnreadFeedPrefetchQueue();
    state.unreadFeedPrefetchSignature = signature;
    const queueToken = state.unreadFeedPrefetchToken;
    void runUnreadFeedPrefetchQueue(candidates, queueToken);
  }

  function getUnreadFeedPrefetchCandidates(rows, context, selectedFeedId) {
    const candidates = [];
    const seenFeedIds = new Set();

    for (const row of rows) {
      const candidate = extractPrefetchCandidateFromRow(row);
      if (!candidate) {
        continue;
      }

      if (!state.summaryFeedPreferences[candidate.feedId]) {
        continue;
      }

      if (selectedFeedId && candidate.feedId === selectedFeedId) {
        continue;
      }

      if (seenFeedIds.has(candidate.feedId)) {
        continue;
      }

      if (context && candidate.entryId === context.entryId) {
        continue;
      }

      if (state.pendingRequest && candidate.entryId === state.pendingRequest.entryId) {
        continue;
      }

      if (state.activeSummary && candidate.entryId === state.activeSummary.entryId) {
        continue;
      }

      if (getPrefetchedSummary(candidate.entryId)) {
        continue;
      }

      seenFeedIds.add(candidate.feedId);
      candidates.push(candidate);
    }

    return candidates;
  }

  function extractPrefetchCandidate(row, selectedFeedId) {
    const candidate = extractPrefetchCandidateFromRow(row);
    if (!candidate || candidate.feedId !== selectedFeedId) {
      return null;
    }

    return candidate;
  }

  function extractPrefetchCandidateFromRow(row) {
    if (!(row instanceof HTMLElement)) {
      return null;
    }

    if (!isUnreadEntry(row)) {
      return null;
    }

    const feedId = extractFeedId(row, row) || extractRowFeedId(row);
    if (!feedId) {
      return null;
    }

    const link = row.querySelector(ENTRY_ROW_LINK_SELECTOR);
    if (!(link instanceof HTMLElement)) {
      return null;
    }

    const sourceUrl = link.getAttribute("data-url") || "";
    const titleNode = row.querySelector(".title");
    const summaryNode = row.querySelector(".summary-inner");
    const entryId = row.getAttribute("data-entry-id") || "";

    if (!entryId || !sourceUrl) {
      return null;
    }

    return {
      entryId,
      feedId,
      title: cleanText(titleNode?.textContent || ""),
      sourceUrl,
      articleText: cleanText(summaryNode?.textContent || row.innerText || "")
    };
  }

  function extractRowFeedId(row) {
    const match = String(row.className || "").match(/\bfeed-id-(\d+)\b/);
    return match ? match[1] : "";
  }

  function isUnreadEntry(row) {
    return row.classList.contains("unread") || !row.classList.contains("read");
  }

  async function runPrefetchQueue(feedId, candidates, queueToken) {
    const uncachedCandidates = (await filterCandidatesAgainstCache(candidates, () => shouldContinuePrefetch(feedId, queueToken))).slice(0, PREFETCH_LIMIT);
    if (!uncachedCandidates.length) {
      if (shouldContinuePrefetch(feedId, queueToken)) {
        state.pendingFeedSelection = null;
      }
      return;
    }

    for (const candidate of uncachedCandidates) {
      if (!shouldContinuePrefetch(feedId, queueToken)) {
        return;
      }

      const requestId = `prefetch:${feedId}:${candidate.entryId}:${Date.now()}`;
      state.activePrefetchRequestId = requestId;

      try {
        const response = await sendMessage({
          type: "prefetchArticle",
          payload: {
            requestId,
            entryId: candidate.entryId,
            title: candidate.title,
            sourceUrl: candidate.sourceUrl,
            articleText: candidate.articleText
          }
        });
        if (response.result.summaryText) {
          storePrefetchedSummary(candidate.entryId, response.result.summaryText);
        }
      } catch (error) {
        console.error("Feedbin Summarizer prefetch:", error);
      } finally {
        if (state.activePrefetchRequestId === requestId) {
          state.activePrefetchRequestId = "";
        }
      }
    }

    if (shouldContinuePrefetch(feedId, queueToken)) {
      state.pendingFeedSelection = null;
    }
  }

  async function runUnreadFeedPrefetchQueue(candidates, queueToken) {
    const uncachedCandidates = await filterCandidatesAgainstCache(candidates, () => shouldContinueUnreadFeedPrefetch(queueToken));
    if (!uncachedCandidates.length) {
      return;
    }

    for (const candidate of uncachedCandidates) {
      if (!shouldContinueUnreadFeedPrefetch(queueToken)) {
        return;
      }

      const requestId = `unread-prefetch:${candidate.feedId}:${candidate.entryId}:${Date.now()}`;
      state.unreadFeedPrefetchRequestId = requestId;

      try {
        const response = await sendMessage({
          type: "prefetchArticle",
          payload: {
            requestId,
            entryId: candidate.entryId,
            title: candidate.title,
            sourceUrl: candidate.sourceUrl,
            articleText: candidate.articleText
          }
        });

        if (response.result.summaryText) {
          storePrefetchedSummary(candidate.entryId, response.result.summaryText);
        }
      } catch (error) {
        console.error("Feedbin Summarizer unread prefetch:", error);
      } finally {
        if (state.unreadFeedPrefetchRequestId === requestId) {
          state.unreadFeedPrefetchRequestId = "";
        }
      }
    }
  }

  async function filterCandidatesAgainstCache(candidates, shouldContinue) {
    if (!candidates.length || !shouldContinue()) {
      return [];
    }

    try {
      const cachedEntryIds = new Set();

      for (let index = 0; index < candidates.length; index += 20) {
        if (!shouldContinue()) {
          return [];
        }

        const response = await sendMessage({
          type: "checkCachedSummaries",
          payload: {
            articles: candidates.slice(index, index + 20).map(candidate => ({
              entryId: candidate.entryId,
              sourceUrl: candidate.sourceUrl,
              title: candidate.title,
              articleText: candidate.articleText
            }))
          }
        });

        if (!shouldContinue()) {
          return [];
        }

        for (const cachedSummary of response.result.cachedSummaries || []) {
          storePrefetchedSummary(cachedSummary.entryId, cachedSummary.summaryText);
        }

        for (const entryId of response.result.cachedEntryIds || []) {
          cachedEntryIds.add(entryId);
        }
      }

      return candidates.filter(candidate => !cachedEntryIds.has(candidate.entryId));
    } catch (error) {
      console.error("Feedbin Summarizer cache check:", error);
      return candidates;
    }
  }

  function shouldContinuePrefetch(feedId, queueToken) {
    if (state.prefetchQueueToken !== queueToken) {
      return false;
    }

    if (!state.summaryFeedPreferences[feedId]) {
      return false;
    }

    return getSelectedFeedId() === feedId;
  }

  function shouldContinueUnreadFeedPrefetch(queueToken) {
    return state.unreadFeedPrefetchToken === queueToken;
  }

  function cancelPrefetchQueue() {
    state.prefetchQueueToken += 1;
    state.activePrefetchSignature = "";
    state.activePrefetchFeedId = "";
    state.pendingFeedSelection = null;

    if (!state.activePrefetchRequestId) {
      return;
    }

    const requestId = state.activePrefetchRequestId;
    state.activePrefetchRequestId = "";
    void sendMessage({
      type: "cancelPrefetch",
      payload: { requestId }
    }).catch(error => {
      console.error("Feedbin Summarizer prefetch cancel:", error);
    });
  }

  function cancelUnreadFeedPrefetchQueue() {
    state.unreadFeedPrefetchToken += 1;
    state.unreadFeedPrefetchSignature = "";

    if (!state.unreadFeedPrefetchRequestId) {
      return;
    }

    const requestId = state.unreadFeedPrefetchRequestId;
    state.unreadFeedPrefetchRequestId = "";
    void sendMessage({
      type: "cancelPrefetch",
      payload: { requestId }
    }).catch(error => {
      console.error("Feedbin Summarizer unread prefetch cancel:", error);
    });
  }

  function preparePrefetchedSwap(entryId) {
    const normalizedEntryId = String(entryId || "").trim();
    if (!normalizedEntryId) {
      clearPendingPrefetchedSwap();
      return;
    }

    if (state.pendingPrefetchedSwapTimer) {
      window.clearTimeout(state.pendingPrefetchedSwapTimer);
    }

    state.pendingPrefetchedEntryId = normalizedEntryId;
    document.documentElement.classList.add(PREPARING_SWAP_CLASS);
    state.pendingPrefetchedSwapTimer = window.setTimeout(() => {
      clearPendingPrefetchedSwap();
    }, 1500);
  }

  function clearPendingPrefetchedSwap() {
    if (state.pendingPrefetchedSwapTimer) {
      window.clearTimeout(state.pendingPrefetchedSwapTimer);
      state.pendingPrefetchedSwapTimer = null;
    }

    state.pendingPrefetchedEntryId = "";
    document.documentElement.classList.remove(PREPARING_SWAP_CLASS);
  }

  function getPrefetchedSummary(entryId) {
    return state.prefetchedSummaries.get(String(entryId || "")) || "";
  }

  function storePrefetchedSummary(entryId, summaryText) {
    const normalizedEntryId = String(entryId || "").trim();
    const normalizedSummary = String(summaryText || "").trim();
    if (!normalizedEntryId || !normalizedSummary) {
      return;
    }

    state.prefetchedSummaries.delete(normalizedEntryId);
    state.prefetchedSummaries.set(normalizedEntryId, normalizedSummary);

    while (state.prefetchedSummaries.size > PREFETCHED_SUMMARY_LIMIT) {
      const oldestEntryId = state.prefetchedSummaries.keys().next().value;
      if (!oldestEntryId) {
        break;
      }
      state.prefetchedSummaries.delete(oldestEntryId);
    }
  }

  function clearPrefetchedSummaries() {
    state.prefetchedSummaries.clear();
    clearPendingPrefetchedSwap();
  }

  function handleRuntimeMessage(message) {
    if (!message || typeof message !== "object") {
      return;
    }

    if (message.type === "feedPreferencesUpdated") {
      state.summaryFeedPreferences = normalizeFeedPreferences(message.payload?.summaryFeedPreferences);
      state.preferencesLoaded = true;
      scheduleRefresh();
      return;
    }

    if (message.type === "settingsUpdated") {
      clearPrefetchedSummaries();
      scheduleRefresh();
    }
  }
})();
