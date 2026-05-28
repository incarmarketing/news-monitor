# 인카금융서비스 PR 모니터링 툴

언론 기사 수집, AI 분류, 부정기사 감시, 카카오 알림톡, 통합 대시보드, 일일/주간/월간 보고서를 하나로 묶은 PR 운영 도구입니다. 이 GitHub 저장소의 `main` 브랜치가 곧 운영 기준이며, 어느 PC에서든 같은 브랜치를 받아 이어서 작업할 수 있습니다.

## 핵심 구조

```text
뉴스 수집 / AI 분석
        ↓
Supabase DB 저장
        ↓
GitHub Actions 자동 실행
        ↓
GitHub Pages 대시보드 / 보고서 배포
        ↓
카카오 알림톡 발송 및 발송 이력 저장
```

- 로컬 PC: 개발, 화면 확인, 수동 테스트용입니다.
- GitHub Actions: 정해진 시간의 수집/보고서/부정기사 감시를 실행합니다.
- cron-job.org: GitHub Actions 예약 지연을 줄이기 위해 workflow를 외부에서 깨우는 보조 클라우드 스케줄러입니다.
- Supabase: 기사, 키워드, 스크랩, 언론사 관리, 발송 이력, 부정기사 감시 로그를 저장합니다.
- GitHub Pages: 최신 대시보드와 보고서를 웹으로 보여줍니다.

## 운영 URL

- 통합 대시보드: `https://incarmarketing.github.io/news-monitor/dashboard.html`
- 최신 일일 보고서: `https://incarmarketing.github.io/news-monitor/`
- 주간 보고서: `https://incarmarketing.github.io/news-monitor/period_reports/weekly.html`
- 월간 보고서: `https://incarmarketing.github.io/news-monitor/period_reports/monthly.html`

## 자동 실행 기준

### 일일 보고서

GitHub Actions와 외부 cron이 한국시간 기준 08:00, 13:00, 18:00 보고서를 실행합니다.

- 08시 보고서: 전일 18:00부터 당일 08:00까지
- 13시 보고서: 당일 08:00부터 13:00까지
- 18시 보고서: 전일 18:00부터 당일 18:00까지의 일일 마감

### 부정기사 감시

부정기사 감시는 PC가 켜져 있는지와 관계없이 클라우드에서 동작해야 합니다.

- 실행 주기: 24시간, 5분마다
- 검사 범위: 매 실행 시 최근 5분 기사
- 실행 위치: GitHub Actions `Negative Article Watch`
- 실행 방식: 4시간마다 클라우드 러너를 띄우고, 러너 안에서 5분 간격으로 48회 실제 감시
- 보조 호출: cron-job.org `news-monitor negative watch`
- 저장 위치: Supabase `negative_watch_runs`, `.watch-state`

`minutes_back=5`는 “한 번 실행할 때 최근 5분을 본다”는 뜻이고, 실제 감시도 5분마다 수행되어야 합니다. 대시보드에 `실제 약 10분`처럼 보이면 최근 실행 기록이 아직 5분 간격으로 충분히 쌓이지 않았거나 감시 서비스가 중단된 상태입니다. 이때는 `Negative Article Watch` 최신 실행 로그에서 5분 간격 iteration이 이어지는지 확인합니다.

## 어느 PC에서든 이어서 작업하기

PowerShell에서 아래 순서로 시작합니다.

```powershell
cd C:\Users\user\OneDrive\Desktop\COWORK\news-monitor
git pull --ff-only origin main
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
. .\tools\dev-shell.ps1
python -m pip install -r requirements.txt
```

GitHub CLI 인증이 필요하면 한 번만 실행합니다.

```powershell
gh auth login
gh auth status
```

현재 작업을 다른 PC에서도 이어가려면 변경사항을 커밋하고 푸시합니다.

```powershell
git status
git add .
git commit -m "작업 내용 요약"
git push origin main
```

## GitHub Secrets

클라우드 운영에 필요한 키는 로컬 PC가 아니라 GitHub 저장소의 Settings > Secrets and variables > Actions에 저장합니다.

필수:

- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`
- `GEMINI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY` 또는 `SUPABASE_PUBLISHABLE_KEY`
- `KAKAO_REST_API_KEY`
- `KAKAO_REFRESH_TOKEN`

외부 cron 자동 동기화용:

- `CRONJOB_API_KEY`
- `GITHUB_DISPATCH_TOKEN`

이 두 값이 있으면 GitHub Actions의 `Sync External Cron`이 cron-job.org 작업을 클라우드에서 생성/갱신합니다. 그래서 특정 PC에 키가 있거나 특정 PC가 켜져 있어야 하는 구조가 아닙니다.

## 주요 GitHub Actions

- `News Briefing`: 기사 수집, AI 분석, 일일/주간/월간 보고서 생성, 대시보드 배포, 카카오 발송
- `Negative Article Watch`: 24시간 5분 단위 부정기사 감시. 예약은 4시간 단위지만, 실행된 클라우드 러너 안에서 5분 간격으로 48회 감시합니다.
- `Pages Dashboard`: GitHub Pages 배포
- `Sync External Cron`: cron-job.org 작업을 24시간 5분 기준으로 동기화

## 로컬 테스트

의존성 설치:

```powershell
python -m pip install -r requirements.txt
```

기사 수집/분석 1회 실행:

```powershell
python run_once.py
```

대시보드/보고서 생성:

```powershell
python publish_report.py
```

부정기사 감시 수동 실행:

```powershell
python negative_watch.py
```

외부 cron 설정 확인:

```powershell
python check_cronjob_org.py
```

## 보고서 출력 기준

통합 대시보드의 미디어 분석 리포트와 주간/월간 보고서는 사내 공유용 한장 보고서를 기준으로 관리합니다.

- 브라우저 인쇄 시 배경 그래픽을 켭니다.
- 통합 대시보드 분석 리포트는 A4 가로 한 장에 맞춰 출력되도록 print CSS가 적용되어 있습니다.
- 주간/월간 보고서는 핵심 지표, 동향 분석, 주요 근거 기사 중심으로 압축합니다.
- 출력물이 여러 장으로 밀리면 `templates/dashboard.html` 또는 `templates/period_report.html`의 `@media print` 영역을 우선 확인합니다.

## 문제 확인 순서

### 대시보드에 최신 기사나 13~18시 기사가 안 보일 때

1. GitHub Actions > `News Briefing` 최신 실행이 성공했는지 확인합니다.
2. Supabase `news_articles`에 해당 슬롯의 데이터가 저장됐는지 확인합니다.
3. `python publish_report.py`로 정적 대시보드를 다시 생성합니다.
4. 브라우저 캐시를 비우고 `dashboard.html`을 새로고침합니다.

### 부정기사 감시가 5분마다 아닌 것처럼 보일 때

1. GitHub Actions > `Negative Article Watch` 최신 실행 로그에서 `Negative watch iteration`과 `Negative watcher scanned`가 찍히는지 확인합니다.
2. GitHub Actions > `Sync External Cron`을 수동 실행합니다.
3. `python check_cronjob_org.py`에서 `negative-watch cadence=5min/24h OK`가 나오는지 확인합니다.
4. 대시보드의 `실제 약 n분` 표기가 5분대로 내려오는지 확인합니다.

### 특정 PC에서만 되는 것처럼 보일 때

로컬 `.env`에만 키가 있고 GitHub Secrets에 키가 없으면 클라우드 자동화가 깨집니다. 운영 키는 반드시 GitHub Secrets에 두고, 로컬 `.env`는 개발 테스트용으로만 사용합니다.

## 관련 문서

- `docs/PR_PLATFORM_BUILDUP.md`: PR 운영센터 제품 빌드업 기준서
- `GITHUB_ACTIONS_SETUP.md`: GitHub Actions 설정
- `EXTERNAL_CRON_SETUP.md`: cron-job.org 외부 호출 설정
- `SUPABASE_EDGE_FUNCTION_SETUP.md`: Supabase Edge Function 설정
- `KAKAO_LINK_SETUP.md`: 카카오 링크/알림 설정
- `HANDOFF.md`: 작업 인수인계 메모

## 발표용 요약

이 저장소는 단순 코드 저장소가 아니라 PR 모니터링 운영 툴입니다. 기사 수집부터 AI 분석, 부정기사 24시간 감시, 카카오 알림, 대시보드와 한장 보고서 배포까지 GitHub Actions와 Supabase 중심으로 클라우드에서 자동화합니다. 로컬 PC는 개발용이며, 실제 운영은 GitHub Secrets와 클라우드 워크플로가 담당합니다.
