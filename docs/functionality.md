# Gantt Project Manager — Full Functionality Reference

This document outlines every feature and capability of the application, from backend API and data model to frontend UI and user flows.

---

## 1. Application Overview

- **Stack**: FastAPI backend, SQLite database, vanilla JavaScript frontend, static HTML/CSS.
- **Purpose**: Internal web app for managing a single project (Markets Data Governance) with hierarchical tasks, a Gantt timeline, RAG status, comments, risks, dependencies, and Excel export/import.
- **Entry point**: The main UI is served at `/` (index.html): a workspace with a task table and Gantt panel. `project.html` redirects to `/`.

---

## 2. Backend (API & Data)

### 2.1 Startup & Database

- **Database**: SQLite; path from `GANTT_DB_PATH` (default `/data/gantt.db` in Docker, or e.g. `./data/gantt.db` locally).
- **Schema** (`backend/database.py`): Tables for `projects`, `tasks`, `dependencies`, `rag_statuses`, `comments`, `risks`, `edit_lock`, `audit_events`. Migrations add `path_to_green` on RAG, and `is_milestone`, `is_deleted`, `deleted_at`, `deleted_by` on tasks when missing.
- **Startup seeding** (`backend/seed_data.py`): Ensures a single project exists (uid `markets-data-governance`, name "Markets Data Governance"). If the project has no tasks, inserts eight top-level tasks: Equities, Commodities, Rates, FX, Markets Operations, Markets Treasury, Spread Products, Other Markets.

### 2.2 Projects

- **Single-project model**: The app is built for one project; project UID is not in the main URL.
- **Endpoints**:
  - `GET /api/projects` — List projects (returns the single project).
  - `GET /api/project` — Get the single (default) project.
  - `GET /api/projects/{uid}` — Get project by UID.
  - `POST /api/projects` — Rejected with 400 (only one project allowed).
  - `DELETE /api/projects/{uid}` — Delete project; 400 if uid is the default project.

### 2.3 Tasks

- **Fields**: uid, project_uid, parent_task_uid, name, description, accountable_person, responsible_party, start_date, end_date, is_milestone, status, progress, sort_order, is_deleted, deleted_at, deleted_by, created_at, updated_at.
- **Status values**: `not_started`, `in_progress`, `complete`, `blocked`, `cancelled`.
- **Endpoints**:
  - `GET /api/tasks` — List non-deleted tasks for the default project (ordered by sort_order, created_at).
  - `GET /api/projects/{project_uid}/tasks` — Same for a given project.
  - `GET /api/tasks/{uid}` — Get one task.
  - `POST /api/tasks` — Create task in default project (validates status; optional parent; can inherit start/end from parent).
  - `POST /api/projects/{project_uid}/tasks` — Create task in given project.
  - `PATCH /api/tasks/{uid}` — Partial update (any subset of updatable fields); records audit event with prior/new value.
  - `POST /api/tasks/{uid}/soft-delete` — Soft-delete with body `{ "strategy": "shift_up" | "delete_subtasks" }`. Shift up reparents children to the deleted task’s parent; delete_subtasks soft-deletes the whole subtree. Removes dependencies involving affected tasks; records full snapshot in audit.
  - `DELETE /api/tasks/{uid}` — Hard delete: recursive delete of children, then dependencies, RAG, comments, risks, and the task; audit event with snapshot.

### 2.4 Edit Lock

- **Purpose**: Single workspace-level lock so only one user can edit at a time.
- **Employee ID**: Header `X-Employee-Id`; format `AA12345` (two letters, five digits); normalized to uppercase letters.
- **Endpoints**:
  - `GET /api/edit-lock` — Current lock state: `{ locked, employee_id, locked_at, updated_at }`.
  - `POST /api/edit-lock/acquire` — Body `{ employee_id, force?: boolean }`. If locked by another and not force, returns 409 with lock details. If same employee, refreshes lock. Records audit (lock_acquire or lock_takeover).
  - `POST /api/edit-lock/release` — Body `{ employee_id, force?: boolean }`. Only lock holder (or force) can release. Records audit (lock_release).

### 2.5 RAG (Red/Amber/Green) Status

- **Model**: History per task: status (`green`, `amber`, `red`), rationale, path_to_green, created_at. Amber/red require rationale.
- **Endpoints**:
  - `GET /api/tasks/{task_uid}/rag` — List RAG history for task.
  - `POST /api/tasks/{task_uid}/rag` — Create new RAG entry; body `{ status, rationale?, path_to_green? }`. Audit: rag_create.

