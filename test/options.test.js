import assert from "node:assert/strict";
import test from "node:test";

import { importFresh, waitFor, withJSDOM } from "../test-support/dom-test-helpers.js";

const OPTIONS_HTML = `
<!doctype html>
<html lang="en">
  <body>
    <form id="settings-form">
      <input type="password" name="openaiApiKey" id="openaiApiKey">
      <button type="button" id="save-key-button">Save key</button>
      <button type="button" id="clear-key-button">Clear key</button>
      <button type="button" id="test-button">Test API</button>
      <input type="text" name="openaiModel" id="openaiModel">
      <select name="openaiReasoningEffort" id="openaiReasoningEffort">
        <option value="">Model default</option>
        <option value="minimal">Minimal</option>
      </select>
      <select name="openaiVerbosity" id="openaiVerbosity">
        <option value="">Model default</option>
        <option value="low">Low</option>
      </select>
      <input type="checkbox" name="summaryCacheEnabled" id="summaryCacheEnabled">
      <input type="checkbox" name="prefetchDebugVisualizationEnabled" id="prefetchDebugVisualizationEnabled">
      <textarea name="systemPrompt" id="systemPrompt"></textarea>
      <span id="key-status"></span>
      <span id="status"></span>
    </form>
  </body>
</html>
`;

test("options page never repopulates the saved API key", async () => {
  await withJSDOM(OPTIONS_HTML, async () => {
    const sentMessages = [];
    globalThis.chrome = {
      runtime: {
        sendMessage(message, callback) {
          sentMessages.push(message);
          if (message.type === "getOptionsState") {
            callback({
              ok: true,
              result: {
                settings: {
                  openaiModel: "gpt-4.1-mini",
                  openaiReasoningEffort: "minimal",
                  openaiVerbosity: "low",
                  summaryCacheEnabled: true,
                  prefetchDebugVisualizationEnabled: true,
                  systemPrompt: "Return plain text."
                },
                keyStatus: {
                  hasOpenAIKey: true,
                  maskedPreview: "••••••••••••"
                }
              }
            });
            return;
          }

          callback({ ok: true, result: {} });
        }
      }
    };

    await importFresh("options/options.js");
    await waitFor(() => document.getElementById("key-status").textContent.includes("Key saved"));

    assert.equal(document.getElementById("openaiApiKey").value, "");
    assert.match(document.getElementById("key-status").textContent, /••••••••••••/);
    assert.equal(sentMessages[0].type, "getOptionsState");
  });
});

test("options page submits a freshly typed key and then clears the field", async () => {
  await withJSDOM(OPTIONS_HTML, async () => {
    const sentMessages = [];
    globalThis.chrome = {
      runtime: {
        sendMessage(message, callback) {
          sentMessages.push(message);
          if (message.type === "getOptionsState") {
            callback({
              ok: true,
              result: {
                settings: {},
                keyStatus: {
                  hasOpenAIKey: false,
                  maskedPreview: ""
                }
              }
            });
            return;
          }

          if (message.type === "saveOpenAIKey") {
            callback({
              ok: true,
              result: {
                keyStatus: {
                  hasOpenAIKey: true,
                  maskedPreview: "••••••••••••"
                }
              }
            });
            return;
          }

          callback({ ok: true, result: { settings: {} } });
        }
      }
    };

    await importFresh("options/options.js");
    const keyField = document.getElementById("openaiApiKey");
    keyField.value = "sk-test_1234567890";
    document.getElementById("save-key-button").click();

    await waitFor(() => sentMessages.some(message => message.type === "saveOpenAIKey"));

    const saveMessage = sentMessages.find(message => message.type === "saveOpenAIKey");
    assert.equal(saveMessage.payload.openaiApiKey, "sk-test_1234567890");
    assert.equal(keyField.value, "");
  });
});
