# GitHub Actions 운영 설정

이 프로젝트의 운영 기준은 GitHub Actions, cron-job.org, Supabase, GitHub Pages, Slack입니다. PC가 꺼져 있어도 GitHub 서버에서 뉴스 수집, 보고서 생성, Pages 배포, Slack 발송이 진행됩니다.

## 1. GitHub Secrets

저장소 `Settings > Secrets and variables > Actions > New repository secret`에서 아래 값을 등록합니다.

필수:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_ANON_KEY 또는 SUPABASE_PUBLISHABLE_KEY
SLACK_WEBHOOK_URL
SLACK_REPORT_WEBHOOK_URL
SLACK_ALERT_WEBHOOK_URL
CRON_DISPATCH_TOKEN
```

Supabase Edge Function에도 별도로 `GITHUB_DISPATCH_TOKEN`을 등록합니다. 이 값은 Supabase 보강 감시가 GitHub Actions를 다시 호출할 때 사용합니다. GitHub 저장소의 `CRON_DISPATCH_TOKEN`과 용도와 저장 위치가 다르며, 토큰을 재발급하면 두 위치를 각각 갱신해야 합니다.

선택:

```text
GEMINI_API_KEY
GROQ_API_KEY
NAVER_CLIENT_ID
NAVER_CLIENT_SECRET
DART_API_KEY
DART_CORP_CODE
```

OpenDART 공시 자동 수집을 사용하려면 `DART_API_KEY`를 반드시 **GitHub 저장소 Actions Secret**에 등록해야 합니다. Supabase Edge Function Secret에 같은 이름이나 `DART`로 저장한 값은 GitHub Actions에서 읽을 수 없습니다.

- 등록 위치: `https://github.com/incarmarketing/news-monitor/settings/secrets/actions`
- 필수: `DART_API_KEY`
- 선택: `DART_CORP_CODE` (미등록 시 인카금융서비스 코드 `01013694` 사용)

화면에 `OpenDART 키 설정 필요`가 계속 표시되면 GitHub Actions Secret의 `DART_API_KEY` 존재 여부를 확인한 뒤 `Deploy Dashboard to GitHub Pages`를 다시 실행합니다. 이전 정적 JSON에 남은 경고는 새 배포가 완료되어야 사라집니다.

## 2. GitHub Pages

1. 저장소 `Settings > Pages`로 이동합니다.
2. `Build and deployment > Source`를 `GitHub Actions`로 설정합니다.
3. 보고서 URL은 기본적으로 `https://incarmarketing.github.io/news-monitor/`를 사용합니다.

## 3. 주요 Workflow

- `news-briefing.yml`: 일일, 주간, 월간 보고서 생성과 Slack 발송
- `negative-watch.yml`: 부정/주의 기사 10분 단위 감시
- `pages-dashboard.yml`: 대시보드와 보고서 Pages 배포
- `sync-external-cron.yml`: cron-job.org 외부 호출 설정 동기화
- `regulator-releases.yml`: 금융당국 보도자료 수집

## 4. 발송 기준

일일 보고서는 08:00, 13:00, 18:00 KST 기준으로 생성합니다. cron-job.org가 1차 호출을 담당하고, GitHub Actions schedule은 각 기준 시각 15분 뒤 fallback으로 동작합니다.

Supabase Cron은 정규 호출과 겹치지 않도록 매시 05, 15, 25, 35, 45, 55분에 상태만 확인합니다. 보고서는 기준 시각 40분 이후에도 생성과 Slack 성공 기록이 없을 때만 최종 복구를 요청하며, GitHub가 요청을 접수한 뒤에는 30분 동안 같은 요청을 다시 보내지 않습니다.

중복 발송은 Supabase `notification_sends`, `job_runs`, `report_runs`와 `.run-state` 마커를 함께 확인해 막습니다. 수동 재발송이 필요하면 GitHub Actions `Run workflow`에서 `Force resend`를 켭니다.

## 5. 장애 확인 순서

1. Slack 채널에 메시지가 왔는지 확인합니다.
2. Supabase `notification_sends`에서 `channel=slack`, `status=success` 기록을 확인합니다.
3. Supabase `job_runs`에서 해당 슬롯의 `daily_report:YYYY-MM-DD:HH` 또는 `daily_report:YYYY-MM-DD:HH:generated` 기록을 확인합니다.
4. GitHub Actions `AI News Briefing` 실행 로그에서 `Send Slack report link` 단계를 확인합니다.
5. 보고서 링크가 오래된 화면이면 `Deploy to GitHub Pages` 완료 여부를 확인합니다.
6. `github_dispatch_failed_401`이면 Supabase Edge Function Secret의 `GITHUB_DISPATCH_TOKEN`이 만료된 것입니다. 새 토큰으로 교체한 뒤 보강 감시를 다시 실행합니다.

## 6. Legacy

카카오 발송 스크립트는 현재 운영 경로가 아닙니다. 필요할 때만 수동 확인용으로 사용하고, 운영 발송 이력은 Slack 기준으로 관리합니다.
