# Gantt Project Manager

Lightweight internal web app for managing projects and tracking work with a Gantt chart. Create projects, hierarchical tasks, RAG status, comments, risks, and dependencies. Export/import full state via Excel.

## Run with Docker

```bash
docker-compose up --build
```

Open http://localhost:8000 in your browser. Data is stored in a Docker volume (`gantt_data`).

## Run locally (optional)

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:GANTT_DB_PATH = ".\data\gantt.db"
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

Open http://localhost:8000.

## Phase 1 features

- Projects: create, list, open, delete
- Tasks: CRUD, hierarchy (parent/child), dates, status, progress
- Gantt: task rows, time axis, bars with RAG color
- Task detail: metadata, RAG history, comments, risks, dependencies
- Excel: full export and import

See `docs/phase1-plan.md` for the full implementation plan.
