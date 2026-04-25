# Mirko Job Tracker Extension

Chrome Manifest V3 extension for capturing the current job page and saving it to Mirko.

## Build

```bash
cd extension
npm test
npm run build
```

The build output is written to `extension/dist`.

## Load In Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select `/Users/incognito/True_Yodha/extension/dist`.
5. Open a job page and click the Mirko extension.

## Configure

Open the extension settings and set:

- API URL: `http://localhost:8000` for local backend development.
- Access token: a Mirko backend JWT for the current user.

The first MVP stores the token in Chrome extension local storage. The production version should replace manual token paste with a web auth handoff.

## Capture Behavior

Mirko captures in this order:

1. Selected text
2. JSON-LD `JobPosting`
3. Known portal selectors
4. Visible page fallback

The user reviews role, company, location, description, primary skills, secondary skills, and emerging skills before saving.
