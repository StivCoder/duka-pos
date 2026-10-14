@echo off
cd /d "%~dp0"
start "" cmd /c "timeout /t 2 >nul & start http://localhost:8000/"
where py >nul 2>nul && (py -m http.server 8000 & exit /b)
python -m http.server 8000
