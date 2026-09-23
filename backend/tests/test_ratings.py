import tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from pydantic import ValidationError
from app.config import settings
from app.schemas import Track,TrackUpdate
from app.storage import Storage
class RatingTests(unittest.TestCase):
 def test_old_tracks_default_unrated_and_invalid_values_rejected(self):
  self.assertEqual(Track(title='Old').rating,0)
  for value in [-1,6,2.5,True]:
   with self.assertRaises(ValidationError):TrackUpdate(rating=value)
 def test_rating_survives_reopen_and_can_be_cleared(self):
  with tempfile.TemporaryDirectory() as folder,patch.object(settings,'DATA_DIR',Path(folder)):
   db=Storage();track=Track(title='Test',rating=4);db.add_track(track);db._db.close()
   db=Storage();saved=db.get_track(track.id);self.assertEqual(saved.rating,4)
   saved.rating=0;db.add_track(saved);self.assertEqual(db.get_track(track.id).rating,0);db._db.close()

 def test_patch_route_saves_rating_without_changing_title(self):
  import asyncio
  from app.api import update_track
  with tempfile.TemporaryDirectory() as folder,patch.object(settings,'DATA_DIR',Path(folder)):
   db=Storage();track=Track(title='Keep title');db.add_track(track)
   with patch('app.api.storage',db):
    result=asyncio.run(update_track(track.id,TrackUpdate(rating=5)))
    self.assertEqual(result.rating,5);self.assertEqual(result.title,'Keep title')
    self.assertEqual(db.get_track(track.id).rating,5)
   db._db.close()
