@echo off
set "nodePath=C:\Users\FairRide\AppData\Local\Temp\nodejs\node-v24.15.0-win-x64"
set "PATH=%nodePath%;%PATH%"
cd /d "C:\Users\FairRide\OneDrive\Desktop\GROOVE LAB\WEBSITE"
echo Starting Groove Lab server...
start http://localhost:3000
node server.js
pause
