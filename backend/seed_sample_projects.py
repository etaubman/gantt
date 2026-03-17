"""Optional startup seed: two realistic sample projects (software + event planning).

Enable by setting GANTT_SAMPLE_SEED=1 (or true/yes). Only runs when the database
has no projects. Uses all app features: hierarchical tasks, milestones,
dependencies (FS/SS/FF/SF), RAG status, comments, risks, varied status/progress.
"""
from datetime import date, datetime, timedelta

from backend.database import get_conn


def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _date_str(d: date) -> str:
    return d.isoformat()


def _is_sample_seed_enabled() -> bool:
    import os
    return os.environ.get("GANTT_SAMPLE_SEED", "").strip().lower() in ("1", "true", "yes")


def _db_is_empty(conn) -> bool:
    return conn.execute("SELECT 1 FROM projects LIMIT 1").fetchone() is None


# ----- Software project: Platform Migration Phase 2 -----
SOFTWARE_UID = "sample-software"
SOFTWARE_NAME = "Platform Migration - Phase 2"

def _software_tasks(base: date):
    """Tasks for software project. Returns list of (uid, parent_uid, name, description, accountable, responsible, start, end, is_milestone, status, progress, sort_order, scheduling_mode)."""
    return [
        # sort 1–3: Discovery
        ("sw-1", None, "Discovery & Requirements", "Gather requirements and technical constraints from stakeholders.", "Jane Chen", "Alex Dev", _date_str(base - timedelta(days=45)), _date_str(base - timedelta(days=15)), False, "complete", 100, 1, "fixed"),
        ("sw-1a", "sw-1", "Stakeholder interviews", "Conduct interviews with product and operations.", "Jane Chen", "Alex Dev", _date_str(base - timedelta(days=45)), _date_str(base - timedelta(days=35)), False, "complete", 100, 1, "fixed"),
        ("sw-1b", "sw-1", "Technical assessment", "Evaluate current stack and migration effort.", "Jane Chen", "Sam Ops", _date_str(base - timedelta(days=38)), _date_str(base - timedelta(days=22)), False, "complete", 100, 2, "fixed"),
        ("sw-1c", "sw-1", "Scope document sign-off", "Formal approval of scope and timeline.", "Jane Chen", "Jane Chen", _date_str(base - timedelta(days=15)), _date_str(base - timedelta(days=15)), True, "complete", 100, 3, "fixed"),
        # 4–6: Design
        ("sw-2", None, "Design", "Architecture and API design.", "Alex Dev", "Alex Dev", _date_str(base - timedelta(days=14)), _date_str(base + timedelta(days=7)), False, "in_progress", 60, 2, "fixed"),
        ("sw-2a", "sw-2", "Architecture design", "System design and component boundaries.", "Alex Dev", "Alex Dev", _date_str(base - timedelta(days=14)), _date_str(base), False, "complete", 100, 1, "fixed"),
        ("sw-2b", "sw-2", "API contract review", "Review and freeze API contracts.", "Alex Dev", "Jordan QA", _date_str(base + timedelta(days=1)), _date_str(base + timedelta(days=5)), False, "in_progress", 40, 2, "fixed"),
        ("sw-2c", "sw-2", "Design sign-off", "Design approved by tech lead.", "Alex Dev", "Alex Dev", _date_str(base + timedelta(days=7)), _date_str(base + timedelta(days=7)), True, "not_started", 0, 3, "fixed"),
        # 7–11: Development
        ("sw-3", None, "Development", "Backend, frontend, and integration.", "Alex Dev", "Alex Dev", _date_str(base + timedelta(days=8)), _date_str(base + timedelta(days=55)), False, "not_started", 0, 3, "auto"),
        ("sw-3a", "sw-3", "Backend development", "Core services and data migration scripts.", "Alex Dev", "Alex Dev", _date_str(base + timedelta(days=8)), _date_str(base + timedelta(days=35)), False, "not_started", 0, 1, "fixed"),
        ("sw-3b", "sw-3", "Frontend development", "New UI and workflows.", "Alex Dev", "Morgan UI", _date_str(base + timedelta(days=15)), _date_str(base + timedelta(days=45)), False, "not_started", 0, 2, "fixed"),
        ("sw-3c", "sw-3", "Integration", "End-to-end integration and fixes.", "Alex Dev", "Jordan QA", _date_str(base + timedelta(days=40)), _date_str(base + timedelta(days=52)), False, "not_started", 0, 3, "fixed"),
        ("sw-3d", "sw-3", "Code freeze", "No further code changes before release.", "Alex Dev", "Alex Dev", _date_str(base + timedelta(days=55)), _date_str(base + timedelta(days=55)), True, "not_started", 0, 4, "fixed"),
        # 12: QA
        ("sw-4", None, "Testing & QA", "UAT and performance testing.", "Jordan QA", "Jordan QA", _date_str(base + timedelta(days=56)), _date_str(base + timedelta(days=70)), False, "not_started", 0, 4, "fixed"),
        # 13–14: Deployment
        ("sw-5", None, "Deployment & Go-live", "Production rollout and cutover.", "Sam Ops", "Sam Ops", _date_str(base + timedelta(days=71)), _date_str(base + timedelta(days=85)), False, "not_started", 0, 5, "fixed"),
        ("sw-5a", "sw-5", "Production release", "Go-live milestone.", "Sam Ops", "Sam Ops", _date_str(base + timedelta(days=85)), _date_str(base + timedelta(days=85)), True, "not_started", 0, 1, "fixed"),
    ]


