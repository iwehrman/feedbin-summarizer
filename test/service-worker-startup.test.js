import assert from "node:assert/strict";
import test from "node:test";

import { resetSecretManagerForTests } from "../background/secret-manager.js";
import { normalizeSettings } from "../background/service-worker-core.js";
import {
  ANTHROPIC_MODEL_UPGRADE_VERSION,
  DEFAULT_SETTINGS,
  LAST_APPLIED_ANTHROPIC_MODEL_UPGRADE_STORAGE_KEY,
  LAST_APPLIED_OPENAI_MODEL_DEFAULT_STORAGE_KEY
} from "../shared/defaults.js";

let workerInstance = 0;

function storageArea(data) {
  return {
    async get(keys) {
      return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, structuredClone(data[key])]));
    },
    async set(values) { Object.assign(data, structuredClone(values)); },
    async remove(keys) { for (const key of keys) delete data[key]; },
    async setAccessLevel() {}
  };
}

async function startWorker(data, broadcasts) {
  resetSecretManagerForTests();
  const event = { addListener() {} };
  let onMessage;
  globalThis.chrome = {
    storage: { local: storageArea(data), session: storageArea({}) },
    runtime: {
      getURL: path => `chrome-extension://test/${path}`,
      onInstalled: event,
      onMessage: { addListener(listener) { onMessage = listener; } }
    },
    action: { onClicked: event, async setIcon() {} },
    tabs: {
      onUpdated: event,
      onRemoved: event,
      async query() { return [{ id: 1 }]; },
      async sendMessage(_tabId, message) { broadcasts.push(message); }
    }
  };
  await import(`../background/service-worker.js?startup-test=${++workerInstance}`);
  // This message waits for the real startup pipeline, including legacy migration.
  const response = await new Promise(resolve => onMessage(
    { type: "getOptionsState" },
    { url: "chrome-extension://test/options/options.html" },
    resolve
  ));
  assert.equal(response.ok, true, response.error);
  return response.result.settings;
}

test("worker persists matching Anthropic upgrades and honors a manual choice on restart", async () => {
  const originalChrome = globalThis.chrome;
  try {
    for (const [oldModel, newModel] of [
      ["claude-haiku-4-5", "claude-haiku-5-5"],
      ["claude-sonnet-4-6", "claude-sonnet-5-5"]
    ]) {
      for (const provider of ["anthropic", "openai"]) {
        const saved = normalizeSettings({ provider, anthropicModel: oldModel, openaiModel: "gpt-5.4-mini" });
        const data = {
          settings: saved,
          [LAST_APPLIED_OPENAI_MODEL_DEFAULT_STORAGE_KEY]: DEFAULT_SETTINGS.openaiModel
        };
        const broadcasts = [];
        const upgraded = await startWorker(data, broadcasts);
        assert.deepEqual(upgraded, { ...saved, anthropicModel: newModel });
        assert.deepEqual(data.settings, upgraded);
        assert.equal(data[LAST_APPLIED_ANTHROPIC_MODEL_UPGRADE_STORAGE_KEY], ANTHROPIC_MODEL_UPGRADE_VERSION);
        assert.equal(broadcasts.length, provider === "anthropic" ? 1 : 0);
        if (provider === "anthropic") {
          assert.equal(broadcasts[0].type, "settingsUpdated");
          assert.equal(broadcasts[0].payload.clearPrefetchedSummaries, true);
        }

        data.settings = { ...upgraded, anthropicModel: oldModel };
        broadcasts.length = 0;
        assert.deepEqual(await startWorker(data, broadcasts), data.settings);
        assert.equal(data.settings.anthropicModel, oldModel);
        assert.equal(broadcasts.length, 0);
      }
    }
  } finally {
    globalThis.chrome = originalChrome;
    resetSecretManagerForTests();
  }
});
