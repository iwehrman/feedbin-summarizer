import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_SETTINGS } from "../shared/defaults.js";
import { importFresh, waitFor, withJSDOM } from "../test-support/dom-test-helpers.js";

const OPTIONS_HTML = `
<!doctype html>
<html lang="en">
  <body>
    <form id="settings-form">
      <input type="radio" name="provider" value="openai" checked>
      <input type="radio" name="provider" value="anthropic">

      <section data-provider-card="openai"></section>
      <input type="password" name="openaiApiKey" id="openaiApiKey">
      <button type="button" data-provider-action="save-key" data-provider="openai">Update</button>
      <button type="button" data-provider-action="clear-key" data-provider="openai">Clear</button>
      <button type="button" data-provider-action="test" data-provider="openai">Test</button>
      <span id="openai-test-indicator"></span>
      <select name="openaiModel" id="openaiModel">
        <option value="gpt-5-nano">GPT-5 Nano</option>
        <option value="gpt-5-mini">GPT-5 Mini</option>
        <option value="gpt-5">GPT-5</option>
      </select>
      <select name="openaiReasoningEffort" id="openaiReasoningEffort">
        <option value="minimal">Minimal</option>
        <option value="low">Low</option>
      </select>
      <select name="openaiVerbosity" id="openaiVerbosity">
        <option value="low">Low</option>
        <option value="medium">Medium</option>
      </select>
      <span id="openai-key-status"></span>

      <section data-provider-card="anthropic"></section>
      <input type="password" name="anthropicApiKey" id="anthropicApiKey">
      <button type="button" data-provider-action="save-key" data-provider="anthropic">Update</button>
      <button type="button" data-provider-action="clear-key" data-provider="anthropic">Clear</button>
      <button type="button" data-provider-action="test" data-provider="anthropic">Test</button>
      <span id="anthropic-test-indicator"></span>
      <select name="anthropicModel" id="anthropicModel">
        <option value="claude-haiku-4-5">Claude Haiku 4.5</option>
        <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
      </select>
      <span id="anthropic-key-status"></span>

      <input type="checkbox" name="summaryCacheEnabled" id="summaryCacheEnabled">
      <input type="checkbox" name="prefetchDebugVisualizationEnabled" id="prefetchDebugVisualizationEnabled">
      <textarea name="systemPrompt" id="systemPrompt"></textarea>
      <span id="status"></span>
    </form>
    <div id="confirm-modal" hidden>
      <h2 id="confirm-title"></h2>
      <p id="confirm-message"></p>
      <button type="button" id="confirm-cancel">Cancel</button>
      <button type="button" id="confirm-submit">Clear</button>
    </div>
  </body>
</html>
`;

test("options page never repopulates saved provider keys", async () => {
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
                  provider: "anthropic",
                  openaiModel: "gpt-5-nano",
                  openaiReasoningEffort: "minimal",
                  openaiVerbosity: "low",
                  anthropicModel: "claude-haiku-4-5",
                  summaryCacheEnabled: true,
                  prefetchDebugVisualizationEnabled: true,
                  systemPrompt: "Return plain text."
                },
                keyStatuses: {
                  openai: {
                    hasKey: true,
                    maskedPreview: "••••••••••••"
                  },
                  anthropic: {
                    hasKey: false,
                    maskedPreview: ""
                  }
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
    await waitFor(() => document.querySelector('[data-provider-action="save-key"][data-provider="openai"]').textContent === "Update");

    assert.equal(document.getElementById("openaiApiKey").value, "");
    assert.equal(document.getElementById("anthropicApiKey").value, "");
    assert.equal(document.getElementById("openai-key-status").textContent, "");
    assert.equal(document.getElementById("anthropic-key-status").textContent, "");
    assert.equal(document.querySelector('[data-provider-action="save-key"][data-provider="openai"]').textContent, "Update");
    assert.equal(document.querySelector('[data-provider-action="save-key"][data-provider="openai"]').disabled, true);
    assert.equal(document.querySelector('[data-provider-action="clear-key"][data-provider="openai"]').disabled, false);
    assert.equal(document.querySelector('[data-provider-action="test"][data-provider="openai"]').disabled, false);
    assert.equal(document.querySelector('[data-provider-action="save-key"][data-provider="anthropic"]').textContent, "Update");
    assert.equal(document.querySelector('[data-provider-action="save-key"][data-provider="anthropic"]').disabled, true);
    assert.equal(document.querySelector('[data-provider-action="clear-key"][data-provider="anthropic"]').disabled, true);
    assert.equal(document.querySelector('[data-provider-action="test"][data-provider="anthropic"]').disabled, true);
    assert.equal(document.querySelector('input[name="provider"][value="anthropic"]').checked, true);
    assert.equal(sentMessages[0].type, "getOptionsState");
  });
});

test("options page shows a local checkmark when provider API verification succeeds", async () => {
  await withJSDOM(OPTIONS_HTML, async () => {
    globalThis.chrome = {
      runtime: {
        sendMessage(message, callback) {
          if (message.type === "getOptionsState") {
            callback({
              ok: true,
              result: {
                settings: {},
                keyStatuses: {
                  openai: { hasKey: true, maskedPreview: "••••••••••••" },
                  anthropic: { hasKey: false, maskedPreview: "" }
                }
              }
            });
            return;
          }

          if (message.type === "updateOptionsSettings") {
            callback({
              ok: true,
              result: {
                settings: message.payload
              }
            });
            return;
          }

          if (message.type === "testProviderConnection") {
            callback({
              ok: true,
              result: {
                provider: "openai",
                model: "gpt-5-nano",
                summaryText: "A short summary."
              }
            });
            return;
          }

          callback({ ok: true, result: {} });
        }
      }
    };

    await importFresh("options/options.js");
    document.querySelector('[data-provider-action="test"][data-provider="openai"]').click();

    await waitFor(() => document.getElementById("openai-test-indicator").textContent === "✓");

    assert.equal(document.getElementById("openai-key-status").textContent, "");
    assert.equal(document.getElementById("openai-test-indicator").classList.contains("is-success"), true);
    assert.equal(document.getElementById("status").textContent, "");
  });
});

