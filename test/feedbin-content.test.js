import assert from "node:assert/strict";
import test from "node:test";

import { importFresh, waitFor, withJSDOM } from "../test-support/dom-test-helpers.js";

const FEEDBIN_FIXTURE = `
<!doctype html>
<html>
  <body>
    <nav class="feeds-target feed-list">
      <li data-feed-id="42">
        <a class="feed-link selected" data-feed-id="42">
          <span class="collection-label-wrap" data-feed-id="42">
            <span class="collection-label renamed" data-feed-id="42">Test Feed</span>
          </span>
          <span class="count">1</span>
        </a>
      </li>
    </nav>
    <ul class="entries-target">
      <li class="entry-summary unread entry-feed-42" data-entry-id="entry-2" data-feed-id="42">
        <a class="entry-summary-link" data-url="https://example.com/another-story">
          <span class="title">Another story</span>
          <span class="time">2h</span>
        </a>
      </li>
    </ul>
    <div class="entry-wrapper entry-feed-42" data-entry-id="entry-1" data-feed-id="42">
      <div class="entry-toolbar">
        <div class="entry-buttons">
          <div class="entry-button-wrap">
            <button type="button" class="entry-button" style="color: rgb(24, 31, 42);">Native</button>
          </div>
          <form data-behavior="toggle_extract" data-entry-id="entry-1">
            <div class="entry-button-wrap">
              <button type="button" class="entry-button">Extract</button>
            </div>
          </form>
        </div>
      </div>
      <article class="entry-content current" data-feed-id="42">
        <header class="entry-header">
          <h1>Test Article</h1>
        </header>
        <a id="source_link" href="https://example.com/story">Source</a>
        <div class="content-styles">
          <p>Original article body.</p>
        </div>
      </article>
    </div>
  </body>
</html>
`;

const CROSS_FEED_ACTIVE_ARTICLE_FIXTURE = FEEDBIN_FIXTURE
  .replace(
    '<div class="entry-wrapper entry-feed-42" data-entry-id="entry-1" data-feed-id="42">',
    '<div class="entry-wrapper entry-feed-99" data-entry-id="entry-1" data-feed-id="99">'
  )
  .replace(
    '<article class="entry-content current" data-feed-id="42">',
    '<article class="entry-content current" data-feed-id="99">'
  );

const SELECTED_FEED_MULTI_ENTRY_FIXTURE = FEEDBIN_FIXTURE.replace(
  '<ul class="entries-target">\n      <li class="entry-summary unread entry-feed-42" data-entry-id="entry-2" data-feed-id="42">\n        <a class="entry-summary-link" data-url="https://example.com/another-story">\n          <span class="title">Another story</span>\n          <span class="time">2h</span>\n        </a>\n      </li>\n    </ul>',
  `<ul class="entries-target">
      <li class="entry-summary unread entry-feed-42" data-entry-id="entry-2" data-feed-id="42">
        <a class="entry-summary-link" data-url="https://example.com/another-story">
          <span class="title">Another story</span>
          <span class="summary-inner">Summary 2</span>
          <span class="time">2h</span>
        </a>
      </li>
      <li class="entry-summary unread entry-feed-42" data-entry-id="entry-3" data-feed-id="42">
        <a class="entry-summary-link" data-url="https://example.com/third-story">
          <span class="title">Third story</span>
          <span class="summary-inner">Summary 3</span>
          <span class="time">3h</span>
        </a>
      </li>
      <li class="entry-summary unread entry-feed-42" data-entry-id="entry-4" data-feed-id="42">
        <a class="entry-summary-link" data-url="https://example.com/fourth-story">
          <span class="title">Fourth story</span>
          <span class="summary-inner">Summary 4</span>
          <span class="time">4h</span>
        </a>
      </li>
    </ul>`
);

