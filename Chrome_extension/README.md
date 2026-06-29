# Myro Job Tracker Extension

Chrome Manifest V3 extension for capturing the current job page and saving it to Myro.

## Build

```bash
cd Chrome_extension
npm test
npm run build
```

The build output is written to `Chrome_extension/dist`.

To regenerate the uploadable archive:

```bash
cd Chrome_extension
npm run package
```

This writes `Chrome_extension/myro-extension.zip`.

## Load In Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select `/Users/incognito/True_Yodha/Chrome_extension/dist`.
5. Open a job page and click the Myro extension.

## Configure

Open the extension settings and set:

- API URL: `http://localhost:8000` for local backend development.
- Access token: a Myro backend JWT for the current user.

For production testing, use the Railway backend URL, for example:

```text
https://YOUR-RAILWAY-URL.railway.app
```

Do not use the Vercel frontend URL as the API URL; the extension posts directly to the FastAPI backend.

The first MVP stores the token in Chrome extension local storage. The production version should replace manual token paste with a web auth handoff.

## Local Test Flow

Start the backend:

```bash
cd /Users/incognito/True_Yodha
source .venv/bin/activate
PYTHONPATH=backend uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Start the frontend in another terminal:

```bash
cd /Users/incognito/True_Yodha/frontend
npm run dev
```

Then:

1. Log in to Myro at `http://localhost:3000`.
2. Copy the current access token from browser local storage key `mirror_token`.
3. Paste it into the extension options page with API URL `http://localhost:8000`.
4. Open a job page, select the job description if extraction is weak, click **Track this job**, review, optionally paste extra skill text and click **Extract skills**, then save.
5. Check `http://localhost:3000/tracker` for the saved job.

## Capture Behavior

Myro captures in this order:

1. Selected text
2. JSON-LD `JobPosting`
3. Known portal selectors
4. Visible page fallback

The user reviews role, company, location, description, primary skills, secondary skills, and emerging skills before saving. If the posting lists skills separately, the user can paste that text into **Skills seen in this job** and run extraction again; Myro merges those suggestions with the existing chips.
