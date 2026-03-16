import { DEFAULT_SETTINGS } from "../shared/defaults.js";

const PROVIDERS = ["openai", "anthropic"];
const PROVIDER_LABELS = {
  openai: "OpenAI",
  anthropic: "Anthropic"
};
const SETTINGS_DEFAULTS = {
  provider: DEFAULT_SETTINGS.provider || "openai",
  openaiModel: DEFAULT_SETTINGS.openaiModel || "gpt-5-nano",
  openaiReasoningEffort: DEFAULT_SETTINGS.openaiReasoningEffort || "minimal",
  openaiVerbosity: DEFAULT_SETTINGS.openaiVerbosity || "low",
  anthropicModel: DEFAULT_SETTINGS.anthropicModel || "claude-haiku-4-5",
  summaryCacheEnabled: DEFAULT_SETTINGS.summaryCacheEnabled ?? true,
  prefetchDebugVisualizationEnabled: DEFAULT_SETTINGS.prefetchDebugVisualizationEnabled ?? false,
  systemPrompt: DEFAULT_SETTINGS.systemPrompt || ""
};

const form = document.getElementById("settings-form");
const status = document.getElementById("status");
const providerCards = new Map(
  PROVIDERS.map(provider => [provider, document.querySelector(`[data-provider-card="${provider}"]`)])
);
const keyFields = new Map(
  PROVIDERS.map(provider => [provider, document.getElementById(`${provider}ApiKey`)])
);
const keyStatuses = new Map(
  PROVIDERS.map(provider => [provider, document.getElementById(`${provider}-key-status`)])
);
const providerActions = new Map(
  PROVIDERS.map(provider => [
    provider,
    {
      save: document.querySelector(`[data-provider-action="save-key"][data-provider="${provider}"]`),
      clear: document.querySelector(`[data-provider-action="clear-key"][data-provider="${provider}"]`),
      test: document.querySelector(`[data-provider-action="test"][data-provider="${provider}"]`)
    }
  ])
);
const testIndicators = new Map(
  PROVIDERS.map(provider => [provider, document.getElementById(`${provider}-test-indicator`)])
);
const providerLabels = new Map(
  PROVIDERS.map(provider => [provider, document.querySelector(`[data-provider-label="${provider}"]`)])
);
const providerKeyStates = new Map(
  PROVIDERS.map(provider => [provider, { hasKey: false }])
);

let saveTimer = null;

init().catch(error => {
  setStatus(error.message || String(error), "error");
});

async function init() {
  const optionsState = await loadOptionsState();
  fillForm(optionsState.settings);
  renderAllKeyStatuses(optionsState.keyStatuses);
  syncProviderUi();

  form.addEventListener("input", handleFormInteraction);
  form.addEventListener("change", handleFormInteraction);

  for (const button of document.querySelectorAll("[data-provider-action]")) {
    button.addEventListener("click", handleProviderAction);
  }
}

function handleFormInteraction(event) {
  const secretProvider = getSecretFieldProvider(event);
  if (eventTargetsSecretField(event)) {
    clearProviderKeyStatus(secretProvider);
    setTestIndicator(secretProvider, "");
    syncProviderActionState(secretProvider);
    return;
  }

  clearAllTestIndicators();
  syncProviderUi();
  scheduleAutoSave();
}

async function handleProviderAction(event) {
  event.preventDefault();
  const button = event.currentTarget;
  const provider = normalizeProvider(button?.dataset?.provider);
  const action = String(button?.dataset?.providerAction || "");
  if (!provider || !action) {
    return;
  }

  try {
    switch (action) {
      case "save-key":
        await saveKeyFromField(provider);
        break;
      case "clear-key":
        await clearProviderKey(provider);
        break;
      case "test":
        await testProviderConnection(provider);
        break;
      default:
        break;
    }
  } catch (error) {
    setTestIndicator(provider, "error");
    setProviderKeyStatus(provider, error.message || String(error), "error");
  }
}

async function saveKeyFromField(provider) {
  const field = keyFields.get(provider);
  const nextKey = String(field?.value || "").trim();
  if (!nextKey) {
    throw new Error(`Enter the full ${PROVIDER_LABELS[provider]} API key to save it.`);
  }

  const response = await sendMessage({
    type: "saveProviderKey",
    payload: {
      provider,
      apiKey: nextKey
    }
  });

  field.value = "";
  setTestIndicator(provider, "");
  renderKeyStatus(provider, response.result.keyStatus);
  setStatus("");
}