# ----- Event project: Annual Conference 2025 -----
EVENT_UID = "sample-event"
EVENT_NAME = "Annual Conference 2025"

def _event_tasks(base: date):
    """Tasks for event project."""
    return [
        ("ev-1", None, "Venue & Contracts", "Secure venue and sign contracts.", "Casey Events", "Casey Events", _date_str(base - timedelta(days=120)), _date_str(base - timedelta(days=60)), False, "complete", 100, 1, "fixed"),
        ("ev-1a", "ev-1", "Venue selection", "Shortlist and site visits.", "Casey Events", "Casey Events", _date_str(base - timedelta(days=120)), _date_str(base - timedelta(days=90)), False, "complete", 100, 1, "fixed"),
        ("ev-1b", "ev-1", "Contract signed", "Venue contract executed.", "Casey Events", "Casey Events", _date_str(base - timedelta(days=60)), _date_str(base - timedelta(days=60)), True, "complete", 100, 2, "fixed"),
        ("ev-2", None, "Program", "Agenda, keynotes, and breakouts.", "Robin Program", "Robin Program", _date_str(base - timedelta(days=90)), _date_str(base - timedelta(days=30)), False, "in_progress", 75, 2, "fixed"),
        ("ev-2a", "ev-2", "Keynote speakers", "Confirm keynotes and bios.", "Robin Program", "Robin Program", _date_str(base - timedelta(days=90)), _date_str(base - timedelta(days=50)), False, "complete", 100, 1, "fixed"),
        ("ev-2b", "ev-2", "Breakout sessions", "CFP and session selection.", "Robin Program", "Robin Program", _date_str(base - timedelta(days=55)), _date_str(base - timedelta(days=35)), False, "in_progress", 80, 2, "fixed"),
        ("ev-2c", "ev-2", "Agenda finalised", "Final agenda published.", "Robin Program", "Robin Program", _date_str(base - timedelta(days=30)), _date_str(base - timedelta(days=30)), True, "not_started", 0, 3, "fixed"),
        ("ev-3", None, "Marketing & Registration", "Website, comms, and registration.", "Sam Marketing", "Sam Marketing", _date_str(base - timedelta(days=75)), _date_str(base - timedelta(days=15)), False, "in_progress", 50, 3, "fixed"),
        ("ev-3a", "ev-3", "Website and registration live", "Launch registration and info site.", "Sam Marketing", "Sam Marketing", _date_str(base - timedelta(days=75)), _date_str(base - timedelta(days=45)), False, "complete", 100, 1, "fixed"),
        ("ev-3b", "ev-3", "Early bird deadline", "Last day for early bird pricing.", "Sam Marketing", "Sam Marketing", _date_str(base - timedelta(days=15)), _date_str(base - timedelta(days=15)), True, "not_started", 0, 2, "fixed"),
        ("ev-4", None, "Catering & Logistics", "F&B, AV, and on-site logistics.", "Casey Events", "Casey Events", _date_str(base - timedelta(days=45)), _date_str(base + timedelta(days=1)), False, "not_started", 0, 4, "fixed"),
        ("ev-5", None, "Day-of execution", "Run of show and event day.", "Casey Events", "Casey Events", _date_str(base), _date_str(base + timedelta(days=2)), False, "not_started", 0, 5, "fixed"),
        ("ev-5a", "ev-5", "Event day", "Main conference day.", "Casey Events", "Casey Events", _date_str(base), _date_str(base), True, "not_started", 0, 1, "fixed"),
    ]


