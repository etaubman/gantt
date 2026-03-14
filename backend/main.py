"""FastAPI app: API routes and static file serving."""
import json
import os
import re
import uuid
from datetime import datetime, date
from typing import Optional

from fastapi import FastAPI, HTTPException, UploadFile, File, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from database import get_conn, init_db
from seed_data import DEFAULT_PROJECT_UID, ensure_single_project_and_seed

app = FastAPI(title="Gantt Project Manager")

# --- Pydantic models ---

class ProjectCreate(BaseModel):
    name: str

class ProjectOut(BaseModel):
    uid: str
    name: str
    created_at: str

class TaskCreate(BaseModel):
    name: str
    parent_task_uid: Optional[str] = None
    description: Optional[str] = None
    accountable_person: Optional[str] = None
    responsible_party: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_milestone: bool = False
    status: str = "not_started"
    progress: int = Field(0, ge=0, le=100)
    sort_order: int = 0

class TaskUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    accountable_person: Optional[str] = None
    responsible_party: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_milestone: Optional[bool] = None
    status: Optional[str] = None
    progress: Optional[int] = Field(None, ge=0, le=100)
    sort_order: Optional[int] = None

class RAGCreate(BaseModel):
    status: str  # green, amber, red
    rationale: Optional[str] = None
    path_to_green: Optional[str] = None

class CommentCreate(BaseModel):
    author: str
    comment_text: str

class RiskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    severity: str = "medium"
    status: str = "open"
    owner: Optional[str] = None
    mitigation_plan: Optional[str] = None

class RiskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    severity: Optional[str] = None
    status: Optional[str] = None
    owner: Optional[str] = None
    mitigation_plan: Optional[str] = None

class DependencyCreate(BaseModel):
    predecessor_task_uid: str
    successor_task_uid: str
    dependency_type: str  # FS, SS, FF, SF


class EditLockRequest(BaseModel):
    employee_id: str
    force: bool = False


EMPLOYEE_ID_RE = re.compile(r"^[a-zA-Z]{2}[0-9]{5}$")


def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _row_to_dict(row) -> dict:
    return dict(row) if row else None


def _normalize_task_dict(row) -> dict:
    task = dict(row)
    task["is_milestone"] = bool(task.get("is_milestone"))
    return task


def _json_dumps(value) -> Optional[str]:
    if value is None:
        return None
    return json.dumps(value, ensure_ascii=True, sort_keys=True)


def _json_loads(value):
    if not value:
        return None
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


def _get_actor_employee_id(request: Optional[Request]) -> str:
    if not request:
        return "SYSTEM"
    value = (request.headers.get("X-Employee-Id") or "").strip()
    if not value:
        return "SYSTEM"
    if EMPLOYEE_ID_RE.fullmatch(value):
        return value[:2].upper() + value[2:]
    return value


def _get_task_name(conn, task_uid: Optional[str]) -> Optional[str]:
    if not task_uid:
        return None
    row = conn.execute("SELECT name FROM tasks WHERE uid = ?", (task_uid,)).fetchone()
    return row["name"] if row else None


