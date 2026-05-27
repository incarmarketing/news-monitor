# News Monitor Handoff

이 문서는 어느 PC에서 작업하더라도 같은 상태에서 이어가기 위한 작업 기준입니다.

## 현재 기준점

- 저장소: `https://github.com/incarmarketing/news-monitor.git`
- 기본 브랜치: `main`
- 확인된 기준 커밋: `795bf94d622ab59670c37c3072b336ed7bf1d994`
- 현재 로컬 `main`과 `origin/main`은 같은 커밋을 가리킵니다.
- 최신 작업 흐름: 대시보드 로그인/세션 보안, Supabase Edge Function, 브리핑 구간 정리.

## PC를 바꿔 작업하기 전 체크

1. Git이 설치되어 있고 PATH에서 실행되는지 확인합니다.

   ```powershell
   git --version
   ```

2. 작업 시작 전에 원격 최신 상태를 받습니다.

   ```powershell
   git checkout main
   git pull --ff-only origin main
   ```

3. 기능 작업은 가능하면 별도 브랜치에서 시작합니다.

   ```powershell
   git checkout -b codex/작업이름
   ```

4. Python 환경과 설정을 확인합니다.

   ```powershell
   python --version
   pip install -r requirements.txt
   .\tools\preflight.ps1
   ```

5. `.env`는 Git에 올리지 않습니다. 새 PC에서는 `.env.example`을 복사한 뒤 키를 직접 넣습니다.

## 작업을 마칠 때

1. 변경 내용을 확인합니다.

   ```powershell
   git status --short
   ```

2. 작업 요약을 이 문서의 "작업 메모"에 한 줄 남깁니다.

3. 커밋하고 원격에 올립니다.

   ```powershell
   git add .
   git commit -m "작업 내용 요약"
   git push -u origin 현재브랜치명
   ```

4. 다른 PC에서는 다시 `git pull --ff-only origin main` 또는 작업 브랜치를 checkout 해서 이어갑니다.

## 이 PC에서 확인된 주의점

- Git은 portable 방식으로 `C:\Users\user\AppData\Local\Programs\news-monitor-tools\mingit\cmd`에 설치했습니다.
- GitHub CLI는 `C:\Users\user\AppData\Local\Programs\news-monitor-tools\gh\bin`에 설치했습니다.
- Supabase CLI는 `C:\Users\user\AppData\Local\Programs\news-monitor-tools\supabase`에 설치했습니다.
- Python 3.13.10은 `C:\Users\user\AppData\Local\Programs\Python\Python313`에 사용자 설치했습니다.
- 새 터미널에서 PATH가 바로 반영되지 않으면 `. .\tools\dev-shell.ps1`을 먼저 실행합니다.
- 프로젝트 Python 환경은 `.venv`에 만들었고 `requirements.txt` 설치까지 완료했습니다.
- 전역 `python` PATH가 바로 보이지 않으면 새 PowerShell을 열거나 `. .\tools\dev-shell.ps1`을 사용합니다.
- `kakao_report_image_send.py`는 `DEFAULT_LINK` import 문제와 `playwright` 의존성 누락이 있어 이미지 전송 기능 사용 전 수정이 필요합니다.
- 최신 보안 방향은 `supabase/functions/dashboard-api`와 `supabase/migrations/202605270002_dashboard_session_security.sql` 기준입니다.
- 루트 `supabase_schema.sql`에는 과거 anon 쓰기 정책이 남아 있어 새 Supabase에 단독 적용하지 않도록 주의합니다.

## 다음 작업 후보

- `generate-risk-response` Edge Function도 대시보드 세션 검증 뒤로 이동.
- 예전 `trigger-news-collection` Edge Function 제거 또는 세션 검증 적용.
- `supabase_schema.sql`을 최신 보안 마이그레이션 기준으로 정리.
- `kakao_report_image_send.py` import/의존성 정리.
- README의 18시 보고서 설명과 `report_window.py` 실제 동작 일치.

## 작업 메모

- 2026-05-27: 이 PC에서 이어 작업하기 전, 동기화/인수인계 기준 문서와 preflight 스크립트 추가.
- 2026-05-27: portable Git 설치, `.venv` 생성, Python 의존성 설치, dev-shell 스크립트 추가.
- 2026-05-27: Supabase CLI standalone 설치.
- 2026-05-27: GitHub CLI standalone 설치.
- 2026-05-27: Python 3.13.10 사용자 설치.
