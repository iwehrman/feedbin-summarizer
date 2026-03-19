# Privacy Policy for Feedbin Summarizer

**Effective Date:** March 19, 2026  
**Developer / Publisher:** Ian Wehrman

Feedbin Summarizer is a Chrome extension that summarizes articles for the user inside Feedbin.

## What This Extension Does

When the user asks Feedbin Summarizer to summarize an article, the extension reads the article content needed for that feature, may fetch the original article page linked from Feedbin, sends the relevant text directly to the AI provider selected by the user, and returns a summary inside Feedbin.

The user may choose either OpenAI or Anthropic as the AI provider and may provide their own API key for that provider in the extension settings.

## Information This Extension Handles

Feedbin Summarizer may handle the following information:

1. **User-provided API keys**
   - The user may enter an OpenAI API key and/or an Anthropic API key in the extension settings.
   - These keys are used only to authenticate requests made directly to the selected AI provider on the user's behalf.

2. **Article and website content**
   - When the user uses the summarization feature, the extension accesses the article text needed to generate the summary.
   - This may include the Feedbin article body, article title, source URL, and extracted text from the original linked article page.
   - If the user enables feed-level summary behavior, the extension may also prefetch article content and summaries for upcoming unread articles from the currently loaded Feedbin view.

3. **Extension settings and local state**
   - The extension stores user preferences and configuration settings locally in the browser.
   - This includes provider selection, model settings, summarization instructions, feed-level summary preferences, and whether local summary caching or debug indicators are enabled.

4. **Generated summaries**
   - The extension may store generated summaries locally in the browser when summary caching is enabled.

## How Information Is Used

Feedbin Summarizer uses information only to provide the summarization feature requested by the user.

Specifically:

- API keys are used only to authenticate requests to the selected AI provider.
- Article and website content are used only to generate summaries for the user.
- Settings and local state are used only to operate and remember the extension's configuration.
- Cached summaries are used only to make repeated summaries faster for the user.

Feedbin Summarizer does not use user data for advertising, profiling, resale, or data brokerage.

## How Information Is Shared

Feedbin Summarizer shares data only as necessary to provide the summarization feature.

### Shared With OpenAI

If the user selects OpenAI and requests a summary, the extension sends the relevant article data directly to OpenAI so OpenAI can generate the summary. This may include article text, title, source URL, and related request metadata needed to process the request.

### Shared With Anthropic

If the user selects Anthropic and requests a summary, the extension sends the relevant article data directly to Anthropic so Anthropic can generate the summary. This may include article text, title, source URL, and related request metadata needed to process the request.

### Not Shared With the Developer

The developer of Feedbin Summarizer does not receive, store, or review the user's API keys, article content, generated summaries, or browsing data through a developer-operated backend or telemetry system. Requests are sent directly from the extension to the selected AI provider using the user's own API key.

## Data Storage and Retention

- **User-provided API keys** are stored locally in the browser's extension storage until the user updates or deletes them, or until the extension is removed.
- **Generated summaries** may be stored locally in the browser for up to 7 days when `Cache Summaries` is enabled. If caching is disabled, generated summaries are not kept in persistent local cache by the extension.
- **Article text and source-page content** are processed to generate summaries and are otherwise kept only as needed for temporary in-memory processing, active requests, or temporary page state while the extension is running.
- **User settings and local state** are stored locally until changed or deleted by the user, or until the extension is removed.

## Analytics and Telemetry

Feedbin Summarizer does not include developer-operated analytics, telemetry, or backend logging.

The selected AI provider may process requests, responses, and related technical metadata as part of providing its API service. That handling is governed by the selected provider's own terms and privacy practices.

## Security

Feedbin Summarizer is designed to handle data over encrypted network connections where supported and to limit access to stored settings and credentials to the minimum extension components needed to provide the feature.

No method of storage or transmission is perfectly secure, but the extension is intended to minimize exposure of user data and credentials.

## User Choices and Controls

Users can:

- enter, update, or remove their API keys in the extension settings;
- choose whether to use OpenAI or Anthropic;
- enable or disable local summary caching;
- enable or disable feed-level summary behavior by using the Summary action in Feedbin;
- use or stop using the summarization feature at any time; and
- remove the extension to delete locally stored extension data, subject to browser behavior.

## Third-Party Services

Feedbin Summarizer relies on third-party services to provide its functionality.

### OpenAI

If selected by the user, OpenAI processes requests sent by the extension in order to generate summaries. OpenAI's handling of data is governed by OpenAI's own terms and privacy practices.

### Anthropic

If selected by the user, Anthropic processes requests sent by the extension in order to generate summaries. Anthropic's handling of data is governed by Anthropic's own terms and privacy practices.

### Feedbin and Visited Websites

The extension operates in the context of Feedbin and may fetch article pages linked from Feedbin in order to summarize them. Feedbin and the visited websites have their own terms and privacy practices.

## Children's Privacy

Feedbin Summarizer is not intended for children under 13, and the developer does not knowingly collect personal information from children.

## Changes to This Policy

This privacy policy may be updated from time to time. The updated version will be posted at the same public URL with a revised effective date.

## Contact

If you have questions about this privacy policy or Feedbin Summarizer, please open an issue in the GitHub repository:

https://github.com/iwehrman/feedbin-summarizer/issues

## Limited Use Statement

Feedbin Summarizer uses data only to provide the user-facing summarization feature requested by the user.

Feedbin Summarizer does not use or transfer user data for advertising, profiling, sale to data brokers, or other unrelated purposes.

Feedbin Summarizer does not allow humans employed by the developer to read user data through a developer-operated backend or telemetry system because the extension sends requests directly to the selected provider and stores data locally in the user's browser.
