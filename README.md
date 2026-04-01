# Feedbin Summarizer

Feedbin Summarizer is a Chrome extension for people who read in Feedbin and want a faster way to understand what an article is about. It adds a `Summary` action to Feedbin's article toolbar and replaces the article body with a concise AI-generated summary using the same article styling already on the page.

Chrome Web Store:
- <https://chromewebstore.google.com/detail/feedbin-summarizer/cmhjhbmppmjjnnlihbmbggockdonkgbo>

## What It Does

- Adds a `Summary` button next to Feedbin's native article actions
- Replaces the current article body with a summary and lets you toggle back to the original article
- Adds a `More` action inside summaries so you can expand the initial summary with extra detail
- Tries to summarize the full linked article, not just the RSS excerpt shown in Feedbin
- Remembers summary mode per feed, so feeds you enable can summarize automatically when you open new articles
- Can prefetch upcoming summaries for faster article switching
- Can cache matching summaries locally for reuse

## How It Works In Feedbin

1. Open an article in Feedbin.
2. Click `Summary` in the article toolbar.
3. The extension fetches and summarizes the article, then swaps the article body in place.
4. Click `More` inside the summary if you want additional detail appended below the first summary.
5. Click `Summary` again to restore the original article text.

If you leave summary mode enabled for a feed, future articles from that feed can summarize automatically when you open them.

## Install

Install the published extension from the Chrome Web Store:

- <https://chromewebstore.google.com/detail/feedbin-summarizer/cmhjhbmppmjjnnlihbmbggockdonkgbo>

Then open the extension's options page, choose a provider, add your API key, test it, and start using `Summary` in Feedbin.

## Settings

- `Provider`
  Chooses whether summaries use OpenAI or Anthropic by default.
- `API Key`
  Stores the selected provider keys locally inside the extension.
- `OpenAI model`
  Defaults to `gpt-5.4-mini`, with `gpt-5.4-nano` and `gpt-5.4` as the other built-in choices.
- `Reasoning effort`
  OpenAI-only. For the current GPT-5.4 models, the built-in choices are `none`, `low`, `medium`, `high`, and `xhigh`.
- `Verbosity`
  OpenAI-only. Lets you bias toward shorter or fuller responses.
- `Anthropic model`
  Defaults to `claude-haiku-4-5`, with `claude-sonnet-4-6` as the stronger alternative.
- `Cache Summaries`
  Reuses matching summaries locally for 7 days.
- `Show Summary Indicators`
  Adds tiny dots in Feedbin to show which feeds and articles are eligible, fetching, or ready.
- `Instructions`
  Controls the style and priorities of the generated summary.

## Privacy And Security

This extension uses user-supplied OpenAI and/or Anthropic API keys and calls those APIs directly from the extension. Keys are stored locally and are not backed by a separate server. That is convenient for a personal tool, but it is less secure than a backend-based design.

The public privacy policy is in [privacy-policy.md](privacy-policy.md).

More detail is in [SECURITY.md](SECURITY.md).

## Local Development

These steps are only for developing or testing the extension locally from this repository.

1. Open `chrome://extensions`
2. Turn on `Developer mode`
3. Click `Load unpacked`
4. Select this repository folder
5. Open the extension's `Details` page and click `Extension options`
6. Choose a provider
7. Enter an OpenAI and/or Anthropic API key
8. Use `Test` on the provider you plan to use
9. Open Feedbin and use the new `Summary` action

## For Development Notes

Implementation notes, architecture, test commands, packaging steps, and maintenance guidance live in [AGENTS.md](AGENTS.md).