def _record_audit_event(
    conn,
    *,
    actor_employee_id: str,
    action_type: str,
    entity_type: str,
    entity_uid: Optional[str] = None,
    task_uid: Optional[str] = None,
    task_name: Optional[str] = None,
    prior_value=None,
    new_value=None,
    metadata=None,
    created_at: Optional[str] = None,
):
    conn.execute(
        """INSERT INTO audit_events (
               uid, actor_employee_id, action_type, entity_type, entity_uid,
               task_uid, task_name, prior_value, new_value, metadata, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            str(uuid.uuid4()),
            actor_employee_id or "SYSTEM",
            action_type,
            entity_type,
            entity_uid,
            task_uid,
            task_name,
            _json_dumps(prior_value),
            _json_dumps(new_value),
            _json_dumps(metadata),
            created_at or _now(),
        ),
    )


def _serialize_audit_event(row) -> dict:
    event = dict(row)
    event["prior_value"] = _json_loads(event.get("prior_value"))
    event["new_value"] = _json_loads(event.get("new_value"))
    event["metadata"] = _json_loads(event.get("metadata"))
    return event


def _collect_task_delete_snapshot(conn, uid: str) -> dict:
    task_row = conn.execute("SELECT * FROM tasks WHERE uid = ?", (uid,)).fetchone()
    if not task_row:
        return {}

    task = _normalize_task_dict(task_row)
    descendant_rows = []

    def walk(task_uid: str):
        children = conn.execute(
            "SELECT * FROM tasks WHERE parent_task_uid = ? ORDER BY sort_order, created_at",
            (task_uid,),
        ).fetchall()
        for child in children:
            descendant_rows.append(_normalize_task_dict(child))
            walk(child["uid"])

    walk(uid)
    task_uids = [task["uid"]] + [child["uid"] for child in descendant_rows]
    placeholders = ",".join(["?"] * len(task_uids))

    dependencies = [
        dict(row)
        for row in conn.execute(
            f"""SELECT uid, project_uid, predecessor_task_uid, successor_task_uid, dependency_type, created_at
                FROM dependencies
                WHERE predecessor_task_uid IN ({placeholders}) OR successor_task_uid IN ({placeholders})
                ORDER BY created_at""",
            tuple(task_uids + task_uids),
        ).fetchall()
    ]
    rag_statuses = [
        dict(row)
        for row in conn.execute(
            f"""SELECT uid, task_uid, status, rationale, path_to_green, created_at
                FROM rag_statuses WHERE task_uid IN ({placeholders}) ORDER BY created_at""",
            tuple(task_uids),
        ).fetchall()
    ]
    comments = [
        dict(row)
        for row in conn.execute(
            f"""SELECT uid, task_uid, author, comment_text, created_at
                FROM comments WHERE task_uid IN ({placeholders}) ORDER BY created_at""",
            tuple(task_uids),
        ).fetchall()
    ]
    risks = [
        dict(row)
        for row in conn.execute(
            f"""SELECT uid, task_uid, title, description, severity, status, owner, mitigation_plan, created_at, updated_at
                FROM risks WHERE task_uid IN ({placeholders}) ORDER BY created_at""",
            tuple(task_uids),
        ).fetchall()
    ]
    return {
        "task": task,
        "descendants": descendant_rows,
        "dependencies": dependencies,
        "rag_statuses": rag_statuses,
        "comments": comments,
        "risks": risks,
    }


def _normalize_employee_id(employee_id: str) -> str:
    value = (employee_id or "").strip()
    if not EMPLOYEE_ID_RE.fullmatch(value):
        raise HTTPException(400, "Employee ID must match format AA12345")
    return value[:2].upper() + value[2:]


def _get_edit_lock(conn):
    row = conn.execute(
        "SELECT lock_name, employee_id, locked_at, updated_at FROM edit_lock WHERE lock_name = ?",
        ("workspace",),
    ).fetchone()
    if not row:
        return {"locked": False, "employee_id": None, "locked_at": None, "updated_at": None}
    return {
        "locked": True,
        "employee_id": row["employee_id"],
        "locked_at": row["locked_at"],
        "updated_at": row["updated_at"],
    }


# --- Projects ---

@app.on_event("startup")
def startup():
    init_db()
    ensure_single_project_and_seed()


@app.get("/api/projects", response_model=list[ProjectOut])
def list_projects():
    """Return the single project (Markets Data Governance) only."""
    with get_conn() as conn:
        row = conn.execute("SELECT uid, name, created_at FROM projects WHERE uid = ?", (DEFAULT_PROJECT_UID,)).fetchone()
        if not row:
            row = conn.execute("SELECT uid, name, created_at FROM projects LIMIT 1").fetchone()
        if not row:
            return []
        return [ProjectOut(**dict(row))]


@app.post("/api/projects", response_model=ProjectOut)
def create_project(body: ProjectCreate):
    raise HTTPException(400, "Only one project is allowed. Use the existing Markets Data Governance project.")


@app.get("/api/projects/{uid}", response_model=ProjectOut)
def get_project(uid: str):
    with get_conn() as conn:
        row = conn.execute("SELECT uid, name, created_at FROM projects WHERE uid = ?", (uid,)).fetchone()
    if not row:
        raise HTTPException(404, "Project not found")
    return ProjectOut(**dict(row))


@app.get("/api/project", response_model=ProjectOut)
def get_single_project():
    """Return the single (default) project. No project concept in URL."""
    with get_conn() as conn:
        row = conn.execute("SELECT uid, name, created_at FROM projects WHERE uid = ?", (DEFAULT_PROJECT_UID,)).fetchone()
        if not row:
            row = conn.execute("SELECT uid, name, created_at FROM projects LIMIT 1").fetchone()
    if not row:
        raise HTTPException(404, "No project found")
    return ProjectOut(**dict(row))


@app.delete("/api/projects/{uid}", status_code=204)
def delete_project(uid: str, request: Request):
    if uid == DEFAULT_PROJECT_UID:
        raise HTTPException(400, "The Markets Data Governance project cannot be deleted.")
    actor_employee_id = _get_actor_employee_id(request)
    with get_conn() as conn:
        project = conn.execute("SELECT uid, name, created_at FROM projects WHERE uid = ?", (uid,)).fetchone()
        if not project:
            raise HTTPException(404, "Project not found")
        cur = conn.execute("DELETE FROM projects WHERE uid = ?", (uid,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Project not found")
        _record_audit_event(
            conn,
            actor_employee_id=actor_employee_id,
            action_type="project_delete",
            entity_type="project",
            entity_uid=uid,
            task_uid=None,
            task_name=None,
            prior_value=dict(project),
            new_value=None,
        )
    return None


# --- Tasks ---

@app.get("/api/projects/{project_uid}/tasks")
def list_tasks(project_uid: str):
    with get_conn() as conn:
        row = conn.execute("SELECT uid FROM projects WHERE uid = ?", (project_uid,)).fetchone()
        if not row:
            raise HTTPException(404, "Project not found")
        cur = conn.execute(
            """SELECT uid, project_uid, parent_task_uid, name, description, accountable_person,
                     responsible_party, start_date, end_date, is_milestone, status, progress, sort_order, created_at, updated_at
              FROM tasks WHERE project_uid = ? ORDER BY sort_order, created_at""",
            (project_uid,),
        )
        tasks = [_normalize_task_dict(r) for r in cur.fetchall()]
    return tasks


@app.get("/api/tasks")
def list_tasks_single():
    """Return tasks for the single (default) project."""
    return list_tasks(DEFAULT_PROJECT_UID)


@app.post("/api/projects/{project_uid}/tasks")
def create_task(project_uid: str, body: TaskCreate, request: Request):
    actor_employee_id = _get_actor_employee_id(request)
    with get_conn() as conn:
        if conn.execute("SELECT uid FROM projects WHERE uid = ?", (project_uid,)).fetchone() is None:
            raise HTTPException(404, "Project not found")
        if body.parent_task_uid:
            parent = conn.execute(
                "SELECT uid, project_uid FROM tasks WHERE uid = ?", (body.parent_task_uid,)
            ).fetchone()
            if not parent or parent["project_uid"] != project_uid:
                raise HTTPException(400, "Parent task must belong to the same project")
        uid = str(uuid.uuid4())
        now = _now()
        conn.execute(
            """INSERT INTO tasks (uid, project_uid, parent_task_uid, name, description,
               accountable_person, responsible_party, start_date, end_date, is_milestone, status, progress, sort_order, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                uid, project_uid, body.parent_task_uid, body.name.strip(), body.description or "",
                body.accountable_person or "", body.responsible_party or "",
                body.start_date, body.end_date, int(body.is_milestone), body.status, body.progress, body.sort_order,
                now, now,
            ),
        )
        task = {"uid": uid, "project_uid": project_uid, "parent_task_uid": body.parent_task_uid,
                "name": body.name.strip(), "description": body.description or "",
                "accountable_person": body.accountable_person or "", "responsible_party": body.responsible_party or "",
                "start_date": body.start_date, "end_date": body.end_date, "is_milestone": body.is_milestone, "status": body.status,
                "progress": body.progress, "sort_order": body.sort_order, "created_at": now, "updated_at": now}
        _record_audit_event(
            conn,
            actor_employee_id=actor_employee_id,
            action_type="task_create",
            entity_type="task",
            entity_uid=uid,
            task_uid=uid,
            task_name=task["name"],
            prior_value=None,
            new_value=task,
        )
    return task


