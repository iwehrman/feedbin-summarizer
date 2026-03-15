# Security Notes

## Threat Model

This extension intentionally accepts user-supplied OpenAI and Anthropic API keys and calls those APIs directly from the browser extension. That is less secure than using a backend. The goal of this design is to minimize exposure of keys inside the extension, not to make a client-side key equivalent to a server-side secret.

## Current Protections

- Manifest V3 only.
- The service worker is the only component that reads or uses saved provider API keys.
- The options page is write-only for keys. It can submit a new key or clear a saved key, but it does not read the full stored value back.
- Content scripts are treated as untrusted. They never receive the key and never construct Authorization headers.
- `chrome.storage.local` and `chrome.storage.session` are set to `TRUSTED_CONTEXTS` so content scripts cannot read extension storage directly.
- The persisted key lives only in `chrome.storage.local` under `secrets`.
- The active key is mirrored into `chrome.storage.session` and worker memory for active use.
- Only the service worker imports provider API clients and constructs authorization headers.
- The message router only accepts explicit message types and rejects unknown message types, arbitrary fetch requests, and any attempt to request raw credential material.
- API errors are sanitized before being returned to the UI.
- Request timeouts and abort handling are enabled for source-page fetches and provider API requests.

## Storage Layout

- `chrome.storage.local`
  - `settings`
  - `feedbinState`
  - `summaryCacheEntries`
  - `secrets`
- `chrome.storage.session`
  - `sessionSecrets`
- service worker memory
  - active in-memory copies of `openaiApiKey` and `anthropicApiKey`

## Message Boundaries

- Options page -> service worker
  - `getOptionsState`
  - `updateOptionsSettings`
  - `saveProviderKey`
  - `clearProviderKey`
  - `testProviderConnection`
- Content script -> service worker
  - `getFeedbinState`
  - `setFeedSummaryPreference`
  - `summarizeArticle`
  - `prefetchArticle`
  - `checkCachedSummaries`
  - `cancelPrefetch`

No other message types are supported.

## Remaining Risks

These risks cannot be fully removed without moving the key to a backend:

- A local machine compromise can still expose the browser profile, extension code, or trusted extension storage.
- A developer with local DevTools access to trusted extension contexts may still inspect extension state.
- The extension has broad `http://*/*` and `https://*/*` host permissions because it fetches source articles from arbitrary origins. That increases the impact of a bug in source-fetching code, even though the worker does not expose a generic authenticated fetch proxy.
- A malicious extension update would still be able to change trusted extension code.
- The summary cache stores article-derived text locally, which may be sensitive depending on what you read in Feedbin.

## Operational Advice

- Use dedicated provider keys with tight spend limits.
- Rotate the key if you ever suspect the browser profile or extension environment was exposed.
- Clear the key from the options page when you are not using the extension for long periods.
