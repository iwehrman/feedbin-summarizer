import { DEFAULT_SETTINGS } from "../shared/defaults.js";

const form = document.getElementById("settings-form");
const status = document.getElementById("status");
const keyStatus = document.getElementById("key-status");
const testButton = document.getElementById("test-button");
const saveKeyButton = document.getElementById("save-key-button");
const clearKeyButton = document.getElementById("clear-key-button");
const keyField = document.getElementById("openaiApiKey");
let saveTimer = null;

init().catch(error => {
  setStatus(error.message || String(error), "error");
});

async function init() {
  const optionsState = await loadOptionsState();
  fillForm(optionsState.settings);
  renderKeyStatus(optionsState.keyStatus);
  form.addEventListener("input", scheduleAutoSave);
  form.addEventListener("change", scheduleAutoSave);
  testButton.addEventListener("click", handleTestConnection);
  saveKeyButton.addEventListener("click", handleSaveKey);
  clearKeyButton.addEventListener("click", handleClearKey);
}

async function handleSaveKey(event) {
  event.preventDefault();
  try {
    await saveKeyFromField();
  } catch (error) {
    setKeyStatus(error.message || String(error), "error");
  }
}

async function saveKeyFromField() {
  const nextKey = String(keyField.value || "").trim();
  if (!nextKey) {
    throw new Error("Enter the full key to save it.");
  }

  const response = await sendMessage({
    type: "saveOpenAIKey",
    payload: {
      openaiApiKey: nextKey
    }
  });

  keyField.value = "";
  renderKeyStatus(response.result.keyStatus);
  setStatus("Key saved.", "success");
}

async function handleClearKey(event) {
  event.preventDefault();

  try {
    const response = await sendMessage({
      type: "clearOpenAIKey"
    });

    keyField.value = "";
    renderKeyStatus(response.result.keyStatus);
    setStatus("Key cleared.", "success");
  } catch (error) {
    setKeyStatus(error.message || String(error), "error");
  }
}

async function handleTestConnection(event) {
  event.preventDefault();
  try {
    flushPendingSave();
    await saveNonSecretSettings();
    if (String(keyField.value || "").trim()) {
      await saveKeyFromField();
    }

    setStatus("Testing API...");

    const response = await sendMessage({
      type: "testOpenAIConnection"
    });

    setStatus(`API is working. Sample response: ${truncate(response.result.summaryText, 120)}`, "success");
  } catch (error) {
    setStatus(error.message || String(error), "error");
  }
}

function scheduleAutoSave(event) {
  if (eventTargetsSecretField(event)) {
    return;
  }

  window.clearTimeout(saveTimer);
  setStatus("Saving...");
  saveTimer = window.setTimeout(() => {
    handleAutoSave().catch(error => {
      setStatus(error.message || String(error), "error");
    });
  }, 350);
}

async function handleAutoSave() {
  saveTimer = null;
  await saveNonSecretSettings();
  setStatus("Saved.", "success");
}

function flushPendingSave() {
  if (saveTimer) {
    window.clearTimeout(saveTimer);
    saveTimer = null;
  }
}

async function saveNonSecretSettings() {
  const settings = readNonSecretSettings();
  const response = await sendMessage({
    type: "updateOptionsSettings",
    payload: settings
  });

  return response.result.settings;
}

function readNonSecretSettings() {
  const data = new FormData(form);
  return {
    openaiModel: String(data.get("openaiModel") || DEFAULT_SETTINGS.openaiModel).trim(),
    openaiReasoningEffort: String(data.get("openaiReasoningEffort") || "").trim(),
    openaiVerbosity: String(data.get("openaiVerbosity") || "").trim(),
    summaryCacheEnabled: data.get("summaryCacheEnabled") === "on",
    systemPrompt: String(data.get("systemPrompt") || DEFAULT_SETTINGS.systemPrompt).trim()
  };
}

function fillForm(settings) {
  for (const [key, value] of Object.entries(settings)) {
    if (key === "openaiApiKey") {
      continue;
    }

    const field = form.elements.namedItem(key);
    if (field) {
      if (field instanceof HTMLInputElement && field.type === "checkbox") {
        field.checked = Boolean(value);
        continue;
      }

      field.value = value;
    }
  }
}

function renderKeyStatus(keyState, overrideMessage = "", tone = "") {
  if (overrideMessage) {
    setKeyStatus(overrideMessage, tone);
    return;
  }

  if (keyState?.hasOpenAIKey) {
    setKeyStatus(`Key saved ${keyState.maskedPreview || ""}`.trim(), "success");
    return;
  }

  setKeyStatus("No key configured.");
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

function setKeyStatus(message, tone = "") {
  keyStatus.textContent = message;
  keyStatus.classList.remove("is-error", "is-success");
  if (tone === "error") {
    keyStatus.classList.add("is-error");
  }
  if (tone === "success") {
    keyStatus.classList.add("is-success");
  }
}

async function loadOptionsState() {
  const response = await sendMessage({
    type: "getOptionsState"
  });

  return {
    settings: {
      ...DEFAULT_SETTINGS,
      ...response.result.settings
    },
    keyStatus: response.result.keyStatus || {
      hasOpenAIKey: false,
      maskedPreview: ""
    }
  };
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
        reject(new Error(response.error || "The OpenAI test failed."));
        return;
      }

      resolve(response);
    });
  });
}

function truncate(value, limit) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit - 3)}...`;
}

function eventTargetsSecretField(event) {
  return Boolean(event?.target?.id === "openaiApiKey");
}
