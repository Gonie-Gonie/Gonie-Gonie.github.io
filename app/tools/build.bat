@echo off
setlocal
call "%~dp0run-go.cmd" run ./cmd/site build
if errorlevel 1 exit /b %errorlevel%
echo.
echo Build completed. Generated files are under app\generated\.
if not defined CI pause
