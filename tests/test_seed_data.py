"""Tests for seed_data module."""
import pytest

from backend.database import get_conn
from backend.seed_data import (
    DEFAULT_PROJECT_UID,
    DEFAULT_TOP_LEVEL_TASKS,
    ensure_single_project_and_seed,
)


def test_ensure_single_project_and_seed_creates_project(client):
    """After reset, one project exists with default uid and name."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT uid, name FROM projects WHERE uid = ?",
            (DEFAULT_PROJECT_UID,),
        ).fetchone()
    assert row is not None
    assert row["uid"] == DEFAULT_PROJECT_UID
    assert "Markets" in row["name"]


def test_ensure_single_project_and_seed_creates_top_level_tasks(client):
    """Seed creates exactly the default top-level tasks."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT name FROM tasks WHERE project_uid = ? AND parent_task_uid IS NULL ORDER BY sort_order",
            (DEFAULT_PROJECT_UID,),
        ).fetchall()
    names = [r["name"] for r in rows]
    assert len(names) == len(DEFAULT_TOP_LEVEL_TASKS)
    for expected in DEFAULT_TOP_LEVEL_TASKS:
        assert expected in names


def test_seed_idempotent_when_tasks_exist(client):
    """Calling ensure_single_project_and_seed again does not duplicate tasks."""
    ensure_single_project_and_seed()
    with get_conn() as conn:
        count = conn.execute(
            "SELECT COUNT(*) as n FROM tasks WHERE project_uid = ?",
            (DEFAULT_PROJECT_UID,),
        ).fetchone()["n"]
    assert count == len(DEFAULT_TOP_LEVEL_TASKS)


def test_seed_task_uids_format(client):
    """Seed tasks have predictable uid format (project_uid-index)."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT uid FROM tasks WHERE project_uid = ? ORDER BY sort_order",
            (DEFAULT_PROJECT_UID,),
        ).fetchall()
    uids = [r["uid"] for r in rows]
    assert len(uids) == len(DEFAULT_TOP_LEVEL_TASKS)
    for i, uid in enumerate(uids, start=1):
        assert uid == f"{DEFAULT_PROJECT_UID}-{i}"
