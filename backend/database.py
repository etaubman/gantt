"""SQLite schema and connection."""
import os
import sqlite3
from contextlib import contextmanager

DB_PATH = os.environ.get("GANTT_DB_PATH", "/data/gantt.db")


def init_db():
    """Create tables if they do not exist."""
    with get_conn() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS projects (
                uid TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tasks (
                uid TEXT PRIMARY KEY,
                project_uid TEXT NOT NULL REFERENCES projects(uid) ON DELETE CASCADE,
                parent_task_uid TEXT REFERENCES tasks(uid) ON DELETE CASCADE,
                name TEXT NOT NULL,
                description TEXT,
                accountable_person TEXT,
                responsible_party TEXT,
                start_date TEXT,
                end_date TEXT,
                is_milestone INTEGER DEFAULT 0,
                status TEXT DEFAULT 'not_started',
                progress INTEGER DEFAULT 0,
                sort_order INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS dependencies (
                uid TEXT PRIMARY KEY,
                project_uid TEXT NOT NULL REFERENCES projects(uid) ON DELETE CASCADE,
                predecessor_task_uid TEXT NOT NULL REFERENCES tasks(uid) ON DELETE CASCADE,
                successor_task_uid TEXT NOT NULL REFERENCES tasks(uid) ON DELETE CASCADE,
                dependency_type TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS rag_statuses (
                uid TEXT PRIMARY KEY,
                task_uid TEXT NOT NULL REFERENCES tasks(uid) ON DELETE CASCADE,
                status TEXT NOT NULL,
                rationale TEXT,
                path_to_green TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS comments (
                uid TEXT PRIMARY KEY,
                task_uid TEXT NOT NULL REFERENCES tasks(uid) ON DELETE CASCADE,
                author TEXT NOT NULL,
                comment_text TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS risks (
                uid TEXT PRIMARY KEY,
                task_uid TEXT NOT NULL REFERENCES tasks(uid) ON DELETE CASCADE,
                title TEXT NOT NULL,
                description TEXT,
                severity TEXT NOT NULL,
                status TEXT NOT NULL,
                owner TEXT,
                mitigation_plan TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS edit_lock (
                lock_name TEXT PRIMARY KEY,
                employee_id TEXT NOT NULL,
                locked_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS audit_events (
                uid TEXT PRIMARY KEY,
                actor_employee_id TEXT NOT NULL,
                action_type TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_uid TEXT,
                task_uid TEXT,
                task_name TEXT,
                prior_value TEXT,
                new_value TEXT,
                metadata TEXT,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_uid);
            CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_uid);
            CREATE INDEX IF NOT EXISTS idx_dependencies_project ON dependencies(project_uid);
            CREATE INDEX IF NOT EXISTS idx_rag_task ON rag_statuses(task_uid);
            CREATE INDEX IF NOT EXISTS idx_comments_task ON comments(task_uid);
            CREATE INDEX IF NOT EXISTS idx_risks_task ON risks(task_uid);
            CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_events(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_events(actor_employee_id);
            CREATE INDEX IF NOT EXISTS idx_audit_action_type ON audit_events(action_type);
            CREATE INDEX IF NOT EXISTS idx_audit_task_uid ON audit_events(task_uid);
        """)
        rag_columns = {row["name"] for row in conn.execute("PRAGMA table_info(rag_statuses)").fetchall()}
        if "path_to_green" not in rag_columns:
            conn.execute("ALTER TABLE rag_statuses ADD COLUMN path_to_green TEXT")
        task_columns = {row["name"] for row in conn.execute("PRAGMA table_info(tasks)").fetchall()}
        if "is_milestone" not in task_columns:
            conn.execute("ALTER TABLE tasks ADD COLUMN is_milestone INTEGER DEFAULT 0")


@contextmanager
def get_conn():
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()