### 2.6 Comments

- **Model**: task_uid, author, comment_text, created_at.
- **Endpoints**:
  - `GET /api/tasks/{task_uid}/comments` — List comments for task.
  - `POST /api/tasks/{task_uid}/comments` — Create comment; body `{ author, comment_text }`. Audit: comment_create.

### 2.7 Risks

- **Model**: task_uid, title, description, severity (`low`|`medium`|`high`|`critical`), status (`open`|`mitigated`|`closed`), owner, mitigation_plan, created_at, updated_at.
- **Endpoints**:
  - `GET /api/tasks/{task_uid}/risks` — List risks for task.
  - `POST /api/tasks/{task_uid}/risks` — Create risk; full body. Audit: risk_create.
  - `PATCH /api/risks/{uid}` — Update risk; audit: risk_update.

### 2.8 Dependencies

- **Model**: project_uid, predecessor_task_uid, successor_task_uid, dependency_type (`FS`, `SS`, `FF`, `SF`), created_at.
- **Endpoints**:
  - `GET /api/dependencies` — List dependencies for default project.
  - `GET /api/projects/{project_uid}/dependencies` — List for project.
  - `POST /api/dependencies` — Create in default project; body `{ predecessor_task_uid, successor_task_uid, dependency_type }`. Validates both tasks in project; no self-dependency. Audit: dependency_create.
  - `POST /api/projects/{project_uid}/dependencies` — Create in project.
  - `DELETE /api/dependencies/{uid}` — Delete dependency. Audit: dependency_delete.

### 2.9 Excel Export / Import

- **Export** (`backend/excel_io.py`):
  - `GET /api/export` — Full project export: workbook with sheets Metadata, Projects, Tasks, Dependencies, RAG Status History, Comments, Risks, Audit Log, Edit Lock. File download.
  - `GET /api/export-report` — Human-readable report: Overview, Task Report (hierarchy, status, RAG, dates, accountable/responsible, latest comment, open risks, predecessors/successors), Open Risks, Latest Comments. Styled with filters and wrapping.
- **Import**:
  - `POST /api/import` — Upload `.xlsx`/`.xls`; replaces project data for all projects in the workbook (projects, tasks, dependencies, RAG, comments, risks; optional audit log and edit lock). Returns summary counts. Audit: import event.

### 2.10 Audit Log

- **Model**: actor_employee_id, action_type, entity_type, entity_uid, task_uid, task_name, prior_value (JSON), new_value (JSON), metadata (JSON), created_at.
- **Endpoint**: `GET /api/audit-events` — Query params: `employee_id`, `action_type`, `task_uid`. Returns events ordered by created_at DESC; prior_value, new_value, metadata parsed from JSON.

### 2.11 Static Files

- **Mount**: `/` serves static files from `static/` with `html=True` (e.g. `/` → index.html). API routes are under `/api/`.

---

## 3. Frontend — Workspace (Main UI)

The workspace is the primary screen: task table (left) and Gantt timeline (right), with header actions and a task detail modal.

### 3.1 Header

- **Project title & meta**: Project name; subtitle with task count, completed count, and plan date range.
- **Server indicator**: Online / Offline / Checking server… (from API connection detection in `api.js`).
- **Mode indicator**: Read only | Locked by {employee_id} | Your lock • {employee_id} | Editing • {employee_id}.
- **Lock for editing** button: Prompts for employee ID (format AA12345) if needed; acquires or releases lock; supports “Take over” when locked by another.
- **Audit log** button: Opens audit log modal.
- **Import Excel**: File input (accept .xlsx, .xls); visible only in edit mode with own lock. Uploads to `/api/import`, shows toast, refreshes data.
- **Export Excel**: Navigate to `/api/export`; toast “Export started”.
- **Export Report**: Navigate to `/api/export-report`; toast “Report export started”.

### 3.2 Edit Mode & Lock

- **Edit mode**: Stored in localStorage (`gantt-workspace-mode`); employee ID in `gantt-employee-id`. Edit mode is on only when lock is held by current employee.
- **Lock polling**: Every 5 seconds `GET /api/edit-lock`; if lock is taken by someone else or released, edit mode is turned off and toast shown (once per loss).
- **Take over**: When locking, if already locked by another user, confirm dialog then acquire with `force: true`.

### 3.3 Task Panel (Left)

