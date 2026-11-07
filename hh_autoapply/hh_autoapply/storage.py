"""Журнал откликов в SQLite: не откликаемся дважды и видим историю."""

import sqlite3
from datetime import datetime, timezone


class Storage:
    def __init__(self, path: str):
        self.conn = sqlite3.connect(path)
        self.conn.execute(
            """CREATE TABLE IF NOT EXISTS applications (
                vacancy_id TEXT PRIMARY KEY,
                title TEXT,
                employer TEXT,
                url TEXT,
                language TEXT,
                status TEXT,
                channel TEXT,
                letter TEXT,
                error TEXT,
                created_at TEXT
            )"""
        )
        self.conn.commit()

    def seen(self, vacancy_id: str) -> bool:
        row = self.conn.execute(
            "SELECT status FROM applications WHERE vacancy_id = ?", (vacancy_id,)
        ).fetchone()
        # Ошибки и пропуски по фильтру можно попробовать снова в следующий запуск.
        return row is not None and row[0] in ("applied", "dry_run_skip", "manual")

    def record(self, vacancy: dict, language: str, status: str, channel: str,
               letter: str = "", error: str = "") -> None:
        self.conn.execute(
            """INSERT OR REPLACE INTO applications
               (vacancy_id, title, employer, url, language, status, channel, letter, error, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                str(vacancy["id"]),
                vacancy.get("name", ""),
                (vacancy.get("employer") or {}).get("name", ""),
                vacancy.get("alternate_url", ""),
                language,
                status,
                channel,
                letter,
                error,
                datetime.now(timezone.utc).isoformat(timespec="seconds"),
            ),
        )
        self.conn.commit()

    def applied_today(self) -> int:
        today = datetime.now(timezone.utc).date().isoformat()
        row = self.conn.execute(
            "SELECT COUNT(*) FROM applications WHERE status = 'applied' AND created_at >= ?",
            (today,),
        ).fetchone()
        return row[0]
