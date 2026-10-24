@echo off
rem Cloud.ru BrandKit installer with the 4K loops and clips (D24): install.cmd -With4K. Unpack the archive
rem <folder>-4k.zip over this folder first: its payload\library-4k lands next to payload\library.
rem   install-4k.cmd [-WithAme] [-Sandbox <dir>]
rem A double click pauses at the end, as install.cmd does without arguments.
call "%~dp0install.cmd" -With4K %*
set CODE=%ERRORLEVEL%
if "%~1"=="" pause
exit /b %CODE%
