"""Conservative planning estimates, never presented as measured vocal timing."""
import math
import re


def estimate(lyrics: str, duration: int, pills=(), bpm=None, style="") -> dict:
    tags = " ".join([p.label.lower() for p in pills] + [style.lower()])
    if bpm is None:
        match = re.search(r"\b(\d{2,3})\s*bpm\b", tags)
        if match and 40 <= int(match[1]) <= 240:
            bpm = int(match[1])
    explicit_bpm = bpm is not None
    bpm = bpm or (80 if any(t in tags for t in ["slow", "ballad", "downtempo"]) else
                  150 if any(t in tags for t in ["fast", "up-tempo", "uptempo", "frantic"]) else 110)
    rate = (2.6 if "rap" in tags else 1.7) * bpm / 110
    text = re.sub(r"\[[^\]]*\]", "", lyrics)
    # Count CJK characters individually instead of treating a whole line as a word.
    words = len(re.findall(r"[\u3400-\u9fff\u3040-\u30ff]|[^\W_\u3400-\u9fff\u3040-\u30ff]+(?:['’][^\W_]+)?", text, re.UNICODE))
    sections = len(re.findall(r"\[[^\]]*\]", lyrics))
    instrumental = 8 + max(0, sections - 1) * 2
    seconds = words / rate + instrumental if words else 0
    low, high = math.ceil(seconds * .8), math.ceil(seconds * 1.35)
    budget = max(4, int(max(0, duration - instrumental) * rate * .85))
    warning = None
    if words and high > duration:
        warning = f"Lyrics may not fit in {duration}s (rough estimate {low}–{high}s). The ending may be cut short."
    return {"word_count": words, "target_words": budget, "estimated_min_seconds": low,
            "estimated_max_seconds": high, "suggested_duration": max(15, min(330, int(math.ceil(high / 5) * 5))),
            "exceeds_duration_limit": high > 330, "bpm": bpm, "explicit_bpm": explicit_bpm,
            "warning": warning, "note": "Estimate only; phrasing, instrumental breaks and language affect sung duration."}
