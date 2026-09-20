# Instrumental reference follow-up

User supplied the MIDI `Super Mario Bros. 1 - Super Mario Bros - Main Theme.mid`
and exported `Inky pipes, green skies.flac` on September 20.

## Confirmed evidence

- MIDI: 34.285632 seconds, 112 BPM, two tracks with 66 and 44 note-on events.
  SHA-256 matches the saved reference provenance. Opening MIDI notes match the
  extracted instrumental melody. Rendered WAV including decay is 37.44 seconds.
- Export: 37.118667 seconds; submitted duration budget 110 seconds; 928 semantic
  content tokens against a 2,970-token limit; `truncated=false`. Other saved
  requests with a 140-second budget also end around 37 seconds.
- Lyrics are present in the saved track and FLAC. The request path passes them
  through to native `SongRequest` and the native prompt includes them.
- Every `V: Vocal` block in the supplied ABC is rests (`Z4`, `Z2`); melodic notes
  occur in `V: Ins`. The app passes this score directly to native `plan()`, whose
  external-ABC branch bypasses score generation. Thus the source's instrumental
  arrangement and short form are conditioned into generation. Raising the
  semantic maximum does not extend this score or create its missing vocal part.
- There is no audio overlay step: the generation engine receives ABC, not the
  rendered MIDI waveform. The output is a newly synthesized score-conditioned song.

Upstream behavior: https://github.com/multimodal-art-projection/YuE/blob/main/skills/yue2-music/references/generation-and-covers.md

## Arrangement implementation

The reference panel now has an explicit file button and three recipe choices:

- **Sing this melody:** move the extracted melodic notes into the vocal voice
  during lyric sections. Keep the motif in the instrumental intro and outro.
- **Use as backing:** YuE2 plans a new vocal melody from the lyrics; the adapter
  combines that vocal line with the reference instrumental motif.
- **Original score:** retain the prior supplied-score path, including its rests
  and musical length. Old recipes default to this for compatibility.

Fit to song length repeats the motif into a form with one intro and outro bar,
then divides the remaining whole bars among lyric sections by their word counts.
It reserves approximately two seconds below the token budget. This is a simple
motif arrangement, not a full musical reharmonizer or a guarantee of precise
syllable-to-note alignment. Output duration and lyric delivery remain model-dependent.
Without fitting, the source motif's approximate bar count is retained.

The parser preserves absolute pitches, key accidentals, ties, rests and rational
note durations. Unsupported repeats, tuplets, inline changes and other notation
fail explicitly rather than silently changing the tune. Backing mode requests
the reference key, meter and tempo from the planner; model compliance and the
musical compatibility of the combined lines still require listening evaluation.

Options reach the engine and are saved with the original source score in the
recipe. The adapted score and arrangement metadata are saved in generation
metadata/checkpoints. Legacy checkpoint fingerprints remain compatible. Arrangement
checkpoints include an adapter version and are reused after a stage pause.

## Validation

- 24 backend, eight frontend and four installer tests pass. Frontend build passes;
  lint has six existing warnings and no errors.
- Browser checks restored the user's old recipe into Original score, selected
  both new modes, and verified the fit checkbox and contextual explanations.
- Real GPU Sing this melody test: source 34.285632 seconds (37.44 with render decay),
  target 110 seconds, arranged score 107.14 seconds, output 106.558667 seconds.
  Audio/metadata are in ignored `data/reference-diagnosis/gpu`.
- Backing output: 118.798667 seconds; semantic token limit reached. This seed
  demonstrates a remaining model duration/ending limitation, surfaced by the
  existing truncation warning. It is not an exact-length or guaranteed-complete ending.
- ASR on the first 25 seconds recognized 23 words for Sing this melody and 18
  words for Use as backing, including words from the supplied test lyrics in
  both. This confirms sung output in these samples, not full lyric fidelity or
  a subjective audio-quality pass. Reports: `data/media-tools/validation/`
  `20260920-013858-alignment` and `20260920-013917-alignment`.
- Local EXE rebuilt as 0.1.0-preview.2; startup, version, API schema and all 16
  existing test-library tracks verified. No library reset or public push.

The earlier short MIDI smoke test validated extraction and supplied-score generation
only; it did not validate vocals or duration fitting. No GitHub push/release is authorized.
