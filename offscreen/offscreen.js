/* global Readability */

if (globalThis.chrome?.runtime?.onMessage?.addListener) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.target !== "offscreen" || message.type !== "extractReadableArticle") {
      return;
    }

    try {
      const result = extractReadableArticle(message.payload || {});
      sendResponse({ ok: true, result });
    } catch (error) {
      sendResponse({ ok: false, error: error.message || String(error) });
    }

    return true;
  });
}

export function extractReadableArticle(payload) {
  const html = String(payload?.html || "");
  const sourceUrl = String(payload?.url || "").trim();

  if (!html) {
    throw new Error("No HTML was provided for extraction.");
  }

  const parser = new DOMParser();
  const documentNode = parser.parseFromString(html, "text/html");
  if (!documentNode || !documentNode.documentElement) {
    throw new Error("The source page could not be parsed as HTML.");
  }

  setDocumentBaseUrl(documentNode, sourceUrl);
  stripNonContentElements(documentNode);

  const article = new Readability(documentNode.cloneNode(true)).parse();
  const fallbackText = extractFallbackText(documentNode);
  const textContent = normalizeText(article?.textContent || fallbackText).slice(0, 120000);

  return {
    title: normalizeText(article?.title || documentNode.title || ""),
    byline: normalizeText(article?.byline || ""),
    excerpt: normalizeText(article?.excerpt || ""),
    siteName: normalizeText(article?.siteName || ""),
    textContent
  };
}

export function setDocumentBaseUrl(documentNode, sourceUrl) {
  if (!sourceUrl) {
    return;
  }

  let base = documentNode.querySelector("base");
  if (!base) {
    base = documentNode.createElement("base");
    const head = documentNode.head || documentNode.documentElement;
    head.insertBefore(base, head.firstChild || null);
  }

  base.setAttribute("href", sourceUrl);
}

export function stripNonContentElements(documentNode) {
  for (const node of documentNode.querySelectorAll("script, style, noscript, iframe, svg, canvas, form, dialog, template")) {
    node.remove();
  }
}

export function extractFallbackText(documentNode) {
  const candidates = Array.from(documentNode.querySelectorAll("article, main, [role='main'], section, div"));
  let bestText = "";
  let bestScore = -Infinity;

  for (const element of candidates) {
    const paragraphs = Array.from(element.querySelectorAll("p"))
      .map(paragraph => normalizeText(paragraph.textContent))
      .filter(text => text.length > 40);

    const combinedParagraphs = paragraphs.join("\n\n");
    const text = combinedParagraphs || normalizeText(element.textContent);
    if (!text) {
      continue;
    }

    const label = `${element.tagName.toLowerCase()} ${element.id} ${element.className}`.toLowerCase();
    let score = text.length + paragraphs.length * 250;
    score += /article|content|entry|main|story|post|body/.test(label) ? 500 : 0;
    score -= element.querySelectorAll("nav, footer, aside").length * 250;

    if (score > bestScore) {
      bestScore = score;
      bestText = text;
    }
  }

  return bestText || normalizeText(documentNode.body?.textContent || "");
}

export function normalizeText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