const MULTI_FEED_UNREAD_FIXTURE = `
<!doctype html>
<html>
  <body>
    <nav class="feeds-target feed-list">
      <li data-feed-id="99">
        <a class="feed-link selected" data-feed-id="99">
          <span class="collection-label-wrap" data-feed-id="99">
            <span class="collection-label renamed" data-feed-id="99">Current Feed</span>
          </span>
          <span class="count">1</span>
        </a>
      </li>
      <li data-feed-id="42">
        <a class="feed-link" data-feed-id="42">
          <span class="collection-label-wrap" data-feed-id="42">
            <span class="collection-label renamed" data-feed-id="42">Prefetch Feed</span>
          </span>
          <span class="count">6</span>
        </a>
      </li>
    </nav>
    <ul class="entries-target">
      <li class="entry-summary unread entry-feed-42" data-entry-id="entry-2" data-feed-id="42">
        <a class="entry-summary-link" data-url="https://example.com/feed-42-story-1">
          <span class="title">Feed 42 story 1</span>
          <span class="summary-inner">Summary 1</span>
          <span class="time">1m</span>
        </a>
      </li>
      <li class="entry-summary unread entry-feed-42" data-entry-id="entry-3" data-feed-id="42">
        <a class="entry-summary-link" data-url="https://example.com/feed-42-story-2">
          <span class="title">Feed 42 story 2</span>
          <span class="summary-inner">Summary 2</span>
          <span class="time">2m</span>
        </a>
      </li>
      <li class="entry-summary unread entry-feed-42" data-entry-id="entry-4" data-feed-id="42">
        <a class="entry-summary-link" data-url="https://example.com/feed-42-story-3">
          <span class="title">Feed 42 story 3</span>
          <span class="summary-inner">Summary 3</span>
          <span class="time">3m</span>
        </a>
      </li>
      <li class="entry-summary unread entry-feed-42" data-entry-id="entry-5" data-feed-id="42">
        <a class="entry-summary-link" data-url="https://example.com/feed-42-story-4">
          <span class="title">Feed 42 story 4</span>
          <span class="summary-inner">Summary 4</span>
          <span class="time">4m</span>
        </a>
      </li>
    </ul>
    <div class="entry-wrapper entry-feed-99" data-entry-id="entry-1" data-feed-id="99">
      <div class="entry-toolbar">
        <div class="entry-buttons">
          <div class="entry-button-wrap">
            <button type="button" class="entry-button" style="color: rgb(24, 31, 42);">Native</button>
          </div>
          <form data-behavior="toggle_extract" data-entry-id="entry-1">
            <div class="entry-button-wrap">
              <button type="button" class="entry-button">Extract</button>
            </div>
          </form>
        </div>
      </div>
      <article class="entry-content current" data-feed-id="99">
        <header class="entry-header">
          <h1>Current Article</h1>
        </header>
        <a id="source_link" href="https://example.com/current-story">Source</a>
        <div class="content-styles">
          <p>Current article body.</p>
        </div>
      </article>
    </div>
  </body>
</html>
`;

test("content script injects the summary button, matches toolbar color, expands with More, and toggles summary content", async () => {
  await withJSDOM(FEEDBIN_FIXTURE, async () => {
    const sentMessages = [];
    const runtimeListeners = [];

    globalThis.chrome = {
      runtime: {
        onMessage: {
          addListener(listener) {
            runtimeListeners.push(listener);
          }
        },
        sendMessage(message, callback) {
          sentMessages.push(message);

          setTimeout(() => {
            if (message.type === "getFeedbinState") {
              callback({
                ok: true,
                result: {
                  summaryFeedPreferences: {}
                }
              });
              return;
            }

            if (message.type === "setFeedSummaryPreference") {
              callback({
                ok: true,
                result: {
                  summaryFeedPreferences: message.payload.enabled ? { 42: true } : {}
                }
              });
              return;
            }

            if (message.type === "summarizeArticle" && message.payload.summaryMode === "expanded") {
              callback({
                ok: true,
                result: {
                  summaryText: "Extra detail paragraph.\\n\\nAdditional implication paragraph."
                }
              });
              return;
            }

            if (message.type === "summarizeArticle") {
              callback({
                ok: true,
                result: {
                  summaryText: "Short summary paragraph.\\n\\nSecond paragraph."
                }
              });
              return;
            }

            callback({ ok: true, result: {} });
          }, 0);
        }
      }
    };

    await importFresh("content/feedbin.js");
    const button = await waitFor(() => {
      const nextButton = document.getElementById("feedbin-summarizer-toolbar-button");
      return nextButton?.dataset?.feedbinSummarizerBound === "true" ? nextButton : null;
    });
    const body = document.querySelector(".content-styles");

    assert.ok(button);
    assert.equal(runtimeListeners.length, 1);
    assert.equal(
      button.style.getPropertyValue("--feedbin-summarizer-icon-off-color"),
      "rgb(24, 31, 42)"
    );

    button.click();
    await waitFor(() => /Short summary paragraph/.test(body.innerHTML));

    assert.match(body.innerHTML, /<p>Short summary paragraph\.<\/p>/);
    assert.match(body.innerHTML, /<p>Second paragraph\.<\/p>/);
    const moreLink = body.querySelector(".feedbin-summarizer-more-link");
    assert.ok(moreLink);
    assert.match(moreLink.textContent || "", /More/);
    assert.equal(button.classList.contains("is-active"), true);
    assert.ok(sentMessages.some(message => message.type === "summarizeArticle"));

    moreLink.click();
    await waitFor(() => /Extra detail paragraph/.test(body.innerHTML));

    assert.match(body.innerHTML, /Short summary paragraph/);
    assert.match(body.innerHTML, /Second paragraph/);
    assert.match(body.innerHTML, /Extra detail paragraph/);
    assert.match(body.innerHTML, /Additional implication paragraph/);
    assert.equal(body.querySelector(".feedbin-summarizer-more-link"), null);
    assert.ok(
      sentMessages.some(
        message =>
          message.type === "summarizeArticle" &&
          message.payload.summaryMode === "expanded" &&
          /Short summary paragraph\./.test(message.payload.existingSummaryText) &&
          /Second paragraph\./.test(message.payload.existingSummaryText)
      )
    );

    button.click();
    await waitFor(() => /Original article body/.test(body.innerHTML));

    assert.match(body.innerHTML, /Original article body/);
    assert.equal(button.classList.contains("is-active"), false);
  });
});

