"""The default palette of mixer pills, grouped by category.

The frontend fetches this to populate the pill tray. Users drag these into the
mixer; the prompt composer turns the selection into a YuE2 style string.
"""
from __future__ import annotations

PILL_CATALOG: dict[str, list[str]] = {
    "genre": [
        "pop", "rock", "indie", "indie rock", "hip-hop", "boom bap", "trap",
        "drill", "lo-fi", "jazz", "jazz-funk", "bebop", "swing", "blues",
        "blues rock", "soul", "neo-soul", "R&B", "funk", "disco", "electronic",
        "house", "deep house", "techno", "trance", "dubstep", "drum and bass",
        "synthwave", "vaporwave", "ambient", "downtempo", "classical",
        "baroque", "orchestral", "cinematic", "epic trailer", "folk",
        "singer-songwriter", "country", "americana", "bluegrass", "metal",
        "heavy metal", "metalcore", "punk", "pop-punk", "hardcore", "reggae",
        "dub", "ska", "afrobeat", "afropop", "amapiano", "latin", "reggaeton",
        "bossa nova", "salsa", "flamenco", "k-pop", "j-pop", "city pop",
        "anime", "gospel", "grunge", "shoegaze", "post-rock", "math rock",
        "gothic", "industrial", "chiptune", "world",
    ],
    "mood": [
        "happy", "joyful", "melancholic", "dreamy", "dark", "moody", "uplifting",
        "nostalgic", "romantic", "sensual", "epic", "chill", "relaxed",
        "aggressive", "angry", "mysterious", "eerie", "playful", "quirky",
        "hopeful", "bittersweet", "somber", "euphoric", "tense", "anxious",
        "confident", "swagger", "peaceful", "triumphant", "haunting", "whimsical",
        "gritty", "ethereal", "brooding", "cathartic",
    ],
    "feeling": [
        "love", "heartbreak", "longing", "yearning", "freedom", "triumph",
        "loneliness", "isolation", "wonder", "awe", "rebellion", "defiance",
        "serenity", "calm", "anxiety", "dread", "joy", "grief", "hope",
        "regret", "gratitude", "empowerment", "vulnerability", "obsession",
        "healing", "redemption", "wanderlust", "homesick",
    ],
    "instrument": [
        "acoustic guitar", "electric guitar", "distorted guitar", "slide guitar",
        "piano", "grand piano", "Rhodes", "Wurlitzer", "organ", "Hammond organ",
        "synth pads", "synth lead", "arpeggiator", "analog synth", "strings",
        "string quartet", "violin", "cello", "double bass", "saxophone",
        "trumpet", "trombone", "brass section", "flute", "clarinet", "harmonica",
        "harp", "bells", "glockenspiel", "vibraphone", "marimba", "808 bass",
        "sub bass", "upright bass", "electric bass", "drum machine", "808 drums",
        "live drums", "acoustic drums", "breakbeat", "hand percussion", "congas",
        "tabla", "banjo", "mandolin", "ukulele", "sitar", "accordion",
        "music box", "choir", "handclaps", "field recording",
    ],
    "vocal": [
        "female vocal", "male vocal", "androgynous vocal", "duet", "choir",
        "gospel choir", "harmonies", "backing vocals", "whispered", "breathy",
        "belting", "falsetto", "head voice", "rap", "melodic rap", "spoken word",
        "ad-libs", "vocoder", "autotuned", "vocal chops", "operatic",
        "raspy", "smooth", "soulful", "childlike", "robotic",
        "instrumental (no vocals)",
    ],
    "pacing": [
        "very slow", "slow", "mid-tempo", "upbeat", "fast", "driving",
        "ballad", "danceable", "groovy", "half-time", "double-time", "frenetic",
        "laid-back", "building", "anthemic", "syncopated",
    ],
    "era": [
        "50s", "60s", "70s", "80s", "90s", "2000s", "2010s", "modern",
        "retro", "vintage", "futuristic", "timeless",
    ],
    "keyword": [
        "rainy night", "summer", "winter", "autumn", "city lights", "neon",
        "road trip", "highway", "space", "cosmic", "underwater", "ocean",
        "festival", "campfire", "midnight", "sunrise", "sunset", "desert",
        "mountains", "forest", "dreamscape", "heartbreak hotel", "late night",
        "coffee shop", "arcade", "cyberpunk", "noir", "fireworks", "storm",
        "childhood", "first love", "new beginnings", "the end",
    ],
}
