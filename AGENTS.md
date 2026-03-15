# AGENTS.md

This file is for people or coding agents working on the repo. The README is intentionally product-focused; the details below are the implementation and maintenance notes.

## Product Summary

- Chrome extension for `https://feedbin.com/*`
- Adds a `Summary` toolbar action to Feedbin articles
- Uses OpenAI or Anthropic to summarize either the visible article text or the fetched source page
- Remembers summary mode per feed
- Supports local summary caching and conservative prefetch

## Architecture

- `content/feedbin.js`
  Feedbin-specific content script. Injects the toolbar button, toggles summaries in place, remembers per-feed preferences, manages prefetch, and renders optional debug dots.
- `background/service-worker.js`
  Background coordinator. Handles settings, cache lookups, source fetches, provider requests, and runtime message routing.
- `background/message-router.js`
  Validates and dispatches the small set of supported runtime messages.
- `background/openai-client.js`
  OpenAI Responses API client. Only worker code should import or use this.
- `background/anthropic-client.js`
  Anthropic Messages API client. Only worker code should import or use this.
- `background/secret-manager.js`
  Owns persisted/session secret handling and trusted-context storage setup.
- `background/service-worker-core.js`
  Shared pure logic for settings normalization, prompt building, cache keys, and cache helpers.
- `offscreen/offscreen.js`
  HTML parsing and Readability extraction in an offscreen document.
- `options/`
  Trusted extension UI for settings and key entry.

## Trust Boundaries

- The service worker is the only code that persists or uses provider API keys.
- Content scripts are treated as untrusted.
- The options page is write-only for the key after save.
- Authorization headers are created only in the service worker.
- `chrome.storage.local` and `chrome.storage.session` are locked to `TRUSTED_CONTEXTS`.

More detail is in [SECURITY.md](/Users/ian/Source/summarize-extension/SECURITY.md).

## Summary Flow

1. The content script detects the active Feedbin article and injects the `Summary` button.
2. On click, it sends article metadata and text to the service worker.
3. The worker decides whether to use cached output, visible article text, or fetched source-page text.
4. The worker calls the selected provider API.
5. The content script replaces the article body with the returned summary using Feedbin's existing article styling.

## Prefetch Behavior

- If summary mode is remembered for a feed, opening articles in that feed can auto-summarize.
- When a feed is selected in the left pane, the next `3` unread articles in the middle pane are candidates for prefetch.
- In broader unread/tag views, the first unread article for each summary-enabled feed can be prefetched.
- Prefetch work is skipped when cache is disabled.
- Optional debug dots:
  - `eligible` gray
  - `fetching` amber
  - `ready` green

## Storage

- `chrome.storage.local`
  - `settings`
  - `feedbinState`
  - `summaryCacheEntries`
  - `secrets`
- `chrome.storage.session`
  - `sessionSecrets`
- service worker memory
  - active in-memory copies of provider API keys

## Runtime Messages

Options page -> service worker
- `getOptionsState`
- `updateOptionsSettings`
- `saveProviderKey`
- `clearProviderKey`
- `testProviderConnection`

Content script -> service worker
- `getFeedbinState`
- `setFeedSummaryPreference`
- `summarizeArticle`
- `prefetchArticle`
- `checkCachedSummaries`
- `cancelPrefetch`

Service worker -> content script
- `settingsUpdated`
- `feedPreferencesUpdated`

No other message types should be supported.

## Commands

- `npm run lint`
- `npm test`
- `npm run build:package`

The Husky pre-commit hook runs lint and tests automatically.

## Packaging And Release

- Bump the extension version in `manifest.json` before packaging a new build.
- Build the uploadable zip with `npm run build:package`.
- Output lands in `dist/feedbin-summarizer-<version>.zip`.
- Chrome Web Store API automation is still pending. See [TODO.md](/Users/ian/Source/summarize-extension/TODO.md).

## Notes For Future Changes

- Keep `README.md` user-facing.
- Put implementation details, workflows, and maintenance notes here instead of expanding the README.
- UI headers, labels, and titles should use Title Case.
- Avoid widening permissions casually, especially article host permissions and anything related to secrets.
