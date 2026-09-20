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
        "female vocal", "male vocal", "duet", "choir",
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

# Expanded studio palette. Labels remain plain language style hints; availability
# here does not imply a separately trained model or guaranteed instrument control.
_EXPANDED = {
    "genre": "dream pop|bedroom pop|art pop|chamber pop|electropop|hyperpop|sophisti-pop|power pop|indie folk|folk rock|psychedelic folk|Celtic folk|traditional folk|alt-country|outlaw country|country rock|western swing|honky-tonk|rockabilly|surf rock|garage rock|psychedelic rock|progressive rock|symphonic rock|soft rock|blues rock|Southern rock|alternative rock|emo|post-punk|new wave|no wave|darkwave|coldwave|minimal wave|dungeon synth|dreamwave|retrowave|outrun|synthpop|electroclash|EBM|IDM|glitch|glitch hop|future bass|future garage|UK garage|2-step|breaks|breakcore|jungle|liquid drum and bass|neurofunk|trip-hop|chillhop|downtempo jazz|acid jazz|nu jazz|jazz fusion|cool jazz|modal jazz|free jazz|swing jazz|big band|Dixieland|ragtime|stride piano|bebop jazz|hard bop|Latin jazz|smooth jazz|acid house|progressive house|organic house|Afro house|tech house|minimal techno|dub techno|Detroit techno|acid techno|hard techno|progressive trance|psytrance|goa trance|hardstyle|gabber|UK bass|electro|disco house|nu-disco|Italo disco|Chicago house|deep dubstep|dancehall|roots reggae|rocksteady|soca|calypso|merengue|bachata|cumbia|tango|samba|samba jazz|MPB|fado|bolero|mariachi|ranchera|norteño|son cubano|highlife|soukous|ethio-jazz|raï|qawwali|Hindustani classical|Carnatic|raga rock|gamelan|enka|kayokyoku|traditional Chinese|Klezmer|Balkan brass|polka|waltz|chanson|cabaret|musical theatre|opera|chamber music|minimalism|modern classical|romantic classical|Renaissance choral|Gregorian chant|sacred choral|symphonic metal|doom metal|power metal|thrash metal|post-metal|blackgaze|progressive metal|mathcore|post-hardcore|acoustic gospel|contemporary worship|spirituals|neo-classical piano|cinematic ambient|dark ambient|space ambient|drone|new age|meditation|electro swing|video game soundtrack|8-bit|16-bit|FM synthesis soundtrack",
    "instrument": "nylon-string guitar|twelve-string guitar|baritone guitar|pedal steel|lap steel|dobro|bouzouki|oud|lute|balalaika|charango|kora|guzheng|pipa|erhu|guqin|shamisen|koto|sarod|santur|dulcimer|hammered dulcimer|kalimba|mbira|handpan|steel drums|singing bowls|tubular bells|celesta|harpsichord|clavichord|clavinet|pipe organ|reed organ|Mellotron|FM synth|wavetable synth|modular synth|acid bass|synth brass|synth strings|sawtooth lead|square-wave lead|plucked synth|analog bass|fretless bass|tuba|euphonium|French horn|flugelhorn|muted trumpet|oboe|English horn|bassoon|bass clarinet|piccolo|recorder|pan flute|shakuhachi|bansuri|duduk|ocarina|bagpipes|tin whistle|viola|solo violin|string ensemble|orchestral percussion|timpani|taiko|djembe|bongos|cajon|frame drum|bodhran|talking drum|darbuka|tambourine|shaker|guiro|castanets|cowbell|woodblock|rim clicks|brush drums|ride cymbal|crash cymbal|finger snaps|stomps|tape loops|found percussion|turntable scratches",
    "mood": "serene|meditative|intimate|tender|wistful|reflective|restless|resolute|defiant|buoyant|radiant|majestic|solemn|suspenseful|ominous|uneasy|surreal|hypnotic|weightless|dreamlike|wistful nostalgia|bright optimism|gentle melancholy|quiet confidence|raw intensity|warm and intimate|cold and distant|sparse and fragile|lush and expansive",
    "feeling": "belonging|reunion|forgiveness|acceptance|resilience|courage|devotion|compassion|empathy|curiosity|anticipation|relief|surrender|reverence|celebration|renewal|perseverance|solace|friendship|family|homecoming|discovery|farewell|reconciliation|quiet faith|second chances",
    "vocal": "a cappella|baritone vocal|bass vocal|tenor vocal|alto vocal|mezzo-soprano|soprano vocal|unison vocals|call and response|layered harmonies|close harmonies|vocal counterpoint|humming|wordless vocals|scat singing|yodeling|throat singing|overtone singing|chanting|rhythmic chanting|intimate lead vocal|dry lead vocal|reverberant vocal|double-tracked vocal|soft vibrato|straight tone|gravelly vocal|airy harmonies|whistle register|crooning|narration",
    "pacing": "60 BPM|70 BPM|80 BPM|90 BPM|100 BPM|110 BPM|120 BPM|130 BPM|140 BPM|150 BPM|160 BPM|180 BPM|free time|rubato|steady pulse|four on the floor|swung eighths|shuffle groove|triplet feel|3/4 time|6/8 time|5/4 time|7/8 time|polyrhythmic|slow build|gradual crescendo|sudden breakdown|stop-start rhythm|relaxed backbeat|marching rhythm",
    "era": "1920s|1930s|1940s|2020s|pre-war recording|early electronic|tape-era studio|golden-age jazz|British invasion|psychedelic era|disco era|early digital|Y2K pop|retro arcade",
    "keyword": "quiet library|empty cathedral|moonlit garden|snowfall|misty valley|tropical rain|city at dawn|night train|coastal drive|open prairie|sunlit kitchen|rooftop party|underground club|candlelit room|old photograph|distant memories|starlit desert|deep space voyage|enchanted forest|abandoned factory|ocean voyage|dusty record shop|Sunday morning|wedding dance|victory celebration|final farewell|dream journal|loopable game music|seamless loop|instrumental intro|instrumental outro|gentle fade out|tape saturation|vinyl crackle|warm analog|lo-fi texture|clean studio|live room|concert hall|small ensemble|wide stereo|mono recording|dry production|lush reverb|dub delay|sidechain pulse|minimal arrangement|layered arrangement|acoustic arrangement|orchestral arrangement"
}
for _category, _labels in _EXPANDED.items():
    _seen = {label.casefold() for label in PILL_CATALOG[_category]}
    for _label in _labels.split("|"):
        if _label.casefold() not in _seen:
            PILL_CATALOG[_category].append(_label)
            _seen.add(_label.casefold())
