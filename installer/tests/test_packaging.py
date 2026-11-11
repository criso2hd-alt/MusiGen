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

    @staticmethod
    def _fake_runtime(home, base):
        """A runtime venv whose pyvenv.cfg points at `base` (created if inside home)."""
        py = home / 'runtime/Scripts/python.exe'
        py.parent.mkdir(parents=True); py.touch()
        (home / 'runtime/pyvenv.cfg').write_text(f'home = {base}\n', encoding='utf-8')
        return py

    def _setup(self, home, portable_after=None):
        """Run setup with uv/torch mocked; return the uv commands it issued."""
        torch_ok = SimpleNamespace(returncode=0, stdout=f'{TORCH_VERSION}+cu128\n')
        with patch.object(launcher, '_run') as run, \
                patch.object(launcher.subprocess, 'run', return_value=torch_ok), \
                patch.object(launcher, '_resolve_torch_wheel') as resolve, \
                patch.object(launcher.shutil, 'disk_usage', return_value=SimpleNamespace(free=100e9)):
            if portable_after is not None:
                with patch.object(launcher, '_runtime_portable', side_effect=portable_after):
                    launcher.run_setup(home, home)
            else:
                launcher.run_setup(home, home)
            resolve.assert_not_called()
            return [call.args[0] for call in run.call_args_list]

    def test_upgrade_reuses_cuda_runtime_and_pins_engine(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            launcher.ensure_home(home)
            base = home / 'python' / 'cpython-3.12-windows-x86_64-none'
            base.mkdir(parents=True)
            self._fake_runtime(home, base)
            commands = self._setup(home)
            # A healthy portable runtime is reused as-is: no venv command at all.
            self.assertFalse(any('venv' in cmd or '--clear' in cmd for cmd in commands))
            self.assertTrue(any(ENGINE_REQUIREMENT in cmd and '--no-deps' in cmd for cmd in commands))
            self.assertTrue((home / 'runtime' / f'.ready-{RUNTIME_TAG}').exists())

    def test_system_python_runtime_is_rebased_in_place_keeping_packages(self):
        # Older builds made the runtime from the system Python on C:. It must be
        # moved onto the in-folder Python WITHOUT --clear (that would wipe torch).
        with tempfile.TemporaryDirectory() as directory, tempfile.TemporaryDirectory() as system:
            home = Path(directory)
            launcher.ensure_home(home)
            self._fake_runtime(home, Path(system))
            self.assertFalse(launcher._runtime_portable(home))
            commands = self._setup(home, portable_after=[False, True])
            venv = [cmd for cmd in commands if 'venv' in cmd]
            self.assertEqual(len(venv), 1)
            self.assertIn('--allow-existing', venv[0])
            self.assertFalse(any('--clear' in cmd for cmd in commands))

    def test_working_runtime_is_kept_when_it_cannot_be_rebased(self):
        # e.g. offline: the in-folder Python can't be downloaded yet. The old
        # runtime still starts, so it must be kept, never wiped.
        with tempfile.TemporaryDirectory() as directory, tempfile.TemporaryDirectory() as system:
            home = Path(directory)
            launcher.ensure_home(home)
            self._fake_runtime(home, Path(system))
            commands = self._setup(home, portable_after=[False, False])
            self.assertFalse(any('--clear' in cmd for cmd in commands))

    def test_unrepairable_runtime_falls_back_to_a_clean_rebuild(self):
        # The base Python vanished (C: reverted) and the runtime can't start.
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            launcher.ensure_home(home)
            self._fake_runtime(home, home / 'python' / 'missing')
            with patch.object(launcher, '_runtime_runs', return_value=False):
                commands = self._setup(home, portable_after=[False, False])
            venv = [cmd for cmd in commands if 'venv' in cmd]
            self.assertEqual(['--allow-existing' in venv[0], '--clear' in venv[1]], [True, True])

    def test_setup_keeps_python_and_uv_cache_inside_the_app_folder(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            with patch.dict(launcher.os.environ, {}, clear=False):
                launcher._portable_env(home)
                env = launcher.os.environ
                self.assertEqual(env['UV_PYTHON_PREFERENCE'], 'only-managed')
                self.assertEqual(Path(env['UV_PYTHON_INSTALL_DIR']), home / 'python')
                self.assertEqual(Path(env['UV_CACHE_DIR']), home / 'downloads' / 'uv-cache')
                self.assertEqual(env['PYTHONUTF8'], '1')

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
