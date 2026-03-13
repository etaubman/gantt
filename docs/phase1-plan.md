# Phase 1 Implementation Plan

This plan delivers a **working end-to-end version** of the Gantt project management app: users can create projects, add hierarchical tasks, view a Gantt chart, open task details, and export/import via Excel. Phase 1 scopes features to keep the first release buildable and testable without implementing every requirement at full depth.

---

## Phase 1 Scope Summary

| Area | In scope | Deferred to later |
|------|----------|-------------------|
| **Projects** | Create, list, open, delete | — |
| **Tasks** | Full CRUD, hierarchy, all core fields, status, progress, sort_order | — |
| **Gantt** | Rows, time axis, bars (start→end), progress, RAG color | Dependency lines (optional polish later) |
| **Dependencies** | Full model (FS/SS/FF/SF), create/remove in UI | — |
| **RAG** | Current status + history, add/update with rationale rules | — |
| **Comments** | List + add (append-only) | Edit/delete (NFR says append-only anyway) |
| **Risks** | List + add + update (all fields) | — |
| **Excel** | Full export + import (all entities, UIDs) | Replace-existing-project option can be Phase 2 |
| **Deployment** | Single Docker container, SQLite on volume | — |

Phase 1 includes the full data model and Excel round-trip so the app is genuinely usable and portable from day one.

---

## Implementation Order

### 1. Foundation (backend + DB + runnable app)

**Goals:** FastAPI app runs, SQLite schema exists, API can be called.

- [ ] **1.1** Project layout  
  - Backend: `app/` or `backend/` (Python 3.12).  
  - Frontend: `static/` or `frontend/` (HTML, CSS, JS).  
  - Root: `docker-compose.yml`, `Dockerfile`, `requirements.txt`.

- [ ] **1.2** Dependencies  
  - `requirements.txt`: FastAPI, uvicorn, sqlite3 (stdlib), openpyxl (or xlsxwriter + openpyxl for read/write), pydantic.  
  - Python 3.12 in Docker.

- [ ] **1.3** SQLite schema  
  - Tables: `projects`, `tasks`, `dependencies`, `rag_statuses`, `comments`, `risks`.  
  - Columns per `initial-requirement.md` (UIDs as TEXT PRIMARY KEY or with UNIQUE).  
  - Foreign keys: `project_uid`, `parent_task_uid`, `task_uid`, predecessor/successor.

- [ ] **1.4** DB bootstrap  
  - Script or startup logic that creates schema if missing (e.g. `CREATE TABLE IF NOT EXISTS`).

- [ ] **1.5** FastAPI app entrypoint  
  - Serve API under `/api` (or root).  
  - Mount static files (HTML/CSS/JS) at `/` so the SPA is the default.  
  - CORS if frontend is ever split (optional for single-origin).

- [ ] **1.6** Docker  
  - Dockerfile: install Python deps, copy app, run uvicorn.  
  - docker-compose: one service, port 8000, volume for SQLite file so data persists.

**Deliverable:** `docker-compose up` brings up the app; static page loads; DB file persists on host.

---

### 2. Projects API and UI

**Goals:** Create, list, delete projects from the UI.

- [ ] **2.1** Projects API  
  - `GET /api/projects` → list all (uid, name, created_at).  
  - `POST /api/projects` → body `{ "name" }` → create with generated UID and `created_at`.  
  - `GET /api/projects/{uid}` → single project (for “open project”).  
  - `DELETE /api/projects/{uid}` → delete project (cascade to tasks, dependencies, RAG, comments, risks).

- [ ] **2.2** Project list view (plain HTML/JS)  
  - Page: list of projects (name, created_at), “Create project” (name prompt), “Open”, “Delete” with confirm.  
  - “Open” navigates to project workspace (e.g. `#/project/<uid>` or `/project.html?uid=...`).

**Deliverable:** User can create projects, see list, open one, delete one.

---

### 3. Tasks API and hierarchy

**Goals:** CRUD tasks for a project; support parent/child.

- [ ] **3.1** Tasks API  
  - `GET /api/projects/{project_uid}/tasks` → all tasks for project (flat list with `parent_task_uid`).  
  - `POST /api/projects/{project_uid}/tasks` → create task (required: name; optional: parent_task_uid, description, accountable_person, responsible_party, start_date, end_date, status, progress, sort_order). Generate `uid`, `created_at`, `updated_at`.  
  - `GET /api/tasks/{uid}` → single task (for detail panel).  
  - `PATCH /api/tasks/{uid}` → update task (allowed fields per spec).  
  - `DELETE /api/tasks/{uid}` → delete task; cascade delete subtasks and remove dependencies/RAG/comments/risks for this task.

