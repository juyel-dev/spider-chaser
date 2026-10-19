@echo off
rem Builds publish\spider-chaser-<version>.zip (the file you upload to the Chrome Web Store / Edge Add-ons).
rem Needs Node.js (to read the version) and Windows 10+ (tar). Double-click to run.
cd /d "%~dp0"
for /f %%v in ('node -p "require('../spider-chaser/manifest.json').version"') do set VER=%%v
if exist "spider-chaser-%VER%.zip" del "spider-chaser-%VER%.zip"
tar -a -c -f "spider-chaser-%VER%.zip" -C ..\spider-chaser manifest.json content.js popup.html popup.css popup.js icons
echo Built spider-chaser-%VER%.zip
dir "spider-chaser-%VER%.zip" | find "spider-chaser"
pause
