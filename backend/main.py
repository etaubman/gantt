"""FastAPI app: API routes and static file serving."""
import os
import uuid
from datetime import datetime, date
from typing import Optional

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from backend.database import get_conn, init_db
from backend.seed_data import DEFAULT_PROJECT_UID, ensure_single_project_and_seed

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


def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _row_to_dict(row) -> dict:
    return dict(row) if row else None


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
def delete_project(uid: str):
    if uid == DEFAULT_PROJECT_UID:
        raise HTTPException(400, "The Markets Data Governance project cannot be deleted.")
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM projects WHERE uid = ?", (uid,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Project not found")
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
                     responsible_party, start_date, end_date, status, progress, sort_order, created_at, updated_at
              FROM tasks WHERE project_uid = ? ORDER BY sort_order, created_at""",
            (project_uid,),
        )
        tasks = [dict(r) for r in cur.fetchall()]
    return tasks


@app.get("/api/tasks")
def list_tasks_single():
    """Return tasks for the single (default) project."""
    return list_tasks(DEFAULT_PROJECT_UID)


@app.post("/api/projects/{project_uid}/tasks")
def create_task(project_uid: str, body: TaskCreate):
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
               accountable_person, responsible_party, start_date, end_date, status, progress, sort_order, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                uid, project_uid, body.parent_task_uid, body.name.strip(), body.description or "",
                body.accountable_person or "", body.responsible_party or "",
                body.start_date, body.end_date, body.status, body.progress, body.sort_order,
                now, now,
            ),
        )
    return {"uid": uid, "project_uid": project_uid, "parent_task_uid": body.parent_task_uid,
            "name": body.name.strip(), "description": body.description or "",
            "accountable_person": body.accountable_person or "", "responsible_party": body.responsible_party or "",
            "start_date": body.start_date, "end_date": body.end_date, "status": body.status,
            "progress": body.progress, "sort_order": body.sort_order, "created_at": now, "updated_at": now}


@app.post("/api/tasks")
def create_task_single(body: TaskCreate):
    """Create task in the single (default) project."""
    return create_task(DEFAULT_PROJECT_UID, body)


@app.get("/api/tasks/{uid}")
def get_task(uid: str):
    with get_conn() as conn:
        row = conn.execute(
            """SELECT uid, project_uid, parent_task_uid, name, description, accountable_person,
                      responsible_party, start_date, end_date, status, progress, sort_order, created_at, updated_at
               FROM tasks WHERE uid = ?""",
            (uid,),
        ).fetchone()
    if not row:
        raise HTTPException(404, "Task not found")
    return dict(row)


@app.patch("/api/tasks/{uid}")
def update_task(uid: str, body: TaskUpdate):
    updates = []
    values = []
    for k, v in body.model_dump(exclude_unset=True).items():
        updates.append(f"{k} = ?")
        values.append(v)
    if not updates:
        return get_task(uid)
    values.append(_now())
    updates.append("updated_at = ?")
    values.append(uid)
    with get_conn() as conn:
        conn.execute(
            f"UPDATE tasks SET {', '.join(updates)} WHERE uid = ?",
            values,
        )
        row = conn.execute("SELECT * FROM tasks WHERE uid = ?", (uid,)).fetchone()
    if not row:
        raise HTTPException(404, "Task not found")
    return dict(row)


@app.delete("/api/tasks/{uid}", status_code=204)
def delete_task(uid: str):
    """Delete task and cascade to subtasks, dependencies, rag, comments, risks."""
    with get_conn() as conn:
        task = conn.execute("SELECT uid, project_uid FROM tasks WHERE uid = ?", (uid,)).fetchone()
        if not task:
            raise HTTPException(404, "Task not found")
        # Recursively delete children first
        children = conn.execute("SELECT uid FROM tasks WHERE parent_task_uid = ?", (uid,)).fetchall()
        for c in children:
            _delete_task_recursive(conn, c["uid"])
        conn.execute("DELETE FROM dependencies WHERE predecessor_task_uid = ? OR successor_task_uid = ?", (uid, uid))
        conn.execute("DELETE FROM rag_statuses WHERE task_uid = ?", (uid,))
        conn.execute("DELETE FROM comments WHERE task_uid = ?", (uid,))
        conn.execute("DELETE FROM risks WHERE task_uid = ?", (uid,))
        conn.execute("DELETE FROM tasks WHERE uid = ?", (uid,))
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
def create_rag(task_uid: str, body: RAGCreate):
    if body.status not in ("green", "amber", "red"):
        raise HTTPException(400, "status must be green, amber, or red")
    if body.status in ("amber", "red") and not (body.rationale or "").strip():
        raise HTTPException(400, "Rationale required for amber or red status")
    with get_conn() as conn:
        if conn.execute("SELECT uid FROM tasks WHERE uid = ?", (task_uid,)).fetchone() is None:
            raise HTTPException(404, "Task not found")
        uid = str(uuid.uuid4())
        now = _now()
        conn.execute(
            "INSERT INTO rag_statuses (uid, task_uid, status, rationale, path_to_green, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (uid, task_uid, body.status, (body.rationale or "").strip(), (body.path_to_green or "").strip(), now),
        )
    return {
        "uid": uid,
        "task_uid": task_uid,
        "status": body.status,
        "rationale": body.rationale or "",
        "path_to_green": body.path_to_green or "",
        "created_at": now,
    }


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
def create_comment(task_uid: str, body: CommentCreate):
    with get_conn() as conn:
        if conn.execute("SELECT uid FROM tasks WHERE uid = ?", (task_uid,)).fetchone() is None:
            raise HTTPException(404, "Task not found")
        uid = str(uuid.uuid4())
        now = _now()
        conn.execute(
            "INSERT INTO comments (uid, task_uid, author, comment_text, created_at) VALUES (?, ?, ?, ?, ?)",
            (uid, task_uid, (body.author or "").strip(), (body.comment_text or "").strip(), now),
        )
    return {"uid": uid, "task_uid": task_uid, "author": body.author, "comment_text": body.comment_text, "created_at": now}


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
def create_risk(task_uid: str, body: RiskCreate):
    if body.severity not in ("low", "medium", "high", "critical"):
        raise HTTPException(400, "Invalid severity")
    if body.status not in ("open", "mitigated", "closed"):
        raise HTTPException(400, "Invalid status")
    with get_conn() as conn:
        if conn.execute("SELECT uid FROM tasks WHERE uid = ?", (task_uid,)).fetchone() is None:
            raise HTTPException(404, "Task not found")
        uid = str(uuid.uuid4())
        now = _now()
        conn.execute(
            """INSERT INTO risks (uid, task_uid, title, description, severity, status, owner, mitigation_plan, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (uid, task_uid, body.title.strip(), body.description or "", body.severity, body.status,
             body.owner or "", body.mitigation_plan or "", now, now),
        )
    return {"uid": uid, "task_uid": task_uid, "title": body.title, "description": body.description or "",
            "severity": body.severity, "status": body.status, "owner": body.owner or "",
            "mitigation_plan": body.mitigation_plan or "", "created_at": now, "updated_at": now}