test("content script fetches a fresh summary after toggling off when cache is disabled", async () => {
  await withJSDOM(FEEDBIN_FIXTURE, async () => {
    const sentMessages = [];
    let summaryRequestCount = 0;

    globalThis.chrome = {
      runtime: {
        onMessage: {
          addListener() {}
        },
        sendMessage(message, callback) {
          sentMessages.push(message);

          setTimeout(() => {
            if (message.type === "getFeedbinState") {
              callback({
                ok: true,
                result: {
                  summaryFeedPreferences: {},
                  summaryCacheEnabled: false
                }
              });
              return;
            }

            if (message.type === "setFeedSummaryPreference") {
              callback({
                ok: true,
                result: {
                  summaryFeedPreferences: message.payload.enabled ? { 42: true } : {}
                }
              });
              return;
            }

            if (message.type === "summarizeArticle") {
              summaryRequestCount += 1;
              callback({
                ok: true,
                result: {
                  summaryText: `Fresh summary ${summaryRequestCount}.`
                }
              });
              return;
            }

            callback({ ok: true, result: {} });
          }, 0);
        }
      }
    };

    await importFresh("content/feedbin.js");
    const button = await waitFor(() => {
      const nextButton = document.getElementById("feedbin-summarizer-toolbar-button");
      return nextButton?.dataset?.feedbinSummarizerBound === "true" ? nextButton : null;
    });
    const body = document.querySelector(".content-styles");

    button.click();
    await waitFor(() => /Fresh summary 1\./.test(body.innerHTML));

    button.click();
    await waitFor(() => /Original article body/.test(body.innerHTML));

    button.click();
    await waitFor(() => /Fresh summary 2\./.test(body.innerHTML));

    assert.equal(sentMessages.filter(message => message.type === "summarizeArticle").length, 2);
  });
});

test("content script refreshes an in-memory summary when richer article text becomes available", async () => {
  const shortFixture = FEEDBIN_FIXTURE.replace("Original article body.", "Short teaser.");

  await withJSDOM(shortFixture, async () => {
    let summaryRequestCount = 0;

    globalThis.chrome = {
      runtime: {
        onMessage: {
          addListener() {}
        },
        sendMessage(message, callback) {
          setTimeout(() => {
            if (message.type === "getFeedbinState") {
              callback({
                ok: true,
                result: {
                  summaryFeedPreferences: {},
                  summaryCacheEnabled: true
                }
              });
              return;
            }

            if (message.type === "setFeedSummaryPreference") {
              callback({
                ok: true,
                result: {
                  summaryFeedPreferences: message.payload.enabled ? { 42: true } : {}
                }
              });
              return;
            }

            if (message.type === "summarizeArticle") {
              summaryRequestCount += 1;
              callback({
                ok: true,
                result: {
                  summaryText: summaryRequestCount === 1 ? "Summary from teaser." : "Summary from full text.",
                  inputTextLength: summaryRequestCount === 1 ? 13 : 2500,
                  inputWordCount: summaryRequestCount === 1 ? 2 : 420,
                  contentSourceKind: "feedbin-visible",
                  cacheable: true
                }
              });
              return;
            }

            callback({ ok: true, result: {} });
          }, 0);
        }
      }
    };

    await importFresh("content/feedbin.js");
    const button = await waitFor(() => {
      const nextButton = document.getElementById("feedbin-summarizer-toolbar-button");
      return nextButton?.dataset?.feedbinSummarizerBound === "true" ? nextButton : null;
    });
    const body = document.querySelector(".content-styles");

    button.click();
    await waitFor(() => /Summary from teaser/.test(body.innerHTML));

    button.click();
    await waitFor(() => /Short teaser/.test(body.innerHTML));

    body.innerHTML = `<p>${Array.from({ length: 420 }, () => "fulltext").join(" ")}</p>`;
    button.click();
    await waitFor(() => /Summary from full text/.test(body.innerHTML));

    assert.equal(summaryRequestCount, 2);
  });
});

