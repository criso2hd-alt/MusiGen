import io
from pathlib import Path
import sys
import tempfile
import socket
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import bootstrap_gui as launcher
from runtime_config import ENGINE_REQUIREMENT, RUNTIME_TAG, TORCH_VERSION


class PackagingTests(unittest.TestCase):
    def test_app_origin_survives_restart_and_rejects_busy_port(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            launcher.ensure_home(home)
            port = launcher._app_port(home)
            self.assertEqual(launcher._app_port(home), port)
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as occupied:
                occupied.bind(('127.0.0.1', port)); occupied.listen()
                with self.assertRaisesRegex(RuntimeError, 'in use'):
                    launcher._app_port(home)

    def test_wheel_selection_keeps_tested_version(self):
        index = '<a href="torch-2.12.0+cu128-cp312-cp312-win_amd64.whl"></a>'
        index += f'<a href="torch-{TORCH_VERSION}+cu128-cp312-cp312-win_amd64.whl"></a>'
        with patch.object(launcher.urllib.request, 'urlopen', return_value=io.BytesIO(index.encode())):
            self.assertIn(f'torch-{TORCH_VERSION}+', launcher._resolve_torch_wheel())

    def test_upgrade_reuses_cuda_runtime_and_pins_engine(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            launcher.ensure_home(home)
            py = home / 'runtime/Scripts/python.exe'
            py.parent.mkdir(); py.touch()
            with patch.object(launcher, '_run') as run, patch.object(launcher.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout=f'{TORCH_VERSION}+cu128\n')), patch.object(launcher, '_resolve_torch_wheel') as resolve, patch.object(launcher.shutil, 'disk_usage', return_value=SimpleNamespace(free=100e9)):
                launcher.run_setup(home, home)
                commands = [call.args[0] for call in run.call_args_list]
                self.assertFalse(any('venv' in cmd or '--clear' in cmd for cmd in commands))
                self.assertTrue(any(ENGINE_REQUIREMENT in cmd and '--no-deps' in cmd for cmd in commands))
                resolve.assert_not_called()
                self.assertTrue((home / 'runtime' / f'.ready-{RUNTIME_TAG}').exists())

    def test_incomplete_download_is_not_reused_as_a_wheel(self):
        response = io.BytesIO(b'partial')
        response.headers = {'Content-Length': '100'}
        with tempfile.TemporaryDirectory() as directory:
            wheel = Path(directory) / 'torch.whl'
            with patch.object(launcher.urllib.request, 'urlopen', return_value=response):
                with self.assertRaisesRegex(RuntimeError, 'incomplete'):
                    launcher._download('https://download.pytorch.org/test.whl', wheel, 0, 100)
            self.assertFalse(wheel.exists())


if __name__ == '__main__':
    unittest.main()
