@echo off
setlocal

set "ROOT_DIR=%~dp0"
pushd "%ROOT_DIR%"

if not exist ".venv\Scripts\python.exe" (
  echo [Neo UART] Creating virtual environment...
  python -m venv .venv
  if errorlevel 1 (
    echo [Neo UART] Failed to create .venv. Please ensure Python is installed.
    pause
    exit /b 1
  )
)

echo [Neo UART] Installing dependencies...
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 (
  echo [Neo UART] Dependency installation failed.
  pause
  exit /b 1
)

echo [Neo UART] Starting backend server...
start "Neo UART Backend" cmd /k call "%ROOT_DIR%\.venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

timeout /t 2 >nul

echo [Neo UART] Opening frontend...
start "" http://127.0.0.1:8000/

echo [Neo UART] Done.
popd
exit /b 0