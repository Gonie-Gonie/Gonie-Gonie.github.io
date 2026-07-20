@echo off
setlocal
cd /d "%~dp0..\.."
set PORT=8000

where py >nul 2>&1
if %errorlevel%==0 (
  start "Portfolio site server" py -3 -m http.server %PORT%
  timeout /t 1 /nobreak >nul
  start "" "http://localhost:%PORT%/"
  exit /b 0
)

where python >nul 2>&1
if %errorlevel%==0 (
  start "Portfolio site server" python -m http.server %PORT%
  timeout /t 1 /nobreak >nul
  start "" "http://localhost:%PORT%/"
  exit /b 0
)

echo ERROR: Python 3 was not found in PATH.
pause
exit /b 1
