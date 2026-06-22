@echo off
title Khoi tao XML Invoice Downloader Local
echo =======================================================
echo          TRINH TAI HOA DON PDF TU DONG LOCAL
echo =======================================================
echo.
echo Buoc 1: Kiem tra va cai dat thu vien Python
python -m pip install --upgrade pip
pip install -r requirements.txt
echo.
echo Buoc 2: Cai dat moi truong Playwright Browser
playwright install chromium
echo.
echo Buoc 3: Khoi chay may chu FastAPI backend
echo Vui long mo trinh duyet truy cap: http://localhost:8000
echo =======================================================
python app.py
pause
