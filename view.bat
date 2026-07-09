@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "PORT=%1"
if "%PORT%"=="" set "PORT=5173"

echo Meshova viewer  -^>  http://localhost:%PORT%/
echo Opening browser shortly. Keep this window open to keep the server running.

rem Open browser after a short delay so the server is ready.
start "" cmd /c "timeout /t 2 >nul & start "" http://localhost:%PORT%/"

call pnpm run view

echo.
echo Server stopped.
pause