def _insert_project(conn, uid: str, name: str, now: str) -> None:
    conn.execute(
        "INSERT INTO projects (uid, name, created_at) VALUES (?, ?, ?)",
        (uid, name, now),
    )


def _insert_tasks(conn, project_uid: str, tasks: list, now: str) -> None:
    for t in tasks:
        uid, parent_uid, name, desc, accountable, responsible, start, end, is_milestone, status, progress, sort_order, scheduling_mode = t
        conn.execute(
            """INSERT INTO tasks (
                   uid, project_uid, parent_task_uid, name, description,
                   accountable_person, responsible_party, start_date, end_date,
                   is_milestone, duration_days, status, progress, sort_order, scheduling_mode,
                   is_deleted, created_at, updated_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                uid, project_uid, parent_uid if parent_uid else None, name, desc or "",
                accountable or "", responsible or "", start, end,
                1 if is_milestone else 0, 7, status, progress, sort_order, scheduling_mode or "fixed",
                0, now, now,
            ),
        )


def _insert_dependency(conn, uid: str, project_uid: str, pred: str, succ: str, dep_type: str, now: str) -> None:
    conn.execute(
        """INSERT INTO dependencies (uid, project_uid, predecessor_task_uid, successor_task_uid, dependency_type, created_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (uid, project_uid, pred, succ, dep_type, now),
    )


def _insert_rag(conn, uid: str, task_uid: str, status: str, rationale: str | None, path_to_green: str | None, created: str) -> None:
    conn.execute(
        "INSERT INTO rag_statuses (uid, task_uid, status, rationale, path_to_green, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (uid, task_uid, status, rationale or "", path_to_green or "", created),
    )


def _insert_comment(conn, uid: str, task_uid: str, author: str, text: str, created: str) -> None:
    conn.execute(
        "INSERT INTO comments (uid, task_uid, author, comment_text, created_at) VALUES (?, ?, ?, ?, ?)",
        (uid, task_uid, author, text, created),
    )


def _insert_risk(conn, uid: str, task_uid: str, title: str, description: str, severity: str, status: str, owner: str, mitigation: str, now: str) -> None:
    conn.execute(
        """INSERT INTO risks (uid, task_uid, title, description, severity, status, owner, mitigation_plan, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (uid, task_uid, title, description, severity, status, owner, mitigation, now, now),
    )


def run_sample_seed_if_enabled() -> bool:
    """If GANTT_SAMPLE_SEED is set and the DB has no projects, seed two sample projects. Returns True if seed ran."""
    if not _is_sample_seed_enabled():
        return False
    with get_conn() as conn:
        if not _db_is_empty(conn):
            return False
        now = _now()
        base = date.today()

        # Projects
        _insert_project(conn, SOFTWARE_UID, SOFTWARE_NAME, now)
        _insert_project(conn, EVENT_UID, EVENT_NAME, now)

        # Software tasks
        _insert_tasks(conn, SOFTWARE_UID, _software_tasks(base), now)
        # Event tasks
        _insert_tasks(conn, EVENT_UID, _event_tasks(base), now)

        # Dependencies — software (FS chain + one SS)
        _insert_dependency(conn, "dep-sw-1", SOFTWARE_UID, "sw-1a", "sw-1b", "FS", now)
        _insert_dependency(conn, "dep-sw-2", SOFTWARE_UID, "sw-1b", "sw-1c", "FS", now)
        _insert_dependency(conn, "dep-sw-3", SOFTWARE_UID, "sw-1c", "sw-2", "FS", now)
        _insert_dependency(conn, "dep-sw-4", SOFTWARE_UID, "sw-2a", "sw-2b", "FS", now)
        _insert_dependency(conn, "dep-sw-5", SOFTWARE_UID, "sw-2b", "sw-2c", "FS", now)
        _insert_dependency(conn, "dep-sw-6", SOFTWARE_UID, "sw-2c", "sw-3", "FS", now)
        _insert_dependency(conn, "dep-sw-7", SOFTWARE_UID, "sw-3a", "sw-3b", "SS", now)
        _insert_dependency(conn, "dep-sw-8", SOFTWARE_UID, "sw-3b", "sw-3c", "FS", now)
        _insert_dependency(conn, "dep-sw-9", SOFTWARE_UID, "sw-3c", "sw-3d", "FS", now)
        _insert_dependency(conn, "dep-sw-10", SOFTWARE_UID, "sw-3d", "sw-4", "FS", now)
        _insert_dependency(conn, "dep-sw-11", SOFTWARE_UID, "sw-4", "sw-5", "FS", now)

        # Dependencies — event
        _insert_dependency(conn, "dep-ev-1", EVENT_UID, "ev-1a", "ev-1b", "FS", now)
        _insert_dependency(conn, "dep-ev-2", EVENT_UID, "ev-1b", "ev-2", "FS", now)
        _insert_dependency(conn, "dep-ev-3", EVENT_UID, "ev-2a", "ev-2b", "FS", now)
        _insert_dependency(conn, "dep-ev-4", EVENT_UID, "ev-2b", "ev-2c", "FS", now)
        _insert_dependency(conn, "dep-ev-5", EVENT_UID, "ev-2c", "ev-3", "FS", now)
        _insert_dependency(conn, "dep-ev-6", EVENT_UID, "ev-3a", "ev-3b", "FS", now)
        _insert_dependency(conn, "dep-ev-7", EVENT_UID, "ev-3", "ev-4", "FS", now)
        _insert_dependency(conn, "dep-ev-8", EVENT_UID, "ev-4", "ev-5", "FS", now)

        # RAG — mix of green, amber, red with rationale/path_to_green
        _insert_rag(conn, "rag-sw-1", "sw-1", "green", None, None, now)
        _insert_rag(conn, "rag-sw-2", "sw-2", "amber", "API review delayed by one sprint.", "Freeze contracts by end of week and run parallel UAT.", now)
        _insert_rag(conn, "rag-sw-3", "sw-3", "red", "Backend and frontend both under-resourced.", "Request one contractor for backend; frontend can slip by 1 week.", now)
        _insert_rag(conn, "rag-ev-1", "ev-2", "amber", "Two speakers still TBC.", "Confirm by Friday or have backup speakers.", now)
        _insert_rag(conn, "rag-ev-2", "ev-3", "green", None, None, now)
        _insert_rag(conn, "rag-ev-3", "ev-4", "red", "Catering quote over budget; venue pushing for minimum spend.", "Renegotiate minimum or reduce session count; escalate to sponsor lead.", now)

        # Comments
        _insert_comment(conn, "com-sw-1", "sw-1", "Jane Chen", "Discovery phase wrapped. All stakeholders aligned on scope.", now)
        _insert_comment(conn, "com-sw-2", "sw-2", "Alex Dev", "API review session scheduled for Thursday.", now)
        _insert_comment(conn, "com-sw-3", "sw-3", "Jordan QA", "Added integration tests to backlog.", now)
        _insert_comment(conn, "com-ev-1", "ev-2", "Robin Program", "Keynotes confirmed. Sending CFP next week.", now)
        _insert_comment(conn, "com-ev-2", "ev-3", "Sam Marketing", "Early bird pricing live; 20% capacity already.", now)
        _insert_comment(conn, "com-ev-3", "ev-4", "Casey Events", "Waiting on final headcount for catering numbers.", now)

        # Risks
        _insert_risk(conn, "risk-sw-1", "sw-3", "Resource shortage", "Backend and frontend may slip without extra capacity.", "high", "open", "Alex Dev", "Escalate to PMO for contractor approval.", now)
        _insert_risk(conn, "risk-sw-2", "sw-5", "Rollback complexity", "Rollback requires DB migration revert and cache flush.", "medium", "mitigated", "Sam Ops", "Runbook updated; dry run scheduled.", now)
        _insert_risk(conn, "risk-ev-1", "ev-2", "Speaker drop-out", "One keynote may cancel due to schedule conflict.", "medium", "open", "Robin Program", "Backup speaker list and flexible agenda.", now)
        _insert_risk(conn, "risk-ev-2", "ev-4", "Catering budget overrun", "Venue F&B minimum above initial budget.", "high", "open", "Casey Events", "Renegotiate or secure additional sponsor.", now)
        _insert_risk(conn, "risk-ev-3", "ev-5", "AV failure", "Risk of technical issues on the day.", "low", "closed", "Casey Events", "Dedicated AV tech and backup equipment on site.", now)

    return True
