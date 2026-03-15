import {
  MASKED_KEY_PREVIEW,
  PROVIDERS,
  SECRETS_STORAGE_KEY,
  SESSION_SECRETS_STORAGE_KEY
} from "../shared/defaults.js";

const PROVIDER_SECRET_FIELDS = Object.freeze({
  openai: "openaiApiKey",
  anthropic: "anthropicApiKey"
});

let accessInitialized = false;
let inMemorySecrets = createEmptySecrets();

export function resetSecretManagerForTests() {
  accessInitialized = false;
  inMemorySecrets = createEmptySecrets();
}

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
  await Promise.all(PROVIDERS.map(provider => getProviderApiKey(provider)));
}

export async function getProviderApiKey(provider) {
  const field = getProviderSecretField(provider);
  if (inMemorySecrets[field]) {
    return inMemorySecrets[field];
  }

  const sessionSecrets = await readSessionSecrets();
  if (sessionSecrets[field]) {
    inMemorySecrets = sessionSecrets;
    return sessionSecrets[field];
  }

  const persistedSecrets = await readPersistedSecrets();
  if (persistedSecrets[field]) {
    inMemorySecrets = persistedSecrets;
    await chrome.storage.session.set({
      [SESSION_SECRETS_STORAGE_KEY]: persistedSecrets
    });
  }

  return persistedSecrets[field] || "";
}

export async function saveProviderApiKey(provider, rawKey) {
  const field = getProviderSecretField(provider);
  const apiKey = String(rawKey || "").trim();
  if (!apiKey) {
    throw new Error(`Enter a full ${getProviderDisplayName(provider)} API key before saving.`);
  }

  // Only the service worker persists secrets. The options page can submit a new
  // key, but it never reads the stored value back out after save.
  const secrets = {
    ...(await readPersistedSecrets()),
    [field]: apiKey
  };
  inMemorySecrets = secrets;

  await chrome.storage.local.set({
    [SECRETS_STORAGE_KEY]: secrets
  });
  await chrome.storage.session.set({
    [SESSION_SECRETS_STORAGE_KEY]: secrets
  });
}

export async function clearProviderApiKey(provider) {
  const field = getProviderSecretField(provider);
  const secrets = {
    ...(await readPersistedSecrets()),
    [field]: ""
  };

  inMemorySecrets = secrets;
  await chrome.storage.local.set({
    [SECRETS_STORAGE_KEY]: secrets
  });
  await chrome.storage.session.set({
    [SESSION_SECRETS_STORAGE_KEY]: secrets
  });
}

export async function getSecretStatus(provider) {
  const apiKey = await getProviderApiKey(provider);
  return {
    hasKey: Boolean(apiKey),
    maskedPreview: apiKey ? MASKED_KEY_PREVIEW : ""
  };
}

export async function getAllSecretStatuses() {
  return Object.fromEntries(
    await Promise.all(
      PROVIDERS.map(async provider => [provider, await getSecretStatus(provider)])
    )
  );
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
    openaiApiKey: String(rawSecrets?.openaiApiKey || "").trim(),
    anthropicApiKey: String(rawSecrets?.anthropicApiKey || "").trim()
  };
}

function createEmptySecrets() {
  return {
    openaiApiKey: "",
    anthropicApiKey: ""
  };
}

function getProviderSecretField(provider) {
  const normalizedProvider = String(provider || "").trim().toLowerCase();
  const field = PROVIDER_SECRET_FIELDS[normalizedProvider];
  if (!field) {
    throw new Error("Unsupported provider.");
  }

  return field;
}

function getProviderDisplayName(provider) {
  return provider === "anthropic" ? "Anthropic" : "OpenAI";
}
