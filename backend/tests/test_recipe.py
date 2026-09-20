"""GPU-free regressions; isolate storage before importing app modules."""
import asyncio
import os
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch, AsyncMock

_temp = tempfile.TemporaryDirectory()
os.environ["MUSIGEN_DATA_DIR"] = _temp.name
os.environ["MUSIGEN_ENGINE"] = "stub"

from app.gpu import ModelBusy, model_operation
from app.jobs import JobManager
from app.schemas import GenerateRequest, GenerationOptions, JobStatus, Pill, Track
from app.engines.base import EngineResult, EnginePaused, EngineProgress
from app.storage import storage


def tearDownModule():
    storage._db.close()
    _temp.cleanup()


class FakeEngine:
    def generate(self, request, progress, cancelled):
        return EngineResult(request.out_path, 12.0, 48000, {"truncated": True})


class RecipeTests(unittest.TestCase):
    def test_media_worker_bridge_and_atomic_timing_update(self):
        import json
        import sys
        import textwrap
        import numpy as np
        import soundfile as sf
        from app.media_tasks import MediaTasks
        from app.config import settings
        fixture = Path(_temp.name) / "media-fixture"
        fixture.mkdir(exist_ok=True)
        (fixture / "torch.py").write_text("from types import SimpleNamespace\ncuda = SimpleNamespace(is_available=lambda: True)\nbfloat16 = 'bf16'\n")
        (fixture / "transformers.py").write_text(textwrap.dedent('''
            class AutoModel:
                @classmethod
                def from_pretrained(cls, *a, **kw): return cls()
                def eval(self): return self
                def to(self, device): return self
                def transcribe(self, audio, **kw): return {'abc': 'X:1\\nK:C\\nC D E F|'}
        '''))
        (fixture / "qwen_asr.py").write_text(textwrap.dedent('''
            from types import SimpleNamespace as NS
            class Qwen3ASRModel:
                @classmethod
                def from_pretrained(cls, *a, **kw): return cls()
                def transcribe(self, **kw):
                    return [NS(text='Hello', language='English', time_stamps=NS(items=[NS(text='Hello', start_time=.01, end_time=.08)]))]
        '''))
        audio = settings.AUDIO_DIR / "media-fixture.flac"
        sf.write(audio, np.zeros((4800, 2)), 48000)
        config = {"sheetsage_python": sys.executable, "alignment_python": sys.executable,
                  "sheetsage_model": str(fixture), "asr_model": str(fixture), "aligner_model": str(fixture)}
        async def run():
            manager = MediaTasks()
            manager.start()
            try:
                task = manager.submit("reference", audio, name="guitar.flac")
                await asyncio.wait_for(manager.queue.join(), 10)
                self.assertEqual(manager.get(task["id"])["status"], "done", manager.get(task["id"]))
                reference = manager.reference(task["id"])
                self.assertEqual(reference["duration"], .1)
                self.assertEqual(len(reference["sha256"]), 64)
                with patch("app.media_tasks.media_tasks", manager):
                    jobs = JobManager()
                    jobs._engines["stub"] = FakeEngine()
                    job = await jobs.submit(GenerateRequest(reference_id=task["id"]))
                    self.assertEqual(jobs._requests[job.id].options.cot, "melody")
                    self.assertEqual(jobs._requests[job.id].abc, reference["abc"])
                    await jobs._run_job(job.id)
                    self.assertEqual(storage.get_track(job.track_id).reference["name"], "guitar.flac")
                track = Track(title="Original", lyrics="Original requested lyrics", audio_url="/media/audio/media-fixture.flac", duration=.1)
                storage.add_track(track)
                task = manager.submit("alignment", audio, track_id=track.id)
                track.title = "Renamed while analyzing"
                storage.add_track(track)
                await asyncio.wait_for(manager.queue.join(), 10)
                self.assertEqual(manager.get(task["id"])["status"], "done", manager.get(task["id"]))
                updated = storage.get_track(track.id)
                self.assertEqual(updated.title, track.title)
                self.assertEqual(updated.lyrics, "Original requested lyrics")
                self.assertEqual(updated.lyric_timing.words[0].text, "Hello")
                storage.delete_track(track.id)
                self.assertFalse(storage.set_lyric_timing(track.id, updated.lyric_timing.model_dump()))
            finally:
                await manager.stop()
        with patch("app.media_tasks.configuration", return_value=config), patch.dict(os.environ, {"PYTHONPATH": str(fixture)}):
            asyncio.run(run())

    def test_media_process_cancel_and_timeout_reap_child(self):
        import sys
        from app.media_tools import run_process
        from app.engines.base import EngineCancelled
        folder = Path(_temp.name) / "process-test"
        folder.mkdir(exist_ok=True)
        command = [sys.executable, "-c", "import time; time.sleep(30)"]
        with self.assertRaises(EngineCancelled):
            run_process(command, folder, lambda: True)
        with self.assertRaises(TimeoutError):
            run_process(command, folder, lambda: False, timeout=.1)

    def test_media_rejects_bad_timestamps_and_overlong_audio(self):
        from app.media_tasks import validate_timing
        from app.media_tools import prepare_audio
        from types import SimpleNamespace
        word = {"text": "hello", "start": 2, "end": 1}
        with self.assertRaises(ValueError):
            validate_timing({"words": [word]}, 5)
        with self.assertRaises(ValueError):
            validate_timing({"words": [{**word, "end": float("nan")}]}, 5)
        with self.assertRaises(ValueError):
            validate_timing({"words": [{**word, "end": 7}]}, 5)
        with self.assertRaises(ValueError):
            validate_timing({"words": []}, 5)
        point = validate_timing({"words": [{"text": "rise", "start": 2, "end": 2},
                                          {"text": "every", "start": 2, "end": 3}]}, 5)
        self.assertEqual([w.text for w in point.words], ["rise", "every"])
        self.assertEqual(point.words[0].end, 2)
        with patch("soundfile.info", return_value=SimpleNamespace(duration=331)):
            with self.assertRaisesRegex(ValueError, "330"):
                prepare_audio(Path("long.wav"), Path(_temp.name), {}, lambda: False, lambda _: None)

    def test_media_api_unconfigured_and_invalid_files(self):
        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)
        with patch("app.media_tools.configuration", return_value={}):
            self.assertTrue(client.get("/api/media-tools").json()["reference_missing"])
            self.assertEqual(client.post("/api/references?filename=demo.wav", content=b"RIFF").status_code, 503)
            self.assertEqual(client.post("/api/references?filename=demo.exe", content=b"bad").status_code, 415)
        with patch("app.media_api.capabilities", return_value={"reference_missing": [], "midi_missing": []}):
            self.assertEqual(client.post("/api/references?filename=empty.wav", content=b"").status_code, 400)
            with patch("app.media_api.MAX_UPLOAD", 3):
                self.assertEqual(client.post("/api/references?filename=large.wav", content=b"four").status_code, 413)

    def test_cancel_survives_restart_and_elapsed_excludes_downtime(self):
        async def run():
            manager = JobManager()
            job = await manager.submit(GenerateRequest())
            job.status = JobStatus.generating
            job.stage = "generating"
            import time
            job.run_started_at = time.time() - 12
            manager.cancel(job.id)
            restored = JobManager()
            restored._restore()
            recovered = restored.jobs[job.id]
            self.assertEqual(recovered.status, "cancelled")
            self.assertGreaterEqual(recovered.elapsed_seconds, 12)
            self.assertLess(recovered.elapsed_seconds, 15)
            self.assertNotIn(job.id, restored._requests)
        asyncio.run(run())

    def test_restoring_tempo_does_not_accumulate_hints(self):
        async def run():
            manager = JobManager()
            manager._engines["stub"] = FakeEngine()
            job = await manager.submit(GenerateRequest(style="jazz", options=GenerationOptions(bpm=90)))
            self.assertEqual(job.style, "jazz, 90 BPM")
            await manager._run_job(job.id)
            track = storage.get_track(job.track_id)
            self.assertEqual(track.style, "jazz")
            self.assertEqual(track.generation_meta["resolved_style"], "jazz, 90 BPM")
            track.options.bpm = 120
            restored = await manager.submit(GenerateRequest(style=track.style, options=track.options))
            self.assertEqual(restored.style, "jazz, 120 BPM")
        asyncio.run(run())

    def test_yue_saved_stages_resume_without_recomposing(self):
        import numpy as np
        from yue2.pipeline import SymbolicPlan, SemanticResult
        from app.engines.yue2_engine import YuE2Engine
        from app.engines.base import EngineRequest
        pause = threading.Event()
        calls = []
        class Pipe:
            weights = {"test": "weights"}
            runtime_sha256 = "test-runtime"
            progress = False
            def plan(self, request, **kwargs):
                calls.append("plan")
                return SymbolicPlan(request, "X:1\nK:C\nC", [], [1])
            def generate_semantic(self, plan, **kwargs):
                calls.append("semantic")
                pause.set()
                return SemanticResult(plan, [1, 2], {"seconds": 1}, False)
            def synthesize(self, semantic, **kwargs):
                calls.append("synthesize")
                with self._status("Synthesizing audio", unit="steps") as status:
                    status.update(32, total=32)
                return np.zeros((2, 64), dtype=np.float32)
            def decode(self, latents):
                calls.append("decode")
                return np.zeros((4800, 2), dtype=np.float32)
        engine = YuE2Engine()
        engine._pipe = Pipe()
        request = EngineRequest("synthwave", "[verse]\nHello", Path(_temp.name) / "resumed.flac",
            checkpoint_dir=Path(_temp.name) / "test-checkpoint", is_pause_requested=pause.is_set)
        events = []
        with self.assertRaises(EnginePaused):
            engine.generate(request, events.append, lambda: False)
        self.assertEqual(calls, ["plan", "semantic"])
        pause.clear()
        with patch("app.engines.yue_synthesis.synthesize_bounded",
                   side_effect=lambda pipe, semantic, report, cancelled, size: pipe.synthesize(semantic)):
            result = engine.generate(request, events.append, lambda: False)
        self.assertEqual(calls, ["plan", "semantic", "synthesize", "decode"])
        self.assertTrue(result.audio_path.exists())
        self.assertTrue(any(e.completed == 32 for e in events))
        request.seed += 1
        with self.assertRaisesRegex(ValueError, "different settings"):
            engine.generate(request, events.append, lambda: False)

    def test_bounded_attention_preserves_full_context(self):
        import torch
        from yue2.nar import attention
        generator = torch.Generator().manual_seed(123)
        query = torch.randn(31, 4, 8, generator=generator)
        key = torch.randn(31, 2, 8, generator=generator)
        value = torch.randn(31, 2, 8, generator=generator)
        for causal in (True, False):
            full = attention(query, key, value, causal=causal, backend="math", query_chunk_size=31)
            bounded = attention(query, key, value, causal=causal, backend="math", query_chunk_size=7)
            torch.testing.assert_close(bounded, full, rtol=1e-5, atol=1e-6)

    def test_pause_resume_and_restart_keep_request(self):
        async def run():
            manager = JobManager()
            job = await manager.submit(GenerateRequest(engine="yue2", extra="dreamy", options=GenerationOptions(seed=97)))
            self.assertTrue(manager.pause(job.id))
            self.assertEqual(job.status, "paused")
            restored = JobManager()
            restored._restore()
            self.assertEqual(restored._requests[job.id].options.seed, 97)
            self.assertEqual(restored.jobs[job.id].status, "paused")
            self.assertTrue(await restored.resume(job.id))
            self.assertFalse(await restored.resume(job.id))
            self.assertTrue(restored.cancel(job.id))
            self.assertNotIn(job.id, restored._requests)
            self.assertFalse(await restored.resume(job.id))
        asyncio.run(run())

    def test_pause_releases_worker_for_next_song(self):
        class PauseEngine:
            def generate(self, request, progress, cancelled):
                raise EnginePaused()
        async def run():
            manager = JobManager()
            manager._engines["yue2"] = PauseEngine()
            manager._engines["stub"] = FakeEngine()
            first = await manager.submit(GenerateRequest(engine="yue2"))
            second = await manager.submit(GenerateRequest(engine="stub"))
            worker = asyncio.create_task(manager._run_worker())
            try:
                with patch("app.model_manager.is_ready", return_value=True):
                    await asyncio.wait_for(manager._queue.join(), 3)
                self.assertEqual(first.status, "paused")
                self.assertEqual(second.status, "done")
                self.assertIsNone(first.run_started_at)
            finally:
                worker.cancel()
                try:
                    await worker
                except asyncio.CancelledError:
                    pass
        asyncio.run(run())

    def test_late_cancel_never_adds_track(self):
        manager = JobManager()
        class LateEngine:
            def generate(self, request, progress, cancelled):
                next(iter(manager._cancel_events.values())).set()
                return EngineResult(request.out_path, 4, 48000)
        async def run():
            manager._engines["stub"] = LateEngine()
            job = await manager.submit(GenerateRequest())
            await manager._run_job(job.id)
            self.assertEqual(job.status, "cancelled")
            self.assertIsNone(job.track_id)
            self.assertIsNotNone(job.finished_at)
        asyncio.run(run())

    def test_error_job_is_persisted_and_worker_continues(self):
        class Broken:
            def generate(self, *args):
                raise RuntimeError("test failure")
        async def run():
            manager = JobManager()
            manager._engines["stub"] = Broken()
            job = await manager.submit(GenerateRequest())
            worker = asyncio.create_task(manager._run_worker())
            await asyncio.wait_for(manager._queue.join(), 3)
            worker.cancel()
            try:
                await worker
            except asyncio.CancelledError:
                pass
            self.assertEqual(job.stage, "error")
            self.assertNotIn(job.id, manager._requests)
            restored = JobManager()
            restored._restore()
            self.assertEqual(restored.jobs[job.id].status, "error")
        asyncio.run(run())

    def test_progress_adapter_labels_submitted_work(self):
        from app.engines.yue_progress import PipelineStatus
        events = []
        with PipelineStatus(events.append, "Synthesizing audio", total=32) as status:
            status.update(16)
            status.update(32)
        self.assertEqual(events[1].completed, 16)
        self.assertEqual(events[1].total, 32)
        self.assertIn("submitted", events[-1].message)
        self.assertLess(events[-1].progress, .90)

    def test_lyric_fit_and_duration_prompt(self):
        from app.lyric_fit import estimate
        from app.prompt_composer import write_lyrics
        long = "[verse]\n" + "heart " * 240
        self.assertIsNotNone(estimate(long, 60)["warning"])
        self.assertGreater(estimate(long, 60, bpm=70)["estimated_max_seconds"], estimate(long, 60, bpm=160)["estimated_max_seconds"])
        self.assertEqual(estimate("[intro]\n[chorus]", 60)["word_count"], 0)
        async def run():
            mock = AsyncMock(return_value="[verse]\nNeon sky")
            with patch("app.prompt_composer.llm.available", return_value=True), patch("app.prompt_composer._run_llm", mock):
                await write_lyrics("test", [], ["verse"], duration=60, bpm=90)
            self.assertIn("60 seconds", mock.call_args.args[1])
            self.assertIn("90 BPM", mock.call_args.args[1])
        asyncio.run(run())

    def test_switching_llm_does_not_block_event_loop(self):
        from app.api import llm_select
        from app.gpu import model_session
        entered, release = threading.Event(), threading.Event()
        def hold():
            with model_session("Test song"):
                entered.set()
                release.wait(3)
        owner = threading.Thread(target=hold)
        owner.start()
        try:
            self.assertTrue(entered.wait(2))
            async def run():
                with self.assertRaises(ModelBusy):
                    await asyncio.wait_for(llm_select({"model": "Qwen/Qwen2.5-3B-Instruct"}), .5)
            asyncio.run(run())
        finally:
            release.set()
            owner.join(3)

    def test_recipe_survives_job_and_storage(self):
        async def run():
            manager = JobManager()
            manager._engines["stub"] = FakeEngine()
            request = GenerateRequest(
                pills=[Pill(id="p1", category="genre", label="synthwave")],
                extra="pixel survival game", lyrics="[verse]\nUnder the neon sky",
                options=GenerationOptions(seed=42, cot="melody", max_duration=180),
            )
            job = await manager.submit(request)
            self.assertEqual(job.style, "synthwave, pixel survival game")
            self.assertEqual(job.title, "Under the neon sky")
            await manager._run_job(job.id)
            track = storage.get_track(job.track_id)
            self.assertEqual(track.seed, 42)
            self.assertEqual(track.extra, request.extra)
            self.assertEqual(track.options, request.options)
            self.assertEqual(track.pills, request.pills)
            self.assertTrue(track.generation_meta["truncated"])
        asyncio.run(run())

    def test_reference_mode_reaches_engine_and_saved_recipe(self):
        from test_reference_arrangement import SOURCE, LYRICS
        seen = []
        class Capture(FakeEngine):
            def generate(self, request, progress, cancelled):
                seen.append(request)
                return super().generate(request, progress, cancelled)
        async def run():
            manager = JobManager()
            manager._engines["stub"] = Capture()
            for mode in ("sing", "backing"):
                request = GenerateRequest(style="folk", abc=SOURCE, lyrics=LYRICS,
                    options=GenerationOptions(reference_mode=mode, reference_fit_duration=False, bpm=100))
                job = await manager.submit(request)
                await manager._run_job(job.id)
                track = storage.get_track(job.track_id)
                self.assertEqual(seen[-1].reference_mode, mode)
                self.assertEqual(seen[-1].arrangement_bpm, 100)
                self.assertFalse(seen[-1].reference_fit_duration)
                self.assertEqual(track.options, request.options)
                self.assertEqual(track.abc, SOURCE)
        asyncio.run(run())

    def test_legacy_track_does_not_invent_settings(self):
        track = Track.model_validate({"title": "Old song", "seed": 12})
        self.assertIsNone(track.options)
        self.assertIsNone(track.extra)

    def test_shared_model_lock_is_reentrant_and_reports_busy(self):
        entered, release = threading.Event(), threading.Event()

        @model_operation()
        def owner():
            nested()
            entered.set()
            release.wait(3)

        @model_operation(wait=False)
        def nested():
            return True

        thread = threading.Thread(target=owner)
        thread.start()
        try:
            self.assertTrue(entered.wait(2))
            with self.assertRaises(ModelBusy):
                nested()
        finally:
            release.set()
            thread.join(3)
        self.assertTrue(nested())

    def test_flac_export_contains_seed_and_recipe(self):
        import json
        import numpy as np
        import soundfile as sf
        from mutagen.flac import FLAC
        from app.api import _tag_flac
        dest = Path(_temp.name) / "export.flac"
        sf.write(dest, np.zeros(1000), 48000)
        track = Track(title="Test", seed=777, extra="tape hiss", options=GenerationOptions(seed=777))
        _tag_flac(dest, track)
        tags = FLAC(dest)
        self.assertEqual(tags["musigen_seed"], ["777"])
        recipe = json.loads(tags["musigen_recipe"][0])
        self.assertEqual(recipe["options"]["seed"], 777)
        self.assertEqual(recipe["extra"], "tape hiss")


if __name__ == "__main__":
    unittest.main()