test("content script does not automatically replace a stale warm summary after article selection", async () => {
  await withJSDOM(CROSS_FEED_ACTIVE_ARTICLE_FIXTURE, async () => {
    const sentMessages = [];

    globalThis.chrome = {
      runtime: {
        onMessage: {
          addListener() {}
        },
        sendMessage(message, callback) {
          sentMessages.push(message);

          setTimeout(() => {
            if (message.type === "getFeedbinState") {
              callback({
                ok: true,
                result: {
                  summaryFeedPreferences: { 42: true },
                  summaryCacheEnabled: true
                }
              });
              return;
            }

            if (message.type === "checkCachedSummaries") {
              callback({
                ok: true,
                result: {
                  cachedEntryIds: [],
                  cachedSummaries: []
                }
              });
              return;
            }

            if (message.type === "prefetchArticle") {
              callback({
                ok: true,
                result: {
                  summaryText: "Warm snippet summary.",
                  inputTextLength: 20,
                  inputWordCount: 3,
                  contentSourceKind: "feedbin-visible",
                  cacheable: true
                }
              });
              return;
            }

            if (message.type === "summarizeArticle") {
              callback({
                ok: true,
                result: {
                  summaryText: "Fresh full article summary.",
                  inputTextLength: 2500,
                  inputWordCount: 420,
                  contentSourceKind: "feedbin-full-content",
                  cacheable: true
                }
              });
              return;
            }

            callback({ ok: true, result: {} });
          }, 0);
        }
      }
    };

    await importFresh("content/feedbin.js");
    await waitFor(() => sentMessages.some(message => message.type === "prefetchArticle"));

    const entryWrapper = document.querySelector(".entry-wrapper");
    const currentEntry = document.querySelector(".entry-content.current");
    const title = document.querySelector("header.entry-header h1");
    const sourceLink = document.querySelector("#source_link");
    const body = document.querySelector(".content-styles");
    const button = await waitFor(() => document.getElementById("feedbin-summarizer-toolbar-button"));

    entryWrapper.className = "entry-wrapper entry-feed-42";
    entryWrapper.setAttribute("data-entry-id", "entry-2");
    entryWrapper.setAttribute("data-feed-id", "42");
    currentEntry.setAttribute("data-feed-id", "42");
    title.textContent = "Another story";
    sourceLink.setAttribute("href", "https://example.com/another-story");
    body.innerHTML = `<p>${Array.from({ length: 420 }, () => "fulltext").join(" ")}</p>`;

    await waitFor(() => button.dataset.entryId === "entry-2");
    await waitFor(() => /Warm snippet summary/.test(body.innerHTML));
    await new Promise(resolve => setTimeout(resolve, 250));

    assert.equal(sentMessages.some(message => message.type === "summarizeArticle"), false);
    assert.match(body.innerHTML, /Warm snippet summary/);
    assert.doesNotMatch(body.innerHTML, /Fresh full article summary/);
  });
});

test("content script shows minimal prefetch debug dots for enabled feeds and articles", async () => {
  await withJSDOM(FEEDBIN_FIXTURE, async () => {
    globalThis.chrome = {
      runtime: {
        onMessage: {
          addListener() {}
        },
        sendMessage(message, callback) {
          setTimeout(() => {
            if (message.type === "getFeedbinState") {
              callback({
                ok: true,
                result: {
                  summaryFeedPreferences: { 42: true },
                  prefetchDebugVisualizationEnabled: true
                }
              });
              return;
            }

            callback({ ok: true, result: {} });
          }, 0);
        }
      }
    };

    await importFresh("content/feedbin.js");
    const feedDot = await waitFor(() => document.querySelector(".feedbin-summarizer-prefetch-dot--feed"));
    const articleDot = await waitFor(() => document.querySelector(".feedbin-summarizer-prefetch-dot--article"));

    assert.equal(feedDot.dataset.state, "eligible");
    assert.equal(document.querySelectorAll(".feedbin-summarizer-prefetch-dot--feed").length, 1);
    assert.equal(feedDot.parentElement?.classList.contains("collection-label"), true);
    assert.equal(articleDot.dataset.state, "eligible");
  });
});

test("content script shows a feed-level prefetch dot once a feed has ready summaries", async () => {
  await withJSDOM(FEEDBIN_FIXTURE, async () => {
    globalThis.chrome = {
      runtime: {
        onMessage: {
          addListener() {}
        },
        sendMessage(message, callback) {
          setTimeout(() => {
            if (message.type === "getFeedbinState") {
              callback({
                ok: true,
                result: {
                  summaryFeedPreferences: { 42: true },
                  prefetchDebugVisualizationEnabled: true
                }
              });
              return;
            }

            if (message.type === "setFeedSummaryPreference") {
              callback({
                ok: true,
                result: {
                  summaryFeedPreferences: { 42: true }
                }
              });
              return;
            }

            if (message.type === "summarizeArticle") {
              callback({
                ok: true,
                result: {
                  summaryText: "Prefetched summary"
                }
              });
              return;
            }

            callback({ ok: true, result: {} });
          }, 0);
        }
      }
    };

    await importFresh("content/feedbin.js");
    const button = await waitFor(() => {
      const nextButton = document.getElementById("feedbin-summarizer-toolbar-button");
      return nextButton?.dataset?.feedbinSummarizerBound === "true" ? nextButton : null;
    });

    button.click();
    const feedDot = await waitFor(() => {
      const dot = document.querySelector(".feedbin-summarizer-prefetch-dot--feed");
      return dot?.dataset.state === "ready" ? dot : null;
    });

    assert.equal(feedDot.dataset.state, "ready");
    assert.equal(document.querySelectorAll(".feedbin-summarizer-prefetch-dot--feed").length, 1);
    assert.equal(feedDot.parentElement?.classList.contains("collection-label"), true);
  });
});

