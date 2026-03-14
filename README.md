# Feedbin Summarizer

A Manifest V3 Chrome extension that adds a `Summary` button to Feedbin's article toolbar and replaces the article body with an LLM-generated summary.

## What It Does

- Runs only on `https://feedbin.com/*`
- Injects a new summary button into the active article view
- Tries to fetch the original source page and summarize the full extracted article text
- Falls back to the article text already visible in Feedbin when the source page cannot be fetched or parsed
- Sends the article text, title, and source URL to OpenAI via the Responses API
- Stores API keys at runtime in `chrome.storage.local`
- Can cache summaries locally for 36 hours so repeat requests can skip the API call
- Lets you restore the original article body after summarizing

## Load It In Chrome

1. Open `chrome://extensions`
2. Turn on `Developer mode`
3. Click `Load unpacked`
4. Select this folder: `/Users/ian/Source/summarize-extension`
5. Open the extension's `Details` page and click `Extension options`
6. Add your API key and other settings; changes save automatically
7. Reload the extension after manifest changes
8. Open Feedbin and click the new `Summary` button in the article toolbar

## Notes

- The button is anchored to Feedbin's current article view, source link, and native extract-content toolbar action.
- If the extension cannot find Feedbin's existing toolbar, it inserts a small fallback toolbar directly above the article body.
- Full-page extraction uses Mozilla Readability in an offscreen document so the service worker can fetch source HTML and still parse it with DOM APIs.
- The extension now has broad host access so it can fetch source articles directly from many different sites.
- The options page exposes model, reasoning effort, verbosity, and a cache toggle so you can tune speed and summary style.
