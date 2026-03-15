import assert from "node:assert/strict";
import test from "node:test";

import { Readability } from "@mozilla/readability";

import { importFresh, withJSDOM } from "../test-support/dom-test-helpers.js";

test("extractReadableArticle returns readable text and strips boilerplate", async () => {
  await withJSDOM("<!doctype html><html><body></body></html>", async () => {
    globalThis.Readability = Readability;
    globalThis.chrome = {
      runtime: {
        onMessage: {
          addListener() {}
        }
      }
    };

    const { extractReadableArticle } = await importFresh("offscreen/offscreen.js");
    const result = extractReadableArticle({
      url: "https://example.com/story",
      html: `
        <!doctype html>
        <html>
          <head>
            <title>Example Story</title>
          </head>
          <body>
            <nav>Site nav</nav>
            <article>
              <h1>Example Story</h1>
              <p>First paragraph with enough detail to count as article content.</p>
              <p>Second paragraph with more detail and no surrounding chrome.</p>
            </article>
            <script>window.shouldNotAppear = true;</script>
          </body>
        </html>
      `
    });

    assert.equal(result.title, "Example Story");
    assert.match(result.textContent, /First paragraph/);
    assert.match(result.textContent, /Second paragraph/);
    assert.doesNotMatch(result.textContent, /Site nav/);
    assert.doesNotMatch(result.textContent, /shouldNotAppear/);
  });
});

test("extractFallbackText prefers paragraph-dense article-like containers", async () => {
  await withJSDOM(`
    <!doctype html>
    <html>
      <body>
        <div class="sidebar">
          <p>Short note.</p>
        </div>
        <div class="story-body article-content" id="main-story">
          <p>This is the main story paragraph with enough detail to score highly.</p>
          <p>Another substantial paragraph that should keep this candidate on top.</p>
        </div>
      </body>
    </html>
  `, async () => {
    globalThis.Readability = Readability;
    globalThis.chrome = {
      runtime: {
        onMessage: {
          addListener() {}
        }
      }
    };

    const { extractFallbackText } = await importFresh("offscreen/offscreen.js");
    const text = extractFallbackText(document);

    assert.match(text, /main story paragraph/i);
    assert.match(text, /Another substantial paragraph/i);
  });
});
