@echo off
setlocal
cd /d "%~dp0..\.."

where py >nul 2>&1
if %errorlevel%==0 (
  py -3 app\tools\build.py
  goto :done
)

where python >nul 2>&1
if %errorlevel%==0 (
  python app\tools\build.py
  goto :done
)

echo ERROR: Python 3 was not found in PATH.
echo Install Python for Windows, then run this file again.
exit /b 1

:done
if errorlevel 1 exit /b %errorlevel%
echo.
echo Build completed. Generated files are under app\generated\.
pause
