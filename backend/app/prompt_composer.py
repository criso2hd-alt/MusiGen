"""Turns mixer pills into a YuE2 `style` string, and writes lyrics.

`compose_style` is deterministic and instant (used for the live preview). The
LLM-backed helpers (`refine_style`, `write_lyrics`) use the local Qwen2.5 model
when its weights are installed, fall back to Ollama if present, and finally to a
deterministic template — so they always return something.
"""
from __future__ import annotations
import re

from . import llm
from .ollama_client import ollama
from .schemas import Pill

_ORDER = ["genre", "mood", "feeling", "instrument", "vocal", "pacing", "era", "keyword"]


def suggest_title(lyrics: str, style: str) -> str:
    """A short local title without loading a second model during submission."""
    for line in lyrics.splitlines():
        line = re.sub(r"\[[^\]]*\]", "", line).strip()
        words = line.split()
        if words:
            return " ".join(words[:6]).strip(".,!?;:—- ")[:70] or "New Song"
    parts = [p.strip() for p in style.split(",") if p.strip()]
    return " ".join(" ".join(parts[:2]).split()[:6]).title()[:70] or "New Song"


def _grouped(pills: list[Pill]) -> dict[str, list[str]]:
    groups: dict[str, list[str]] = {}
    for p in sorted(pills, key=lambda x: -x.weight):
        groups.setdefault(p.category, []).append(p.label)
    return groups


def compose_style(pills: list[Pill]) -> str:
    """Deterministic pills -> style string (no network/model needed)."""
    if not pills:
        return ""
    groups = _grouped(pills)
    parts: list[str] = []
    for cat in _ORDER:
        parts.extend(groups.get(cat, []))
    seen: set[str] = set()
    ordered = [p for p in parts if not (p.lower() in seen or seen.add(p.lower()))]
    return ", ".join(ordered)


_STYLE_SYSTEM = (
    "You are a prompt engineer for a text-to-music model. Given tags, write ONE "
    "concise natural-language style description (max 30 words): language if "
    "implied, genre, instrumentation, vocal type, mood, tempo. Output ONLY the "
    "description — no quotes, no preamble, no lists."
)


async def refine_style(pills: list[Pill], extra: str = "") -> tuple[str, bool]:
    """AI-refine the pills into a richer style string. (style, used_llm)."""
    base = compose_style(pills)
    if extra.strip():
        base = f"{base}, {extra.strip()}" if base else extra.strip()
    if not base:
        return "", False
    prompt = f"Tags: {base}\nStyle description:"
    if llm.available():
        text = await _run_llm(_STYLE_SYSTEM, prompt, 120, 0.8)
        if text:
            return _clean(text), True
    if await ollama.available():
        text = await ollama.generate(prompt, system=_STYLE_SYSTEM)
        if text:
            return _clean(text), True
    return base, False


_LYRICS_SYSTEM = (
    "You are a professional songwriter. Write original, singable song lyrics. "
    "You MUST use section tags in square brackets on their own line for every "
    "section, e.g. [intro], [verse], [pre-chorus], [chorus], [bridge], [outro]. "
    "Follow the requested section order EXACTLY, repeating a chorus's lyrics when "
    "it recurs. Keep lines concise and rhythmic. Output ONLY the tagged lyrics — "
    "no titles, notes, or commentary."
)