test("feed-level prefetch dot stays ready after a provisional article summary is hidden", async () => {
  await withJSDOM(FEEDBIN_FIXTURE, async () => {
    globalThis.chrome = {
      runtime: {
        onMessage: {
          addListener() {}
        },
        sendMessage(message, callback) {
          setTimeout(() => {
            if (message.type === "getFeedbinState") {
              callback({
                ok: true,
                result: {
                  summaryFeedPreferences: { 42: true },
                  prefetchDebugVisualizationEnabled: true
                }
              });
              return;
            }

            if (message.type === "setFeedSummaryPreference") {
              callback({
                ok: true,
                result: {
                  summaryFeedPreferences: { 42: true }
                }
              });
              return;
            }

            if (message.type === "summarizeArticle") {
              callback({
                ok: true,
                result: {
                  summaryText: "Current article summary"
                }
              });
              return;
            }

            callback({ ok: true, result: {} });
          }, 0);
        }
      }
    };

    await importFresh("content/feedbin.js");
    const button = await waitFor(() => document.getElementById("feedbin-summarizer-toolbar-button"));

    button.click();
    await waitFor(() => {
      const dot = document.querySelector(".feedbin-summarizer-prefetch-dot--feed");
      return dot?.dataset.state === "ready" ? dot : null;
    });

    button.click();
    const feedDot = await waitFor(() => {
      const dot = document.querySelector(".feedbin-summarizer-prefetch-dot--feed");
      return dot?.dataset.state === "ready" ? dot : null;
    });

    assert.equal(feedDot.dataset.state, "ready");
  });
});

test("content script retries auto-summary once source metadata arrives", async () => {
  const lateSourceFixture = FEEDBIN_FIXTURE
    .replace('<a id="source_link" href="https://example.com/story">Source</a>', "")
    .replace("<p>Original article body.</p>", "Loading full content...");

  await withJSDOM(lateSourceFixture, async () => {
    const sentMessages = [];

    globalThis.chrome = {
      runtime: {
        onMessage: {
          addListener() {}
        },
        sendMessage(message, callback) {
          sentMessages.push(message);

          setTimeout(() => {
            if (message.type === "getFeedbinState") {
              callback({
                ok: true,
                result: {
                  summaryFeedPreferences: { 42: true }
                }
              });
              return;
            }

            if (message.type === "summarizeArticle") {
              callback({
                ok: true,
                result: {
                  summaryText: "Auto summary after source appeared."
                }
              });
              return;
            }

            callback({ ok: true, result: {} });
          }, 0);
        }
      }
    };

    await importFresh("content/feedbin.js");
    const body = document.querySelector(".content-styles");

    await waitFor(() => document.getElementById("feedbin-summarizer-toolbar-button"));
    assert.equal(sentMessages.some(message => message.type === "summarizeArticle"), false);

    const sourceLink = document.createElement("a");
    sourceLink.id = "source_link";
    sourceLink.href = "https://example.com/story";
    sourceLink.textContent = "Source";
    document.querySelector(".entry-header")?.insertAdjacentElement("afterend", sourceLink);

    await waitFor(() => sentMessages.some(message => message.type === "summarizeArticle"));
    await waitFor(() => /Auto summary after source appeared/.test(body.innerHTML));

    const summaryMessage = sentMessages.find(message => message.type === "summarizeArticle");
    assert.equal(summaryMessage.payload.sourceUrl, "https://example.com/story");
  });
});

test("prefetched swap stays armed until the target cached article becomes current", async () => {
  await withJSDOM(FEEDBIN_FIXTURE, async () => {
    globalThis.chrome = {
      runtime: {
        onMessage: {
          addListener() {}
        },
        sendMessage(message, callback) {
          setTimeout(() => {
            if (message.type === "getFeedbinState") {
              callback({
                ok: true,
                result: {
                  summaryFeedPreferences: { 42: true }
                }
              });
              return;
            }

            if (message.type === "setFeedSummaryPreference") {
              callback({
                ok: true,
                result: {
                  summaryFeedPreferences: { 42: true }
                }
              });
              return;
            }

            if (message.type === "summarizeArticle") {
              callback({
                ok: true,
                result: {
                  summaryText: message.payload.entryId === "entry-2" ? "Second article summary" : "First article summary"
                }
              });
              return;
            }

            callback({ ok: true, result: {} });
          }, 0);
        }
      }
    };

    await importFresh("content/feedbin.js");

    const button = await waitFor(() => document.getElementById("feedbin-summarizer-toolbar-button"));
    const row = document.querySelector('li.entry-summary[data-entry-id="entry-2"]');
    const entryWrapper = document.querySelector(".entry-wrapper");
    const currentEntry = document.querySelector(".entry-content.current");
    const title = document.querySelector("header.entry-header h1");
    const sourceLink = document.querySelector("#source_link");
    const body = document.querySelector(".content-styles");

    entryWrapper.setAttribute("data-entry-id", "entry-2");
    currentEntry.setAttribute("data-feed-id", "42");
    title.textContent = "Another story";
    sourceLink.setAttribute("href", "https://example.com/another-story");
    body.innerHTML = "<p>Original second article body.</p>";
    await waitFor(() => button.dataset.entryId === "entry-2");

    button.click();
    await waitFor(() => /Second article summary/.test(body.innerHTML));

    entryWrapper.setAttribute("data-entry-id", "entry-1");
    currentEntry.setAttribute("data-feed-id", "42");
    title.textContent = "Test Article";
    sourceLink.setAttribute("href", "https://example.com/story");
    body.innerHTML = "<p>Original article body.</p>";
    await waitFor(() => button.dataset.entryId === "entry-1");

    button.click();
    await waitFor(() => /First article summary/.test(body.innerHTML));

    row.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    currentEntry.classList.add("loading-next-entry");

    await waitFor(() => document.documentElement.classList.contains("feedbin-summarizer-preparing-swap"));

    entryWrapper.setAttribute("data-entry-id", "entry-2");
    currentEntry.classList.remove("loading-next-entry");
    currentEntry.setAttribute("data-feed-id", "42");
    title.textContent = "Another story";
    sourceLink.setAttribute("href", "https://example.com/another-story");
    body.innerHTML = "<p>Original second article body.</p>";

    await waitFor(() => button.dataset.entryId === "entry-2");
    await waitFor(() => /Second article summary/.test(body.innerHTML));
    assert.equal(document.documentElement.classList.contains("feedbin-summarizer-preparing-swap"), false);
  });
});

