# 인카금융서비스 PR 모니터링 툴

언론 기사 수집, AI 분류, 부정기사 감시, 보도자료 작성, 카카오 알림톡, 통합 대시보드, 일일/주간/월간 보고서를 하나로 묶은 PR 운영 도구입니다.

이 저장소의 `main` 브랜치가 운영 기준입니다. 어느 PC에서든 `main`을 받아 작업을 이어갈 수 있고, GitHub Actions와 Supabase를 통해 PC가 꺼져 있어도 클라우드에서 수집, 분석, 알림, 보고서 배포가 이어지는 구조를 목표로 합니다.

## 운영 URL

- 통합 대시보드: `https://incarmarketing.github.io/news-monitor/dashboard.html`
- 최신 일일 보고서: `https://incarmarketing.github.io/news-monitor/`
- 주간 보고서: `https://incarmarketing.github.io/news-monitor/weekly.html`
- 월간 보고서: `https://incarmarketing.github.io/news-monitor/monthly.html`

## 현재 완성된 기능

- 네이버/구글 뉴스 기반 기사 수집
- 키워드, 카테고리, 언론사, 논조, 리스크 기준 분석
- Supabase DB 저장 및 대시보드 API 연동
- 대시보드 로그인/세션 보안
- 실시간 모니터링 피드
- 미디어 분석 리포트 및 인쇄/PDF 저장
- 리스크 대응센터와 언론 해명/사내 해명 초안 생성
- 보도자료 작성 화면
- 주요 기사 스크랩
- 언론사 관리, 기자 관리, 광고비 관리
- 카카오 알림톡 발송 및 발송 이력 확인
- 24시간 부정기사 감시
- 일일/주간/월간 한장 보고서
- GitHub Pages 자동 배포

## 전체 구조

```text
기사 수집
  news_collector.py
        ↓
AI/룰 기반 분석
  analyzer.py / ai_briefing.py / period_report.py
        ↓
공유 저장
  Supabase tables / Edge Functions
        ↓
자동 실행
  GitHub Actions / cron-job.org
        ↓
운영 화면
  GitHub Pages dashboard.html / reports
        ↓
알림
  KakaoTalk link message / notification history
```

- 로컬 PC는 개발, 테스트, 화면 확인용입니다.
- GitHub Actions는 실제 운영 실행자입니다.
- cron-job.org는 GitHub Actions 예약 지연을 줄이는 외부 호출 장치입니다.
- Supabase는 기사, 키워드, 스크랩, 언론사, 기자, 광고비, 발송 이력, 부정기사 감시 로그를 저장합니다.
- GitHub Pages는 최신 대시보드와 보고서를 보여줍니다.

## 처음부터 빌드업하는 순서

이 프로젝트를 처음부터 다시 만든다면 아래 순서로 쌓아 올립니다. 이 순서가 현재 저장소의 설계 기준입니다.

### 1. 저장소와 개발 환경 만들기

1. GitHub에 `news-monitor` 저장소를 만듭니다.
2. Python 프로젝트 기본 파일을 준비합니다.
3. `.env.example`, `requirements.txt`, `tools/dev-shell.ps1`, `tools/preflight.ps1`을 둡니다.
4. 로컬 실행 결과물은 Git에 올리지 않도록 `.gitignore`를 먼저 정합니다.

Git에 올리지 않는 대표 항목:

```text
.env
.venv/
data/
logs/
public/
.watch-state/
.run-state/
supabase/.temp/
```

### 2. 뉴스 수집 파이프라인 만들기

1. `config.py`에 기본 키워드와 API 설정을 둡니다.
2. `news_collector.py`에서 네이버/구글 뉴스 검색 결과를 수집합니다.
3. 중복 기사, 오래된 기사, 관계없는 기사를 제거합니다.
4. `브랜드평판`처럼 범위가 넓은 키워드는 단독 수집하지 않고 `보험대리점 브랜드평판`, `GA 브랜드평판`, `인카금융서비스 브랜드평판`처럼 맥락이 있는 검색어로 확장합니다.
5. 기사마다 제목, 링크, 언론사, 발행일, 키워드, 요약 원문을 표준 형태로 맞춥니다.

