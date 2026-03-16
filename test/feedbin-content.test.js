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

test("content script injects the summary button, matches toolbar color, and toggles summary content", async () => {
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
    const button = await waitFor(() => document.getElementById("feedbin-summarizer-toolbar-button"));
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
    assert.equal(button.classList.contains("is-active"), true);
    assert.ok(sentMessages.some(message => message.type === "summarizeArticle"));

    button.click();
    await waitFor(() => /Original article body/.test(body.innerHTML));

    assert.match(body.innerHTML, /Original article body/);
    assert.equal(button.classList.contains("is-active"), false);
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
    const button = await waitFor(() => document.getElementById("feedbin-summarizer-toolbar-button"));

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

test("content script still requests a summary when the visible article body is empty but a source URL exists", async () => {
  await withJSDOM(FEEDBIN_FIXTURE.replace("<p>Original article body.</p>", ""), async () => {
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
                  summaryText: "Fetched from source."
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

    await waitFor(() => sentMessages.some(message => message.type === "summarizeArticle"));
    const summaryMessage = sentMessages.find(message => message.type === "summarizeArticle");

    assert.equal(summaryMessage.payload.sourceUrl, "https://example.com/story");
    assert.equal(summaryMessage.payload.articleText, "");
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
        /Refresh Feedbin after reloading the extension, then try Summary again\./
      );
      assert.equal(button.classList.contains("is-loading"), false);
    } finally {
      console.error = originalConsoleError;
    }
  });
});