@app.patch("/api/risks/{uid}")
def update_risk(uid: str, body: RiskUpdate):
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
    with get_conn() as conn:
        conn.execute(f"UPDATE risks SET {', '.join(updates)} WHERE uid = ?", values)
        row = conn.execute("SELECT * FROM risks WHERE uid = ?", (uid,)).fetchone()
    if not row:
        raise HTTPException(404, "Risk not found")
    return dict(row)


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
def create_dependency(project_uid: str, body: DependencyCreate):
    if body.dependency_type not in ("FS", "SS", "FF", "SF"):
        raise HTTPException(400, "dependency_type must be FS, SS, FF, or SF")
    if body.predecessor_task_uid == body.successor_task_uid:
        raise HTTPException(400, "Predecessor and successor must differ")
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
    return {"uid": uid, "project_uid": project_uid, "predecessor_task_uid": body.predecessor_task_uid,
            "successor_task_uid": body.successor_task_uid, "dependency_type": body.dependency_type, "created_at": now}


@app.get("/api/dependencies")
def list_dependencies_single():
    """Return dependencies for the single (default) project."""
    return list_dependencies(DEFAULT_PROJECT_UID)


@app.post("/api/dependencies")
def create_dependency_single(body: DependencyCreate):
    """Create dependency in the single (default) project."""
    return create_dependency(DEFAULT_PROJECT_UID, body)


@app.delete("/api/dependencies/{uid}", status_code=204)
def delete_dependency(uid: str):
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM dependencies WHERE uid = ?", (uid,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Dependency not found")
    return None


# --- Excel export / import ---

@app.get("/api/projects/{project_uid}/export")
def export_project(project_uid: str):
    from backend.excel_io import export_project_to_xlsx
    path = export_project_to_xlsx(project_uid)
    if not path:
        raise HTTPException(404, "Project not found")
    return FileResponse(path, filename="project-export.xlsx", media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


@app.get("/api/export")
def export_single():
    """Export the single (default) project."""
    return export_project(DEFAULT_PROJECT_UID)


@app.post("/api/import")
def import_excel(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(400, "Please upload an Excel (.xlsx) file")
    from backend.excel_io import import_xlsx
    content = file.file.read()
    try:
        imported = import_xlsx(content)
    except Exception as e:
        raise HTTPException(400, str(e))
    return imported


# --- Static files (must be last) ---

STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "static")
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