@app.post("/api/tasks")
def create_task_single(body: TaskCreate, request: Request):
    """Create task in the single (default) project."""
    return create_task(DEFAULT_PROJECT_UID, body, request)


@app.get("/api/tasks/{uid}")
def get_task(uid: str):
    with get_conn() as conn:
        row = conn.execute(
            """SELECT uid, project_uid, parent_task_uid, name, description, accountable_person,
                      responsible_party, start_date, end_date, is_milestone, status, progress, sort_order, created_at, updated_at
               FROM tasks WHERE uid = ?""",
            (uid,),
        ).fetchone()
    if not row:
        raise HTTPException(404, "Task not found")
    return _normalize_task_dict(row)


@app.patch("/api/tasks/{uid}")
def update_task(uid: str, body: TaskUpdate, request: Request):
    updates = []
    values = []
    for k, v in body.model_dump(exclude_unset=True).items():
        updates.append(f"{k} = ?")
        values.append(int(v) if k == "is_milestone" else v)
    if not updates:
        return get_task(uid)
    values.append(_now())
    updates.append("updated_at = ?")
    values.append(uid)
    actor_employee_id = _get_actor_employee_id(request)
    with get_conn() as conn:
        previous_row = conn.execute("SELECT * FROM tasks WHERE uid = ?", (uid,)).fetchone()
        if not previous_row:
            raise HTTPException(404, "Task not found")
        conn.execute(
            f"UPDATE tasks SET {', '.join(updates)} WHERE uid = ?",
            values,
        )
        row = conn.execute("SELECT * FROM tasks WHERE uid = ?", (uid,)).fetchone()
        if not row:
            raise HTTPException(404, "Task not found")
        previous_task = _normalize_task_dict(previous_row)
        task = _normalize_task_dict(row)
        _record_audit_event(
            conn,
            actor_employee_id=actor_employee_id,
            action_type="task_update",
            entity_type="task",
            entity_uid=uid,
            task_uid=uid,
            task_name=task["name"],
            prior_value=previous_task,
            new_value=task,
        )
    return task


