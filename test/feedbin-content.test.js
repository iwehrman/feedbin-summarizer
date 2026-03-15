import assert from "node:assert/strict";
import test from "node:test";

import { importFresh, waitFor, withJSDOM } from "../test-support/dom-test-helpers.js";

const FEEDBIN_FIXTURE = `
<!doctype html>
<html>
  <body>
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
