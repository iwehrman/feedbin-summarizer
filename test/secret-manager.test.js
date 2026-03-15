import assert from "node:assert/strict";
import test from "node:test";

import {
  clearProviderApiKey,
  getAllSecretStatuses,
  getProviderApiKey,
  getSecretStatus,
  initializeSecretManager,
  resetSecretManagerForTests,
  saveProviderApiKey
} from "../background/secret-manager.js";
import {
  SECRETS_STORAGE_KEY,
  SESSION_SECRETS_STORAGE_KEY
} from "../shared/defaults.js";

test.beforeEach(() => {
  resetSecretManagerForTests();
});

test.afterEach(() => {
  delete globalThis.chrome;
});

test("initializeSecretManager locks storage to trusted contexts", async () => {
  const { chrome, localArea, sessionArea } = createChromeMock();
  globalThis.chrome = chrome;

  await initializeSecretManager();

  assert.deepEqual(localArea.accessLevels, [{ accessLevel: "TRUSTED_CONTEXTS" }]);
  assert.deepEqual(sessionArea.accessLevels, [{ accessLevel: "TRUSTED_CONTEXTS" }]);
});

test("saveProviderApiKey persists OpenAI and Anthropic keys without echoing raw values", async () => {
  const { chrome, localArea, sessionArea } = createChromeMock();
  globalThis.chrome = chrome;

  await saveProviderApiKey("openai", " sk-test_1234567890 ");
  await saveProviderApiKey("anthropic", " sk-ant-api03-abcdef ");

  assert.equal(localArea.data[SECRETS_STORAGE_KEY].openaiApiKey, "sk-test_1234567890");
  assert.equal(localArea.data[SECRETS_STORAGE_KEY].anthropicApiKey, "sk-ant-api03-abcdef");
  assert.equal(sessionArea.data[SESSION_SECRETS_STORAGE_KEY].openaiApiKey, "sk-test_1234567890");
  assert.equal(sessionArea.data[SESSION_SECRETS_STORAGE_KEY].anthropicApiKey, "sk-ant-api03-abcdef");
  assert.deepEqual(await getSecretStatus("openai"), {
    hasKey: true,
    maskedPreview: "••••••••••••"
  });
  assert.deepEqual(await getSecretStatus("anthropic"), {
    hasKey: true,
    maskedPreview: "••••••••••••"
  });
});

test("getProviderApiKey prefers session storage and primes it from persisted storage", async () => {
  const { chrome, sessionArea } = createChromeMock({
    local: {
      [SECRETS_STORAGE_KEY]: {
        openaiApiKey: "sk-local_1234567890",
        anthropicApiKey: "sk-ant-api03-local"
      }
    }
  });
  globalThis.chrome = chrome;

  const openAIKey = await getProviderApiKey("openai");
  const anthropicKey = await getProviderApiKey("anthropic");

  assert.equal(openAIKey, "sk-local_1234567890");
  assert.equal(anthropicKey, "sk-ant-api03-local");
  assert.equal(sessionArea.data[SESSION_SECRETS_STORAGE_KEY].openaiApiKey, "sk-local_1234567890");
  assert.equal(sessionArea.data[SESSION_SECRETS_STORAGE_KEY].anthropicApiKey, "sk-ant-api03-local");

  sessionArea.data[SESSION_SECRETS_STORAGE_KEY] = {
    openaiApiKey: "sk-session_abcdefgh",
    anthropicApiKey: "sk-ant-api03-session"
  };
  resetSecretManagerForTests();

  assert.equal(await getProviderApiKey("openai"), "sk-session_abcdefgh");
  assert.equal(await getProviderApiKey("anthropic"), "sk-ant-api03-session");
});

test("clearProviderApiKey clears only the targeted provider secret", async () => {
  const { chrome, localArea, sessionArea } = createChromeMock();
  globalThis.chrome = chrome;

  await saveProviderApiKey("openai", "sk-test_1234567890");
  await saveProviderApiKey("anthropic", "sk-ant-api03-abcdef");
  await clearProviderApiKey("anthropic");

  assert.equal(localArea.data[SECRETS_STORAGE_KEY].openaiApiKey, "sk-test_1234567890");
  assert.equal(localArea.data[SECRETS_STORAGE_KEY].anthropicApiKey, "");
  assert.equal(sessionArea.data[SESSION_SECRETS_STORAGE_KEY].openaiApiKey, "sk-test_1234567890");
  assert.equal(sessionArea.data[SESSION_SECRETS_STORAGE_KEY].anthropicApiKey, "");
  assert.deepEqual(await getAllSecretStatuses(), {
    openai: {
      hasKey: true,
      maskedPreview: "••••••••••••"
    },
    anthropic: {
      hasKey: false,
      maskedPreview: ""
    }
  });
});

function createChromeMock(initial = {}) {
  const localArea = createStorageArea(initial.local);
  const sessionArea = createStorageArea(initial.session);

  return {
    chrome: {
      storage: {
        local: localArea.api,
        session: sessionArea.api
      }
    },
    localArea,
    sessionArea
  };
}

function createStorageArea(initialData = {}) {
  const data = { ...(initialData || {}) };
  const accessLevels = [];

  return {
    data,
    accessLevels,
    api: {
      async get(keys) {
        if (typeof keys === "string") {
          return {
            [keys]: data[keys]
          };
        }

        if (Array.isArray(keys)) {
          return Object.fromEntries(keys.map(key => [key, data[key]]));
        }

        return { ...data };
      },
      async set(nextValues) {
        Object.assign(data, nextValues);
      },
      async remove(keys) {
        for (const key of Array.isArray(keys) ? keys : [keys]) {
          delete data[key];
        }
      },
      async setAccessLevel(nextLevel) {
        accessLevels.push(nextLevel);
      }
    }
  };
}
