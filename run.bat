@echo off
title Dota 2 SkinForge — Cosmetic Suite
cd /d "%~dp0"
echo Cleaning up existing instances...
taskkill /F /IM electron.exe >nul 2>&1
echo Starting Dota 2 SkinForge...
npm start