async function clearProviderKey(provider) {
  const response = await sendMessage({
    type: "clearProviderKey",
    payload: {
      provider
    }
  });

  const field = keyFields.get(provider);
  if (field) {
    field.value = "";
  }

  setTestIndicator(provider, "");
  renderKeyStatus(provider, response.result.keyStatus);
  setStatus("");
}

async function testProviderConnection(provider) {
  flushPendingSave();
  await saveNonSecretSettings();

  const field = keyFields.get(provider);
  if (String(field?.value || "").trim()) {
    await saveKeyFromField(provider);
  }

  setTestIndicator(provider, "pending");
  try {
    await sendMessage({
      type: "testProviderConnection",
      payload: {
        provider
      }
    });
  } catch (error) {
    setTestIndicator(provider, "error");
    throw error;
  }

  setTestIndicator(provider, "success");
  clearProviderKeyStatus(provider);
  setStatus("");
}

function scheduleAutoSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    handleAutoSave().catch(error => {
      setStatus(error.message || String(error), "error");
    });
  }, 350);
}

async function handleAutoSave() {
  saveTimer = null;
  await saveNonSecretSettings();
  setStatus("");
}

function flushPendingSave() {
  if (!saveTimer) {
    return;
  }

  window.clearTimeout(saveTimer);
  saveTimer = null;
}

async function saveNonSecretSettings() {
  const response = await sendMessage({
    type: "updateOptionsSettings",
    payload: readNonSecretSettings()
  });

  return response.result.settings;
}

function readNonSecretSettings() {
  const data = new FormData(form);
  return {
    provider: normalizeProvider(data.get("provider")) || SETTINGS_DEFAULTS.provider,
    openaiModel: String(data.get("openaiModel") || SETTINGS_DEFAULTS.openaiModel).trim(),
    openaiReasoningEffort: String(data.get("openaiReasoningEffort") || "").trim(),
    openaiVerbosity: String(data.get("openaiVerbosity") || "").trim(),
    anthropicModel: String(data.get("anthropicModel") || SETTINGS_DEFAULTS.anthropicModel).trim(),
    summaryCacheEnabled: data.get("summaryCacheEnabled") === "on",
    prefetchDebugVisualizationEnabled: data.get("prefetchDebugVisualizationEnabled") === "on",
    systemPrompt: String(data.get("systemPrompt") || SETTINGS_DEFAULTS.systemPrompt).trim()
  };
}

function fillForm(settings) {
  setRadioValue("provider", normalizeProvider(settings.provider) || SETTINGS_DEFAULTS.provider);
  setFieldValue("openaiModel", settings.openaiModel ?? SETTINGS_DEFAULTS.openaiModel);
  setFieldValue("openaiReasoningEffort", settings.openaiReasoningEffort ?? SETTINGS_DEFAULTS.openaiReasoningEffort);
  setFieldValue("openaiVerbosity", settings.openaiVerbosity ?? SETTINGS_DEFAULTS.openaiVerbosity);
  setFieldValue("anthropicModel", settings.anthropicModel ?? SETTINGS_DEFAULTS.anthropicModel);
  setCheckboxValue("summaryCacheEnabled", settings.summaryCacheEnabled ?? SETTINGS_DEFAULTS.summaryCacheEnabled);
  setCheckboxValue(
    "prefetchDebugVisualizationEnabled",
    settings.prefetchDebugVisualizationEnabled ?? SETTINGS_DEFAULTS.prefetchDebugVisualizationEnabled
  );
  setFieldValue("systemPrompt", settings.systemPrompt ?? SETTINGS_DEFAULTS.systemPrompt);
}

function renderAllKeyStatuses(nextStatuses) {
  for (const provider of PROVIDERS) {
    renderKeyStatus(provider, nextStatuses?.[provider]);
  }
}

function renderKeyStatus(provider, keyState) {
  providerKeyStates.set(provider, {
    hasKey: Boolean(keyState?.hasKey)
  });
  clearProviderKeyStatus(provider);
  syncProviderActionState(provider);
}

function setProviderKeyStatus(provider, message, tone = "") {
  const element = keyStatuses.get(provider);
  if (!element) {
    return;
  }

  element.textContent = message;
  element.classList.remove("is-error", "is-success");
  if (tone === "error") {
    element.classList.add("is-error");
  }
  if (tone === "success") {
    element.classList.add("is-success");
  }
}

function clearProviderKeyStatus(provider) {
  setProviderKeyStatus(provider, "");
}

