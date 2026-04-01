(() => {
  const SUMMARY_BUTTON_ID = "feedbin-summarizer-toolbar-button";
  const SUMMARY_BUTTON_WRAP_CLASS = "feedbin-summarizer-button-wrap";
  const SUMMARY_BUTTON_BOUND_FLAG = "feedbinSummarizerBound";
  const ACTIVE_ENTRY_SELECTOR = ".entry-content.current";
  const CONTENT_SELECTOR = ".content-styles";
  const TITLE_SELECTOR = "header.entry-header h1";
  const SOURCE_LINK_SELECTOR = "#source_link";
  const TOOLBAR_BUTTONS_SELECTOR = ".entry-toolbar .entry-buttons";
  const EXTRACT_FORM_SELECTOR = '[data-behavior="toggle_extract"]';
  const FEED_CLASS_PATTERN = /\bentry-feed-(\d+)\b/;
  const FEED_LIST_SELECTOR = ".feeds-target.feed-list";
  const FEED_ITEM_SELECTOR = `${FEED_LIST_SELECTOR} li[data-feed-id]`;
  const ENTRY_LIST_SELECTOR = "ul.entries-target";
  const ENTRY_ROW_SELECTOR = `${ENTRY_LIST_SELECTOR} li.entry-summary`;
  const ENTRY_ROW_LINK_SELECTOR = ".entry-summary-link";
  const PREFETCH_LIMIT = 5;
  const PREFETCH_CONCURRENCY = 2;
  const UNREAD_FEED_PREFETCH_LIMIT = 3;
  const UNREAD_FEED_PREFETCH_TOTAL_LIMIT = 12;
  const UNREAD_FEED_PREFETCH_CONCURRENCY = 2;
  const PREFETCHED_SUMMARY_LIMIT = 12;
  const PREPARING_SWAP_CLASS = "feedbin-summarizer-preparing-swap";
  const PREFETCH_DEBUG_DOT_CLASS = "feedbin-summarizer-prefetch-dot";
  const SUMMARY_MORE_LINK_CLASS = "feedbin-summarizer-more-link";
  const SUMMARY_MORE_LINK_LABEL = "More";
  const STATUS_NOTICE_CLASS = "feedbin-summarizer-status-notice";
  const STATUS_NOTICE_DURATION_MS = 6000;
  const ACTIVE_ICON_COLOR = "rgb(7, 172, 71)";
  const DEFAULT_OFF_ICON_COLOR = "rgb(246, 246, 246)";

  const state = {
    activeSummary: null,
    pendingRequest: null,
    refreshTimer: null,
    summaryFeedPreferences: {},
    preferencesLoaded: false,
    summaryCacheEnabled: true,
    prefetchDebugVisualizationEnabled: false,
    lastViewedEntryId: "",
    lastAutoAttemptEntryId: "",
    suppressExtractPreferenceUpdate: false,
    activePrefetchSignature: "",
    activePrefetchFeedId: "",
    activePrefetchRequests: new Map(),
    prefetchQueueToken: 0,
    unreadFeedPrefetchSignature: "",
    unreadFeedPrefetchRequests: new Map(),
    unreadFeedPrefetchToken: 0,
    prefetchedSummaries: new Map(),
    prefetchDebugEntries: new Map(),
    pendingPrefetchedEntryId: "",
    pendingPrefetchedSwapTimer: null,
    statusNoticeTimer: null,
    prefetchDotRemovalTimers: new Map()
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
      clearStatusNotice();
      state.lastViewedEntryId = "";
      state.lastAutoAttemptEntryId = "";
      clearPendingRequest();
      clearPendingPrefetchedSwap();
      if (state.activeSummary) {
        restoreSummary(state.activeSummary);
      }
      managePrefetchQueue(null);
      manageUnreadFeedPrefetch(null);
      syncPrefetchDebugIndicators(null);
      return;
    }

    if (state.lastViewedEntryId !== context.entryId) {
      clearStatusNotice();
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

    const button = ensureSummaryButton(wrap);
    if (!isButtonElement(button)) {
      return;
    }

    button.dataset.entryId = context.entryId;
    attachExtractPreferenceBridge(context);
    syncButtonPalette(button, context);
    syncButtonState(button, context);
    maybeAutoApplySummary(context, button);
    managePrefetchQueue(context);
    manageUnreadFeedPrefetch(context);
    syncPrefetchDebugIndicators(context);
  }

  function buildToolbarButtonWrap() {
    const wrap = document.createElement("div");
    wrap.className = `entry-button-wrap ${SUMMARY_BUTTON_WRAP_CLASS}`;

    wrap.appendChild(createSummaryButton());
    return wrap;
  }

  function createSummaryButton() {
    const button = document.createElement("button");
    button.id = SUMMARY_BUTTON_ID;
    button.type = "button";
    button.className = "entry-button feedbin-summarizer-toolbar-button";
    button.title = "Summarize article";
    button.setAttribute("aria-label", "Summarize article");
    button.innerHTML = `
      <svg viewBox="0 0 14 16" class="feedbin-summarizer-toolbar-icon feedbin-summarizer-toolbar-icon-off" aria-hidden="true">
        <path style="fill: currentColor !important;" d="M11 14.5V16H3v-1.5zm1.5-1.5V3A1.5 1.5 0 0 0 11 1.5H3A1.5 1.5 0 0 0 1.5 3v10A1.5 1.5 0 0 0 3 14.5V16l-.154-.004A3 3 0 0 1 0 13V3A3 3 0 0 1 2.846.004L3 0h8l.154.004A3 3 0 0 1 14 3v10a3 3 0 0 1-2.846 2.996L11 16v-1.5a1.5 1.5 0 0 0 1.5-1.5"></path>
        <path style="fill: currentColor !important;" d="M7 4.25v1.5H3.5a.75.75 0 0 1 0-1.5zM10.5 4.25a.75.75 0 0 1 0 1.5h-2v-1.5zM8.75 7.25a.75.75 0 0 1 0 1.5H3.5a.75.75 0 0 1 0-1.5z"></path>
      </svg>
      <svg viewBox="0 0 14 16" class="feedbin-summarizer-toolbar-icon feedbin-summarizer-toolbar-icon-on" aria-hidden="true">
        <path style="fill: currentColor !important;" d="M11 0a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3V3a3 3 0 0 1 3-3zM3.5 7.25a.75.75 0 0 0 0 1.5h5.25a.75.75 0 0 0 0-1.5zm0-3a.75.75 0 0 0 0 1.5H7v-1.5zm5 1.5h2a.75.75 0 0 0 0-1.5h-2z"></path>
      </svg>
    `;
    bindSummaryButton(button);
    return button;
  }

  function ensureSummaryButton(wrap) {
    const existingButton = wrap.querySelector(`#${SUMMARY_BUTTON_ID}`);
    if (isButtonElement(existingButton)) {
      bindSummaryButton(existingButton);
      return existingButton;
    }

    const button = createSummaryButton();
    wrap.replaceChildren(button);
    return button;
  }

  function bindSummaryButton(button) {
    if (button.dataset[SUMMARY_BUTTON_BOUND_FLAG] === "true") {
      return;
    }

    button.addEventListener("click", handleSummarizeClick, true);
    button.dataset[SUMMARY_BUTTON_BOUND_FLAG] = "true";
  }

  function isButtonElement(value) {
    return value instanceof HTMLElement && value.tagName === "BUTTON";
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
    await triggerSummary(button, context, {
      prioritizeUserRequest: true
    });
  }

  async function triggerSummary(button, context, options = {}) {
    if (!context) {
      return false;
    }

    if (options.prioritizeUserRequest) {
      cancelPrefetchQueue();
      cancelUnreadFeedPrefetchQueue();
    }

    const articleText = extractArticleText(context.bodyNode);
    if (!canSummarizeContext(context, articleText)) {
      return false;
    }

    if (options.showToolbarLoading !== false) {
      setButtonLoading(button, true);
    }
    const requestId = `${context.entryId}:${Date.now()}`;
    state.pendingRequest = {
      entryId: context.entryId,
      requestId,
      button,
      startedWithExtract: context.isExtractActive,
      summaryMode: options.summaryMode || "standard",
      usesToolbarLoading: options.showToolbarLoading !== false
    };

    try {
      const response = await sendMessage({
        type: "summarizeArticle",
        payload: {
          entryId: context.entryId,
          title: context.title,
          sourceUrl: context.sourceUrl,
          articleText,
          preferVisibleArticleText: context.isExtractActive,
          summaryMode: options.summaryMode || "standard",
          existingSummaryText: options.existingSummaryText || ""
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

      const summaryState = options.summaryState || createSummaryState(latestContext);

      if (latestContext.isExtractActive) {
        latestContext = await deactivateExtractForSummary(latestContext, requestId);
        if (!latestContext) {
          clearPendingPrefetchedSwap();
          return;
        }
      }

      rememberSummaryResult(
        context.entryId,
        response.result.summaryText,
        context.feedId,
        options.summaryMode || "standard"
      );
      renderSummary(latestContext, response.result.summaryText, summaryState, {
        summaryMode: options.summaryMode || "standard"
      });
    } catch (error) {
      if (options.moreLink instanceof HTMLElement) {
        setMoreLinkLoading(options.moreLink, false);
      }
      clearPendingPrefetchedSwap();
      showSummaryError(context, error);
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

    return true;
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
      feedId: context.feedId,
      originalHtml: context.bodyNode.innerHTML,
      originalText: extractArticleText(context.bodyNode)
    };
  }

  function showSummaryError(context, error) {
    const message = getSummaryErrorMessage(error);
    if (!message) {
      return;
    }

    const notice = ensureStatusNotice(context);
    if (!notice) {
      return;
    }

    notice.textContent = message;
    notice.hidden = false;
    window.clearTimeout(state.statusNoticeTimer);
    state.statusNoticeTimer = window.setTimeout(() => {
      clearStatusNotice();
    }, STATUS_NOTICE_DURATION_MS);
  }

  function getSummaryErrorMessage(error) {
    const message = String(error?.message || "").trim();
    if (!message) {
      return "Summary failed. Please try again.";
    }

    if (
      /Receiving end does not exist/i.test(message) ||
      /Extension context invalidated/i.test(message)
    ) {
      return "Refresh Feedbin after reloading the extension, then try Summary again.";
    }

    return message;
  }

  function ensureStatusNotice(context) {
    const anchor = context?.bodyNode;
    if (!(anchor instanceof HTMLElement)) {
      return null;
    }

    let notice = context.currentEntry.querySelector(`.${STATUS_NOTICE_CLASS}`);
    if (!(notice instanceof HTMLElement)) {
      notice = document.createElement("div");
      notice.className = STATUS_NOTICE_CLASS;
      notice.hidden = true;
      notice.setAttribute("role", "status");
      notice.setAttribute("aria-live", "polite");
      anchor.insertAdjacentElement("beforebegin", notice);
    }

    return notice;
  }

  function clearStatusNotice() {
    window.clearTimeout(state.statusNoticeTimer);
    state.statusNoticeTimer = null;

    for (const notice of document.querySelectorAll(`.${STATUS_NOTICE_CLASS}`)) {
      notice.remove();
    }
  }

  function activateSummaryState(context, summaryState = createSummaryState(context)) {
    if (state.activeSummary && state.activeSummary.entryId !== summaryState.entryId) {
      restoreSummary(state.activeSummary);
    }

    if (state.activeSummary && state.activeSummary.entryId === summaryState.entryId) {
      state.activeSummary.bodyNode = context.bodyNode;
      state.activeSummary.feedId = summaryState.feedId || context.feedId || state.activeSummary.feedId || "";
      return state.activeSummary;
    }

    state.activeSummary = {
      entryId: summaryState.entryId,
      feedId: summaryState.feedId || context.feedId || "",
      bodyNode: context.bodyNode,
      originalHtml: summaryState.originalHtml,
      originalText: summaryState.originalText,
      summaryMode: summaryState.summaryMode || "standard",
      conciseSummaryText: summaryState.conciseSummaryText || "",
      expandedSummaryText: summaryState.expandedSummaryText || ""
    };

    return state.activeSummary;
  }

  function renderSummary(context, summaryText, summaryState, options = {}) {
    const activeSummary = activateSummaryState(context, summaryState);
    const summaryMode = options.summaryMode || "standard";
    activeSummary.summaryMode = summaryMode;
    if (summaryMode === "expanded") {
      activeSummary.expandedSummaryText = String(summaryText || "").trim();
      removeMoreLink(context.bodyNode);
      context.bodyNode.insertAdjacentHTML("beforeend", buildSummaryHtml(summaryText, {
        showMoreLink: false
      }));
    } else {
      activeSummary.conciseSummaryText = String(summaryText || "").trim();
      activeSummary.expandedSummaryText = "";
      context.bodyNode.innerHTML = buildSummaryHtml(summaryText, {
        showMoreLink: true
      });
    }

    bindRenderedSummaryActions(context, activeSummary);
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

    if (!state.summaryCacheEnabled) {
      clearEphemeralSummaryState(summary.entryId);
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

  function canSummarizeContext(context, articleText = extractArticleText(context?.bodyNode)) {
    const normalizedArticleText = cleanText(articleText);
    if (normalizedArticleText && !isLoadingPlaceholderText(normalizedArticleText)) {
      return true;
    }

    return Boolean(context?.sourceUrl);
  }

  function isLoadingPlaceholderText(value) {
    const normalized = cleanText(value).toLowerCase();
    return (
      normalized === "loading" ||
      normalized === "loading..." ||
      normalized === "loading full content" ||
      normalized === "loading full content..." ||
      /^loading\b/.test(normalized)
    );
  }

  function buildSummaryHtml(summaryText, options = {}) {
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

    if (options.showMoreLink) {
      htmlParts.push(
        `<p><a href="#" class="${SUMMARY_MORE_LINK_CLASS}">` +
          `<span class="${SUMMARY_MORE_LINK_CLASS}-text">${escapeHtml(SUMMARY_MORE_LINK_LABEL)}</span>` +
          `<span class="${SUMMARY_MORE_LINK_CLASS}-adornment" aria-hidden="true">` +
            `<span class="${SUMMARY_MORE_LINK_CLASS}-chevron">›</span>` +
            `<span class="${SUMMARY_MORE_LINK_CLASS}-spinner">` +
              `<span class="${SUMMARY_MORE_LINK_CLASS}-dot">.</span>` +
              `<span class="${SUMMARY_MORE_LINK_CLASS}-dot">.</span>` +
              `<span class="${SUMMARY_MORE_LINK_CLASS}-dot">.</span>` +
            `</span>` +
          `</span>` +
        `</a></p>`
      );
    }

    return htmlParts.join("");
  }

  function bindRenderedSummaryActions(context, summaryState) {
    const moreLink = context.bodyNode.querySelector(`.${SUMMARY_MORE_LINK_CLASS}`);
    if (!(moreLink instanceof HTMLElement)) {
      return;
    }

    moreLink.addEventListener("click", event => {
      void handleMoreClick(event, summaryState);
    }, { once: true });
  }

  async function handleMoreClick(event, summaryState) {
    event.preventDefault();
    event.stopPropagation();

    const moreLink = event.currentTarget;
    if (!(moreLink instanceof HTMLElement)) {
      return;
    }

    const context = getActiveEntryContext();
    if (!context || !state.activeSummary || state.activeSummary.entryId !== context.entryId) {
      return;
    }

    if (state.pendingRequest && state.pendingRequest.entryId === context.entryId) {
      return;
    }

    if (state.activeSummary.summaryMode === "expanded") {
      return;
    }

    const summaryButton = document.getElementById(SUMMARY_BUTTON_ID);
    setMoreLinkLoading(moreLink, true);
    await triggerSummary(isButtonElement(summaryButton) ? summaryButton : null, context, {
      prioritizeUserRequest: true,
      summaryMode: "expanded",
      summaryState,
      showToolbarLoading: false,
      moreLink,
      existingSummaryText: state.activeSummary.conciseSummaryText || extractArticleText(context.bodyNode)
    });
  }

  function setMoreLinkLoading(link, isLoading) {
    link.classList.toggle("is-loading", isLoading);
    link.setAttribute("aria-disabled", isLoading ? "true" : "false");
    if (isLoading) {
      link.setAttribute("tabindex", "-1");
      return;
    }

    link.removeAttribute("tabindex");
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

  function syncButtonPalette(button, context) {
    const referenceButton = getReferenceToolbarButton(button, context);
    const offColor = referenceButton
      ? getComputedStyle(referenceButton).color
      : getComputedStyle(context.currentEntry).color || DEFAULT_OFF_ICON_COLOR;

    button.style.setProperty("--feedbin-summarizer-icon-off-color", offColor || DEFAULT_OFF_ICON_COLOR);
    button.style.setProperty("--feedbin-summarizer-icon-on-color", ACTIVE_ICON_COLOR);
  }

  function getReferenceToolbarButton(button, context) {
    const toolbar = context.toolbarButtons;
    if (!(toolbar instanceof HTMLElement)) {
      return null;
    }

    const nativeButtons = Array.from(toolbar.querySelectorAll(".entry-button"))
      .filter(candidate => candidate instanceof HTMLElement && candidate !== button && isVisibleElement(candidate));

    return nativeButtons.find(candidate => !candidate.classList.contains("active")) || nativeButtons[0] || null;
  }

  function isVisibleElement(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function setButtonLoading(button, isLoading) {
    if (!isButtonElement(button)) {
      return;
    }

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

    if (state.pendingRequest.usesToolbarLoading !== false) {
      setButtonLoading(state.pendingRequest.button, false);
    }
    state.pendingRequest = null;
  }

  function removeMoreLink(bodyNode) {
    const moreLink = bodyNode.querySelector(`.${SUMMARY_MORE_LINK_CLASS}`);
    if (!(moreLink instanceof HTMLElement)) {
      return;
    }

    const wrapper = moreLink.closest("p");
    if (wrapper instanceof HTMLElement) {
      wrapper.remove();
      return;
    }

    moreLink.remove();
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
    void feedId;
    cancelPrefetchQueue();
    scheduleRefresh();
  }

  async function loadFeedbinState() {
    try {
      const response = await sendMessage({
        type: "getFeedbinState"
      });
      state.summaryFeedPreferences = normalizeFeedPreferences(response.result.summaryFeedPreferences);
      state.summaryCacheEnabled = response.result.summaryCacheEnabled !== false;
      state.prefetchDebugVisualizationEnabled = Boolean(response.result.prefetchDebugVisualizationEnabled);
      state.preferencesLoaded = true;
      scheduleRefresh();
    } catch (error) {
      console.warn("Feedbin Summarizer: failed to load feed preferences.", error);
      state.summaryFeedPreferences = {};
      state.summaryCacheEnabled = true;
      state.prefetchDebugVisualizationEnabled = false;
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

    if (!context.isExtractActive) {
      const prefetchedSummary = getPrefetchedSummary(context.entryId);
      if (prefetchedSummary) {
        state.lastAutoAttemptEntryId = context.entryId;
        renderSummary(context, prefetchedSummary, createSummaryState(context));
        syncButtonState(button, context);
        return;
      }
    }

    if (!canSummarizeContext(context)) {
      return;
    }

    state.lastAutoAttemptEntryId = context.entryId;
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
    if (!state.summaryCacheEnabled) {
      cancelPrefetchQueue();
      return;
    }

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

    const rows = Array.from(document.querySelectorAll(ENTRY_ROW_SELECTOR));
    if (!rows.length) {
      return;
    }

    const candidates = getPrefetchCandidates(rows, selectedFeedId, context);
    const candidateEntryIds = new Set(candidates.map(candidate => candidate.entryId));
    cancelPrefetchRequests(
      state.activePrefetchRequests,
      "Feedbin Summarizer prefetch cancel:",
      entryId => !candidateEntryIds.has(entryId)
    );

    const signature = `${selectedFeedId}:${candidates.map(candidate => candidate.entryId).join(",")}`;
    if (!candidates.length) {
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
    if (!state.summaryCacheEnabled) {
      cancelUnreadFeedPrefetchQueue();
      return;
    }

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
    const feedCandidateCounts = new Map();

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

      const currentFeedCount = feedCandidateCounts.get(candidate.feedId) || 0;
      if (currentFeedCount >= UNREAD_FEED_PREFETCH_LIMIT) {
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

      feedCandidateCounts.set(candidate.feedId, currentFeedCount + 1);
      candidates.push(candidate);

      if (candidates.length >= UNREAD_FEED_PREFETCH_TOTAL_LIMIT) {
        break;
      }
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
      return;
    }

    await runConcurrentPrefetchCandidates(
      uncachedCandidates,
      PREFETCH_CONCURRENCY,
      () => shouldContinuePrefetch(feedId, queueToken),
      async candidate => {
        const requestId = `prefetch:${feedId}:${candidate.entryId}:${Date.now()}`;
        markPrefetchFetching(candidate.entryId, candidate.feedId);
        registerPrefetchRequest(state.activePrefetchRequests, requestId, candidate.entryId);

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
            rememberSummaryResult(candidate.entryId, response.result.summaryText, candidate.feedId);
          }
        } catch (error) {
          console.error("Feedbin Summarizer prefetch:", error);
        } finally {
          releasePrefetchRequest(state.activePrefetchRequests, requestId);
        }
      }
    );
  }

  async function runUnreadFeedPrefetchQueue(candidates, queueToken) {
    const uncachedCandidates = await filterCandidatesAgainstCache(candidates, () => shouldContinueUnreadFeedPrefetch(queueToken));
    if (!uncachedCandidates.length) {
      return;
    }

    await runConcurrentPrefetchCandidates(
      uncachedCandidates,
      UNREAD_FEED_PREFETCH_CONCURRENCY,
      () => shouldContinueUnreadFeedPrefetch(queueToken),
      async candidate => {
        const requestId = `unread-prefetch:${candidate.feedId}:${candidate.entryId}:${Date.now()}`;
        markPrefetchFetching(candidate.entryId, candidate.feedId);
        registerPrefetchRequest(state.unreadFeedPrefetchRequests, requestId, candidate.entryId);

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
            rememberSummaryResult(candidate.entryId, response.result.summaryText, candidate.feedId);
          }
        } catch (error) {
          console.error("Feedbin Summarizer unread prefetch:", error);
        } finally {
          releasePrefetchRequest(state.unreadFeedPrefetchRequests, requestId);
        }
      }
    );
  }

  async function runConcurrentPrefetchCandidates(candidates, concurrency, shouldContinue, runCandidate) {
    let nextIndex = 0;
    const workerCount = Math.min(concurrency, candidates.length);
    const workers = [];

    for (let index = 0; index < workerCount; index += 1) {
      workers.push((async () => {
        while (shouldContinue()) {
          const candidate = candidates[nextIndex];
          nextIndex += 1;
          if (!candidate) {
            return;
          }

          await runCandidate(candidate);
        }
      })());
    }

    await Promise.all(workers);
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

        const candidateBatch = candidates.slice(index, index + 20);
        const candidatesByEntryId = new Map(candidateBatch.map(candidate => [candidate.entryId, candidate]));

        const response = await sendMessage({
          type: "checkCachedSummaries",
          payload: {
            articles: candidateBatch.map(candidate => ({
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
          rememberSummaryResult(
            cachedSummary.entryId,
            cachedSummary.summaryText,
            candidatesByEntryId.get(cachedSummary.entryId)?.feedId || ""
          );
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

    cancelPrefetchRequests(state.activePrefetchRequests, "Feedbin Summarizer prefetch cancel:");
  }

  function cancelUnreadFeedPrefetchQueue() {
    state.unreadFeedPrefetchToken += 1;
    state.unreadFeedPrefetchSignature = "";

    cancelPrefetchRequests(state.unreadFeedPrefetchRequests, "Feedbin Summarizer unread prefetch cancel:");
  }

  function registerPrefetchRequest(requestMap, requestId, entryId) {
    requestMap.set(requestId, entryId);
  }

  function releasePrefetchRequest(requestMap, requestId) {
    const entryId = requestMap.get(requestId) || "";
    requestMap.delete(requestId);
    if (entryId && !hasAnyActivePrefetchForEntry(entryId)) {
      clearFetchingPrefetchState(entryId);
    }
  }

  function hasAnyActivePrefetchForEntry(entryId) {
    for (const activeEntryId of state.activePrefetchRequests.values()) {
      if (activeEntryId === entryId) {
        return true;
      }
    }

    for (const activeEntryId of state.unreadFeedPrefetchRequests.values()) {
      if (activeEntryId === entryId) {
        return true;
      }
    }

    return false;
  }

  function cancelPrefetchRequests(requestMap, errorPrefix, shouldCancel = () => true) {
    for (const [requestId, entryId] of Array.from(requestMap.entries())) {
      if (!shouldCancel(entryId, requestId)) {
        continue;
      }

      requestMap.delete(requestId);
      if (entryId && !hasAnyActivePrefetchForEntry(entryId)) {
        clearFetchingPrefetchState(entryId);
      }

      void sendMessage({
        type: "cancelPrefetch",
        payload: { requestId }
      }).catch(error => {
        console.error(errorPrefix, error);
      });
    }
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
    if (!state.summaryCacheEnabled) {
      return "";
    }

    return state.prefetchedSummaries.get(String(entryId || "")) || "";
  }

  function rememberSummaryResult(entryId, summaryText, feedId = "", summaryMode = "standard") {
    if (summaryMode === "standard" && state.summaryCacheEnabled) {
      storePrefetchedSummary(entryId, summaryText, feedId);
      return;
    }

    upsertPrefetchDebugEntry(entryId, feedId, "ready");
    scheduleDebugRefresh();
  }

  function storePrefetchedSummary(entryId, summaryText, feedId = "") {
    const normalizedEntryId = String(entryId || "").trim();
    const normalizedSummary = String(summaryText || "").trim();
    if (!normalizedEntryId || !normalizedSummary) {
      return;
    }

    state.prefetchedSummaries.delete(normalizedEntryId);
    state.prefetchedSummaries.set(normalizedEntryId, normalizedSummary);
    upsertPrefetchDebugEntry(normalizedEntryId, feedId, "ready");

    while (state.prefetchedSummaries.size > PREFETCHED_SUMMARY_LIMIT) {
      const oldestEntryId = state.prefetchedSummaries.keys().next().value;
      if (!oldestEntryId) {
        break;
      }
      state.prefetchedSummaries.delete(oldestEntryId);
      const debugEntry = state.prefetchDebugEntries.get(oldestEntryId);
      if (debugEntry?.status === "ready") {
        state.prefetchDebugEntries.delete(oldestEntryId);
      }
    }

    scheduleDebugRefresh();
  }

  function clearEphemeralSummaryState(entryId) {
    const normalizedEntryId = String(entryId || "").trim();
    if (!normalizedEntryId) {
      return;
    }

    const debugEntry = state.prefetchDebugEntries.get(normalizedEntryId);
    if (!debugEntry || debugEntry.status !== "ready") {
      return;
    }

    state.prefetchDebugEntries.delete(normalizedEntryId);
    scheduleDebugRefresh();
  }

  function markPrefetchFetching(entryId, feedId) {
    upsertPrefetchDebugEntry(entryId, feedId, "fetching");
    scheduleDebugRefresh();
  }

  function clearFetchingPrefetchState(entryId) {
    const normalizedEntryId = String(entryId || "").trim();
    if (!normalizedEntryId) {
      return;
    }

    const entry = state.prefetchDebugEntries.get(normalizedEntryId);
    if (!entry || entry.status !== "fetching") {
      return;
    }

    state.prefetchDebugEntries.delete(normalizedEntryId);
    scheduleDebugRefresh();
  }

  function upsertPrefetchDebugEntry(entryId, feedId, status) {
    const normalizedEntryId = String(entryId || "").trim();
    const normalizedFeedId = String(feedId || "").trim();
    if (!normalizedEntryId) {
      return;
    }

    const previousEntry = state.prefetchDebugEntries.get(normalizedEntryId);
    state.prefetchDebugEntries.delete(normalizedEntryId);
    state.prefetchDebugEntries.set(normalizedEntryId, {
      status,
      feedId: normalizedFeedId || previousEntry?.feedId || ""
    });

    while (state.prefetchDebugEntries.size > PREFETCHED_SUMMARY_LIMIT * 4) {
      const oldestEntryId = state.prefetchDebugEntries.keys().next().value;
      if (!oldestEntryId) {
        break;
      }
      state.prefetchDebugEntries.delete(oldestEntryId);
    }
  }

  function scheduleDebugRefresh() {
    if (!state.prefetchDebugVisualizationEnabled) {
      return;
    }

    scheduleRefresh();
  }

  function syncPrefetchDebugIndicators(context) {
    if (!state.prefetchDebugVisualizationEnabled) {
      removePrefetchDebugIndicators();
      return;
    }

    syncArticlePrefetchIndicators(context);
    syncFeedPrefetchIndicators();
  }

  function syncArticlePrefetchIndicators(context) {
    const rows = Array.from(document.querySelectorAll(ENTRY_ROW_SELECTOR));
    const visibleEntryIds = new Set();

    for (const row of rows) {
      const entryId = row.getAttribute("data-entry-id") || "";
      const feedId = extractFeedId(row, row) || extractRowFeedId(row);
      if (!entryId || !feedId) {
        removeDotFromTarget(resolveArticleIndicatorTarget(row));
        continue;
      }

      visibleEntryIds.add(entryId);
      const stateValue = getArticlePrefetchIndicatorState(entryId, feedId, context);
      const target = resolveArticleIndicatorTarget(row);
      if (!stateValue) {
        removeDotFromTarget(target);
        continue;
      }

      upsertPrefetchDot(target, stateValue, "article");
    }

    for (const [entryId, entry] of state.prefetchDebugEntries.entries()) {
      if (!visibleEntryIds.has(entryId) && entry.status === "fetching") {
        state.prefetchDebugEntries.delete(entryId);
      }
    }
  }

  function syncFeedPrefetchIndicators() {
    const visibleFeedStates = new Map();
    const visibleFeedCounts = new Map();
    const memoryFeedStates = new Map();
    const selectedFeedId = getSelectedFeedId();
    for (const row of document.querySelectorAll(ENTRY_ROW_SELECTOR)) {
      const entryId = row.getAttribute("data-entry-id") || "";
      const feedId = extractFeedId(row, row) || extractRowFeedId(row);
      if (!entryId || !feedId) {
        continue;
      }

      const stateValue = getArticlePrefetchIndicatorState(entryId, feedId, null);
      if (!stateValue) {
        continue;
      }

      visibleFeedCounts.set(feedId, (visibleFeedCounts.get(feedId) || 0) + 1);
      visibleFeedStates.set(feedId, mergeIndicatorStates(visibleFeedStates.get(feedId) || "", stateValue));
    }

    for (const [entryId, entry] of state.prefetchDebugEntries.entries()) {
      if (!entry.feedId) {
        continue;
      }

      if (entry.status === "fetching") {
        memoryFeedStates.set(entry.feedId, mergeIndicatorStates(memoryFeedStates.get(entry.feedId) || "", "fetching"));
        continue;
      }

      if (entry.status === "ready" && getPrefetchedSummary(entryId)) {
        memoryFeedStates.set(entry.feedId, mergeIndicatorStates(memoryFeedStates.get(entry.feedId) || "", "ready"));
      }
    }

    for (const feedItem of document.querySelectorAll(FEED_ITEM_SELECTOR)) {
      const feedId = feedItem.getAttribute("data-feed-id") || "";
      const target = resolveFeedIndicatorTarget(feedItem);
      const stateValue = getFeedPrefetchIndicatorState(
        feedId,
        visibleFeedStates,
        visibleFeedCounts,
        memoryFeedStates,
        selectedFeedId
      );
      removeExtraFeedDots(feedItem, target);
      if (!stateValue) {
        removeDotFromTarget(target);
        continue;
      }

      upsertPrefetchDot(target, stateValue, "feed");
    }
  }

  function removePrefetchDebugIndicators() {
    clearAllDotRemovalTimers();
    for (const dot of document.querySelectorAll(`.${PREFETCH_DEBUG_DOT_CLASS}`)) {
      dot.remove();
    }
  }

  function getArticlePrefetchIndicatorState(entryId, feedId, context) {
    if (!state.summaryFeedPreferences[feedId]) {
      return "";
    }

    const debugEntry = state.prefetchDebugEntries.get(entryId);
    if (debugEntry?.status === "fetching") {
      return "fetching";
    }

    if (getPrefetchedSummary(entryId)) {
      return "ready";
    }

    if (state.pendingRequest && state.pendingRequest.entryId === entryId) {
      return "fetching";
    }

    if (context && context.entryId === entryId && state.activeSummary && state.activeSummary.entryId === entryId) {
      return "ready";
    }

    return "eligible";
  }

  function getFeedPrefetchIndicatorState(feedId, visibleFeedStates, visibleFeedCounts, memoryFeedStates, selectedFeedId) {
    if (!feedId || !state.summaryFeedPreferences[feedId]) {
      return "";
    }

    const hasVisibleRows = (visibleFeedCounts.get(feedId) || 0) > 0;
    let stateValue =
      feedId === selectedFeedId && hasVisibleRows
        ? visibleFeedStates.get(feedId) || ""
        : mergeIndicatorStates(memoryFeedStates.get(feedId) || "", visibleFeedStates.get(feedId) || "");

    if (state.pendingRequest && state.pendingRequest.feedId === feedId) {
      stateValue = mergeIndicatorStates(stateValue, "fetching");
    }

    if (state.activeSummary && state.activeSummary.feedId === feedId) {
      stateValue = mergeIndicatorStates(stateValue, "ready");
    }

    return stateValue || "eligible";
  }

  function mergeIndicatorStates(currentState, nextState) {
    const currentPriority = getIndicatorPriority(currentState);
    const nextPriority = getIndicatorPriority(nextState);
    return nextPriority > currentPriority ? nextState : currentState;
  }

  function getIndicatorPriority(stateValue) {
    switch (stateValue) {
      case "fetching":
        return 3;
      case "ready":
        return 2;
      case "eligible":
        return 1;
      default:
        return 0;
    }
  }

  function resolveFeedIndicatorTarget(feedItem) {
    if (!(feedItem instanceof HTMLElement)) {
      return null;
    }

    const selectors = [
      ".feed-label",
      ".feed-link .collection-label",
      ".feed-link .collection-label-wrap",
      ".feed-link .title",
      ".feed-link .label",
      ".feed-link .name",
      ".collection-label",
      ".collection-label-wrap",
      ".label",
      ".name",
      ".title",
      ".feed-link"
    ];

    for (const selector of selectors) {
      const match = feedItem.querySelector(selector);
      if (match instanceof HTMLElement) {
        return match;
      }
    }

    return feedItem.querySelector(".feed-link") || feedItem;
  }

  function resolveArticleIndicatorTarget(row) {
    if (!(row instanceof HTMLElement)) {
      return null;
    }

    const selectors = [
      ".meta .time",
      ".meta time",
      ".meta .date",
      "time",
      ".time",
      ".date",
      ".timestamp",
      ".published",
      ".entry-meta",
      ".meta"
    ];

    for (const selector of selectors) {
      const match = row.querySelector(selector);
      if (match instanceof HTMLElement) {
        return match;
      }
    }

    return row.querySelector(ENTRY_ROW_LINK_SELECTOR) || row;
  }

  function upsertPrefetchDot(target, stateValue, kind) {
    if (!(target instanceof HTMLElement)) {
      return;
    }

    let dot = target.querySelector(`:scope > .${PREFETCH_DEBUG_DOT_CLASS}`);
    if (!dot) {
      dot = document.createElement("span");
      dot.className = `${PREFETCH_DEBUG_DOT_CLASS} ${PREFETCH_DEBUG_DOT_CLASS}--${kind}`;
      dot.setAttribute("aria-hidden", "true");
      target.append(dot);
    }
    cancelDotRemoval(dot);

    if (dot.dataset.state !== stateValue) {
      dot.dataset.state = stateValue;
    }

    const title = getPrefetchDebugLabel(stateValue);
    if (dot.title !== title) {
      dot.title = title;
    }
  }

  function removeDotFromTarget(target) {
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const dot = target.querySelector(`:scope > .${PREFETCH_DEBUG_DOT_CLASS}`);
    if (!dot) {
      return;
    }

    scheduleDotRemoval(dot);
  }

  function removeExtraFeedDots(feedItem, target) {
    if (!(feedItem instanceof HTMLElement)) {
      return;
    }

    for (const dot of feedItem.querySelectorAll(`.${PREFETCH_DEBUG_DOT_CLASS}--feed`)) {
      if (target instanceof HTMLElement && dot.parentElement === target) {
        continue;
      }

      dot.remove();
    }
  }

  function scheduleDotRemoval(dot) {
    if (!(dot instanceof HTMLElement)) {
      return;
    }

    cancelDotRemoval(dot);
    const timer = window.setTimeout(() => {
      if (state.prefetchDotRemovalTimers.get(dot) !== timer) {
        return;
      }

      state.prefetchDotRemovalTimers.delete(dot);
      dot.remove();
    }, 120);

    state.prefetchDotRemovalTimers.set(dot, timer);
  }

  function cancelDotRemoval(dot) {
    const timer = state.prefetchDotRemovalTimers.get(dot);
    if (!timer) {
      return;
    }

    window.clearTimeout(timer);
    state.prefetchDotRemovalTimers.delete(dot);
  }

  function clearAllDotRemovalTimers() {
    for (const timer of state.prefetchDotRemovalTimers.values()) {
      window.clearTimeout(timer);
    }

    state.prefetchDotRemovalTimers.clear();
  }

  function getPrefetchDebugLabel(stateValue) {
    switch (stateValue) {
      case "fetching":
        return "Prefetch in progress";
      case "ready":
        return "Prefetched or cached";
      default:
        return "Prefetch enabled";
    }
  }

  function clearPrefetchedSummaries() {
    state.prefetchedSummaries.clear();
    state.prefetchDebugEntries.clear();
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
      state.summaryCacheEnabled = message.payload?.summaryCacheEnabled !== false;
      state.prefetchDebugVisualizationEnabled = Boolean(message.payload?.prefetchDebugVisualizationEnabled);
      if (message.payload?.clearPrefetchedSummaries !== false) {
        clearPrefetchedSummaries();
      }
      scheduleRefresh();
    }
  }
})();
