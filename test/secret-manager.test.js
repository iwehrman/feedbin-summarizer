import assert from "node:assert/strict";
import test from "node:test";

import {
  clearOpenAIKey,
  getOpenAIKey,
  getSecretStatus,
  initializeSecretManager,
  resetSecretManagerForTests,
  saveOpenAIKey
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

test("saveOpenAIKey persists to local and session storage without echoing the raw key", async () => {
  const { chrome, localArea, sessionArea } = createChromeMock();
  globalThis.chrome = chrome;

  await saveOpenAIKey(" sk-test_1234567890 ");
  const status = await getSecretStatus();

  assert.equal(localArea.data[SECRETS_STORAGE_KEY].openaiApiKey, "sk-test_1234567890");
  assert.equal(sessionArea.data[SESSION_SECRETS_STORAGE_KEY].openaiApiKey, "sk-test_1234567890");
  assert.deepEqual(status, {
    hasOpenAIKey: true,
    maskedPreview: "••••••••••••"
  });
});

test("getOpenAIKey prefers session storage and primes it from persisted storage", async () => {
  const { chrome, sessionArea } = createChromeMock({
    local: {
      [SECRETS_STORAGE_KEY]: {
        openaiApiKey: "sk-local_1234567890"
      }
    }
  });
  globalThis.chrome = chrome;

  const key = await getOpenAIKey();

  assert.equal(key, "sk-local_1234567890");
  assert.equal(sessionArea.data[SESSION_SECRETS_STORAGE_KEY].openaiApiKey, "sk-local_1234567890");

  sessionArea.data[SESSION_SECRETS_STORAGE_KEY] = {
    openaiApiKey: "sk-session_abcdefgh"
  };
  resetSecretManagerForTests();

  const secondKey = await getOpenAIKey();
  assert.equal(secondKey, "sk-session_abcdefgh");
});

test("clearOpenAIKey clears both persisted and session secrets", async () => {
  const { chrome, localArea, sessionArea } = createChromeMock();
  globalThis.chrome = chrome;

  await saveOpenAIKey("sk-test_1234567890");
  await clearOpenAIKey();

  assert.equal(localArea.data[SECRETS_STORAGE_KEY].openaiApiKey, "");
  assert.equal(sessionArea.data[SESSION_SECRETS_STORAGE_KEY].openaiApiKey, "");
  assert.deepEqual(await getSecretStatus(), {
    hasOpenAIKey: false,
    maskedPreview: ""
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
