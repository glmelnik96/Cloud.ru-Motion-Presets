@echo off
rem Cloud.ru BrandKit installer with the stock music (D24): install.cmd -WithMusic. Unpack the archive
rem <folder>-music.zip over this folder first: its payload\library-music lands next to payload\library.
rem   install-music.cmd [-WithAme] [-With4K] [-Sandbox <dir>]
rem A double click pauses at the end, as install.cmd does without arguments.
call "%~dp0install.cmd" -WithMusic %*
set CODE=%ERRORLEVEL%
if "%~1"=="" pause
exit /b %CODE%