### 3. 분석 기준 만들기

1. `analyzer.py`에서 기사 카테고리를 나눕니다.
   - 당사
   - 정책/규제
   - 경쟁사
   - GA/보험사 동향
   - 기타
2. 논조를 나눕니다.
   - 긍정
   - 중립
   - 부정
3. 부정 단어, 정책 단어, 경쟁사 단어, 업계 단어를 분리합니다.
4. 당사 직접 부정, 업계 부정, 정책 리스크를 다르게 보이도록 점수를 조정합니다.
5. 같은 기사 묶음은 대표 기사 중심으로 클러스터링합니다.

### 4. 일일 보고서 만들기

1. `ai_briefing.py`에서 수집 기사와 분석 결과를 일일 보고서로 만듭니다.
2. `report_window.py`로 08시, 13시, 18시 보고 구간을 나눕니다.
3. `archiver.py`로 일일 결과를 보관합니다.
4. Supabase에는 슬롯별 `report_runs`, `news_articles`로 저장합니다.
5. 정적 HTML은 최신 보고서 링크용으로만 사용하고, 운영 데이터의 기준은 Supabase로 둡니다.

### 5. Supabase 저장소 만들기

마이그레이션은 `supabase/migrations`에 쌓습니다.

현재 주요 마이그레이션:

- `202605210001_add_monitor_keywords.sql`: 모니터링 키워드
- `202605210002_dashboard_persistence.sql`: 대시보드 기본 저장 테이블
- `202605270001_dashboard_employee_login.sql`: 사번 로그인
- `202605270002_dashboard_session_security.sql`: 세션 보안과 RLS 정리
- `202605270003_keyword_categories_and_shared_scraps.sql`: 키워드 카테고리와 공유 스크랩
- `202605270004_notifications_and_watch_runs.sql`: 알림 발송 이력과 부정기사 감시 로그
- `202605270006_negative_watch_five_minute_default.sql`: 부정기사 5분 감시 기본값

Supabase는 단순 DB가 아니라 이 툴의 운영 기억장치입니다. 로컬 브라우저 저장소에 중요한 데이터를 남기지 않고, 키워드/스크랩/언론사/발송 이력/감시 로그를 Supabase 기준으로 공유합니다.

### 6. 대시보드 만들기

1. `templates/dashboard.html`을 중심으로 통합 대시보드를 만듭니다.
2. `dashboard_builder.py`가 Supabase/아카이브 데이터를 화면에 넣을 형태로 정리합니다.
3. `publish_report.py`가 `public/dashboard.html`, `public/index.html`, `public/weekly.html`, `public/monthly.html`을 생성합니다.
4. 화면은 기능별 페이지로 나눕니다.
   - 통합 대시보드
   - 실시간 모니터링
   - 미디어 분석 리포트
   - 주요 기사 스크랩
   - 리스크 대응 센터
   - 보도자료 작성
   - 언론사 관리
   - 기자 관리
   - 광고비 관리
   - 환경 설정
5. 인쇄/PDF는 별도 print CSS 기준으로 검수합니다.

### 7. 보안과 API 경유 구조 만들기

1. `dashboard_users`에서 사번/권한을 관리합니다.
2. 로그인 성공 시 세션 토큰을 발급합니다.
3. 주요 테이블은 브라우저에서 직접 접근하지 않고 Supabase Edge Function을 거칩니다.
4. 현재 Edge Functions:
   - `dashboard-api`: 대시보드 읽기/쓰기와 세션 검증
   - `generate-risk-response`: 리스크 대응 초안 생성
   - `trigger-news-collection`: 대시보드에서 수집 실행 트리거
5. 민감한 키는 `.env`, GitHub Secrets, Supabase Function Secrets에만 둡니다.

### 8. 카카오 알림톡 연결하기

1. `kakao_token_setup.py`로 카카오 토큰을 발급합니다.
2. `KAKAO_REFRESH_TOKEN`과 `KAKAO_REST_API_KEY`를 GitHub Secrets에 저장합니다.
3. `kakao_report_send.py`로 일일 동향 링크를 발송합니다.
4. `kakao_period_send.py`로 주간/월간 링크를 발송합니다.
5. 발송 결과는 Supabase `notification_sends`에 저장합니다.
6. 대시보드에서 발송 시간, 성공 여부, 발송 본문을 확인합니다.