test("options page submits a freshly typed provider key and then clears the field", async () => {
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
                keyStatuses: {
                  openai: { hasKey: false, maskedPreview: "" },
                  anthropic: { hasKey: false, maskedPreview: "" }
                }
              }
            });
            return;
          }

          if (message.type === "saveProviderKey") {
            callback({
              ok: true,
              result: {
                keyStatus: {
                  hasKey: true,
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
    const keyField = document.getElementById("anthropicApiKey");
    const saveButton = document.querySelector('[data-provider-action="save-key"][data-provider="anthropic"]');
    const clearButton = document.querySelector('[data-provider-action="clear-key"][data-provider="anthropic"]');

    assert.equal(saveButton.textContent, "Update");
    assert.equal(saveButton.disabled, true);
    assert.equal(clearButton.disabled, true);

    keyField.value = "sk-ant-test_1234567890";
    keyField.dispatchEvent(new Event("input", { bubbles: true }));
    assert.equal(saveButton.disabled, false);
    document.querySelector('[data-provider-action="save-key"][data-provider="anthropic"]').click();

    await waitFor(() => sentMessages.some(message => message.type === "saveProviderKey"));
    await waitFor(() => saveButton.textContent === "Update");

    const saveMessage = sentMessages.find(message => message.type === "saveProviderKey");
    assert.equal(saveMessage.payload.provider, "anthropic");
    assert.equal(saveMessage.payload.apiKey, "sk-ant-test_1234567890");
    assert.equal(keyField.value, "");
    assert.equal(saveButton.textContent, "Update");
    assert.equal(saveButton.disabled, true);
    assert.equal(clearButton.disabled, false);
  });
});

test("options page confirms before clearing a saved provider key", async () => {
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
                keyStatuses: {
                  openai: { hasKey: true, maskedPreview: "••••••••••••" },
                  anthropic: { hasKey: false, maskedPreview: "" }
                }
              }
            });
            return;
          }

          if (message.type === "clearProviderKey") {
            callback({
              ok: true,
              result: {
                keyStatus: {
                  hasKey: false,
                  maskedPreview: ""
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

    const clearButton = document.querySelector('[data-provider-action="clear-key"][data-provider="openai"]');
    const confirmModal = document.getElementById("confirm-modal");
    const confirmCancel = document.getElementById("confirm-cancel");
    const confirmSubmit = document.getElementById("confirm-submit");

    clearButton.click();

    assert.equal(confirmModal.hidden, false);
    assert.equal(sentMessages.some(message => message.type === "clearProviderKey"), false);

    confirmCancel.click();
    assert.equal(confirmModal.hidden, true);
    assert.equal(sentMessages.some(message => message.type === "clearProviderKey"), false);

    clearButton.click();
    confirmSubmit.click();

    await waitFor(() => sentMessages.some(message => message.type === "clearProviderKey"));

    const clearMessage = sentMessages.find(message => message.type === "clearProviderKey");
    assert.equal(clearMessage.payload.provider, "openai");
    assert.equal(confirmModal.hidden, true);
    assert.equal(clearButton.disabled, true);
  });
});

test("options page auto-saves provider-specific and shared settings", async () => {
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
                keyStatuses: {
                  openai: { hasKey: false, maskedPreview: "" },
                  anthropic: { hasKey: false, maskedPreview: "" }
                }
              }
            });
            return;
          }

          if (message.type === "updateOptionsSettings") {
            callback({
              ok: true,
              result: {
                settings: message.payload
              }
            });
            return;
          }

          callback({ ok: true, result: {} });
        }
      }
    };

    await importFresh("options/options.js");

    document.querySelector('input[name="provider"][value="anthropic"]').checked = true;
    document.querySelector('input[name="provider"][value="anthropic"]').dispatchEvent(new Event("change", { bubbles: true }));
    document.getElementById("anthropicModel").value = "claude-sonnet-4-6";
    document.getElementById("anthropicModel").dispatchEvent(new Event("change", { bubbles: true }));
    document.getElementById("summaryCacheEnabled").checked = false;
    document.getElementById("summaryCacheEnabled").dispatchEvent(new Event("change", { bubbles: true }));
    document.getElementById("systemPrompt").value = "Summarize clearly.";
    document.getElementById("systemPrompt").dispatchEvent(new Event("input", { bubbles: true }));

    await waitFor(() => sentMessages.some(message => message.type === "updateOptionsSettings"));

    const updateMessage = sentMessages.findLast(message => message.type === "updateOptionsSettings");
    assert.deepEqual(updateMessage.payload, {
      provider: "anthropic",
      openaiModel: DEFAULT_SETTINGS.openaiModel,
      openaiReasoningEffort: DEFAULT_SETTINGS.openaiReasoningEffort,
      openaiVerbosity: DEFAULT_SETTINGS.openaiVerbosity,
      anthropicModel: "claude-sonnet-4-6",
      summaryCacheEnabled: false,
      prefetchDebugVisualizationEnabled: false,
      systemPrompt: "Summarize clearly."
    });
  });
});
