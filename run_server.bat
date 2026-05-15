@echo off
set "SCRIPT_DIR=%~dp0"
set "PYTHON=%SCRIPT_DIR%venv\Scripts\python.exe"
if not exist "%PYTHON%" (
    echo Virtual environment Python not found at "%PYTHON%".
    echo Create it with: python -m venv venv
    echo Then install dependencies: pip install -r requirements.txt
    exit /b 1
)
"%PYTHON%" -m server.main
