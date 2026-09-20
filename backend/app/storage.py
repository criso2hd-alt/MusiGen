"""SQLite persistence for tracks and playlists (audio files live on disk)."""
from __future__ import annotations

import json
import sqlite3
import threading
from typing import Optional

from .config import settings
from .schemas import Playlist, Track


class Storage:
    def __init__(self) -> None:
        settings.ensure_dirs()
        self._lock = threading.Lock()
        self._db = sqlite3.connect(str(settings.DB_PATH), check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self) -> None:
        with self._lock:
            self._db.executescript(
                """
                CREATE TABLE IF NOT EXISTS tracks (
                    id TEXT PRIMARY KEY,
                    data TEXT NOT NULL,
                    created_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS playlists (
                    id TEXT PRIMARY KEY,
                    data TEXT NOT NULL,
                    created_at REAL NOT NULL
                );
                """
            )
            self._db.commit()

    # -- tracks ------------------------------------------------------------

    def add_track(self, track: Track) -> Track:
        with self._lock:
            self._db.execute(
                "INSERT OR REPLACE INTO tracks (id, data, created_at) VALUES (?,?,?)",
                (track.id, track.model_dump_json(), track.created_at),
            )
            self._db.commit()
        return track

    def get_track(self, track_id: str) -> Optional[Track]:
        with self._lock:
            row = self._db.execute(
                "SELECT data FROM tracks WHERE id=?", (track_id,)
            ).fetchone()
        return Track.model_validate_json(row["data"]) if row else None

    def list_tracks(self) -> list[Track]:
        with self._lock:
            rows = self._db.execute(
                "SELECT data FROM tracks ORDER BY created_at DESC"
            ).fetchall()
        return [Track.model_validate_json(r["data"]) for r in rows]

    def delete_track(self, track_id: str) -> bool:
        with self._lock:
            cur = self._db.execute("DELETE FROM tracks WHERE id=?", (track_id,))
            self._db.commit()
            return cur.rowcount > 0

    def set_lyric_timing(self, track_id: str, timing: dict) -> bool:
        """Merge analysis atomically without resurrecting deletes or losing edits."""
        with self._lock:
            row = self._db.execute("SELECT data FROM tracks WHERE id=?", (track_id,)).fetchone()
            if not row:
                return False
            data = json.loads(row["data"])
            data["lyric_timing"] = timing
            track = Track.model_validate(data)
            self._db.execute("UPDATE tracks SET data=? WHERE id=?", (track.model_dump_json(), track_id))
            self._db.commit()
            return True

    # -- playlists ---------------------------------------------------------

    def add_playlist(self, pl: Playlist) -> Playlist:
        with self._lock:
            self._db.execute(
                "INSERT OR REPLACE INTO playlists (id, data, created_at) VALUES (?,?,?)",
                (pl.id, pl.model_dump_json(), pl.created_at),
            )
            self._db.commit()
        return pl

    def get_playlist(self, pl_id: str) -> Optional[Playlist]:
        with self._lock:
            row = self._db.execute(
                "SELECT data FROM playlists WHERE id=?", (pl_id,)
            ).fetchone()
        return Playlist.model_validate_json(row["data"]) if row else None

    def list_playlists(self) -> list[Playlist]:
        with self._lock:
            rows = self._db.execute(
                "SELECT data FROM playlists ORDER BY created_at ASC"
            ).fetchall()
        pls = [Playlist.model_validate_json(r["data"]) for r in rows]
        pls.sort(key=lambda p: (p.order, p.created_at))
        return pls

    def delete_playlist(self, pl_id: str) -> bool:
        with self._lock:
            cur = self._db.execute("DELETE FROM playlists WHERE id=?", (pl_id,))
            self._db.commit()
            return cur.rowcount > 0


storage = Storage()
