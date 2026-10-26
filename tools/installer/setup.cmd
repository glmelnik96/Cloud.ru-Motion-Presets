@echo off
rem The Windows launcher of the package (its name in the package is Russian, "Install (Windows)"): opens the window of
rem the installer, files\setup.ps1, and leaves. Opened from inside the zip, Explorer has only this file in a temporary
rem folder: the console says to unpack first. cmd reads a line in the code page it has when it gets to it, so the
rem lines before chcp stay ASCII and the Russian ones come after it, outside any parenthesised block. No BOM.
if exist "%~dp0files\setup.ps1" goto run
chcp 65001 >nul
echo.
echo   Сначала распакуйте архив целиком: правый щелчок по архиву → «Извлечь все…».
echo   Потом запустите «Установить (Windows)» из распакованной папки.
echo.
pause
exit /b 1
:run
start "" powershell -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File "%~dp0files\setup.ps1"
