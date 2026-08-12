@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "EDITOR_DIR=%~dp0"
set "REPO_DIR=%EDITOR_DIR%.."
set "RUNTIME_DIR=%EDITOR_DIR%runtime"
set "GOROOT=%RUNTIME_DIR%\go"
set "GOPATH=%RUNTIME_DIR%\gopath"
set "GOMODCACHE=%RUNTIME_DIR%\gomodcache"
set "GOCACHE=%RUNTIME_DIR%\gocache"
set "GOBIN=%RUNTIME_DIR%\bin"
set "PATH=%GOROOT%\bin;%GOBIN%;%PATH%"
set "OUTPUT_NAME=Profile-Editor.exe"

if not exist "%RUNTIME_DIR%\.portable-go-ready" goto :not_setup
if not exist "%GOROOT%\bin\go.exe" goto :not_setup
if not exist "%GOBIN%\wails.exe" goto :not_setup

pushd "%EDITOR_DIR%cmd\editor"
"%GOBIN%\wails.exe" build -clean -o "%OUTPUT_NAME%"
set "RESULT=%errorlevel%"
if not "!RESULT!"=="0" (
  popd
  exit /b !RESULT!
)

copy /Y "build\bin\%OUTPUT_NAME%" "%REPO_DIR%\%OUTPUT_NAME%" >nul
set "RESULT=%errorlevel%"
popd
if not "%RESULT%"=="0" exit /b %RESULT%

echo.
echo Build completed: %REPO_DIR%\%OUTPUT_NAME%
echo This root-level executable is intentionally tracked by Git.
exit /b 0

:not_setup
echo ERROR: The local editor toolchain is not installed.
echo Run editor\setup.bat first.
exit /b 1
