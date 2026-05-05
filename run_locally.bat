@echo off
echo Starting FIWB Local Environment...

:: Start Backend on port 8002
echo Starting Backend...
start "FIWB Backend" cmd /k "cd backend && venv_312\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8002"

:: Start Frontend on port 3000
echo Starting Frontend...
start "FIWB Frontend" cmd /k "cd frontend && npm run dev"

echo Done. Backend on http://localhost:8002, Frontend on http://localhost:3000
