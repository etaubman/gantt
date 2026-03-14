"""Seed the single project from CSV (tasks) with optional RAG/comments/risks in code."""
import csv
import os
import uuid
from datetime import datetime, timedelta

from database import get_conn

DEFAULT_PROJECT_UID = "markets-data-governance"
DEFAULT_PROJECT_NAME = "Markets Data Governance"

SEED_CSV_PATH = os.path.join(os.path.dirname(__file__), "data", "seed_tasks.csv")


def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def ensure_single_project(conn) -> str:
    """Ensure the single project exists. Return its uid."""
    row = conn.execute("SELECT uid FROM projects WHERE uid = ?", (DEFAULT_PROJECT_UID,)).fetchone()
    if row:
        conn.execute("UPDATE projects SET name = ? WHERE uid = ?", (DEFAULT_PROJECT_NAME, row["uid"]))
        return row["uid"]
    row = conn.execute("SELECT uid FROM projects ORDER BY created_at ASC LIMIT 1").fetchone()
    if row:
        conn.execute("UPDATE projects SET name = ? WHERE uid = ?", (DEFAULT_PROJECT_NAME, row["uid"]))
        return row["uid"]
    conn.execute(
        "INSERT INTO projects (uid, name, created_at) VALUES (?, ?, ?)",
        (DEFAULT_PROJECT_UID, DEFAULT_PROJECT_NAME, _now()),
    )
    return DEFAULT_PROJECT_UID


def _int(val, default=0):
    if val is None or (isinstance(val, str) and val.strip() == ""):
        return default
    try:
        return int(val)
    except (ValueError, TypeError):
        return default


def _str(val):
    return (val or "").strip()


def _load_seed_rows() -> list[dict]:
    if not os.path.isfile(SEED_CSV_PATH):
        return []
    with open(SEED_CSV_PATH, newline="", encoding="utf-8") as f:
        return [row for row in csv.DictReader(f) if _str(row.get("name"))]


def seed_sample_data(project_uid: str) -> None:
    """If project has no tasks, load tasks from CSV and insert. Then add RAG/comments/risks for last CDGP and Remediation."""
    with get_conn() as conn:
        if conn.execute("SELECT 1 FROM tasks WHERE project_uid = ? LIMIT 1", (project_uid,)).fetchone():
            return  # already has tasks

        seed_rows = _load_seed_rows()
        if not seed_rows:
            return  # no seed file

        now = _now()
        base = datetime.utcnow().date()

        def d(days: int) -> str:
            return (base + timedelta(days=days)).isoformat()

        # last inserted task_uid at each level (1..5); parent of level L is last_at[L-1]
        last_uid_at_level = {0: None}

        last_cdgp_uid = None
        last_remediation_uid = None

        for row in seed_rows:
            level = _int(row.get("level"), 1)
            name = _str(row.get("name"))
            description = _str(row.get("description"))
            accountable = _str(row.get("accountable_person"))
            responsible = _str(row.get("responsible_party"))
            start_off = _int(row.get("start_offset_days"), 0)
            end_off = _int(row.get("end_offset_days"), start_off + 30)
            status = _str(row.get("status")) or "not_started"
            progress = _int(row.get("progress"), 0)
            sort_order = _int(row.get("sort_order"), 0)

            parent_uid = last_uid_at_level.get(level - 1)
            start_date = d(start_off)
            end_date = d(end_off)

            uid = str(uuid.uuid4())
            conn.execute(
                """INSERT INTO tasks (uid, project_uid, parent_task_uid, name, description, accountable_person, responsible_party, start_date, end_date, status, progress, sort_order, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    uid,
                    project_uid,
                    parent_uid,
                    name,
                    description,
                    accountable,
                    responsible,
                    start_date,
                    end_date,
                    status,
                    progress,
                    sort_order,
                    now,
                    now,
                ),
            )
            last_uid_at_level[level] = uid
            for stale_level in [x for x in last_uid_at_level if x > level]:
                del last_uid_at_level[stale_level]
            if name == "CDGP Compliance":
                last_cdgp_uid = uid
            elif name == "Remediation plan":
                last_remediation_uid = uid

        # RAG and comments/risks on last CDGP and Remediation (Commodities)
        if last_cdgp_uid:
            conn.executemany(
                "INSERT INTO rag_statuses (uid, task_uid, status, rationale, created_at) VALUES (?, ?, ?, ?, ?)",
                [
                    (str(uuid.uuid4()), last_cdgp_uid, "amber", "Remediation plan delayed; awaiting sign-off.", _now()),
                ],
            )
            conn.execute(
                "INSERT INTO comments (uid, task_uid, author, comment_text, created_at) VALUES (?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), last_cdgp_uid, "Compliance", "CDGP checklist circulated. Feedback by EOW.", _now()),
            )
            conn.execute(
                """INSERT INTO risks (uid, task_uid, title, description, severity, status, owner, mitigation_plan, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    str(uuid.uuid4()),
                    last_cdgp_uid,
                    "Audit deadline at risk",
                    "Remediation may not complete before audit window.",
                    "medium",
                    "open",
                    "Compliance Lead",
                    "Weekly checkpoint with Internal Audit.",
                    now,
                    now,
                ),
            )
        if last_remediation_uid:
            conn.executemany(
                "INSERT INTO rag_statuses (uid, task_uid, status, rationale, created_at) VALUES (?, ?, ?, ?, ?)",
                [
                    (str(uuid.uuid4()), last_remediation_uid, "green", "On track for target date.", _now()),
                ],
            )
            conn.execute(
                "INSERT INTO comments (uid, task_uid, author, comment_text, created_at) VALUES (?, ?, ?, ?, ?)",
                (
                    str(uuid.uuid4()),
                    last_remediation_uid,
                    "Compliance Lead",
                    "Remediation plan draft with Legal review.",
                    _now(),
                ),
            )