test("content script rebinds a stale existing summary button and keeps it clickable", async () => {
  const staleButtonFixture = FEEDBIN_FIXTURE.replace(
    '<form data-behavior="toggle_extract" data-entry-id="entry-1">',
    `<div class="entry-button-wrap feedbin-summarizer-button-wrap">
            <button id="feedbin-summarizer-toolbar-button" type="button" class="entry-button feedbin-summarizer-toolbar-button" title="Summarize article" aria-label="Summarize article"></button>
          </div>
          <form data-behavior="toggle_extract" data-entry-id="entry-1">`
  );

  await withJSDOM(staleButtonFixture, async () => {
    const sentMessages = [];

    globalThis.chrome = {
      runtime: {
        onMessage: {
          addListener() {}
        },
        sendMessage(message, callback) {
          sentMessages.push(message);

          setTimeout(() => {
            if (message.type === "getFeedbinState") {
              callback({
                ok: true,
                result: {
                  summaryFeedPreferences: {}
                }
              });
              return;
            }

            if (message.type === "setFeedSummaryPreference") {
              callback({
                ok: true,
                result: {
                  summaryFeedPreferences: { 42: true }
                }
              });
              return;
            }

            if (message.type === "summarizeArticle") {
              callback({
                ok: true,
                result: {
                  summaryText: "Recovered summary."
                }
              });
              return;
            }

            callback({ ok: true, result: {} });
          }, 0);
        }
      }
    };

    await importFresh("content/feedbin.js");
    const button = await waitFor(() => {
      const candidate = document.getElementById("feedbin-summarizer-toolbar-button");
      return candidate?.dataset.feedbinSummarizerBound === "true" ? candidate : null;
    });
    const body = document.querySelector(".content-styles");

    button.click();

    await waitFor(() => sentMessages.some(message => message.type === "summarizeArticle"));
    await waitFor(() => /Recovered summary/.test(body.innerHTML));

    assert.equal(button.dataset.feedbinSummarizerBound, "true");
  });
});

test("content script shows a refresh hint when the extension runtime is stale", async () => {
  await withJSDOM(FEEDBIN_FIXTURE, async () => {
    let summarizeAttemptCount = 0;
    const runtime = {
      lastError: null,
      onMessage: {
        addListener() {}
      },
      sendMessage(message, callback) {
        setTimeout(() => {
          if (message.type === "getFeedbinState") {
            callback({
              ok: true,
              result: {
                summaryFeedPreferences: {}
              }
            });
            return;
          }

          if (message.type === "setFeedSummaryPreference") {
            callback({
              ok: true,
              result: {
                summaryFeedPreferences: { 42: true }
              }
            });
            return;
          }

          if (message.type === "summarizeArticle") {
            summarizeAttemptCount += 1;
          }

          runtime.lastError = {
            message: "Could not establish connection. Receiving end does not exist."
          };
          callback();
          runtime.lastError = null;
        }, 0);
      }
    };

    globalThis.chrome = {
      runtime
    };

    await importFresh("content/feedbin.js");
    const button = await waitFor(() => document.getElementById("feedbin-summarizer-toolbar-button"));
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
      button.click();

      const notice = await waitFor(() => document.querySelector(".feedbin-summarizer-status-notice"));
      assert.match(
        notice.textContent || "",
        /Feedbin lost contact with the extension\. Refresh Feedbin and try Summary again\./
      );
      assert.ok(summarizeAttemptCount >= 2);
      await waitFor(() => !button.classList.contains("is-loading"));
    } finally {
      console.error = originalConsoleError;
    }
  });
});