# --- Edit lock ---

@app.get("/api/edit-lock")
def get_edit_lock():
    with get_conn() as conn:
        return _get_edit_lock(conn)


@app.post("/api/edit-lock/acquire")
def acquire_edit_lock(body: EditLockRequest, request: Request):
    employee_id = _normalize_employee_id(body.employee_id)
    actor_employee_id = _get_actor_employee_id(request) or employee_id
    now = _now()
    with get_conn() as conn:
        current = _get_edit_lock(conn)
        if current["locked"] and current["employee_id"] != employee_id and not body.force:
            raise HTTPException(409, {
                "message": f"Edit mode is currently locked by {current['employee_id']}",
                "employee_id": current["employee_id"],
                "locked_at": current["locked_at"],
            })
        locked_at = current["locked_at"] if current["locked"] and current["employee_id"] == employee_id else now
        conn.execute(
            """INSERT OR REPLACE INTO edit_lock (lock_name, employee_id, locked_at, updated_at)
               VALUES (?, ?, ?, ?)""",
            ("workspace", employee_id, locked_at, now),
        )
        updated_lock = _get_edit_lock(conn)
        _record_audit_event(
            conn,
            actor_employee_id=actor_employee_id,
            action_type="lock_takeover" if current["locked"] and current["employee_id"] != employee_id else "lock_acquire",
            entity_type="edit_lock",
            entity_uid="workspace",
            task_uid=None,
            task_name=None,
            prior_value=current,
            new_value=updated_lock,
            metadata={"force": bool(body.force)},
            created_at=now,
        )
        return updated_lock


