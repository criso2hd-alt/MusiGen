"""Section skeletons for instrumental (wordless) songs.

YuE2 sizes a song by its sections: with chain-of-thought on it first plans a
score for exactly the sections it is given, and the audio cannot outlast that
score. A wordless request used to arrive as a single empty "[verse]", so a
180-second instrumental planned only ~60 seconds of music. Here a wordless
request is expanded into enough sections to fill the requested duration.
"""
from __future__ import annotations

import math
import re

_TAG = re.compile(r"^\s*\[([^\]]+)\]\s*$")
_FILLER = re.compile(r"^\s*(…|\.\.\.|-|–|—)?\s*$")

# Roughly 4-8 bars of music per section. Erring short is safe: the semantic
# token budget still stops the song at the requested duration, whereas too few
# sections end it early.
SECONDS_PER_SECTION = 15


def has_words(lyrics: str | None) -> bool:
    """True when the lyrics contain anything besides section tags and blanks."""
    return any(not (_TAG.match(line) or _FILLER.match(line)) for line in (lyrics or "").splitlines())


def _tags(lyrics: str | None) -> list[str]:
    return [m.group(1).strip() for line in (lyrics or "").splitlines() if (m := _TAG.match(line))]


def instrumental_lyrics(lyrics: str | None, duration: float) -> str:
    """An empty-section skeleton long enough for `duration` seconds.

    The user's own section order (from wordless tags) is kept and its middle is
    repeated as needed; otherwise a conventional intro/verse/chorus/bridge/outro
    form is used.
    """
    needed = max(2, math.ceil(max(15.0, float(duration or 0)) / SECONDS_PER_SECTION))
    tags = _tags(lyrics)
    if len(tags) >= needed:
        sections = tags
    elif len(tags) == 2:
        # Two chosen sections (e.g. verse/chorus): alternate them.
        sections = [tags[i % 2] for i in range(needed)]
    elif len(tags) >= 3:
        # Keep the chosen opening and ending; repeat the middle to fill the length.
        head, tail = tags[:1], tags[-1:]
        middle = tags[1:-1] or tags
        sections = list(head)
        while len(sections) + len(tail) < needed:
            sections.append(middle[(len(sections) - 1) % len(middle)])
        sections += tail
    else:
        body_cycle = ["verse", "chorus", "verse", "chorus", "bridge", "chorus"]
        sections = ["intro"]
        while len(sections) < needed - 1:
            sections.append(body_cycle[(len(sections) - 1) % len(body_cycle)])
        sections.append("outro")
    return "".join(f"[{s}]\n\n" for s in sections)
