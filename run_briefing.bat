@echo off
cd /d C:\Users\User\Desktop\COWORK\news-monitor
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
echo.>> logs\scheduler.log
echo ==================================================>> logs\scheduler.log
echo START %date% %time%>> logs\scheduler.log
python -u run_once.py >> logs\scheduler.log 2>&1
python -u kakao_report_send.py >> logs\scheduler.log 2>&1
echo EXIT_CODE %ERRORLEVEL%>> logs\scheduler.log
echo END %date% %time%>> logs\scheduler.log