@app.post("/api/edit-lock/release")
def release_edit_lock(body: EditLockRequest, request: Request):
    employee_id = _normalize_employee_id(body.employee_id)
    actor_employee_id = _get_actor_employee_id(request) or employee_id
    with get_conn() as conn:
        current = _get_edit_lock(conn)
        if not current["locked"]:
            return current
        if current["employee_id"] != employee_id and not body.force:
            raise HTTPException(409, {
                "message": f"Edit mode is currently locked by {current['employee_id']}",
                "employee_id": current["employee_id"],
                "locked_at": current["locked_at"],
            })
        conn.execute("DELETE FROM edit_lock WHERE lock_name = ?", ("workspace",))
        updated_lock = _get_edit_lock(conn)
        _record_audit_event(
            conn,
            actor_employee_id=actor_employee_id,
            action_type="lock_release",
            entity_type="edit_lock",
            entity_uid="workspace",
            prior_value=current,
            new_value=updated_lock,
            metadata={"force": bool(body.force)},
        )
        return updated_lock


@app.delete("/api/tasks/{uid}", status_code=204)
def delete_task(uid: str, request: Request):
    """Delete task and cascade to subtasks, dependencies, rag, comments, risks."""
    actor_employee_id = _get_actor_employee_id(request)
    with get_conn() as conn:
        task = conn.execute("SELECT uid, project_uid FROM tasks WHERE uid = ?", (uid,)).fetchone()
        if not task:
            raise HTTPException(404, "Task not found")
        snapshot = _collect_task_delete_snapshot(conn, uid)
        # Recursively delete children first
        children = conn.execute("SELECT uid FROM tasks WHERE parent_task_uid = ?", (uid,)).fetchall()
        for c in children:
            _delete_task_recursive(conn, c["uid"])
        conn.execute("DELETE FROM dependencies WHERE predecessor_task_uid = ? OR successor_task_uid = ?", (uid, uid))
        conn.execute("DELETE FROM rag_statuses WHERE task_uid = ?", (uid,))
        conn.execute("DELETE FROM comments WHERE task_uid = ?", (uid,))
        conn.execute("DELETE FROM risks WHERE task_uid = ?", (uid,))
        conn.execute("DELETE FROM tasks WHERE uid = ?", (uid,))
        _record_audit_event(
            conn,
            actor_employee_id=actor_employee_id,
            action_type="task_delete",
            entity_type="task",
            entity_uid=uid,
            task_uid=uid,
            task_name=snapshot.get("task", {}).get("name"),
            prior_value=snapshot,
            new_value=None,
        )
    return None


def _delete_task_recursive(conn, uid: str):
    for c in conn.execute("SELECT uid FROM tasks WHERE parent_task_uid = ?", (uid,)).fetchall():
        _delete_task_recursive(conn, c["uid"])
    conn.execute("DELETE FROM dependencies WHERE predecessor_task_uid = ? OR successor_task_uid = ?", (uid, uid))
    conn.execute("DELETE FROM rag_statuses WHERE task_uid = ?", (uid,))
    conn.execute("DELETE FROM comments WHERE task_uid = ?", (uid,))
    conn.execute("DELETE FROM risks WHERE task_uid = ?", (uid,))
    conn.execute("DELETE FROM tasks WHERE uid = ?", (uid,))


# --- RAG ---

@app.get("/api/tasks/{task_uid}/rag")
def list_rag(task_uid: str):
    with get_conn() as conn:
        if conn.execute("SELECT uid FROM tasks WHERE uid = ?", (task_uid,)).fetchone() is None:
            raise HTTPException(404, "Task not found")
        cur = conn.execute(
            "SELECT uid, task_uid, status, rationale, path_to_green, created_at FROM rag_statuses WHERE task_uid = ? ORDER BY created_at ASC",
            (task_uid,),
        )
        return [dict(r) for r in cur.fetchall()]


