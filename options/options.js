const DEFAULT_SETTINGS = {
  openaiApiKey: "",
  openaiModel: "gpt-4.1-mini",
  openaiReasoningEffort: "minimal",
  openaiVerbosity: "low",
  summaryCacheEnabled: true,
  systemPrompt: [
    "You summarize articles for a single user inside Feedbin.",
    "Prioritize what happened, why it matters, and any important nuance, dates, names, or numbers.",
    "Be compact but not vague.",
    "Do not mention that you are an AI assistant.",
    "Return plain text only."
  ].join(" ")
};

const form = document.getElementById("settings-form");
const status = document.getElementById("status");
const testButton = document.getElementById("test-button");
let saveTimer = null;

init().catch(error => {
  setStatus(error.message || String(error), "error");
});

async function init() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  const settings = {
    ...DEFAULT_SETTINGS,
    ...migrateLegacySettings(stored)
  };

  fillForm(settings);
  form.addEventListener("input", scheduleAutoSave);
  form.addEventListener("change", scheduleAutoSave);
  testButton.addEventListener("click", handleSaveAndTest);
}

async function handleSaveAndTest(event) {
  event.preventDefault();
  try {
    flushPendingSave();
    const settings = await saveForm();
    setStatus("Testing API...");

    const response = await sendMessage({
      type: "testProvider",
      payload: settings
    });

    setStatus(`API is working. Sample response: ${truncate(response.result.summaryText, 120)}`, "success");
  } catch (error) {
    setStatus(error.message || String(error), "error");
  }
}

function scheduleAutoSave() {
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
  await saveForm();
  setStatus("Saved.", "success");
}

function flushPendingSave() {
  if (saveTimer) {
    window.clearTimeout(saveTimer);
    saveTimer = null;
  }
}

async function saveForm() {
  const settings = readForm();
  await chrome.storage.local.set(settings);
  return settings;
}

function readForm() {
  const data = new FormData(form);
  return {
    openaiApiKey: String(data.get("openaiApiKey") || "").trim(),
    openaiModel: String(data.get("openaiModel") || DEFAULT_SETTINGS.openaiModel).trim(),
    openaiReasoningEffort: String(data.get("openaiReasoningEffort") || "").trim(),
    openaiVerbosity: String(data.get("openaiVerbosity") || "").trim(),
    summaryCacheEnabled: data.get("summaryCacheEnabled") === "on",
    systemPrompt: String(data.get("systemPrompt") || DEFAULT_SETTINGS.systemPrompt).trim()
  };
}

function fillForm(settings) {
  for (const [key, value] of Object.entries(settings)) {
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

function migrateLegacySettings(settings) {
  const next = { ...settings };
  if (typeof next.summaryCacheEnabled === "undefined") {
    next.summaryCacheEnabled = true;
  }

  return next;
}
