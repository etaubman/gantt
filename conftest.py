"""Pytest configuration and shared fixtures for backend tests.

Set GANTT_DB_PATH before any backend import so the app uses a test database.
"""
import os
import tempfile

import pytest

# Use a dedicated test DB so we don't touch dev/data. Set before importing backend.
_test_db_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_test_db_file.close()
os.environ["GANTT_DB_PATH"] = _test_db_file.name


from backend.database import get_conn, init_db
from backend.main import app
from backend.seed_data import DEFAULT_PROJECT_UID, ensure_single_project_and_seed
from fastapi.testclient import TestClient


def _reset_db():
    """Clear all tables and reseed the single project with default tasks."""
    init_db()  # Ensure tables exist before DELETE (app startup may not have run yet)
    with get_conn() as conn:
        conn.execute("DELETE FROM audit_events")
        conn.execute("DELETE FROM edit_lock")
        conn.execute("DELETE FROM dependencies")
        conn.execute("DELETE FROM rag_statuses")
        conn.execute("DELETE FROM comments")
        conn.execute("DELETE FROM risks")
        conn.execute("DELETE FROM tasks")
        conn.execute("DELETE FROM projects")
    ensure_single_project_and_seed()


@pytest.fixture
def client():
    """FastAPI test client. Resets DB to seeded state before each test."""
    _reset_db()
    with TestClient(app) as c:
        yield c


@pytest.fixture
def project_uid():
    """Default project UID after reset."""
    return DEFAULT_PROJECT_UID


@pytest.fixture
def seed_task_uids(client, project_uid):
    """First two seed task UIDs (for dependencies etc.)."""
    r = client.get("/api/tasks")
    assert r.status_code == 200
    tasks = r.json()
    assert len(tasks) >= 2
    return [tasks[0]["uid"], tasks[1]["uid"]]