- **Panel label**: “Tasks” and badge with “X visible” (count after filters/focus).
- **Domain filter**: Dropdown of root-level tasks (from task tree); “All domains” or one domain — filters to that subtree.
- **Expand all / Collapse all**: Expand or collapse all nodes in the tree (collapse all = all with children collapsed).
- **Accountable / Responsible / RAG / Status filters**: Dropdowns; options from current task set (including “Unassigned” or “No RAG”). Filter to tasks matching the selection and show their ancestors.
- **Focus selected**: With a task selected, restricts view to that task, its ancestors, and its descendants. Button toggles to “Exit focus”.
- **Clear filters**: Resets accountable, responsible, RAG, status to “All”; re-renders.
- **Filter summary**: Text like “All filters off” or “Filtered by …” and/or “Focused on …”.
- **Task table**:
  - Columns: Task (hierarchy number, expand/collapse, milestone marker, RAG dot, name), Accountable, Responsible, Start, End, RAG, Status, %, and actions.
  - Rows: One per visible task in the filtered/expanded tree; indent by depth; cancelled tasks styled.
  - Row click: Select row; syncs selection to Gantt and detail.
  - Row double-click: Open task detail modal.
  - Expand/collapse: Click chevron to toggle that task’s children (state in memory, not persisted).
- **Quick edit (edit mode only)**:
  - Clicking Accountable, Responsible, Start, End, RAG, Status, or Progress opens a popover to edit that field; Save sends PATCH or RAG POST and refreshes.
  - RAG quick edit: status, rationale, path to green; rationale required for amber/red.
  - Progress: slider plus 0/25/50/75/100% presets.
- **Add subtask** (edit mode only): “+” per row; modal for task name; creates task with parent_task_uid and default dates (parent start + 7 days).
- **Quick comment** (edit mode only): Comment icon per row; popover to add comment (author from employee ID); persists and refreshes.
- **Task name tooltip**: Hover/focus on task name shows super-tooltip with description, duration, latest comment, and risks (loaded on delay).
- **RAG badge tooltip**: RAG cells and badges use `Gantt.ragTooltip`: hover/focus shows current RAG, rationale, path to green, trend, and short history.

### 3.4 Gantt Panel (Timeline, Right)

- **Panel label**: “Timeline” and badge: “Plan view” or selected task name.
- **Timeline edit** button: Toggle timeline edit mode (only when in edit mode and holding lock). When on: bars can be resized/dragged and dependencies drawn.
- **Zoom**: Select Years / Quarters / Months / Weeks / Days; controls scale (px per day) and header granularity.
- **Reset view**: Scrolls timeline horizontally so “today” is centered.
- **Date range**: Displays current visible date range.
- **Pan left / right**: Buttons to scroll timeline horizontally.
- **Timeline content**:
  - Time axis: Two header rows (e.g. years + months or months + weeks) and weekend shading.
  - Today line: Vertical line at today’s date.
  - Rows: One per visible task; bar or milestone diamond; RAG color; progress fill on bars; label and meta (dates).
  - Row/bar click: Select task.
  - Bar double-click: Open task detail modal.
  - Hover on bar: Tooltip (name, description, type, status, RAG, progress, dates, accountable, responsible); dependency highlight (incoming/outgoing links).
- **Timeline edit mode** (when enabled):
  - **Bar drag**: Move bar horizontally (same duration); unscheduled tasks get default 7-day duration; milestones move as one date.
  - **Bar resize**: Drag left or right edge (8px zone) to change start or end; dates sent via PATCH on mouseup.
  - **Milestone**: Single date; drag to move; save as start_date = end_date.
  - **Dependency creation**: Right-side dot on bar = “drag to create dependency (this task as predecessor)”. Drag to left-side dot on another bar (“this task as successor”). Creates FS dependency via API; duplicate link shows toast. Left dot shows “Drop here to create dependency (this task as successor)”.
- **Dependency arcs**: SVG overlay; incoming/outgoing arrows and styling on hover for the active task.

### 3.5 Scroll & Sync

- **Vertical sync**: Task table body and Gantt rows stay in sync; scrolling the task table scrolls the Gantt body (transform). Mouse wheel on Gantt scrolls the task table vertically.

### 3.6 Task Detail Modal

