@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 불만족 피드백 자동 판정

if "%~1"=="" (
  echo.
  echo   Metabase 내보내기 파일을 이 아이콘 위로 끌어다 놓으세요.
  echo.
  pause
  exit /b 1
)

where claude >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Claude Code가 설치되어 있지 않습니다. 설치 후 다시 실행하세요.
  echo   https://claude.com/claude-code
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo 처음 실행: 패키지 설치 중...
  call npm install --no-audit --no-fund
)

echo.
echo 판정 시작: %~nx1
echo 불만족 행만 골라 판정합니다. 50건 기준 10~15분 걸립니다. 이 창을 닫지 마세요.
echo.

claude -p "/판정 %~1" --permission-mode acceptEdits --allowedTools "Bash(node tools/judge/scripts/*)" "Read" "Write" "Edit" "Glob" "Grep" "Agent"

echo.
if exist "tools\judge\output\%~n1_판정.xlsx" (
  echo ======================================================
  echo  완료. 결과 파일: tools\judge\output\%~n1_판정.xlsx
  echo  열리는 대시보드 [데이터 조회] 업로드에 이 파일을 올리세요.
  echo ======================================================
  start "" "tools\judge\output"
  start "" "https://ai-satisfaction-dashboard.vercel.app/records"
) else (
  echo  결과 파일이 만들어지지 않았습니다. 위 메시지를 AI 전략팀에 전달해 주세요.
)
echo.
pause