def repair_seed_hierarchy(project_uid: str) -> bool:
    """Repair parent links for the built-in sample project when rows still match seed order."""
    seed_rows = _load_seed_rows()
    if not seed_rows:
        return False

    with get_conn() as conn:
        tasks = conn.execute(
            "SELECT rowid, uid, name, parent_task_uid FROM tasks WHERE project_uid = ? ORDER BY rowid ASC",
            (project_uid,),
        ).fetchall()
        if len(tasks) != len(seed_rows):
            return False
        if any(task["name"] != _str(row.get("name")) for task, row in zip(tasks, seed_rows)):
            return False

        stack = {0: None}
        updates = []
        now = _now()
        for task, row in zip(tasks, seed_rows):
            level = _int(row.get("level"), 1)
            expected_parent_uid = stack.get(level - 1)
            if task["parent_task_uid"] != expected_parent_uid:
                updates.append((expected_parent_uid, now, task["uid"]))
            stack[level] = task["uid"]
            for stale_level in [x for x in stack if x > level]:
                del stack[stale_level]

        if not updates:
            return False

        conn.executemany(
            "UPDATE tasks SET parent_task_uid = ?, updated_at = ? WHERE uid = ?",
            updates,
        )
        return True


def repair_seed_branches(project_uid: str) -> bool:
    """Fallback repair for older sample data where branch children were attached to the wrong root."""
    with get_conn() as conn:
        roots = conn.execute(
            "SELECT uid, name FROM tasks WHERE project_uid = ? AND parent_task_uid IS NULL",
            (project_uid,),
        ).fetchall()
        root_by_name = {row["name"]: row["uid"] for row in roots}
        equities_uid = root_by_name.get("Equities")
        commodities_uid = root_by_name.get("Commodities")
        if not equities_uid or not commodities_uid:
            return False

        direct_children = conn.execute(
            """SELECT uid, parent_task_uid, description
               FROM tasks
               WHERE project_uid = ? AND parent_task_uid IN (?, ?)""",
            (project_uid, equities_uid, commodities_uid),
        ).fetchall()

        updates = []
        now = _now()
        for task in direct_children:
            description = _str(task["description"])
            if "Equities" in description and task["parent_task_uid"] != equities_uid:
                updates.append((equities_uid, now, task["uid"]))
            elif "Commodities" in description and task["parent_task_uid"] != commodities_uid:
                updates.append((commodities_uid, now, task["uid"]))

        if not updates:
            return False

        conn.executemany(
            "UPDATE tasks SET parent_task_uid = ?, updated_at = ? WHERE uid = ?",
            updates,
        )
        return True


def ensure_single_project_and_seed() -> str:
    """Ensure single project exists and is seeded from CSV. Return project uid."""
    with get_conn() as conn:
        uid = ensure_single_project(conn)
    seed_sample_data(uid)
    repair_seed_hierarchy(uid)
    repair_seed_branches(uid)
    return uid