### 9. 클라우드 자동 실행 만들기

GitHub Actions는 `.github/workflows`에 있습니다.

- `news-briefing.yml`: 기사 수집, 일일 보고서, 주간/월간 보고서, 카카오 발송, Pages 배포
- `negative-watch.yml`: 24시간 부정기사 감시
- `pages-dashboard.yml`: 기존 아카이브 기준 정적 대시보드 배포
- `sync-external-cron.yml`: cron-job.org 외부 호출 설정 동기화

GitHub Actions의 `schedule`은 지연될 수 있습니다. 그래서 cron-job.org가 GitHub workflow를 직접 깨우도록 보조 장치를 둡니다.

### 10. 부정기사 감시 만들기

1. `negative_watch.py`는 최근 `minutes_back=5` 범위의 기사를 검사합니다.
2. GitHub Actions `Negative Article Watch`는 4시간마다 클라우드 러너를 띄웁니다.
3. 그 러너 안에서 5분 간격으로 48회 감시합니다.
4. cron-job.org의 `news-monitor negative watch`는 이 workflow를 5분마다 한 번 더 깨우는 보조 장치입니다.
5. 실행 결과는 Supabase `negative_watch_runs`에 저장합니다.
6. 대시보드에는 마지막 수행 시각, 상태, 최근 검사 결과만 간결하게 보여줍니다.

중요한 구분:

- `minutes_back=5`: 한 번 실행할 때 최근 5분 기사를 본다는 뜻
- 실행 주기 5분: 실제 감시가 5분마다 호출되어야 한다는 뜻

### 11. 주간/월간 보고서 만들기

1. `period_report.py`가 일일 아카이브와 Supabase 데이터를 모아 기간 보고서를 만듭니다.
2. 보고서는 제언 문서가 아니라 트래킹 문서입니다.
3. 핵심은 의사결정 또는 경과 확인입니다.
4. 긍정 추이를 과장하지 않고 부정 리스크, 기사량, 카테고리, 주요 근거 기사를 중심으로 정리합니다.
5. 인쇄/PDF는 A4 한 장 기준으로 맞춥니다.

### 12. 운영 UI를 제품처럼 다듬기

초기 화면이 기능 나열에 머물면 실제 업무에서 쓰기 어렵습니다. 그래서 아래 기준으로 계속 다듬습니다.

- 버튼 상태가 실제 선택 상태와 맞아야 합니다.
- 모바일에서 URL 입력, 기사 선택, 버튼 배치가 불편하면 우선 개선합니다.
- 불필요한 설명 문구는 줄이고, 상태는 짧게 보여줍니다.
- 보고서는 한 장에 들어가야 합니다.
- 그래프는 숫자만 나열하지 않고 비교와 우선순위가 보여야 합니다.
- 로컬 저장소에만 남는 데이터는 제거하고 Supabase 저장으로 옮깁니다.

## 최초 설치

### 1. 저장소 받기

```powershell
Set-Location -LiteralPath "$env:USERPROFILE\Desktop"
git clone https://github.com/incarmarketing/news-monitor.git
Set-Location -LiteralPath "$env:USERPROFILE\Desktop\news-monitor"
```

이미 받은 PC라면:

```powershell
git checkout main
git pull --ff-only origin main
```

### 2. 개발 셸 열기

PowerShell 실행 정책 때문에 스크립트가 막히면 현재 세션에서만 우회합니다.

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
. .\tools\dev-shell.ps1
```

또는 점검만 할 때:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\preflight.ps1
```

### 3. Python 의존성 설치

