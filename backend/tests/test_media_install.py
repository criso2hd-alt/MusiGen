import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from app.config import settings
from app.media_install import repair, MediaInstaller, save_config

class MediaInstallTests(unittest.TestCase):
 def test_repair_finds_existing_config_without_overwriting_valid_paths(self):
  with tempfile.TemporaryDirectory() as root:
   root=Path(root); source=root/'data'; source.mkdir(); dest=root/'installer'/'dist'/'data'; dest.mkdir(parents=True)
   python=source/'python.exe'; python.touch(); model=source/'model'; model.mkdir(); current=dest/'own-python.exe';current.touch()
   (source/'media-tools.json').write_text(json.dumps({'sheetsage_python':'python.exe','sheetsage_model':'model'}))
   (dest/'media-tools.json').write_text(json.dumps({'sheetsage_python':'own-python.exe'}))
   with patch.object(settings,'DATA_DIR',dest):
    tools=repair(); self.assertEqual(tools['reference_missing'],[])
    config=json.loads((dest/'media-tools.json').read_text()); self.assertEqual(config['sheetsage_python'],'own-python.exe');self.assertEqual(config['sheetsage_model'],str(model.resolve()))
 def test_local_config_paths_remain_relative(self):
  with tempfile.TemporaryDirectory() as root:
   with patch.object(settings,'DATA_DIR',Path(root)):
    save_config({'ffmpeg':str(Path(root)/'tools'/'ffmpeg.exe')})
    self.assertFalse(Path(json.loads((Path(root)/'media-tools.json').read_text())['ffmpeg']).is_absolute())
 def test_installer_reuses_available_tools_without_downloads(self):
  with tempfile.TemporaryDirectory() as root:
   installer=MediaInstaller()
   with patch.object(settings,'DATA_DIR',Path(root)), patch('app.media_install.repair',return_value={'reference_missing':[],'midi_missing':[],'ffmpeg_configured':True}), patch.object(installer,'download') as download:
    installer._run('reference');self.assertEqual(installer.status()['status'],'done'); download.assert_not_called()
 def test_install_failure_visible_and_cancel_checked(self):
  installer=MediaInstaller();installer.cancel()
  with self.assertRaises(InterruptedError):installer.check()
  with self.assertRaises(ValueError):installer.start('unknown')
  installer.state['status']='installing'
  with self.assertRaises(ValueError):installer.start('reference')
