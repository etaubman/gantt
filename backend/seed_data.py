"""Seed the single project with default top-level market domains only."""
from datetime import datetime

from backend.database import get_conn

DEFAULT_PROJECT_UID = "markets-data-governance"
DEFAULT_PROJECT_NAME = "Markets Data Governance"
DEFAULT_TOP_LEVEL_TASKS = [
    "Equities",
    "Commodities",
    "Rates",
    "FX",
    "Markets Operations",
    "Markets Treasury",
    "Spread Products",
    "Other Markets",
]


def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def ensure_single_project(conn) -> str:
    """Ensure at least one project exists. Return default or first project uid."""
    row = conn.execute("SELECT uid FROM projects WHERE uid = ?", (DEFAULT_PROJECT_UID,)).fetchone()
    if row:
        return row["uid"]
    row = conn.execute("SELECT uid FROM projects ORDER BY created_at ASC LIMIT 1").fetchone()
    if row:
        return row["uid"]
    conn.execute(
        "INSERT INTO projects (uid, name, created_at) VALUES (?, ?, ?)",
        (DEFAULT_PROJECT_UID, DEFAULT_PROJECT_NAME, _now()),
    )
    return DEFAULT_PROJECT_UID


def seed_default_top_level_tasks(project_uid: str) -> None:
    """If project has no tasks, insert the default top-level market domains only."""
    with get_conn() as conn:
        if conn.execute("SELECT 1 FROM tasks WHERE project_uid = ? LIMIT 1", (project_uid,)).fetchone():
            return

        now = _now()
        for index, name in enumerate(DEFAULT_TOP_LEVEL_TASKS, start=1):
            conn.execute(
                """INSERT INTO tasks (
                       uid, project_uid, parent_task_uid, name, description,
                       accountable_person, responsible_party, start_date, end_date,
                       status, progress, sort_order, created_at, updated_at
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    f"{project_uid}-{index}",
                    project_uid,
                    None,
                    name,
                    "",
                    "",
                    "",
                    None,
                    None,
                    "not_started",
                    0,
                    index,
                    now,
                    now,
                ),
            )


def ensure_single_project_and_seed() -> str:
    """Ensure the single project exists and has the default top-level tasks."""
    with get_conn() as conn:
        uid = ensure_single_project(conn)
    seed_default_top_level_tasks(uid)
    return uid
