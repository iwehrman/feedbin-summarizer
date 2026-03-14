import {
  MASKED_KEY_PREVIEW,
  SECRETS_STORAGE_KEY,
  SESSION_SECRETS_STORAGE_KEY
} from "../shared/defaults.js";

let accessInitialized = false;
let inMemorySecrets = {
  openaiApiKey: ""
};

export async function initializeSecretManager() {
  if (accessInitialized) {
    return;
  }

  // Content scripts are treated as untrusted. Restrict storage access to trusted
  // extension contexts before anything else reads or writes persisted settings.
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  await chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  accessInitialized = true;
}

export async function primeSecretCache() {
  await getOpenAIKey();
}

export async function getOpenAIKey() {
  if (inMemorySecrets.openaiApiKey) {
    return inMemorySecrets.openaiApiKey;
  }

  const sessionSecrets = await readSessionSecrets();
  if (sessionSecrets.openaiApiKey) {
    inMemorySecrets = sessionSecrets;
    return sessionSecrets.openaiApiKey;
  }

  const persistedSecrets = await readPersistedSecrets();
  if (persistedSecrets.openaiApiKey) {
    inMemorySecrets = persistedSecrets;
    await chrome.storage.session.set({
      [SESSION_SECRETS_STORAGE_KEY]: persistedSecrets
    });
  }

  return persistedSecrets.openaiApiKey || "";
}

export async function saveOpenAIKey(rawKey) {
  const openaiApiKey = String(rawKey || "").trim();
  if (!openaiApiKey) {
    throw new Error("Enter a full OpenAI API key before saving.");
  }

  // Only the service worker persists secrets. The options page can submit a new
  // key, but it never reads the stored value back out after save.
  const secrets = { openaiApiKey };
  inMemorySecrets = secrets;

  await chrome.storage.local.set({
    [SECRETS_STORAGE_KEY]: secrets
  });
  await chrome.storage.session.set({
    [SESSION_SECRETS_STORAGE_KEY]: secrets
  });
}

export async function clearOpenAIKey() {
  inMemorySecrets = { openaiApiKey: "" };
  await chrome.storage.local.set({
    [SECRETS_STORAGE_KEY]: { openaiApiKey: "" }
  });
  await chrome.storage.session.set({
    [SESSION_SECRETS_STORAGE_KEY]: { openaiApiKey: "" }
  });
}

export async function getSecretStatus() {
  const openaiApiKey = await getOpenAIKey();
  return {
    hasOpenAIKey: Boolean(openaiApiKey),
    maskedPreview: openaiApiKey ? MASKED_KEY_PREVIEW : ""
  };
}

async function readPersistedSecrets() {
  const stored = await chrome.storage.local.get(SECRETS_STORAGE_KEY);
  return normalizeSecrets(stored[SECRETS_STORAGE_KEY]);
}

async function readSessionSecrets() {
  const stored = await chrome.storage.session.get(SESSION_SECRETS_STORAGE_KEY);
  return normalizeSecrets(stored[SESSION_SECRETS_STORAGE_KEY]);
}

function normalizeSecrets(rawSecrets) {
  return {
    openaiApiKey: String(rawSecrets?.openaiApiKey || "").trim()
  };
}