async def write_lyrics(
    theme: str, pills: list[Pill], structure: list[str], *, duration=120, bpm=None,
    fit_duration=True, style=""
) -> tuple[str, bool]:
    """Write lyrics following the requested [section] structure. (lyrics, used_llm)."""
    mood = compose_style(pills)
    struct = structure or ["verse", "chorus", "verse", "chorus", "bridge", "chorus"]
    order = " -> ".join(f"[{s}]" for s in struct)
    prompt = (
        f"Theme / idea: {theme or 'open to interpretation'}\n"
        f"Style & mood: {mood or 'any'}\n"
        f"Section order (use these exact tags, in this order): {order}\n"
        "Write the lyrics now."
    )
    max_tokens = 800
    if fit_duration:
        from .lyric_fit import estimate
        fit = estimate("\n".join(f"[{s}]" for s in struct), duration, pills, bpm, style)
        prompt += (f"\nTarget song duration: {duration} seconds, roughly {fit['bpm']} BPM. "
                   f"Use at most {fit['target_words']} words TOTAL, counting repeated choruses. "
                   "Leave space for instrumental transitions. Use fewer, shorter lines per section "
                   "when many sections must fit. Complete the last section within the word budget.")
        max_tokens = min(2000, max(250, fit["target_words"] * 3 + len(struct) * 12))
    if llm.available():
        text = await _run_llm(_LYRICS_SYSTEM, prompt, max_tokens, 0.95)
        if text:
            return _ensure_tags(text, struct), True
    if await ollama.available():
        text = await ollama.generate(prompt, system=_LYRICS_SYSTEM)
        if text:
            return _ensure_tags(text, struct), True
    return _skeleton(theme, struct), False


_COVER_SYSTEM = (
    "You are an art director writing a prompt for a text-to-image model that will "
    "paint an ALBUM COVER. Given a song's title, musical style, and lyrics, output "
    "ONE vivid single-line image prompt (max 40 words): concrete subject/scene, "
    "mood, color palette, lighting, and art style (e.g. oil painting, synthwave, "
    "collage, photography). Do NOT include any text, words, letters, or typography "
    "in the image. Output ONLY the prompt — no quotes, labels, or preamble."
)


def _cover_template(title: str, style: str) -> str:
    bits = [b for b in [title, style] if b and b.strip()]
    base = ", ".join(bits) if bits else "abstract music artwork"
    return (
        f"album cover art for '{title or 'untitled'}', {style or 'atmospheric'}, "
        "bold cinematic lighting, rich color palette, highly detailed, no text"
    )


async def write_cover_prompt(
    title: str, style: str, lyrics: str
) -> tuple[str, bool]:
    """Compose an image-gen prompt for the cover from title/style/lyrics. (prompt, used_llm)."""
    excerpt = (lyrics or "").strip()
    if len(excerpt) > 600:
        excerpt = excerpt[:600]
    user = (
        f"Title: {title or 'Untitled'}\n"
        f"Style: {style or 'any'}\n"
        f"Lyrics:\n{excerpt or '(instrumental)'}\n\n"
        "Album cover image prompt:"
    )
    if llm.available():
        text = await _run_llm(_COVER_SYSTEM, user, 120, 0.9)
        if text:
            cleaned = _clean(text)
            # keep it a single line
            cleaned = " ".join(cleaned.splitlines()).strip()
            if cleaned:
                return cleaned, True
    if await ollama.available():
        text = await ollama.generate(user, system=_COVER_SYSTEM)
        if text:
            return " ".join(_clean(text).splitlines()).strip(), True
    return _cover_template(title, style), False


# --- helpers ---------------------------------------------------------------


async def _run_llm(system: str, user: str, max_new: int, temp: float) -> str | None:
    import asyncio

    loop = asyncio.get_running_loop()
    # transformers generation is blocking → run off the event loop
    return await loop.run_in_executor(
        None, lambda: llm.generate(system, user, max_new, temp)
    )


def _clean(text: str) -> str:
    return text.strip().strip('"').strip()


def _ensure_tags(text: str, structure: list[str]) -> str:
    """If the model forgot section tags entirely, wrap the output in the structure."""
    if "[" in text and "]" in text:
        return text.strip()
    return _skeleton_from_text(text, structure)


def _skeleton_from_text(text: str, structure: list[str]) -> str:
    lines = [ln for ln in text.splitlines() if ln.strip()]
    out: list[str] = []
    i = 0
    for sec in structure:
        out.append(f"[{sec}]")
        out.append(lines[i] if i < len(lines) else "")
        out.append("")
        i += 1
    return "\n".join(out).strip()


def _skeleton(theme: str, structure: list[str]) -> str:
    out: list[str] = []
    for sec in structure:
        out.append(f"[{sec}]")
        out.append(theme or "…")
        out.append("")
    return "\n".join(out).strip()
