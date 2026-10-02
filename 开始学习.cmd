@echo off
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
  py -3 scripts\start.py
) else (
  python scripts\start.py
)
if errorlevel 1 (
  echo Please install Python 3.10 or later from https://www.python.org/downloads/
  pause
)
