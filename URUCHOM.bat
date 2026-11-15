@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Moj domek - podglad 3D
python serwer.py %*
if errorlevel 1 (
  echo.
  echo Cos poszlo nie tak - przeczytaj komunikat powyzej.
  echo Potrzebny jest Python ^(ten sam, ktorego uzywa ODSWIEZ.bat^).
)
pause
