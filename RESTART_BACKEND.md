# If you still see "Only one project is allowed"

The backend code in `backend/main.py` **allows multiple projects** and no longer returns that error. If you still see it, the running server is using old code.

## If you run locally (uvicorn)

1. **Stop** the current backend (Ctrl+C in the terminal where uvicorn is running).
2. Clear Python cache so the updated module is loaded:
   ```powershell
   Remove-Item -Recurse -Force backend\__pycache__ -ErrorAction SilentlyContinue
   ```
3. **Start** the backend again from the project root:
   ```powershell
   python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
   ```

## If you run with Docker

Rebuild the image so it includes the latest `backend/main.py`, then start the container:

```powershell
docker build -t gantt .
docker run -p 8000:8000 -v "${PWD}/data:/data" gantt
```

(Adjust the run command if you use docker-compose or a different setup.)

After restarting (or rebuilding and running), creating a new project and switching projects should work.