- **Open**: Double-click task row or bar; or from row/bar single-click then open-detail (e.g. from a future “Open” control if present). Modal has tabs: Task, Health, Comments, Risks, Dependencies.
- **Top bar**: Chips (milestone, accountable, responsible, schedule, status • progress %, mode). In edit mode: “Save task” and hint.
- **Task tab**:
  - Edit mode: Name, description, accountable, responsible, “Render as milestone”, start/end (or milestone date + mirror), status, progress %. Save sends PATCH and refreshes.
  - Read-only: Same fields as readonly.
  - Danger zone: “Remove from plan view” — “Delete, keep subtasks” (soft-delete shift_up) and “Delete with subtasks” (soft-delete delete_subtasks); confirm then API and close modal + refresh.
- **Health tab**:
  - Status and progress % (editable in edit mode).
  - Current RAG card: latest status, date, rationale, path to green; RAG history below; badge uses RAG tooltip.
  - Edit mode: Update RAG (status, rationale, path to green); “Update RAG” posts new RAG and refreshes.
- **Comments tab**: List of comments (newest first); edit mode: textarea + “Add comment” (author from employee ID).
- **Risks tab**: List of risks (title, severity, status, owner, mitigation); edit mode: “Add risk”, form (title, description, severity, status, owner, mitigation), Save/Cancel; edit existing risk by “Edit” then save.
- **Dependencies tab**: List of “predecessor → this (type)” and “this → successor (type)”; edit mode: dropdown to pick predecessor, dependency type (FS/SS/FF/SF), “Add dependency”; remove via “Remove” per row (DELETE dependency).
- **Close**: X button, backdrop click, or Escape.

### 3.7 Initial Load & Refresh

- **Refresh**: Load project, tasks, dependencies, then RAG per task; then render table + Gantt, sync scroll, open detail if already open, center timeline on today (first load only).
- **Loading overlay**: Shown during refresh; hidden when done.

---

## 4. Audit Log Modal

- **Open**: Header “Audit log” button.
- **UI**: Modal with list pane and detail pane; toolbar: User filter, Action filter, Task search (task name or payload text), Refresh.
- **List**: One row per audit event: action (formatted), task/entity, user (actor_employee_id), time. Click to select and show detail.
- **Detail**: Action, entity, user, timestamp, task; “What changed” diff (prior vs new, field-level when possible); raw Prior value, New value, Metadata JSON.
- **Close**: Backdrop, X, or Escape.

---

## 5. RAG Tooltip

- **Bind**: Used on RAG badges in table and detail; options: taskUid, taskName, optional preloaded history.
- **Content**: Task name, current status, date, rationale, path to green, trend (improving/worsening/stable), short history line (e.g. “Red -> Amber -> Green”). Loads history from API if not cached.

---

## 6. Utilities & Shared Behavior

- **Date formatting**: shortDate, prettyDate, dateStr (ISO date part) in `utils.js`.
- **Status display**: titleCaseStatus (e.g. not_started → “Not Started”).
- **Toasts**: showToast(msg, isError); auto-dismiss; used for save confirmations, errors, lock lost, etc.
- **Escape HTML**: Used for all user-supplied text in markup.

---

## 7. Landing / Project List (Optional Entry)

- **landing.js**: If the page has `#project-list`, it fetches `/api/projects`, shows the first project with “Open project”; click goes to `/project.html?uid=...`. Since `project.html` redirects to `/`, the main entry in practice is the workspace at `/`.

---

## 8. Data Flow Summary

- **State** (`workspace-state.js`): In-memory project, tasks, dependencies, taskRag map; selectedTaskUid, filters (domain, accountable, responsible, RAG, status), focusedTaskUid, expand/collapse set, edit mode, edit lock, timeline zoom, timeline edit mode. Employee ID and mode persisted in localStorage.
- **Rendering**: buildTaskTree → apply domain filter → apply accountable/responsible/RAG/status filters → apply focus (optional) → getVisibleTree (collapse) → render table and Gantt with same visible set and selection.
- **Writes**: All mutating API calls require edit mode and lock (and employee ID when needed); toasts and refresh after success.

---

## 9. File Reference

| Area | Files |
|------|--------|
| Backend | `backend/main.py`, `backend/database.py`, `backend/excel_io.py`, `backend/seed_data.py` |
| Static | `static/index.html`, `static/project.html`, `static/styles.css`, `static/css/*.css` |
| Frontend JS | `static/js/utils.js`, `static/js/api.js`, `static/js/workspace-state.js`, `static/js/workspace.js`, `static/js/workspace-table.js`, `static/js/workspace-gantt.js`, `static/js/workspace-detail.js`, `static/js/rag-tooltip.js`, `static/js/audit-log.js`, `static/js/landing.js` |

This document is the single reference for every bit of functionality in the Gantt Project Manager application.
