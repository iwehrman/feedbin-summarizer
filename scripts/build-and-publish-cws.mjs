import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const manifestPath = path.join(projectRoot, "manifest.json");
const distDir = path.join(projectRoot, "dist");

const buildCommand = ["node", [path.join("scripts", "build-package.mjs")]];
const requiredEnvNames = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "CWS_REFRESH_TOKEN",
  "CWS_PUBLISHER_ID",
  "CWS_EXTENSION_ID"
];
const uploadPollIntervalMs = 2000;
const uploadPollTimeoutMs = 60000;
const dotEnvPath = path.join(projectRoot, ".env");
const dotEnvValues = await loadDotEnv(dotEnvPath);

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const extensionVersion = manifest.version || "0.0.0";
const packageBaseName = `feedbin-summarizer-${extensionVersion}`;
const zipPath = path.join(distDir, `${packageBaseName}.zip`);

await runBuild();

const env = readRequiredEnv(requiredEnvNames, dotEnvValues);
const accessToken = await getAccessToken(env);
const itemName = `publishers/${env.CWS_PUBLISHER_ID}/items/${env.CWS_EXTENSION_ID}`;

console.log(`Uploading ${packageBaseName}.zip to the Chrome Web Store...`);
const uploadResponse = await uploadPackage({
  accessToken,
  itemName,
  zipPath
});
const uploadState = await waitForUploadIfNeeded({
  accessToken,
  itemName,
  initialResponse: uploadResponse
});

if (uploadState && uploadState !== "SUCCESS") {
  throw new Error(`Chrome Web Store upload did not succeed. Final uploadState: ${uploadState}`);
}

console.log("Submitting uploaded package for review...");
const publishResponse = await publishItem({ accessToken, itemName });
const publishedState = getFirstMatchingValue(publishResponse, [
  "status",
  "publishState",
  "itemState"
]);

console.log("Chrome Web Store publish request completed.");
if (publishedState) {
  console.log(`Publish state: ${publishedState}`);
}
console.log(`Extension version ${extensionVersion} is uploaded and submitted.`);

async function runBuild() {
  await new Promise((resolve, reject) => {
    const child = spawn(buildCommand[0], buildCommand[1], {
      cwd: projectRoot,
      stdio: "inherit"
    });

    child.on("error", error => {
      reject(new Error(`Failed to start build step: ${error.message || error}`));
    });

    child.on("close", code => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Package build exited with code ${code}.`));
    });
  });
}

function readRequiredEnv(names, dotEnvValues) {
  const mergedEnv = Object.fromEntries(
    names.map(name => [name, process.env[name] || dotEnvValues[name] || ""])
  );
  const missing = names.filter(name => !mergedEnv[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}.`
    );
  }

  return mergedEnv;
}

async function getAccessToken(env) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.CWS_REFRESH_TOKEN,
      grant_type: "refresh_token"
    })
  });

  const payload = await parseJsonResponse(response, "token refresh");
  const accessToken = payload.access_token;

  if (!response.ok || !accessToken) {
    throw new Error(
      `Failed to refresh Chrome Web Store access token: ${formatApiError(payload)}`
    );
  }

  return accessToken;
}

async function uploadPackage({ accessToken, itemName, zipPath }) {
  const zipBuffer = await readFile(zipPath);
  const response = await fetch(
    `https://chromewebstore.googleapis.com/upload/v2/${itemName}:upload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/zip"
      },
      body: zipBuffer
    }
  );

  const payload = await parseJsonResponse(response, "package upload");
  if (!response.ok) {
    throw new Error(`Chrome Web Store upload failed: ${formatApiError(payload)}`);
  }

  return payload;
}

async function waitForUploadIfNeeded({ accessToken, itemName, initialResponse }) {
  let uploadState = getFirstMatchingValue(initialResponse, ["uploadState"]);

  if (!uploadState || uploadState === "SUCCESS") {
    return uploadState || "SUCCESS";
  }

  if (uploadState !== "UPLOAD_IN_PROGRESS") {
    return uploadState;
  }

  const deadline = Date.now() + uploadPollTimeoutMs;

  while (Date.now() < deadline) {
    await sleep(uploadPollIntervalMs);
    const statusResponse = await fetchStatus({ accessToken, itemName });
    uploadState = getFirstMatchingValue(statusResponse, ["uploadState"]);

    if (!uploadState || uploadState === "SUCCESS") {
      return uploadState || "SUCCESS";
    }

    if (uploadState !== "UPLOAD_IN_PROGRESS") {
      return uploadState;
    }
  }

  throw new Error(
    `Timed out waiting for Chrome Web Store upload processing after ${uploadPollTimeoutMs / 1000}s.`
  );
}

async function fetchStatus({ accessToken, itemName }) {
  const response = await fetch(
    `https://chromewebstore.googleapis.com/v2/${itemName}:fetchStatus`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  const payload = await parseJsonResponse(response, "status fetch");
  if (!response.ok) {
    throw new Error(
      `Chrome Web Store status fetch failed: ${formatApiError(payload)}`
    );
  }

  return payload;
}

async function publishItem({ accessToken, itemName }) {
  const response = await fetch(
    `https://chromewebstore.googleapis.com/v2/${itemName}:publish`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        publishType: "DEFAULT_PUBLISH",
        skipReview: false
      })
    }
  );

  const payload = await parseJsonResponse(response, "publish");
  if (!response.ok) {
    throw new Error(`Chrome Web Store publish failed: ${formatApiError(payload)}`);
  }

  return payload;
}

async function parseJsonResponse(response, actionLabel) {
  const text = await response.text();
  if (text.trim() === "") {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Failed to parse Chrome Web Store ${actionLabel} response: ${error.message || error}`
    );
  }
}

function formatApiError(payload) {
  return (
    getFirstMatchingValue(payload, ["message", "status", "error"]) ||
    JSON.stringify(payload)
  );
}

function getFirstMatchingValue(value, keys) {
  const seen = new Set();
  const queue = [value];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current || typeof current !== "object") {
      continue;
    }

    if (seen.has(current)) {
      continue;
    }
    seen.add(current);

    for (const key of keys) {
      if (typeof current[key] === "string" && current[key].length > 0) {
        return current[key];
      }
    }

    for (const nestedValue of Object.values(current)) {
      queue.push(nestedValue);
    }
  }

  return null;
}

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

async function loadDotEnv(targetPath) {
  let text = "";

  try {
    text = await readFile(targetPath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }

  const entries = {};
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    entries[key] = value;
  }

  return entries;
}