```powershell
python -m venv .venv
. .\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

### 4. GitHub CLI 인증

```powershell
gh auth login
gh auth status
```

## 환경변수와 Secrets

로컬 테스트용 키는 `.env`에 둡니다. 운영 자동화용 키는 GitHub 저장소의 `Settings > Secrets and variables > Actions`에 저장합니다.

필수:

```text
NAVER_CLIENT_ID
NAVER_CLIENT_SECRET
GEMINI_API_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_ANON_KEY 또는 SUPABASE_PUBLISHABLE_KEY
KAKAO_REST_API_KEY
KAKAO_REFRESH_TOKEN
```

외부 cron 동기화용:

```text
CRONJOB_API_KEY
GITHUB_DISPATCH_TOKEN
```

주의: `SUPABASE_SERVICE_ROLE_KEY`, `GITHUB_DISPATCH_TOKEN`, `KAKAO_REFRESH_TOKEN`, `GEMINI_API_KEY`는 코드, README, 채팅, 이슈에 붙여넣지 않습니다.

## 로컬 실행 명령

기사 수집/분석 1회 실행:

```powershell
python run_once.py
```

대시보드와 정적 보고서 생성:

```powershell
python publish_report.py
```

주간/월간 보고서 생성:

```powershell
python period_report.py weekly
python period_report.py monthly
```

부정기사 감시 수동 실행:

```powershell
python negative_watch.py
```

외부 cron 설정 확인:

```powershell
python check_cronjob_org.py
```

## 배포 프로세스

### 일반 코드 수정

```powershell
git status --short --branch
git add 수정한파일
git commit -m "작업 내용 요약"
git push origin main
```

푸시 후 확인:

```powershell
gh run list --limit 5
```

`Publish Dashboard` 또는 `AI News Briefing`이 성공하면 GitHub Pages에 반영됩니다.

### 다른 PC에서 이어서 작업

```powershell
git checkout main
git pull --ff-only origin main
powershell -ExecutionPolicy Bypass -File .\tools\preflight.ps1
```

작업 전에는 원격과 로컬이 같은지 확인하고, 작업 후에는 반드시 커밋/푸시합니다. 그래야 다른 PC에서도 이어서 작업할 수 있습니다.

## 자동 실행 기준

### 일일 보고서

한국시간 기준 08:00, 13:00, 18:00 보고서를 실행합니다.

- 08시 보고서: 전일 18:00부터 당일 08:00까지
- 13시 보고서: 당일 08:00부터 13:00까지
- 18시 보고서: 전일 18:00부터 당일 18:00까지의 일일 마감

### 주간/월간 보고서

- 주간 보고서: 월요일 07:00 KST 기준
- 월간 보고서: 매월 1일 07:00 KST 기준

### 부정기사 감시

- 운영 목표: 24시간 5분마다
- 검사 범위: 매 실행 시 최근 5분 기사
- 실행 위치: GitHub Actions와 cron-job.org
- 저장 위치: Supabase `negative_watch_runs`

## 품질 관리 기준

작업 후 아래를 우선 확인합니다.

```powershell
python -m py_compile news_collector.py analyzer.py dashboard_builder.py publish_report.py period_report.py ai_briefing.py
python publish_report.py
git diff --check
```

프론트엔드 변경 시 확인할 것:

- 데스크톱과 모바일에서 버튼 텍스트가 깨지지 않는가
- 선택된 버튼 색상이 실제 상태와 맞는가
- 인쇄/PDF 저장 시 예전 양식이 아니라 현재 리포트 양식이 나오는가
- 그래프가 너무 빈약하거나 여백만 많아 보이지 않는가
- 대시보드 데이터가 Supabase 최신 데이터와 맞는가

데이터 품질 변경 시 확인할 것:

- 관계없는 키워드가 대량 유입되지 않는가
- 당사 언급 기사와 부정 논조가 서로 잘못 섞이지 않는가
- `브랜드평판`처럼 광범위한 키워드는 보험/GA 맥락 없이는 제외되는가
- 08/13/18 슬롯 데이터가 덮어쓰기되지 않고 보존되는가

## 문제 해결 순서

### 대시보드에 최신 기사가 안 보일 때

1. GitHub Actions `AI News Briefing` 최신 실행이 성공했는지 봅니다.
2. Supabase `news_articles`에 해당 날짜/슬롯 데이터가 있는지 봅니다.
3. `Publish Dashboard`가 성공했는지 봅니다.
4. `dashboard.html?v=커밋해시`로 캐시를 우회해 확인합니다.

### 13~18시 기사가 반영되지 않을 때

1. `report_runs`에 18시 슬롯이 저장됐는지 확인합니다.
2. `news_articles`의 `report_slot` 값이 들어갔는지 확인합니다.
3. 정적 기간 보고서가 로컬 `data/daily/YYYY-MM-DD.json`만 보고 계산하는 구조인지 확인합니다.
4. 필요하면 Supabase 슬롯 기준으로 집계하도록 수정합니다.

### 부정기사 감시가 지연될 때

1. GitHub Actions `Negative Article Watch` 로그에서 5분 간격 iteration이 도는지 봅니다.
2. GitHub Actions `Sync External Cron`을 수동 실행합니다.
3. `python check_cronjob_org.py`로 `negative-watch cadence=5min/24h OK`가 나오는지 확인합니다.
4. 대시보드의 마지막 수행 시간이 5분대 안으로 돌아오는지 봅니다.

### 특정 PC에서만 되는 것처럼 보일 때

로컬 `.env`에만 키가 있고 GitHub Secrets에 없으면 클라우드 자동화가 깨집니다. 운영 키는 GitHub Secrets에 두고, 로컬 `.env`는 개발 테스트용으로만 둡니다.

## 유지보수 원칙

- `main`은 항상 운영 가능한 상태로 둡니다.
- 기능 추가 전 `git pull --ff-only origin main`을 먼저 실행합니다.
- 민감한 키는 절대 커밋하지 않습니다.
- 수집/분석/저장/표시/알림 중 어느 단계의 문제인지 먼저 분리합니다.
- 한 번에 너무 많은 파일을 고치지 않습니다.
- 대시보드 UI 변경은 실제 브라우저와 인쇄/PDF까지 확인합니다.
- 데이터 구조 변경은 Supabase 마이그레이션으로 남깁니다.
- 로컬 저장 기능은 새로 만들지 않고 Supabase 공유 저장을 기본으로 합니다.

## 주요 파일 안내

```text
news_collector.py          기사 수집과 1차 필터링
analyzer.py                카테고리, 논조, 리스크 분석
ai_briefing.py             일일 보고서 생성
period_report.py           주간/월간 보고서 생성
negative_watch.py          부정기사 24시간 감시
dashboard_builder.py       대시보드 데이터 구성
publish_report.py          public 정적 산출물 생성
templates/dashboard.html   통합 대시보드 UI
templates/period_report.html 주간/월간 보고서 템플릿
supabase/migrations        DB 구조 변경 이력
supabase/functions         Edge Functions
.github/workflows          클라우드 자동 실행
tools/preflight.ps1        작업 전 환경 점검
tools/dev-shell.ps1        개발 셸 진입
```

## 관련 문서

- `HANDOFF.md`: 다른 PC에서 이어서 작업하는 방법
- `GITHUB_ACTIONS_SETUP.md`: GitHub Actions와 Pages 기본 설정
- `EXTERNAL_CRON_SETUP.md`: cron-job.org 외부 호출 설정
- `SUPABASE_EDGE_FUNCTION_SETUP.md`: Supabase Edge Function 설정
- `KAKAO_LINK_SETUP.md`: 카카오 링크/알림 설정
- `docs/PR_PLATFORM_BUILDUP.md`: PR 운영센터 제품 빌드업 기준서

## 발표용 요약

이 프로젝트는 단순 기사 수집 스크립트가 아니라 PR 운영센터의 기반 툴입니다. 처음에는 기사 수집과 보고서 생성에서 출발했고, 이후 Supabase 저장, GitHub Actions 자동화, 카카오 알림, 부정기사 24시간 감시, 대시보드 로그인, 미디어 분석 리포트, 리스크 대응 초안, 보도자료 작성, 광고비/언론사/기자 관리까지 확장했습니다.

핵심은 로컬 PC에 의존하지 않는 클라우드형 운영 구조입니다. 로컬 PC는 개발과 확인용이고, 실제 운영은 GitHub Actions, Supabase, cron-job.org, GitHub Pages가 담당합니다. 그래서 이 저장소와 Secrets만 제대로 관리하면 어느 PC에서든 같은 툴을 이어서 만들고 운영할 수 있습니다.
