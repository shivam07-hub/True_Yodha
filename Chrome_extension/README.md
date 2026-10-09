# Myro Chrome Extension

Chrome Manifest V3 extension. On any job page it answers one question — *which
of my jobs is this?* — and offers that job's next step on the goal line:

| Page is… | Popup leads with |
|---|---|
| not in Myro | **Save this job** (capture → review → save) |
| saved | **Tailor your CV** |
| tailored | **I applied** (the user's own answer), then the tailored CV |
| applied | **Prepare for this job** |

"Find people to reach" sits under the lead once the job is saved (ADR-0018).
The answer comes from the server (`POST /jobs/collections/page`, CONTEXT.md →
Page Entry); the extension stores only the session tokens and the API URL.

## Build and test

```bash
cd Chrome_extension
npm test
npm run build      # → Chrome_extension/dist
npm run package    # → Chrome_extension/myro-extension.zip (the store upload)
```

## Load unpacked (local)

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select `Chrome_extension/dist`.
3. Open a job page, click the Myro icon, **Connect with Myro**.

Connect opens `/extension/connect` on the web app, which hands the extension
its own session — no token copying. The API URL defaults to
`https://api.himyro.com` (prod). To point at the dev backend, set it under
**Settings** (`https://truemirror.up.railway.app`, or `http://localhost:8000`
with the web app on `:3000`). Never use the Vercel frontend URL as the API URL.

## Release to the Chrome Web Store

The popup calls backend routes, so **the backend that serves them must be live
first**: merge `Develop` → `main`, wait for the prod deploy, then upload.

1. Bump `version` in `public/manifest.json` and `package.json` (store rejects a
   version it already has).
2. `npm test && npm run package`.
3. [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   → **Myro Job Tracker** → **Package** → **Upload new package** →
   `myro-extension.zip`.
4. **Store listing** / **Privacy** tabs: only if the permissions or data use
   changed (they list `activeTab`, `scripting`, `storage`, `identity`).
5. **Submit for review**. Installed copies update on their own once it is
   approved.

## Capture order

1. Selected text
2. JSON-LD `JobPosting`
3. Known portal selectors
4. Visible page fallback

The user reviews role, company, location, description and skills before
saving. If the posting lists skills separately, paste them into **Skills seen
in this job** and run extraction again; Myro merges them with the chips.
