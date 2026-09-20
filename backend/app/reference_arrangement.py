"""Arrange native melody-only ABC using exact musical durations.

Deliberately fail on unsupported notation rather than quietly changing a tune.
Original-score mode never passes through this adapter.
"""
from dataclasses import dataclass
from fractions import Fraction as F
import math
import re


def retime_score(abc, bpm):
    """Keep notes and rests intact while making an explicit tempo consistent."""
    if not abc or bpm is None:
        return abc
    tempo = f'Q:1/4={bpm:g}'
    if re.search(r'^Q:.*$', abc, re.MULTILINE):
        return re.sub(r'^Q:.*$', tempo, abc, flags=re.MULTILINE)
    return re.sub(r'^(K:)', tempo + '\n' + r'\1', abc, count=1, flags=re.MULTILINE)


@dataclass
class Event:
    pitch: int | None
    beats: F
    tie: bool = False


@dataclass
class Score:
    meter: str
    bar: F
    bpm: float
    voices: dict[str, list[Event]]
    key_name: str


def _key(text):
    key = (text.strip().split() or ['C'])[0].replace('♭', 'b').replace('♯', '#')
    major = {'Cb': -7, 'Gb': -6, 'Db': -5, 'Ab': -4, 'Eb': -3, 'Bb': -2, 'F': -1,
             'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'F#': 6, 'C#': 7}
    minor = {'Ab': -7, 'Eb': -6, 'Bb': -5, 'F': -4, 'C': -3, 'G': -2, 'D': -1,
             'A': 0, 'E': 1, 'B': 2, 'F#': 3, 'C#': 4, 'G#': 5, 'D#': 6, 'A#': 7}
    match = re.fullmatch(r'([A-G](?:#|b)?)(m|min|minor|maj|major)?', key)
    if not match:
        raise ValueError('Reference arrangement needs a major/minor key signature. Use Original score for this notation.')
    root, mode = match.groups()
    fifths = (minor if mode in {'m', 'min', 'minor'} else major).get(root)
    if fifths is None:
        raise ValueError('Unsupported reference key signature')
    return {note: (1 if fifths > 0 else -1) for note in ('FCGDAEB' if fifths > 0 else 'BEADGCF')[:abs(fifths)]}


def _length(text):
    if not text:
        return F(1)
    if re.fullmatch(r'/+', text):
        return F(1, 2 ** len(text))
    if text.startswith('/'):
        return F(1, int(text[1:]))
    if text.endswith('/'):
        return F(int(text[:-1]), 2)
    return F(text)


def parse_score(abc: str) -> Score:
    if not abc or len(abc) > 200000:
        raise ValueError('Missing or oversized reference score')
    meter, bar, unit, bpm = '4/4', F(4), F(1, 2), 120.0
    key, accidentals, voices, current = {}, {}, {}, 'default'
    key_name = 'C'
    body = False
    token = re.compile(r'([=_^]{0,2})([A-Ga-gzZxX])([,\x27]*)(\d+(?:/\d*)?|/+\d*)?(-?)')
    for raw in abc.splitlines():
        line = raw.split('%', 1)[0].strip()
        if not line:
            continue
        field = re.match(r'^([A-Za-z]):\s*(.*)$', line)
        if field:
            name, value = field.groups()
            if name == 'V':
                current = value.split()[0]
                voices.setdefault(current, [])
                accidentals.setdefault(current, {})
            elif name in {'M', 'L', 'Q', 'K'}:
                if body and any(voices.values()):
                    raise ValueError('Changing meter, tempo or key inside a reference is not supported for adaptation yet. Use Original score.')
                if name == 'M':
                    meter = {'C': '4/4', 'C|': '2/2'}.get(value, value)
                    bar = F(meter) * 4
                    if bar <= 0 or bar > 16:
                        raise ValueError('Unsupported reference meter')
                elif name == 'L':
                    unit = F(value) * 4
                    if unit <= 0:
                        raise ValueError('Invalid reference note length')
                elif name == 'Q':
                    match = re.fullmatch(r'(?:(\d+/\d+)\s*=\s*)?(\d+(?:\.\d+)?)', value)
                    if not match:
                        raise ValueError('Unsupported reference tempo notation')
                    bpm = float(match[2]) * float(F(match[1] or '1/4') * 4)
                    if not 20 <= bpm <= 400:
                        raise ValueError('Unsupported reference tempo')
                else:
                    key = _key(value)
                    key_name = value
                    body = True
            elif name not in {'X', 'T', 'C', 'S', 'R', 'N', 'O', 'w'}:
                raise ValueError(f'Unsupported reference field {name}')
            continue
        if not body:
            continue
        events = voices.setdefault(current, [])
        acc = accidentals.setdefault(current, {})
        # Chord symbols are intentionally discarded for melody-only generation.
        line = re.sub(r'"[^"]*"', '', line)
        if any(symbol in line for symbol in ('|:', ':|', '[1', '[2', '>', '<', '!', '+', '[V:', '[K:')) or re.search(r'\(\d', line):
            raise ValueError('Reference has repeats, tuplets or inline notation that cannot yet be adapted safely. Use Original score.')
        pos = 0
        while pos < len(line):
            char = line[pos]
            if char.isspace() or char in '()':
                pos += 1; continue
            if char in '|]':
                acc.clear(); pos += 1; continue
            match = token.match(line, pos)
            if not match:
                raise ValueError(f'Unsupported reference notation near {line[pos:pos+16]!r}. Use Original score.')
            accidental, note, octave_marks, length, tie = match.groups()
            beats = _length(length or '') * (bar if note in 'ZX' else unit)
            if beats <= 0 or beats > 4000:
                raise ValueError('Invalid reference event duration')
            pitch = None
            if note.upper() in 'ABCDEFG':
                octave = (5 if note.islower() else 4) + octave_marks.count("'") - octave_marks.count(',')
                letter = note.upper()
                if accidental:
                    acc[(letter, octave)] = accidental.count('^') - accidental.count('_')
                pitch = 12 * (octave + 1) + {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}[letter] + acc.get((letter, octave), key.get(letter, 0))
                if not 0 <= pitch <= 127:
                    raise ValueError('Reference note is outside MIDI range')
            if events and events[-1].tie:
                if events[-1].pitch != pitch:
                    raise ValueError('Reference tie does not connect matching pitches')
                events[-1].beats += beats; events[-1].tie = bool(tie)
            else:
                events.append(Event(pitch, beats, bool(tie)))
            pos = match.end()
    if not body or not any(e.pitch is not None for events in voices.values() for e in events):
        raise ValueError('No playable melody found in the reference score')
    return Score(meter, bar, bpm, voices, key_name)


def voice_events(score, preferred):
    names = [name for wanted in preferred for name in score.voices if name.lower() == wanted.lower()]
    for name in names or (list(score.voices) if len(score.voices) == 1 else []):
        events = score.voices[name]
        if any(e.pitch is not None for e in events):
            return events
    raise ValueError('The generated score has no vocal melody. Retry with a vocal style, or use Sing this melody.')


def bars(events, bar):
    result, row, used = [], [], F(0)
    for event in events:
        left = event.beats
        while left:
            take = min(left, bar - used)
            row.append(Event(event.pitch, take, event.pitch is not None and (left > take or event.tie)))
            used += take; left -= take
            if used == bar:
                result.append(row); row, used = [], F(0)
    if row:
        row.append(Event(None, bar - used)); result.append(row)
    # Strip only wholly silent edge measures, keeping rests within the motif.
    while result and all(e.pitch is None for e in result[0]): result.pop(0)
    while result and all(e.pitch is None for e in result[-1]): result.pop()
    if not result:
        raise ValueError('No melody notes available to arrange')
    return result


def _render(row, next_row=None):
    result = []
    names = ['=C', '^C', '=D', '^D', '=E', '=F', '^F', '=G', '^G', '=A', '^A', '=B']
    for i, e in enumerate(row):
        name = 'z'
        if e.pitch is not None:
            name = names[e.pitch % 12]
            octave = e.pitch // 12 - 1
            name += "'" * max(0, octave - 4) + ',' * max(0, 4 - octave)
        duration = e.beats * 4  # L:1/16
        suffix = str(duration.numerator) if duration.denominator == 1 else f'{duration.numerator}/{duration.denominator}'
        following = row[i+1] if i+1 < len(row) else next_row[0] if next_row else None
        tied = e.tie and following is not None and following.pitch == e.pitch
        result.append(name + suffix + ('-' if tied else ''))
    return ''.join(result) + '|'


def lyric_sections(lyrics):
    sections = []
    for line in lyrics.splitlines():
        match = re.fullmatch(r'\s*\[([^\]]+)\]\s*', line)
        if match:
            sections.append([re.sub(r'[^\w -]', '', match[1]).lower() or 'verse', []])
        elif line.strip():
            if not sections: sections.append(['verse', []])
            sections[-1][1].append(line.strip())
    return [(name, lines) for name, lines in sections if lines]


def arrange(source, lyrics, mode, duration, fit=True, bpm=None, vocal_plan=None):
    if mode not in {'sing', 'backing'}:
        raise ValueError('Unknown reference arrangement mode')
    sections = lyric_sections(lyrics)
    if not sections:
        raise ValueError('This reference mode creates singing and needs written lyrics. Add words in the Lyrics panel (or use Write), then Generate again. A recording supplies the tune, not written lyrics. To follow the reference without adding new vocals, choose Original score.')
    score = parse_score(source)
    tempo = bpm or score.bpm
    melody = bars(voice_events(score, ['Vocal', 'Ins'] if mode == 'sing' else ['Ins', 'Vocal']), score.bar)
    if mode == 'backing':
        if not vocal_plan:
            raise ValueError('Backing mode requires a newly planned vocal melody')
        vocal = bars(voice_events(parse_score(vocal_plan), ['Vocal']), score.bar)
    else:
        vocal = melody
    seconds_per_bar = float(score.bar) * 60 / tempo
    count = math.floor(max(0, duration - 2) / seconds_per_bar) if fit else len(melody)
    if count < len(sections) + 2:
        raise ValueError('This song is too short for its lyric sections plus an intro and ending. Increase duration or shorten the lyrics.')
    # One intro and ending bar; divide the remaining bars among actual lyrics.
    available = count - 2
    weights = [max(1, len(' '.join(lines).split())) for _, lines in sections]
    quotas = [(available - len(sections)) * w / sum(weights) for w in weights]
    allocation = [1 + math.floor(q) for q in quotas]
    for i in sorted(range(len(sections)), key=lambda i: quotas[i] % 1, reverse=True)[:available - sum(allocation)]:
        allocation[i] += 1
    rest = [Event(None, score.bar)]
    layout = [('intro', 1), *[(name, n) for (name, _), n in zip(sections, allocation)], ('outro', 1)]
    output = ['X:1', 'T:Reference arrangement', f'M:{score.meter}', 'L:1/16', f'Q:1/4={tempo:g}',
              'V: Vocal clef=treble name="Vocal Melody"', 'V: Ins clef=treble name="Ins Melody"', 'K:C']
    offset, sung_offset = 0, 0
    for block, (name, size) in enumerate(layout):
        is_sung = 0 < block < len(layout) - 1
        vocals = [vocal[(sung_offset+i) % len(vocal)] if is_sung else rest for i in range(size)]
        instruments = [melody[(offset+i) % len(melody)] if mode == 'backing' or not is_sung else rest for i in range(size)]
        output.append(f'% {name}')
        # End ties at section boundaries instead of tying into an instrumental gap.
        for start in range(0, size, 4):
            for voice, rows in [('Vocal', vocals), ('Ins', instruments)]:
                output += [f'V: {voice}', ''.join(_render(rows[i], rows[i+1] if i+1 < size else None) for i in range(start, min(size, start+4)))]
        offset += size
        if is_sung: sung_offset += size
    return '\n'.join(output) + '\n', {'mode': mode, 'fit_duration': fit, 'bars': count,
        'score_seconds': round(count * seconds_per_bar, 2), 'bpm': tempo,
        'source_melody_bars': len(melody), 'section_bars': allocation}
