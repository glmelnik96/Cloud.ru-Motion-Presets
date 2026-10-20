@echo off
rem Cloud.ru BrandKit installer for Windows: runs install.ps1 next to it (spec 8.1).
rem   install.cmd [-WithAme] [-Sandbox <dir>]
rem install.ps1 writes the DONE file as its very last step. A run that ends with code 0 and without it was stopped
rem half-way (an antivirus stopped the script without a word on the build PC, 2026-10-20) and counts as a failure;
rem install.ps1 -Interrupted says so (its texts are in UTF-8 there, this file is read in the OEM code page).
set "DONE=%TEMP%\brandkit-install-%RANDOM%%RANDOM%.done"
if exist "%DONE%" del /q "%DONE%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %* -Done "%DONE%"
set CODE=%ERRORLEVEL%
if "%CODE%"=="0" if not exist "%DONE%" set CODE=interrupted
if "%CODE%"=="interrupted" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" -Interrupted
  set CODE=1
)
if exist "%DONE%" del /q "%DONE%"
if "%~1"=="" pause
exit /b %CODE%