function setTestIndicator(provider, state) {
  const indicator = testIndicators.get(provider);
  if (!indicator) {
    return;
  }

  indicator.classList.remove("is-visible", "is-success", "is-error");
  indicator.textContent = "";
  indicator.removeAttribute("title");
  indicator.removeAttribute("aria-label");

  switch (state) {
    case "pending":
      indicator.classList.add("is-visible");
      indicator.textContent = "...";
      indicator.setAttribute("title", "Testing Key");
      indicator.setAttribute("aria-label", "Testing Key");
      break;
    case "success":
      indicator.classList.add("is-visible", "is-success");
      indicator.textContent = "✓";
      indicator.setAttribute("title", "Key Verified");
      indicator.setAttribute("aria-label", "Key Verified");
      break;
    case "error":
      indicator.classList.add("is-visible", "is-error");
      indicator.textContent = "×";
      indicator.setAttribute("title", "Key Test Failed");
      indicator.setAttribute("aria-label", "Key Test Failed");
      break;
    default:
      break;
  }
}

function clearAllTestIndicators() {
  for (const provider of PROVIDERS) {
    setTestIndicator(provider, "");
  }
}

function syncProviderUi() {
  const activeProvider = getSelectedProvider();
  for (const provider of PROVIDERS) {
    providerCards.get(provider)?.classList.toggle("is-active", provider === activeProvider);
    const label = providerLabels.get(provider);
    if (label) {
      label.textContent = provider === activeProvider ? "Active" : "Select";
    }
  }

  syncProviderActionStates();
}

function syncProviderActionStates() {
  for (const provider of PROVIDERS) {
    syncProviderActionState(provider);
  }
}

function syncProviderActionState(provider) {
  const actions = providerActions.get(provider);
  if (!actions) {
    return;
  }

  const hasSavedKey = Boolean(providerKeyStates.get(provider)?.hasKey);
  const hasTypedKey = Boolean(getProviderKeyInputValue(provider));

  if (actions.save) {
    actions.save.textContent = "Update";
    actions.save.disabled = !hasTypedKey;
  }

  if (actions.clear) {
    actions.clear.disabled = !hasSavedKey;
  }

  if (actions.test) {
    actions.test.disabled = !hasSavedKey && !hasTypedKey;
  }
}

async function loadOptionsState() {
  const response = await sendMessage({
    type: "getOptionsState"
  });

  return {
    settings: {
      ...SETTINGS_DEFAULTS,
      ...response.result.settings
    },
    keyStatuses: normalizeKeyStatuses(response.result)
  };
}

function normalizeKeyStatuses(result) {
  const statuses = {
    openai: { hasKey: false, maskedPreview: "" },
    anthropic: { hasKey: false, maskedPreview: "" }
  };

  if (result?.keyStatuses && typeof result.keyStatuses === "object") {
    for (const provider of PROVIDERS) {
      const nextStatus = result.keyStatuses[provider];
      if (nextStatus) {
        statuses[provider] = {
          hasKey: Boolean(nextStatus.hasKey),
          maskedPreview: String(nextStatus.maskedPreview || "")
        };
      }
    }
  }

  return statuses;
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!response) {
        reject(new Error("No response from the background worker."));
        return;
      }

      if (!response.ok) {
        reject(new Error(response.error || "The provider request failed."));
        return;
      }

      resolve(response);
    });
  });
}

function setStatus(message, tone = "") {
  status.textContent = message;
  status.classList.remove("is-error", "is-success");
  if (tone === "error") {
    status.classList.add("is-error");
  }
  if (tone === "success") {
    status.classList.add("is-success");
  }
}

function eventTargetsSecretField(event) {
  return Boolean(event?.target?.id && /ApiKey$/.test(event.target.id));
}

function getSecretFieldProvider(event) {
  const targetId = String(event?.target?.id || "");
  const match = targetId.match(/^(openai|anthropic)ApiKey$/);
  return match ? match[1] : "";
}

function getProviderKeyInputValue(provider) {
  return String(keyFields.get(provider)?.value || "").trim();
}

function getSelectedProvider() {
  return normalizeProvider(new FormData(form).get("provider")) || SETTINGS_DEFAULTS.provider;
}

function setRadioValue(name, value) {
  for (const radio of form.querySelectorAll(`input[type="radio"][name="${name}"]`)) {
    radio.checked = radio.value === value;
  }
}

function setFieldValue(name, value) {
  const field = form.elements.namedItem(name);
  if (field && "value" in field) {
    field.value = String(value ?? "");
  }
}

function setCheckboxValue(name, value) {
  const field = form.elements.namedItem(name);
  if (field instanceof HTMLInputElement) {
    field.checked = Boolean(value);
  }
}

function normalizeProvider(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return PROVIDERS.includes(normalized) ? normalized : "";
}