@app.post("/api/tasks/{task_uid}/rag")
def create_rag(task_uid: str, body: RAGCreate, request: Request):
    if body.status not in ("green", "amber", "red"):
        raise HTTPException(400, "status must be green, amber, or red")
    if body.status in ("amber", "red") and not (body.rationale or "").strip():
        raise HTTPException(400, "Rationale required for amber or red status")
    actor_employee_id = _get_actor_employee_id(request)
    with get_conn() as conn:
        task = conn.execute("SELECT uid, name FROM tasks WHERE uid = ?", (task_uid,)).fetchone()
        if task is None:
            raise HTTPException(404, "Task not found")
        uid = str(uuid.uuid4())
        now = _now()
        conn.execute(
            "INSERT INTO rag_statuses (uid, task_uid, status, rationale, path_to_green, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (uid, task_uid, body.status, (body.rationale or "").strip(), (body.path_to_green or "").strip(), now),
        )
        rag = {
            "uid": uid,
            "task_uid": task_uid,
            "status": body.status,
            "rationale": body.rationale or "",
            "path_to_green": body.path_to_green or "",
            "created_at": now,
        }
        _record_audit_event(
            conn,
            actor_employee_id=actor_employee_id,
            action_type="rag_create",
            entity_type="rag",
            entity_uid=uid,
            task_uid=task_uid,
            task_name=task["name"],
            prior_value=None,
            new_value=rag,
        )
    return rag


# --- Comments ---

@app.get("/api/tasks/{task_uid}/comments")
def list_comments(task_uid: str):
    with get_conn() as conn:
        if conn.execute("SELECT uid FROM tasks WHERE uid = ?", (task_uid,)).fetchone() is None:
            raise HTTPException(404, "Task not found")
        cur = conn.execute(
            "SELECT uid, task_uid, author, comment_text, created_at FROM comments WHERE task_uid = ? ORDER BY created_at ASC",
            (task_uid,),
        )
        return [dict(r) for r in cur.fetchall()]


@app.post("/api/tasks/{task_uid}/comments")
def create_comment(task_uid: str, body: CommentCreate, request: Request):
    actor_employee_id = _get_actor_employee_id(request)
    with get_conn() as conn:
        task = conn.execute("SELECT uid, name FROM tasks WHERE uid = ?", (task_uid,)).fetchone()
        if task is None:
            raise HTTPException(404, "Task not found")
        uid = str(uuid.uuid4())
        now = _now()
        conn.execute(
            "INSERT INTO comments (uid, task_uid, author, comment_text, created_at) VALUES (?, ?, ?, ?, ?)",
            (uid, task_uid, (body.author or "").strip(), (body.comment_text or "").strip(), now),
        )
        comment = {"uid": uid, "task_uid": task_uid, "author": body.author, "comment_text": body.comment_text, "created_at": now}
        _record_audit_event(
            conn,
            actor_employee_id=actor_employee_id,
            action_type="comment_create",
            entity_type="comment",
            entity_uid=uid,
            task_uid=task_uid,
            task_name=task["name"],
            prior_value=None,
            new_value=comment,
        )
    return comment


# --- Risks ---

@app.get("/api/tasks/{task_uid}/risks")
def list_risks(task_uid: str):
    with get_conn() as conn:
        if conn.execute("SELECT uid FROM tasks WHERE uid = ?", (task_uid,)).fetchone() is None:
            raise HTTPException(404, "Task not found")
        cur = conn.execute(
            """SELECT uid, task_uid, title, description, severity, status, owner, mitigation_plan, created_at, updated_at
               FROM risks WHERE task_uid = ? ORDER BY created_at ASC""",
            (task_uid,),
        )
        return [dict(r) for r in cur.fetchall()]


