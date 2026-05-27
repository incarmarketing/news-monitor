# News Monitor Handoff

이 문서는 다른 PC에서도 같은 작업을 이어가기 위한 기준 문서입니다. 저장소에는 소스와 설정 절차만 보관하고, API 키와 토큰은 `.env` 또는 GitHub/Supabase Secret에만 보관합니다.

## 현재 기준

- 저장소: `https://github.com/incarmarketing/news-monitor.git`
- 기본 브랜치: `main`
- 최신 확인 커밋: `cc1e25c`
- 주요 작업 흐름: 대시보드 로그인/세션 보안, Supabase Edge Function, 카카오 브리핑, 5분 단위 부정기사 감지, 대시보드 UI 개선

## 집 PC에서 이어가기

1. Git이 설치되어 있는지 확인합니다.

   ```powershell
   git --version
   ```

2. 저장소를 처음 받는 PC라면 클론합니다.

   ```powershell
   Set-Location -LiteralPath "$env:USERPROFILE\Desktop"
   git clone https://github.com/incarmarketing/news-monitor.git
   Set-Location -LiteralPath "$env:USERPROFILE\Desktop\news-monitor"
   ```

3. 이미 받은 저장소라면 최신 상태로 맞춥니다.

   ```powershell
   git checkout main
   git pull --ff-only origin main
   ```

4. PowerShell 실행 정책 때문에 스크립트가 막히면 아래 방식으로 실행합니다.

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\tools\preflight.ps1
   ```

5. 개발용 셸을 엽니다. 이 명령은 현재 PowerShell 세션에 portable Git/GitHub CLI/Supabase CLI 경로와 `.venv`를 잡아줍니다.

   ```powershell
   . .\tools\dev-shell.ps1
   ```

6. 새 작업은 가능하면 별도 브랜치에서 시작합니다.

   ```powershell
   git checkout -b codex/task-name
   ```

## 토큰과 키 관리

아래 파일과 폴더는 Git에 올리지 않습니다.

- `.env`
- `public/`
- `data/`
- `logs/`
- `.venv/`
- `supabase/.temp/`

집 PC에서 실제 실행까지 하려면 `.env`는 직접 만들어야 합니다. 저장소에 토큰을 올리지 않는 것이 정상입니다.

필요한 대표 환경변수:

```text
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
GEMINI_API_KEY=
KAKAO_REST_API_KEY=
KAKAO_REFRESH_TOKEN=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GITHUB_TOKEN=
CRONJOB_API_KEY=
```

주의: `SUPABASE_SERVICE_ROLE_KEY`, `GITHUB_TOKEN`, `KAKAO_REFRESH_TOKEN`, `GEMINI_API_KEY`는 외부에 공유하면 안 됩니다. 코드나 문서에 붙여넣지 말고 `.env`, GitHub Actions Secrets, Supabase Function Secrets에만 넣습니다.

## 현재 보안 구조

- 대시보드 로그인은 Supabase `dashboard_users` 기준입니다.
- `1611499` 계정은 `admin` 권한입니다.
- 로그인 성공 시 12시간 세션 토큰을 발급합니다.
- 주요 데이터는 브라우저에서 Supabase 테이블을 직접 읽지 않고 `dashboard-api` Edge Function을 통해 접근합니다.
- `anon`의 주요 테이블 직접 접근은 차단했습니다.
- 정적 `articles.json`에는 기사 데이터를 공개하지 않습니다.

## 작업 전 점검

```powershell
git status --short --branch
powershell -ExecutionPolicy Bypass -File .\tools\preflight.ps1
```

정상이라면 `main vs origin/main`이 OK이고, `.env file`이 OK로 나와야 실제 API 실행까지 가능합니다.

## 작업 후 반영

```powershell
git status --short
git add .
git commit -m "작업 내용 요약"
git push -u origin 현재브랜치명
```

`main`에 직접 올릴 때는 현재 작업트리가 깨끗하고 원격과 충돌이 없는지 먼저 확인합니다.

## 다음 보완 후보

- `generate-risk-response`도 대시보드 세션 검증 경유로 통합
- 기존 `trigger-news-collection` 공개 호출 구조 제거 또는 세션 검증 적용
- `supabase_schema.sql`을 최신 보안 마이그레이션 기준으로 정리
- 사용자 관리 화면 추가: 계정 추가, 비활성화, 비밀번호 변경, 권한 변경
- 로그인 이력/실패 이력 관리자 화면 추가