- [ ] **3.2** Hierarchy rules in API  
  - Validate parent_task_uid belongs to same project.  
  - On project delete, cascade. On task delete, cascade subtasks.

**Deliverable:** API supports full task CRUD and hierarchy; can be tested with curl/Postman.

---

### 4. Project workspace: task table + Gantt shell

**Goals:** One project workspace page with a task table and a Gantt area; no Excel yet.

- [ ] **4.1** Project workspace page  
  - URL: e.g. `/project.html?uid=<project_uid>` or hash route.  
  - Load project and tasks via API.  
  - Layout: top bar (project name, Export Excel, Import Excel buttons); left: task table; right: Gantt.

- [ ] **4.2** Task table (left panel)  
  - Columns: name, accountable, responsible, start, end, status, progress (and optionally RAG).  
  - Rows: tasks in tree order (parent, then children by sort_order). Indent or tree control for hierarchy.  
  - Click row → select task and show detail panel (or inline).  
  - “Add task” / “Add subtask” that call POST tasks API and refresh.

- [ ] **4.3** Gantt area (right panel)  
  - Horizontal: time axis (e.g. months/weeks from min start to max end across tasks).  
  - Vertical: one row per task (same order as table), subtasks under parents.  
  - Each row: bar from `start_date` to `end_date`; show progress (e.g. fill %).  
  - RAG: color bar or indicator (green/amber/red) from current RAG status (default to green if none).  
  - No dependency arrows required in Phase 1 (can add later).

**Deliverable:** Open a project → see task table + Gantt; add/edit tasks; selection drives task detail.

---

### 5. Task detail panel

**Goals:** Selecting a task shows metadata, RAG, comments, risks, dependencies; user can add/update.

- [ ] **5.1** Detail panel layout  
  - Task metadata: name, description, accountable, responsible, start, end, status, progress.  
  - Editable fields: update via PATCH when user saves.

- [ ] **5.2** RAG block  
  - Show current RAG (latest from history).  
  - “Update RAG”: dropdown (green/amber/red) + rationale (required for amber/red).  
  - POST new RAG entry to API; refresh history list.

- [ ] **5.3** Comments block  
  - List comments (newest last or first, per spec “chronological”).  
  - “Add comment”: author + text; POST; append-only (no edit/delete in UI).

- [ ] **5.4** Risks block  
  - List risks with title, severity, status, owner.  
  - “Add risk”: all fields (title, description, severity, status, owner, mitigation_plan).  
  - “Edit” risk: PATCH; show full form.

- [ ] **5.5** Dependencies block  
  - List: “Task A → Task B (FS)” etc.  
  - “Add dependency”: choose predecessor, successor, type (FS/SS/FF/SF).  
  - “Remove” dependency.

**Deliverable:** Full task detail panel with all required sections and actions.

---

### 6. Supporting APIs (RAG, comments, risks, dependencies)

**Goals:** All backend endpoints needed by the task detail panel and Gantt.

- [ ] **6.1** RAG API  
  - `GET /api/tasks/{task_uid}/rag` → list history (newest last or first consistently).  
  - `POST /api/tasks/{task_uid}/rag` → body `{ "status", "rationale" }`; validate amber/red require rationale.

- [ ] **6.2** Comments API  
  - `GET /api/tasks/{task_uid}/comments` → list by created_at.  
  - `POST /api/tasks/{task_uid}/comments` → body `{ "author", "comment_text" }`.

- [ ] **6.3** Risks API  
  - `GET /api/tasks/{task_uid}/risks` → list.  
  - `POST /api/tasks/{task_uid}/risks` → create (all fields).  
  - `PATCH /api/risks/{uid}` → update.  
  - `DELETE /api/risks/{uid}` → optional for Phase 1.

- [ ] **6.4** Dependencies API  
  - `GET /api/projects/{project_uid}/dependencies` → list.  
  - `POST /api/projects/{project_uid}/dependencies` → body `{ "predecessor_task_uid", "successor_task_uid", "dependency_type" }`.  
  - `DELETE /api/dependencies/{uid}`.

**Deliverable:** All of task detail panel’s actions work against the API.

---

### 7. Excel export

**Goals:** One button exports full project state to a workbook that can fully restore the app.

