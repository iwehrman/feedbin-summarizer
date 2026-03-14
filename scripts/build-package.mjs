import { cp, mkdir, readFile, rm, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const distDir = path.join(projectRoot, "dist");

const packageJson = JSON.parse(
  await readFile(path.join(projectRoot, "package.json"), "utf8")
);
const manifest = JSON.parse(
  await readFile(path.join(projectRoot, "manifest.json"), "utf8")
);

const extensionVersion = manifest.version || packageJson.version || "0.0.0";
const packageBaseName = `feedbin-summarizer-${extensionVersion}`;
const stageDir = path.join(distDir, packageBaseName);
const zipPath = path.join(distDir, `${packageBaseName}.zip`);

const runtimePaths = [
  "manifest.json",
  "README.md",
  "SECURITY.md",
  "background",
  "content",
  "offscreen",
  "options",
  "shared"
];

const readabilitySource = path.join(
  projectRoot,
  "node_modules",
  "@mozilla",
  "readability",
  "Readability.js"
);
const readabilityTarget = path.join(
  stageDir,
  "node_modules",
  "@mozilla",
  "readability",
  "Readability.js"
);

await ensureExists(readabilitySource, "Missing Readability dependency. Run `npm install` first.");

await rm(stageDir, { recursive: true, force: true });
await rm(zipPath, { force: true });
await mkdir(stageDir, { recursive: true });

for (const relativePath of runtimePaths) {
  const sourcePath = path.join(projectRoot, relativePath);
  await ensureExists(sourcePath, `Missing runtime path: ${relativePath}`);
  await cp(sourcePath, path.join(stageDir, relativePath), {
    recursive: true
  });
}

await mkdir(path.dirname(readabilityTarget), { recursive: true });
await cp(readabilitySource, readabilityTarget);
await createZipArchive(stageDir, zipPath);

console.log(`Built Chrome Web Store package: ${zipPath}`);

async function ensureExists(targetPath, message) {
  try {
    await stat(targetPath);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      throw new Error(message);
    }
    throw error;
  }
}

async function createZipArchive(sourceDir, destinationZip) {
  await new Promise((resolve, reject) => {
    const zip = spawn("zip", ["-qr", destinationZip, "."], {
      cwd: sourceDir,
      stdio: "inherit"
    });

    zip.on("error", error => {
      reject(new Error(`Failed to run zip: ${error.message || error}`));
    });

    zip.on("close", code => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`zip exited with code ${code}.`));
    });
  });
}
