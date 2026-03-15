# Feedbin Summarizer

Feedbin Summarizer is a Chrome extension for people who read in Feedbin and want a faster way to understand what an article is about. It adds a `Summary` action to Feedbin's article toolbar and replaces the article body with a concise OpenAI-generated summary using the same article styling already on the page.

## What It Does

- Adds a `Summary` button next to Feedbin's native article actions
- Replaces the current article body with a summary and lets you toggle back to the original article
- Tries to summarize the full linked article, not just the RSS excerpt shown in Feedbin
- Remembers summary mode per feed, so feeds you enable can summarize automatically when you open new articles
- Can prefetch upcoming summaries for faster article switching
- Can cache matching summaries locally for reuse

## How It Works In Feedbin

1. Open an article in Feedbin.
2. Click `Summary` in the article toolbar.
3. The extension fetches and summarizes the article, then swaps the article body in place.
4. Click `Summary` again to restore the original article text.

If you leave summary mode enabled for a feed, future articles from that feed can summarize automatically when you open them.

## Install And Set Up

1. Open `chrome://extensions`
2. Turn on `Developer mode`
3. Click `Load unpacked`
4. Select this repository folder
5. Open the extension's `Details` page and click `Extension options`
6. Enter your OpenAI API key and click `Save key`
7. Adjust the model and summarization settings if you want
8. Use `Test API` to confirm the key works
9. Open Feedbin and use the new `Summary` action

## Settings

- `API key`
  Stores your OpenAI key locally in the extension.
- `Model`
  Chooses which OpenAI model is used for summaries.
- `Reasoning effort`
  Useful mainly for GPT-5-family models.
- `Verbosity`
  Lets you bias toward shorter or fuller responses.
- `Enable summary cache`
  Reuses matching summaries locally for about 36 hours.
- `Show prefetch debug indicators`
  Adds tiny dots in Feedbin to show which feeds and articles are eligible, fetching, or ready.
- `Summarization instructions`
  Controls the style and priorities of the generated summary.

## Privacy And Security

This extension uses a user-supplied OpenAI API key and calls OpenAI directly from the extension. The key is stored locally and is not backed by a separate server. That is convenient for a personal tool, but it is less secure than a backend-based design.

More detail is in [SECURITY.md](/Users/ian/Source/summarize-extension/SECURITY.md).

## For Development

Implementation notes, architecture, test commands, packaging steps, and maintenance guidance live in [AGENTS.md](/Users/ian/Source/summarize-extension/AGENTS.md).
