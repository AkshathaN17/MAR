# Run the server using the workspace virtual environment.
# This ensures FastAPI/uvicorn are available from the repo's venv.
$venvPython = Join-Path $PSScriptRoot 'venv\Scripts\python.exe'
if (-Not (Test-Path $venvPython)) {
    Write-Error "Virtual environment Python not found at $venvPython. Create it with 'python -m venv venv' and install requirements."
    exit 1
}
& $venvPython -m server.main
