import unittest
from fractions import Fraction
from app.reference_arrangement import arrange,parse_score,bars

SOURCE='''X:1
M:4/4
L:1/16
Q:1/4=120
V: Vocal
V: Ins
K:G
V: Vocal
Z4|
V: Ins
F8G8|A16-|A16|B8c8|
'''
LYRICS='[verse]\nMorning light brings me home\n[chorus]\nWe belong together'
class ArrangementTests(unittest.TestCase):
 def test_sing_length_pitch_and_balanced_voices(self):
  abc,meta=arrange(SOURCE,LYRICS,'sing',60)
  score=parse_score(abc)
  self.assertEqual(meta['score_seconds'],58)
  self.assertEqual({sum(e.beats for e in v) for v in score.voices.values()},{Fraction(116)})
  self.assertEqual(next(e.pitch for e in score.voices['Vocal'] if e.pitch is not None),66)
  self.assertEqual(meta['bars'],29)
 def test_backing_keeps_reference_and_new_vocal(self):
  vocal=SOURCE.replace('V: Vocal\nZ4|','V: Vocal\nD16|E16|D16|E16|')
  abc,_=arrange(SOURCE,LYRICS,'backing',60,vocal_plan=vocal)
  score=parse_score(abc)
  self.assertEqual(next(e.pitch for e in score.voices['Vocal'] if e.pitch is not None),62)
  self.assertEqual(next(e.pitch for e in score.voices['Ins'] if e.pitch is not None),66)
 def test_rejects_missing_vocals_and_unsupported_notation(self):
  with self.assertRaises(ValueError): arrange(SOURCE,LYRICS,'backing',60,vocal_plan=SOURCE)
  with self.assertRaises(ValueError): arrange(SOURCE,'','sing',60)
  with self.assertRaises(ValueError): parse_score(SOURCE.replace('F8G8','(3FGAB'))
 def test_no_fit_preserves_motif_length(self):
  _,meta=arrange(SOURCE,LYRICS,'sing',120,False)
  self.assertEqual(meta['score_seconds'],8)

 def test_explicit_tempo_preserves_notes_and_overrides_score(self):
  from app.reference_arrangement import retime_score
  score=parse_score(retime_score(SOURCE,90))
  self.assertEqual(score.bpm,90)
  self.assertEqual([(e.pitch,e.beats) for e in score.voices['Ins']],[(e.pitch,e.beats) for e in parse_score(SOURCE).voices['Ins']])
