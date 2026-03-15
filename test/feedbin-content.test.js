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
    const articleDot = await waitFor(() => document.querySelector(".feedbin-summarizer-prefetch-dot--article"));

    assert.equal(document.querySelector(".feedbin-summarizer-prefetch-dot--feed"), null);
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
    const feedDot = await waitFor(() => document.querySelector(".feedbin-summarizer-prefetch-dot--feed"));

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
