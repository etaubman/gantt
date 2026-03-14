# Gantt Project Manager

Lightweight internal web app for managing projects and tracking work with a Gantt chart. Create projects, hierarchical tasks, RAG status, comments, risks, and dependencies. Export/import full state via Excel.

## Run with Docker

```bash
docker-compose up --build
```

Open http://localhost:8000 in your browser. Data is stored in a Docker volume (`gantt_data`).

## Run locally without Docker

Recommended Python version: `3.12`

This matches the Docker image and project docs. Earlier or later versions may work, but `3.12` is the tested target.

Required Python libraries:

- `fastapi==0.115.6`
- `uvicorn[standard]==0.32.1`
- `openpyxl==3.1.5`
- `pydantic==2.10.3`
- `python-multipart==0.0.18`

### 1. Create and activate a virtual environment

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### 2. Set the local database path

The app uses SQLite. Set `GANTT_DB_PATH` so the database is created in the repo:

```powershell
New-Item -ItemType Directory -Force -Path .\data | Out-Null
$env:GANTT_DB_PATH = ".\data\gantt.db"
```

### 3. Start the server

Run from the repository root:

```powershell
python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

Open [http://localhost:8000](http://localhost:8000) in your browser.

### Notes

- The database file will be created automatically at `data/gantt.db`.
- Keep the terminal open while the server is running.
- If you open a new terminal, reactivate the virtual environment and set `GANTT_DB_PATH` again before starting the server.

## Phase 1 features

- Projects: create, list, open, delete
- Tasks: CRUD, hierarchy (parent/child), dates, status, progress
- Gantt: task rows, time axis, bars with RAG color
- Task detail: metadata, RAG history, comments, risks, dependencies
- Excel: full export and import

See `docs/phase1-plan.md` for the full implementation plan.
