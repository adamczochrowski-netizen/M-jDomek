@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo MOJ DOMEK - wysylanie na GitHub
echo -------------------------------
if not exist "..\skrypty\dane_modelu.json" (
  echo Brak ..\skrypty\dane_modelu.json - uruchom najpierw ODSWIEZ.bat.
  pause
  exit /b 1
)
rem kopia aktualnych danych domu obok index.html - z niej korzysta wersja na GitHub Pages
copy /y "..\skrypty\dane_modelu.json" "dane_modelu.json" >nul
git add -A
git diff --cached --quiet
if errorlevel 1 (
  git commit -q -m "Aktualizacja danych domu"
) else (
  echo Nowych zmian nie ma - wysylam to, co jeszcze nie dotarlo na GitHub.
)
rem push takze wtedy, gdy commit jest juz zrobiony, a wczesniej nie dotarl (np. trzeba bylo sie zalogowac)
git push
if errorlevel 1 (
  echo.
  echo Nie udalo sie wyslac - przeczytaj komunikat powyzej.
  pause
  exit /b 1
)
echo.
echo Wyslane. Strona odswiezy sie za 1-2 minuty:
echo   https://adamczochrowski-netizen.github.io/M-jDomek/
pause
