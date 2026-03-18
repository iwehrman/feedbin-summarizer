# TODO

- Add a Chrome Web Store API publish/update workflow so new packaged builds can be uploaded and published without using the dashboard UI after the current extension listing is approved.

## Future Feature Ideas

### 1. Conversational Article Q&A (High Priority)

After summarizing an article, show a chat input below the summary so users can ask follow-up questions ("What was the sample size?", "Explain the technical details"). Store the full extracted article text alongside the summary in cache. Add a new `askArticleQuestion` message type that sends the question, cached article text, and conversation history to the selected provider. Conversation context is session-scoped and not persisted.

Key files: `content/feedbin.js` (UI), `background/service-worker.js` (routing), new `background/conversation-manager.js` (multi-turn context).

### 2. Key Quotes Extraction (High Priority, Low Effort)

Extend the summarization prompt to also return 2-3 verbatim key quotes alongside the summary. Display quotes in a dedicated section below the summary with source attribution. Add a "Show in original" button that switches to the full article and scrolls to the quoted passage. Optionally persist saved quotes in `chrome.storage.local` for later export as markdown or JSON.

### 3. Cross-Article Intelligence: Topic Clustering & Trends (High Priority)

On each summarization, extract 3-5 topic tags (via the summarize prompt or a lightweight second call). Store tags in a new `articleIndex` in `chrome.storage.local`. Add a new extension popup (`popup/popup.html`) showing topic clusters with article counts, a "Trending this week" section, and click-through links to articles in Feedbin. Periodically clean up index entries older than 30 days. All computation stays client-side.

### 4. Smart Feed Prioritization & Triage Mode (Medium Priority)

Add a triage mode to Feedbin's article list where each article gets a relevance indicator (high/medium/low) based on the user's stated interests (new settings field). Use a lightweight classification call on titles and first paragraphs with the cheapest available model. Show visual indicators in the article list (colored dots/badges). Optionally auto-mark low-priority articles as read. Batch-classify visible articles in a single API call to minimize cost.

### 5. Daily Briefing Generation (Medium Priority)

A "Generate Briefing" button that collects recent unread articles, summarizes each (reusing the existing pipeline and cache), then sends all summaries to a synthesis prompt that produces a structured, cohesive briefing document. Display in a full-page overlay within Feedbin, grouped by topic. Include source article links for drill-down.

### 6. Feedbin API Integration: Star, Tag, Organize (Medium Priority)

Use Feedbin's REST API (HTTP basic auth) to take AI-driven actions — auto-star important articles, auto-tag by topic, suggest feed folder organization. Store Feedbin credentials via the existing `secret-manager.js` pattern. Rate-limit API calls to respect Feedbin's limits.

### 7. Audio Summary Mode (Lower Priority, Low Effort)

Convert summaries to audio using the browser `SpeechSynthesis` API (zero cost, works offline). Add play/pause controls next to summaries. Advanced option: integrate a cloud TTS API for higher-quality voices. Support a playlist mode to queue summaries from multiple articles.

### 8. Reading Analytics Dashboard (Lower Priority)

Track reading patterns locally: articles opened, summaries viewed, time saved, topic distribution. Display insights on a new analytics page (linked from options). Use lightweight charts (CSS or Chart.js). All data stays local with no telemetry. Optional weekly summary notification.

### 9. Cross-Browser Support: Firefox & Safari (Lower Priority, High Effort)

Abstract browser-specific APIs behind a compatibility layer (`shared/browser-compat.js`). Handle key differences: `chrome.*` vs `browser.*`, Manifest V3 variations, offscreen document alternatives for Firefox, Safari Web Extension Xcode wrapper. Add a build step to produce browser-specific packages.

### 10. Collaborative Summaries & Shared Collections (Stretch Goal)

Share summaries and curated article collections via unique links. Requires a small backend (Firebase, Supabase, or similar). "Share this summary" generates a link to a page showing the summary and original article link. Collections let users group shared summaries. Most architecturally ambitious — fundamentally changes the project from client-only to client+server.
