"""Tests for database module (schema and connection)."""
import os

import pytest

# conftest sets GANTT_DB_PATH before any backend import
from backend.database import get_conn, init_db, DB_PATH


def test_db_path_from_env():
    assert os.environ.get("GANTT_DB_PATH") is not None
    assert DB_PATH == os.environ["GANTT_DB_PATH"]


def test_init_db_creates_tables():
    init_db()
    with get_conn() as conn:
        tables = [
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            ).fetchall()
        ]
    assert "projects" in tables
    assert "tasks" in tables
    assert "dependencies" in tables
    assert "rag_statuses" in tables
    assert "comments" in tables
    assert "risks" in tables
    assert "edit_lock" in tables
    assert "audit_events" in tables


def test_get_conn_returns_row_factory():
    init_db()
    with get_conn() as conn:
        conn.execute("INSERT INTO projects (uid, name, created_at) VALUES (?, ?, ?)", ("t-db-1", "Test", "2025-01-01T00:00:00Z"))
    with get_conn() as conn:
        row = conn.execute("SELECT uid, name FROM projects WHERE uid = ?", ("t-db-1",)).fetchone()
    assert row is not None
    assert row["uid"] == "t-db-1"
    assert row["name"] == "Test"
    # Cleanup so other tests don't see this project
    with get_conn() as conn:
        conn.execute("DELETE FROM projects WHERE uid = ?", ("t-db-1",))


def test_get_conn_commits_on_exit():
    init_db()
    with get_conn() as conn:
        conn.execute("INSERT INTO projects (uid, name, created_at) VALUES (?, ?, ?)", ("t-db-2", "Test2", "2025-01-01T00:00:00Z"))
    with get_conn() as conn:
        row = conn.execute("SELECT 1 FROM projects WHERE uid = ?", ("t-db-2",)).fetchone()
    assert row is not None
    with get_conn() as conn:
        conn.execute("DELETE FROM projects WHERE uid = ?", ("t-db-2",))


def test_init_db_idempotent():
    init_db()
    init_db()
    with get_conn() as conn:
        tables = [row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    assert "tasks" in tables
    assert "projects" in tables


def test_tasks_table_has_expected_columns():
    init_db()
    with get_conn() as conn:
        cols = [row[1] for row in conn.execute("PRAGMA table_info(tasks)").fetchall()]
    assert "uid" in cols
    assert "is_milestone" in cols
    assert "is_deleted" in cols
    assert "deleted_at" in cols