test("content script retries a transient runtime disconnect before showing an error", async () => {
  await withJSDOM(FEEDBIN_FIXTURE, async () => {
    let summarizeAttemptCount = 0;

    globalThis.chrome = {
      runtime: {
        lastError: null,
        onMessage: {
          addListener() {}
        },
        sendMessage(message, callback) {
          setTimeout(() => {
            if (message.type === "getFeedbinState") {
              callback({
                ok: true,
                result: {
                  summaryFeedPreferences: {}
                }
              });
              return;
            }

            if (message.type === "setFeedSummaryPreference") {
              callback({
                ok: true,
                result: {
                  summaryFeedPreferences: { 42: true }
                }
              });
              return;
            }

            if (message.type === "summarizeArticle") {
              summarizeAttemptCount += 1;

              if (summarizeAttemptCount === 1) {
                globalThis.chrome.runtime.lastError = {
                  message: "Could not establish connection. Receiving end does not exist."
                };
                callback();
                globalThis.chrome.runtime.lastError = null;
                return;
              }

              callback({
                ok: true,
                result: {
                  summaryText: "Recovered summary."
                }
              });
              return;
            }

            callback({ ok: true, result: {} });
          }, 0);
        }
      }
    };

    await importFresh("content/feedbin.js");
    const button = await waitFor(() => document.getElementById("feedbin-summarizer-toolbar-button"));
    const body = document.querySelector(".content-styles");

    button.click();

    await waitFor(() => /Recovered summary/.test(body.innerHTML));

    assert.equal(summarizeAttemptCount, 2);
    assert.equal(document.querySelector(".feedbin-summarizer-status-notice"), null);
    assert.equal(button.classList.contains("is-loading"), false);
  });
});

test("manual summary cancels lower-priority prefetch before starting the on-demand request", async () => {
  await withJSDOM(CROSS_FEED_ACTIVE_ARTICLE_FIXTURE, async () => {
    const sentMessages = [];

    globalThis.chrome = {
      runtime: {
        onMessage: {
          addListener() {}
        },
        sendMessage(message, callback) {
          sentMessages.push(message);

          setTimeout(() => {
            if (message.type === "getFeedbinState") {
              callback({
                ok: true,
                result: {
                  summaryFeedPreferences: { 42: true }
                }
              });
              return;
            }

            if (message.type === "prefetchArticle") {
              return;
            }

            if (message.type === "cancelPrefetch") {
              callback({
                ok: true,
                result: {
                  cancelled: true
                }
              });
              return;
            }

            if (message.type === "setFeedSummaryPreference") {
              callback({
                ok: true,
                result: {
                  summaryFeedPreferences: { 42: true, 99: true }
                }
              });
              return;
            }

            if (message.type === "summarizeArticle") {
              callback({
                ok: true,
                result: {
                  summaryText: "Manual summary wins."
                }
              });
              return;
            }

            callback({ ok: true, result: {} });
          }, 0);
        }
      }
    };

    await importFresh("content/feedbin.js");
    const button = await waitFor(() => document.getElementById("feedbin-summarizer-toolbar-button"));
    const selectedFeedLink = document.querySelector(".feed-link.selected");
    const body = document.querySelector(".content-styles");

    selectedFeedLink.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await waitFor(() => sentMessages.some(message => message.type === "prefetchArticle"));

    button.click();

    await waitFor(() => sentMessages.some(message => message.type === "cancelPrefetch"));
    await waitFor(() => sentMessages.some(message => message.type === "summarizeArticle"));
    await waitFor(() => /Manual summary wins/.test(body.innerHTML));

    const cancelIndex = sentMessages.findIndex(message => message.type === "cancelPrefetch");
    const summarizeIndex = sentMessages.findIndex(message => message.type === "summarizeArticle");
    assert.notEqual(cancelIndex, -1);
    assert.notEqual(summarizeIndex, -1);
    assert.ok(cancelIndex < summarizeIndex);
  });
});

test("marking a prefetched article as read cancels its in-flight prefetch request", async () => {
  await withJSDOM(CROSS_FEED_ACTIVE_ARTICLE_FIXTURE, async () => {
    const sentMessages = [];

    globalThis.chrome = {
      runtime: {
        onMessage: {
          addListener() {}
        },
        sendMessage(message, callback) {
          sentMessages.push(message);

          setTimeout(() => {
            if (message.type === "getFeedbinState") {
              callback({
                ok: true,
                result: {
                  summaryFeedPreferences: { 42: true }
                }
              });
              return;
            }

            if (message.type === "prefetchArticle") {
              return;
            }

            if (message.type === "cancelPrefetch") {
              callback({
                ok: true,
                result: {
                  cancelled: true
                }
              });
              return;
            }

            callback({ ok: true, result: {} });
          }, 0);
        }
      }
    };

    await importFresh("content/feedbin.js");
    const selectedFeedLink = document.querySelector(".feed-link.selected");
    const row = document.querySelector('li.entry-summary[data-entry-id="entry-2"]');

    selectedFeedLink.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await waitFor(() => sentMessages.some(message => message.type === "prefetchArticle"));

    row.classList.remove("unread");
    row.classList.add("read");

    await waitFor(() => sentMessages.some(message => message.type === "cancelPrefetch"));
  });
});

