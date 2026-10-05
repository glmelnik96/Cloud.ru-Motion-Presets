@echo off
rem Cloud.ru BrandKit installer for Windows: runs install.ps1 next to it (spec 8.1).
rem   install.cmd [-WithAme] [-Sandbox <dir>]
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
set CODE=%ERRORLEVEL%
if "%~1"=="" pause
exit /b %CODE%