@app.post("/api/tasks/{task_uid}/risks")
def create_risk(task_uid: str, body: RiskCreate, request: Request):
    if body.severity not in ("low", "medium", "high", "critical"):
        raise HTTPException(400, "Invalid severity")
    if body.status not in ("open", "mitigated", "closed"):
        raise HTTPException(400, "Invalid status")
    actor_employee_id = _get_actor_employee_id(request)
    with get_conn() as conn:
        task = conn.execute("SELECT uid, name FROM tasks WHERE uid = ?", (task_uid,)).fetchone()
        if task is None:
            raise HTTPException(404, "Task not found")
        uid = str(uuid.uuid4())
        now = _now()
        conn.execute(
            """INSERT INTO risks (uid, task_uid, title, description, severity, status, owner, mitigation_plan, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (uid, task_uid, body.title.strip(), body.description or "", body.severity, body.status,
             body.owner or "", body.mitigation_plan or "", now, now),
        )
        risk = {"uid": uid, "task_uid": task_uid, "title": body.title, "description": body.description or "",
                "severity": body.severity, "status": body.status, "owner": body.owner or "",
                "mitigation_plan": body.mitigation_plan or "", "created_at": now, "updated_at": now}
        _record_audit_event(
            conn,
            actor_employee_id=actor_employee_id,
            action_type="risk_create",
            entity_type="risk",
            entity_uid=uid,
            task_uid=task_uid,
            task_name=task["name"],
            prior_value=None,
            new_value=risk,
        )
    return risk


@app.patch("/api/risks/{uid}")
def update_risk(uid: str, body: RiskUpdate, request: Request):
    updates = []
    values = []
    for k, v in body.model_dump(exclude_unset=True).items():
        updates.append(f"{k} = ?")
        values.append(v)
    if not updates:
        with get_conn() as conn:
            row = conn.execute("SELECT * FROM risks WHERE uid = ?", (uid,)).fetchone()
        if not row:
            raise HTTPException(404, "Risk not found")
        return dict(row)
    values.append(_now())
    updates.append("updated_at = ?")
    values.append(uid)
    actor_employee_id = _get_actor_employee_id(request)
    with get_conn() as conn:
        previous_row = conn.execute("SELECT * FROM risks WHERE uid = ?", (uid,)).fetchone()
        if not previous_row:
            raise HTTPException(404, "Risk not found")
        conn.execute(f"UPDATE risks SET {', '.join(updates)} WHERE uid = ?", values)
        row = conn.execute("SELECT * FROM risks WHERE uid = ?", (uid,)).fetchone()
        if not row:
            raise HTTPException(404, "Risk not found")
        risk = dict(row)
        _record_audit_event(
            conn,
            actor_employee_id=actor_employee_id,
            action_type="risk_update",
            entity_type="risk",
            entity_uid=uid,
            task_uid=risk.get("task_uid"),
            task_name=_get_task_name(conn, risk.get("task_uid")),
            prior_value=dict(previous_row),
            new_value=risk,
        )
    return risk


# --- Dependencies ---

@app.get("/api/projects/{project_uid}/dependencies")
def list_dependencies(project_uid: str):
    with get_conn() as conn:
        if conn.execute("SELECT uid FROM projects WHERE uid = ?", (project_uid,)).fetchone() is None:
            raise HTTPException(404, "Project not found")
        cur = conn.execute(
            "SELECT uid, project_uid, predecessor_task_uid, successor_task_uid, dependency_type, created_at FROM dependencies WHERE project_uid = ?",
            (project_uid,),
        )
        return [dict(r) for r in cur.fetchall()]


@app.post("/api/projects/{project_uid}/dependencies")
def create_dependency(project_uid: str, body: DependencyCreate, request: Request):
    if body.dependency_type not in ("FS", "SS", "FF", "SF"):
        raise HTTPException(400, "dependency_type must be FS, SS, FF, or SF")
    if body.predecessor_task_uid == body.successor_task_uid:
        raise HTTPException(400, "Predecessor and successor must differ")
    actor_employee_id = _get_actor_employee_id(request)
    with get_conn() as conn:
        if conn.execute("SELECT uid FROM projects WHERE uid = ?", (project_uid,)).fetchone() is None:
            raise HTTPException(404, "Project not found")
        for tid in (body.predecessor_task_uid, body.successor_task_uid):
            row = conn.execute("SELECT uid, project_uid FROM tasks WHERE uid = ?", (tid,)).fetchone()
            if not row or row["project_uid"] != project_uid:
                raise HTTPException(400, "Both tasks must belong to the project")
        uid = str(uuid.uuid4())
        now = _now()
        conn.execute(
            """INSERT INTO dependencies (uid, project_uid, predecessor_task_uid, successor_task_uid, dependency_type, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (uid, project_uid, body.predecessor_task_uid, body.successor_task_uid, body.dependency_type, now),
        )
        dependency = {"uid": uid, "project_uid": project_uid, "predecessor_task_uid": body.predecessor_task_uid,
                      "successor_task_uid": body.successor_task_uid, "dependency_type": body.dependency_type, "created_at": now}
        _record_audit_event(
            conn,
            actor_employee_id=actor_employee_id,
            action_type="dependency_create",
            entity_type="dependency",
            entity_uid=uid,
            task_uid=body.successor_task_uid,
            task_name=_get_task_name(conn, body.successor_task_uid),
            prior_value=None,
            new_value=dependency,
            metadata={"predecessor_task_name": _get_task_name(conn, body.predecessor_task_uid)},
        )
    return dependency


@app.get("/api/dependencies")
def list_dependencies_single():
    """Return dependencies for the single (default) project."""
    return list_dependencies(DEFAULT_PROJECT_UID)


@app.post("/api/dependencies")
def create_dependency_single(body: DependencyCreate, request: Request):
    """Create dependency in the single (default) project."""
    return create_dependency(DEFAULT_PROJECT_UID, body, request)


@app.delete("/api/dependencies/{uid}", status_code=204)
def delete_dependency(uid: str, request: Request):
    actor_employee_id = _get_actor_employee_id(request)
    with get_conn() as conn:
        dependency = conn.execute(
            "SELECT uid, project_uid, predecessor_task_uid, successor_task_uid, dependency_type, created_at FROM dependencies WHERE uid = ?",
            (uid,),
        ).fetchone()
        if not dependency:
            raise HTTPException(404, "Dependency not found")
        cur = conn.execute("DELETE FROM dependencies WHERE uid = ?", (uid,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Dependency not found")
        dep = dict(dependency)
        _record_audit_event(
            conn,
            actor_employee_id=actor_employee_id,
            action_type="dependency_delete",
            entity_type="dependency",
            entity_uid=uid,
            task_uid=dep.get("successor_task_uid"),
            task_name=_get_task_name(conn, dep.get("successor_task_uid")),
            prior_value=dep,
            new_value=None,
            metadata={"predecessor_task_name": _get_task_name(conn, dep.get("predecessor_task_uid"))},
        )
    return None


# --- Excel export / import ---

@app.get("/api/projects/{project_uid}/export")
def export_project(project_uid: str):
    from excel_io import export_project_to_xlsx
    path = export_project_to_xlsx(project_uid)
    if not path:
        raise HTTPException(404, "Project not found")
    return FileResponse(path, filename="project-export.xlsx", media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


@app.get("/api/export")
def export_single():
    """Export the single (default) project."""
    return export_project(DEFAULT_PROJECT_UID)


@app.post("/api/import")
def import_excel(request: Request, file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(400, "Please upload an Excel (.xlsx) file")
    from excel_io import import_xlsx
    actor_employee_id = _get_actor_employee_id(request)
    content = file.file.read()
    try:
        imported = import_xlsx(content)
    except Exception as e:
        raise HTTPException(400, str(e))
    with get_conn() as conn:
        _record_audit_event(
            conn,
            actor_employee_id=actor_employee_id,
            action_type="import",
            entity_type="import",
            entity_uid=file.filename or "import",
            prior_value=None,
            new_value=imported,
            metadata={"filename": file.filename},
        )
    return imported


# --- Audit log ---

@app.get("/api/audit-events")
def list_audit_events(
    employee_id: Optional[str] = None,
    action_type: Optional[str] = None,
    task_uid: Optional[str] = None,
):
    where = []
    values = []
    if employee_id:
        where.append("actor_employee_id = ?")
        values.append(employee_id)
    if action_type:
        where.append("action_type = ?")
        values.append(action_type)
    if task_uid:
        where.append("task_uid = ?")
        values.append(task_uid)
    sql = """SELECT uid, actor_employee_id, action_type, entity_type, entity_uid, task_uid, task_name,
                    prior_value, new_value, metadata, created_at
             FROM audit_events"""
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY created_at DESC"
    with get_conn() as conn:
        rows = conn.execute(sql, tuple(values)).fetchall()
    return [_serialize_audit_event(row) for row in rows]


# --- Static files (must be last) ---

STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "static")
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