test("selected summary-enabled feeds immediately prefetch visible unread articles with concurrency", async () => {
  await withJSDOM(SELECTED_FEED_MULTI_ENTRY_FIXTURE, async () => {
    const sentMessages = [];
    const pendingPrefetchCallbacks = [];

    globalThis.chrome = {
      runtime: {
        onMessage: {
          addListener() {}
        },
        sendMessage(message, callback) {
          sentMessages.push(message);

          setTimeout(() => {
            if (message.type === "getFeedbinState") {
              callback({
                ok: true,
                result: {
                  summaryFeedPreferences: { 42: true }
                }
              });
              return;
            }

            if (message.type === "checkCachedSummaries") {
              callback({
                ok: true,
                result: {
                  cachedEntryIds: [],
                  cachedSummaries: []
                }
              });
              return;
            }

            if (message.type === "prefetchArticle") {
              pendingPrefetchCallbacks.push(() => {
                callback({
                  ok: true,
                  result: {
                    summaryText: `Prefetched ${message.payload.entryId}`
                  }
                });
              });
              return;
            }

            callback({ ok: true, result: {} });
          }, 0);
        }
      }
    };

    await importFresh("content/feedbin.js");

    await waitFor(() => sentMessages.filter(message => message.type === "prefetchArticle").length >= 2);

    const initialPrefetchEntryIds = sentMessages
      .filter(message => message.type === "prefetchArticle")
      .slice(0, 2)
      .map(message => message.payload.entryId);
    assert.deepEqual(initialPrefetchEntryIds, ["entry-2", "entry-3"]);

    while (pendingPrefetchCallbacks.length) {
      pendingPrefetchCallbacks.shift()();
    }

    await waitFor(() => sentMessages.filter(message => message.type === "prefetchArticle").length >= 3);
    while (pendingPrefetchCallbacks.length) {
      pendingPrefetchCallbacks.shift()();
    }
  });
});

test("unopened summary-enabled feeds prefetch the first three visible unread articles with concurrency", async () => {
  await withJSDOM(MULTI_FEED_UNREAD_FIXTURE, async () => {
    const sentMessages = [];
    const pendingPrefetchCallbacks = [];

    globalThis.chrome = {
      runtime: {
        onMessage: {
          addListener() {}
        },
        sendMessage(message, callback) {
          sentMessages.push(message);

          setTimeout(() => {
            if (message.type === "getFeedbinState") {
              callback({
                ok: true,
                result: {
                  summaryFeedPreferences: { 42: true }
                }
              });
              return;
            }

            if (message.type === "checkCachedSummaries") {
              callback({
                ok: true,
                result: {
                  cachedEntryIds: [],
                  cachedSummaries: []
                }
              });
              return;
            }

            if (message.type === "prefetchArticle") {
              pendingPrefetchCallbacks.push(() => {
                callback({
                  ok: true,
                  result: {
                    summaryText: `Prefetched ${message.payload.entryId}`
                  }
                });
              });
              return;
            }

            callback({ ok: true, result: {} });
          }, 0);
        }
      }
    };

    await importFresh("content/feedbin.js");

    await waitFor(() => sentMessages.filter(message => message.type === "prefetchArticle").length >= 2);

    const initialPrefetchEntryIds = sentMessages
      .filter(message => message.type === "prefetchArticle")
      .slice(0, 2)
      .map(message => message.payload.entryId);
    assert.deepEqual(initialPrefetchEntryIds, ["entry-2", "entry-3"]);

    while (pendingPrefetchCallbacks.length) {
      pendingPrefetchCallbacks.shift()();
    }

    await waitFor(() => sentMessages.filter(message => message.type === "prefetchArticle").length >= 3);
    while (pendingPrefetchCallbacks.length) {
      pendingPrefetchCallbacks.shift()();
    }

    const prefetchedEntryIds = sentMessages
      .filter(message => message.type === "prefetchArticle")
      .map(message => message.payload.entryId);

    assert.deepEqual(prefetchedEntryIds.slice(0, 3), ["entry-2", "entry-3", "entry-4"]);
    assert.equal(prefetchedEntryIds.includes("entry-5"), false);
  });
});

test("nonselected feed dots stay ready when warm summaries remain in memory after rows disappear", async () => {
  await withJSDOM(MULTI_FEED_UNREAD_FIXTURE, async () => {
    globalThis.chrome = {
      runtime: {
        onMessage: {
          addListener() {}
        },
        sendMessage(message, callback) {
          setTimeout(() => {
            if (message.type === "getFeedbinState") {
              callback({
                ok: true,
                result: {
                  summaryFeedPreferences: { 42: true },
                  prefetchDebugVisualizationEnabled: true
                }
              });
              return;
            }

            if (message.type === "checkCachedSummaries") {
              callback({
                ok: true,
                result: {
                  cachedEntryIds: [],
                  cachedSummaries: []
                }
              });
              return;
            }

            if (message.type === "prefetchArticle") {
              callback({
                ok: true,
                result: {
                  summaryText: `Prefetched ${message.payload.entryId}`
                }
              });
              return;
            }

            callback({ ok: true, result: {} });
          }, 0);
        }
      }
    };

    await importFresh("content/feedbin.js");

    await waitFor(() => {
      const feedItem = document.querySelector('li[data-feed-id="42"]');
      const dot = feedItem?.querySelector(".feedbin-summarizer-prefetch-dot--feed");
      return dot?.dataset.state === "ready" ? dot : null;
    });

    document.querySelector(".entries-target").innerHTML = "";

    const feedDot = await waitFor(() => {
      const feedItem = document.querySelector('li[data-feed-id="42"]');
      const dot = feedItem?.querySelector(".feedbin-summarizer-prefetch-dot--feed");
      return dot?.dataset.state === "ready" ? dot : null;
    });

    assert.equal(feedDot.dataset.state, "ready");
  });
});
