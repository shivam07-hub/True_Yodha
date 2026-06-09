FROM python:3.11-slim-bookworm

WORKDIR /app

# Pin Debian 12 (bookworm). `python:3.11-slim` floats to the newest Debian; it
# rolled to trixie (13), which Playwright doesn't recognize -> it falls back to
# the ubuntu20.04 dep list and apt-fails on ttf-unifont/ttf-ubuntu-font-family
# (dropped from trixie repos). Bookworm is a Playwright-supported base.

# System deps for building Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Headless Chromium for the WYSIWYG CV PDF renderer (cv_pdf_html). --with-deps
# pulls the Chromium runtime libraries; fonts-liberation supplies an Arial-metric
# face so the server PDF matches the sheet's Helvetica/Arial fallback chain.
RUN playwright install --with-deps chromium \
    && apt-get update \
    && apt-get install -y --no-install-recommends fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Download spaCy model (used in Phase 1C CV parsing)
RUN python -m spacy download en_core_web_sm

COPY . .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
