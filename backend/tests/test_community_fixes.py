"""Regressions for community-reported issues (Discord, Sep-Oct 2026)."""
import asyncio
import os
import subprocess
import sys
import tempfile
import unittest

_temp = tempfile.TemporaryDirectory()
os.environ["MUSIGEN_DATA_DIR"] = _temp.name
os.environ["MUSIGEN_ENGINE"] = "stub"

from app.config import settings  # noqa: E402
from app.instrumental import has_words, instrumental_lyrics  # noqa: E402
from app.jobs import JobManager  # noqa: E402
from app.schemas import GenerateRequest, JobStatus  # noqa: E402


def _sections(lyrics: str) -> list[str]:
    return [line.strip("[] ") for line in lyrics.splitlines() if line.strip()]


class InstrumentalLengthTests(unittest.TestCase):
    """180 s instrumentals came out ~60 s: one empty [verse] planned one section."""

    def test_wordless_detection(self):
        self.assertFalse(has_words(""))
        self.assertFalse(has_words("[verse]\n\n[chorus]\n…\n"))
        self.assertTrue(has_words("[verse]\nȘoseaua mea\n"))

    def test_long_instrumental_gets_enough_sections(self):
        for duration in (60, 120, 180, 330):
            sections = _sections(instrumental_lyrics("[verse]\n", duration))
            self.assertGreaterEqual(len(sections) * 15, duration, duration)
            self.assertEqual(sections[0], "intro")
            self.assertEqual(sections[-1], "outro")

    def test_chosen_order_is_kept_and_extended(self):
        sections = _sections(instrumental_lyrics("[intro]\n[verse]\n[chorus]\n[outro]\n", 180))
        self.assertEqual((sections[0], sections[-1]), ("intro", "outro"))
        self.assertGreaterEqual(len(sections), 12)
        self.assertEqual(set(sections[1:-1]), {"verse", "chorus"})
        self.assertEqual(_sections(instrumental_lyrics("[verse]\n[chorus]\n", 60)),
                         ["verse", "chorus", "verse", "chorus"])


class ClearQueueTests(unittest.TestCase):
    """There was no way to clear the queue; finished jobs came back on every launch."""

    def test_clear_finished_keeps_active_and_deletes_journals(self):
        async def run():
            manager = JobManager()
            done = await manager.submit(GenerateRequest())
            failed = await manager.submit(GenerateRequest())
            queued = await manager.submit(GenerateRequest())
            done.status = JobStatus.done
            failed.status = JobStatus.error
            for job in (done, failed, queued):
                manager._persist(job)

            cleared = manager.clear_finished()
            self.assertEqual(set(cleared), {done.id, failed.id})
            self.assertIn(queued.id, manager.jobs)
            for job_id in cleared:
                self.assertNotIn(job_id, manager.jobs)
                self.assertFalse((settings.DATA_DIR / "jobs" / f"{job_id}.json").exists())

            restored = JobManager()
            restored._restore()
            self.assertEqual(set(restored.jobs), {queued.id})
        asyncio.run(run())

    def test_clear_only_the_given_ids(self):
        async def run():
            manager = JobManager()
            a = await manager.submit(GenerateRequest())
            b = await manager.submit(GenerateRequest())
            a.status = b.status = JobStatus.cancelled
            self.assertEqual(manager.clear_finished([a.id]), [a.id])
            self.assertIn(b.id, manager.jobs)
        asyncio.run(run())


class UnicodeLyricsTests(unittest.TestCase):
    """Romanian lyrics crashed with "'charmap' codec can't encode character '\\u0218'"."""

    def test_utf8_mode_writes_romanian_text(self):
        # The launcher starts the backend with PYTHONUTF8=1; prove that mode makes a
        # default-encoding text write (as the engine's checkpoint writer does) safe.
        code = ("import pathlib,sys,tempfile; p=pathlib.Path(tempfile.mkdtemp())/'x.txt';"
                "p.write_text('Șoseaua, țara, cântăm'); print(sys.flags.utf8_mode)")
        env = dict(os.environ, PYTHONUTF8="1")
        out = subprocess.run([sys.executable, "-c", code], env=env, capture_output=True, text=True)
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertEqual(out.stdout.strip(), "1")


if __name__ == "__main__":
    unittest.main()
