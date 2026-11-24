@echo off
title California Housing ML GUI Server
cd /d "%~dp0"

echo ==========================================================
echo   California Housing Price Prediction - ML GUI
echo   Source Model: house_predict_model.ipynb
echo ==========================================================
echo.
echo [1/2] Starting local Python server...
echo [2/2] Opening GUI at http://localhost:5000 in your browser...
echo.

timeout /t 2 /nobreak > nul
start http://localhost:5000

python app.py

pause
