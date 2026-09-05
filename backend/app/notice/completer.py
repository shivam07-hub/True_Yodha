"""OpenRouter completer for the Notice author. Sync; closer is not the user path."""

from __future__ import annotations

import json
import os

import httpx


class OpenRouterCompleter:
    def complete(self, prompt: str) -> str:
        key = os.environ.get("OPENROUTER_API_KEY", "").strip()
        if not key:
            raise RuntimeError("OPENROUTER_API_KEY missing")
        response = httpx.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {key}",
                "HTTP-Referer": "https://himyro.com",
                "X-Title": "Myro Notice closer",
            },
            json={
                "model": "google/gemma-3-12b-it",
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"},
            },
            timeout=120.0,
        )
        response.raise_for_status()
        body = response.json()
        text = body["choices"][0]["message"]["content"]
        json.loads(text)
        return text
