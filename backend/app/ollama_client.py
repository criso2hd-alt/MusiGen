"""Thin async client for a local Ollama server. Degrades gracefully if absent."""
from __future__ import annotations

import httpx

from .config import settings


class OllamaClient:
    def __init__(self) -> None:
        self.base = settings.OLLAMA_URL.rstrip("/")
        self.model = settings.OLLAMA_MODEL
        self._available: bool | None = None

    async def available(self) -> bool:
        """Reachability check. Caches a positive result; keeps re-probing while
        down so the app detects Ollama the moment it is started."""
        if self._available:
            return True
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                r = await client.get(f"{self.base}/api/tags")
                self._available = r.status_code == 200
        except Exception:
            self._available = False
        return self._available

    async def generate(self, prompt: str, system: str = "") -> str | None:
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                r = await client.post(
                    f"{self.base}/api/generate",
                    json={
                        "model": self.model,
                        "prompt": prompt,
                        "system": system,
                        "stream": False,
                        "options": {"temperature": 0.8},
                    },
                )
                r.raise_for_status()
                return r.json().get("response", "").strip()
        except Exception:
            self._available = False
            return None


ollama = OllamaClient()
