import path from "node:path";
import { pathToFileURL } from "node:url";

import { JSDOM } from "jsdom";

export async function importFresh(relativePath) {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  const url = pathToFileURL(absolutePath);
  url.searchParams.set("t", `${Date.now()}-${Math.random()}`);
  return import(url.href);
}

export async function withJSDOM(html, callback, options = {}) {
  const dom = new JSDOM(html, {
    url: options.url || "https://feedbin.com/",
    pretendToBeVisual: true
  });

  const previousGlobals = captureGlobals();
  installDomGlobals(dom.window);

  try {
    return await callback(dom);
  } finally {
    await new Promise(resolve => dom.window.setTimeout(resolve, 0));
    restoreGlobals(previousGlobals);
    dom.window.close();
  }
}

export async function waitFor(predicate, { timeoutMs = 1000, intervalMs = 20 } = {}) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) {
      return value;
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error("Timed out waiting for condition.");
}

function installDomGlobals(window) {
  defineGlobal("window", window);
  defineGlobal("document", window.document);
  defineGlobal("navigator", window.navigator);
  defineGlobal("location", window.location);
  defineGlobal("MutationObserver", window.MutationObserver);
  defineGlobal("DOMParser", window.DOMParser);
  defineGlobal("FormData", window.FormData);
  defineGlobal("Event", window.Event);
  defineGlobal("MouseEvent", window.MouseEvent);
  defineGlobal("KeyboardEvent", window.KeyboardEvent);
  defineGlobal("CustomEvent", window.CustomEvent);
  defineGlobal("Node", window.Node);
  defineGlobal("Element", window.Element);
  defineGlobal("HTMLElement", window.HTMLElement);
  defineGlobal("HTMLInputElement", window.HTMLInputElement);
  defineGlobal("HTMLTextAreaElement", window.HTMLTextAreaElement);
  defineGlobal("HTMLSelectElement", window.HTMLSelectElement);
  defineGlobal("getComputedStyle", window.getComputedStyle.bind(window));

  Object.defineProperty(window.HTMLElement.prototype, "innerText", {
    configurable: true,
    get() {
      return this.textContent || "";
    },
    set(value) {
      this.textContent = value;
    }
  });

  Object.defineProperty(window.HTMLElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value() {
      return {
        width: 20,
        height: 20,
        top: 0,
        left: 0,
        right: 20,
        bottom: 20
      };
    }
  });
}

function captureGlobals() {
  return new Map([
    ["window", globalThis.window],
    ["document", globalThis.document],
    ["navigator", globalThis.navigator],
    ["location", globalThis.location],
    ["MutationObserver", globalThis.MutationObserver],
    ["DOMParser", globalThis.DOMParser],
    ["FormData", globalThis.FormData],
    ["Event", globalThis.Event],
    ["MouseEvent", globalThis.MouseEvent],
    ["KeyboardEvent", globalThis.KeyboardEvent],
    ["CustomEvent", globalThis.CustomEvent],
    ["Node", globalThis.Node],
    ["Element", globalThis.Element],
    ["HTMLElement", globalThis.HTMLElement],
    ["HTMLInputElement", globalThis.HTMLInputElement],
    ["HTMLTextAreaElement", globalThis.HTMLTextAreaElement],
    ["HTMLSelectElement", globalThis.HTMLSelectElement],
    ["getComputedStyle", globalThis.getComputedStyle]
  ]);
}

function restoreGlobals(previousGlobals) {
  for (const [key, value] of previousGlobals.entries()) {
    if (typeof value === "undefined") {
      continue;
    }

    defineGlobal(key, value);
  }
}

function defineGlobal(key, value) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value
  });
}