- [ ] **7.1** Workbook structure (per spec)  
  - Sheets: Metadata, Projects, Tasks, Dependencies, RAG Status History, Comments, Risks.  
  - Metadata: schema_version, exported_at, application_version.

- [ ] **7.2** Export API  
  - `GET /api/projects/{project_uid}/export` → generate .xlsx, return as file download (or include all projects for “full system” export; spec says “export project data” so one project is enough; can add “export all” later).  
  - Write all projects (or single project), its tasks, dependencies, RAG, comments, risks into the sheets.  
  - Use UIDs everywhere so import can rebuild relationships.

- [ ] **7.3** Export button in UI  
  - “Export Excel” in project workspace triggers download.

**Deliverable:** Export produces a valid workbook with all entities; structure matches spec.

---

### 8. Excel import

**Goals:** Import a previously exported workbook to restore one or more projects.

- [ ] **8.1** Import API  
  - `POST /api/import` (or `/api/projects/import`) → multipart file upload.  
  - Parse workbook (openpyxl): read Metadata, Projects, Tasks, Dependencies, RAG, Comments, Risks.  
  - Process order: projects → tasks → dependencies → RAG → comments → risks.  
  - Use UIDs to link; insert or replace (Phase 1: insert new project; optional query param to replace existing project by UID).

- [ ] **8.2** Import UI  
  - “Import Excel” → file picker → POST file → on success show message and refresh project list (and optionally open the first/new project).

- [ ] **8.3** Validation  
  - Validate sheet presence and required columns; return clear errors if format is wrong.

**Deliverable:** User can import an exported file and get back projects with tasks, RAG, comments, risks, dependencies.

---

### 9. Polish and non-functional

**Goals:** Simple, maintainable, deployable.

- [ ] **9.1** Error handling  
  - API: consistent error responses (e.g. 400/404/422 with message).  
  - UI: show API errors (e.g. toast or inline).

- [ ] **9.2** Basic styling  
  - Readable fonts, spacing, and layout; Gantt bars and RAG colors clear.  
  - No framework required; plain CSS (or minimal structure).

- [ ] **9.3** SQLite on disk  
  - Path for DB file fixed in app (e.g. `/data/app.db` or `./data/app.db`).  
  - Docker volume maps that path so data survives container restart.

- [ ] **9.4** README  
  - How to run: `docker-compose up`, open browser.  
  - How to run locally (optional): Python venv, run uvicorn, open static folder.

**Deliverable:** App is easy to run, data persists, code is readable and maintainable.

---

## Phase 1 Completion Criteria

- [ ] User can create/delete projects and open a project.  
- [ ] User can add/edit/delete tasks with hierarchy; dates, status, progress, accountable, responsible.  
- [ ] Gantt shows tasks as bars with progress and RAG color; subtasks under parents.  
- [ ] Task detail shows metadata, RAG history, comments, risks, dependencies.  
- [ ] User can add/update RAG, add comments, add/update risks, add/remove dependencies.  
- [ ] Export produces a single Excel workbook with full state (all sheets).  
- [ ] Import restores projects/tasks/hierarchy/dependencies/RAG/comments/risks.  
- [ ] `docker-compose up` runs the app; SQLite persists on a volume.

---

## Suggested Repo Structure (Phase 1)

```
gantt/
├── docker-compose.yml
├── Dockerfile
├── requirements.txt
├── README.md
├── docs/
│   ├── initial-requirement.md
│   └── phase1-plan.md
├── backend/                 # or app/
│   ├── main.py              # FastAPI app, static mount, routes
│   ├── database.py          # SQLite connection, schema init
│   ├── models/              # Pydantic request/response
│   ├── routers/             # projects, tasks, rag, comments, risks, dependencies, import/export
│   └── services/            # export_xlsx, import_xlsx, business rules
└── static/                  # or frontend/
    ├── index.html           # project list
    ├── project.html         # project workspace (table + Gantt + detail)
    ├── styles.css
    └── app.js               # or split by view
```

---

## What Comes After Phase 1

- **Phase 2 (optional):** Dependency lines on Gantt; “replace existing project” on import; dependency validation (e.g. no circular refs); risk delete; richer Gantt scaling/zoom.  
- **Ongoing:** Tests (API + export/import round-trip); accessibility; performance for large projects.

This plan keeps Phase 1 to a single working version with full data model and Excel round-trip, so the app is usable and portable as soon as the checklist above is done.
