# Feedbin Summarizer

A Manifest V3 Chrome extension that adds a `Summary` button to Feedbin's article toolbar and replaces the article body with an OpenAI-generated summary.

## What It Does

- Runs only on `https://feedbin.com/*`
- Injects a `Summary` action next to Feedbin's native article actions
- Fetches the full source page when possible, extracts readable text, and summarizes that
- Falls back to the text already visible in Feedbin when source-page extraction fails
- Uses the OpenAI Responses API directly from the extension service worker
- Remembers per-feed summary mode and can prefetch a few upcoming summaries
- Caches summaries locally for up to 36 hours when the cache setting is enabled

## Security Model

- The service worker is the only code that persists or uses the OpenAI API key.
- The options page is write-only for the key. After save, it shows only masked status dots.
- Content scripts are treated as untrusted. They send article text and metadata to the worker and receive summary text back.
- `chrome.storage.local` and `chrome.storage.session` are restricted to `TRUSTED_CONTEXTS` at startup so content scripts cannot read extension storage directly.
- Authorization headers are constructed only in the service worker.

More detail is in [SECURITY.md](/Users/ian/Source/summarize-extension/SECURITY.md).

## Load It In Chrome

1. Open `chrome://extensions`
2. Turn on `Developer mode`
3. Click `Load unpacked`
4. Select this folder: `/Users/ian/Source/summarize-extension`
5. Open the extension's `Details` page and click `Extension options`
6. Paste your OpenAI API key and click `Save key`
7. Adjust model, reasoning effort, verbosity, cache, or prompt settings; those save automatically
8. Use `Test API` to verify the key without revealing it back into the UI
9. Open Feedbin and click `Summary` in the article toolbar

## Message Flow

- Options page -> service worker:
  - `getOptionsState`
  - `updateOptionsSettings`
  - `saveOpenAIKey`
  - `clearOpenAIKey`
  - `testOpenAIConnection`
- Content script -> service worker:
  - `getFeedbinState`
  - `setFeedSummaryPreference`
  - `summarizeArticle`
  - `prefetchArticle`
  - `checkCachedSummaries`
  - `cancelPrefetch`
- Service worker -> content script:
  - `settingsUpdated`
  - `feedPreferencesUpdated`

The worker rejects all other message types, including any attempt to request the raw API key or proxy arbitrary fetches.

## Storage Design

- `chrome.storage.local`
  - `settings`
  - `feedbinState`
  - `summaryCacheEntries`
  - `secrets` with the persisted OpenAI key
- `chrome.storage.session`
  - `sessionSecrets` with the active in-session copy of the OpenAI key
- Service worker memory
  - in-memory copy of the OpenAI key for active use

The options page never reads the saved key back from storage after save. It only receives `has key / no key` status plus a masked preview.

## Permissions

- `storage`
  - Required for settings, feed preferences, the summary cache, and trusted-context secret storage.
- `offscreen`
  - Required so the worker can parse fetched source HTML with Readability in an offscreen document.
- `https://feedbin.com/*`
  - Required for the content script and Feedbin tab messaging.
- `http://*/*` and `https://*/*`
  - Required because source articles can live on arbitrary origins, and the extension fetches those pages directly for summarization and prefetch.

## Development

- Syntax checks:
  - `node --check background/service-worker.js`
  - `node --check content/feedbin.js`
  - `node --check options/options.js`
- Tests:
  - `npm test`
