# Chrome Web Store Release Setup

This document covers the one-time OAuth setup needed for:

```bash
npm run build:publish
```

That command:

1. builds the uploadable zip
2. uploads it to the Chrome Web Store
3. waits for upload processing if needed
4. submits the item for review

The command reads credentials from a repo-root `.env` file. The real `.env` is gitignored. Use [.env.example](./.env.example) as the template.

## Required `.env` Values

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
CWS_REFRESH_TOKEN=
CWS_PUBLISHER_ID=
CWS_EXTENSION_ID=
```

## One-Time Setup

### 1. Create A Google Cloud Project

Use the same personal Google account that owns the Chrome Web Store extension.

You do not need:

- a separate Google account
- a backend
- a service account

You do need a Google Cloud project so Google can issue OAuth credentials for the Chrome Web Store API.

Useful links:

- Google Cloud credentials: <https://console.cloud.google.com/apis/credentials>
- OAuth consent screen: <https://console.cloud.google.com/apis/credentials/consent>
- Chrome Web Store API guide: <https://developer.chrome.com/docs/webstore/using-api>

### 2. Configure The OAuth Consent Screen

Use:

- Audience: `External`

Do not use:

- `Internal`

`Internal` is for Google Workspace organizations. For a personal account, `External` is the correct choice.

If the app is in `Testing` mode, add yourself as a test user. Otherwise Google will block OAuth with an “Access blocked” message.

### 3. Create The Correct OAuth Client Type

Create:

- `OAuth client ID`
- Application type: `Web application`

Do not use:

- `Chrome extension`

The `Chrome extension` client type does not match the OAuth Playground flow used here and usually will not give you the client secret you need.

For the `Web application` client:

- You do not need any `Authorized JavaScript origins`
- You do need this `Authorized redirect URI`:

```text
https://developers.google.com/oauthplayground
```

When the client is created, copy:

- `Client ID` -> `GOOGLE_CLIENT_ID`
- `Client secret` -> `GOOGLE_CLIENT_SECRET`

### 4. Enable The Chrome Web Store API

Open this page for your Google Cloud project and click `Enable`:

<https://console.cloud.google.com/apis/library/chromewebstore.googleapis.com>

If you skip this, Chrome Web Store API calls will fail with:

```text
SERVICE_DISABLED
Chrome Web Store API has not been used in project ... before or it is disabled.
```

If you just enabled it, wait a couple of minutes before retrying.

### 5. Generate A Refresh Token

Open OAuth Playground:

<https://developers.google.com/oauthplayground>

Then:

1. click the gear in the top right
2. enable `Use your own OAuth credentials`
3. paste the `Client ID` and `Client secret` from the web application client
4. in the left scope panel, enter:

```text
https://www.googleapis.com/auth/chromewebstore
```

5. authorize using the same Google account that owns the extension
6. exchange the authorization code for tokens
7. copy the `refresh_token`

Use that as:

- `CWS_REFRESH_TOKEN`

### 6. Find The Publisher ID

Open the Chrome Web Store Developer Dashboard and go to the `Account` section.

That page shows the publisher ID.

Use that as:

- `CWS_PUBLISHER_ID`

### 7. Find The Extension ID

Use the extension item ID from the Chrome Web Store listing URL or the developer dashboard item URL.

Use that as:

- `CWS_EXTENSION_ID`

## Local `.env`

Copy the example file:

```bash
cp .env.example .env
```

Then fill in the values.

The real `.env` is gitignored. It is expected to stay local and untracked.

## Publish A Release

After bumping the extension version:

```bash
npm run build:publish
```

That command rebuilds the zip before uploading, so you do not need to run `build:package` separately first.

## Troubleshooting

### “Access blocked … app is currently being tested”

Your OAuth consent screen is in `Testing` mode and your Google account is not listed as a test user.

Fix:

- open the OAuth consent screen
- add yourself under `Test Users`

### “Chrome Web Store API has not been used in project … before or it is disabled”

The API is not enabled yet, or it was enabled only moments ago.

Fix:

- enable `chromewebstore.googleapis.com`
- wait a minute or two
- retry

### No Client Secret Was Shown

You probably created the wrong OAuth client type.

Fix:

- create a new OAuth client
- use `Web application`
- add the OAuth Playground redirect URI

### Unsure Whether The Credentials Work

The safest validation path is a read-only status check against the item before trying a real publish.

The current publish script already exercises the same token path and Chrome Web Store API endpoints, so once the API is enabled, `npm run build:publish` is the intended end-to-end test.
