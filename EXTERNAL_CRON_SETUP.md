# 외부 Cron으로 GitHub Actions 호출하기

GitHub Actions의 `schedule`은 지연될 수 있으므로, 안정성이 더 필요한 실행은 외부 cron 서비스가 GitHub workflow를 직접 깨우는 방식으로 보완합니다. 현재 `Negative Article Watch`는 GitHub 클라우드 러너 안에서 5분마다 검사하고, 1시간 단위로 다음 실행을 직접 예약합니다. 지연이 생기면 Supabase의 마지막 성공 시각 이후 구간을 자동으로 보정 검사합니다. cron-job.org는 이 실행을 한 번 더 깨우는 보조 장치이고, Supabase Cron은 cron-job.org까지 늦어질 때 DB 내부에서 마지막으로 감시 상태를 확인하는 백업입니다.

## 1. GitHub 토큰 만들기

1. GitHub 우측 상단 프로필 > Settings
2. Developer settings > Personal access tokens > Fine-grained tokens
3. Generate new token
4. Repository access: `your-github-id/your-repo`만 선택
5. Permissions
   - Actions: Read and write
   - Contents: Read-only
6. 생성된 토큰을 복사합니다.

주의: 이 토큰은 외부 cron 서비스에 입력되므로, 저장 후 노출되지 않게 관리해야 합니다.

## 1-1. 클라우드에서 자동 등록하기

로컬 PC에 키를 두고 실행하지 않으려면 GitHub 저장소의 Settings > Secrets and variables > Actions에 아래 두 값을 저장합니다.

- `CRONJOB_API_KEY`: cron-job.org API key
- `CRON_DISPATCH_TOKEN`: GitHub fine-grained token

그 다음 GitHub Actions > `Sync External Cron` > Run workflow를 실행합니다. 이 워크플로는 GitHub 클라우드 러너에서 `setup_cronjob_org.py`를 실행하므로 어느 PC가 켜져 있는지와 무관하게 cron-job.org 작업을 생성/갱신합니다. 이후에는 매일 한 번 같은 설정을 다시 확인합니다.

로컬에서 수동으로 확인해야 할 때만 아래처럼 실행합니다.

```powershell
$env:CRONJOB_API_KEY="cron-job.org API key"
$env:CRON_DISPATCH_TOKEN="GitHub fine-grained token"
python setup_cronjob_org.py
```

이 스크립트는 아래 작업을 자동 생성하거나, 같은 제목의 작업이 이미 있으면 업데이트합니다.

- `news-monitor negative watch`
- `news-monitor daily 08`
- `news-monitor daily 13`
- `news-monitor daily 18`
- `news-monitor weekly report`
- `news-monitor monthly report`

cron-job.org API key는 cron-job.org Console > Settings에서 생성합니다. cron-job.org 공식 문서에 따르면 API는 `Authorization: Bearer <API_KEY>` 방식으로 인증하며, 요청 payload는 JSON으로 보냅니다.

## 2. 부정기사 24시간 5분 감지 호출

외부 cron 서비스에서 아래 요청을 24시간 내내 5분마다 실행할 수 있습니다. 기본 GitHub Actions는 러너 내부에서 5분마다 검사하고, 다음 러너를 이어서 예약합니다. hourly schedule은 체인이 끊겼을 때 복구하는 안전장치입니다. `negative_watch.py`는 기본적으로 24/7로 동작하며 DB에는 보통 `minutes_back=5`로 기록합니다. 단, 실행 지연이 발생하면 마지막 성공 시각 이후를 보정하기 위해 `minutes_back`이 자동으로 커질 수 있습니다.

- Method: `POST`
- URL:

```text
https://api.github.com/repos/your-github-id/your-repo/actions/workflows/negative-watch.yml/dispatches
```

- Headers:

```text
Accept: application/vnd.github+json
Authorization: Bearer <GITHUB_TOKEN>
X-GitHub-Api-Version: 2022-11-28
Content-Type: application/json
```

- Body:

```json
{"ref":"main"}
```

권장 cron:

```text
*/5 * * * *
```

`setup_cronjob_org.py`를 실행하면 `news-monitor negative watch` 작업이 cron-job.org에서 매일 00:00~23:59 KST, 5분 단위로 생성/업데이트됩니다. 적용 후에는 `check_cronjob_org.py`로 minutes 값이 `[0, 5, 10, ..., 55]`, hours 값이 `[0, 1, ..., 23]`인지 확인합니다.

대시보드의 `검사 범위 5분`은 한 번 실행될 때 몇 분 전 기사까지 검사하는지 의미합니다. `감시 서비스 확인 필요`가 보이면 Supabase `negative_watch_runs`의 최신 기록이 12분 이상 늦어진 상태입니다. 이 경우 GitHub Actions의 `Negative Article Watch` 실행 목록을 먼저 확인하고, GitHub Secrets에 `CRONJOB_API_KEY`, `CRON_DISPATCH_TOKEN`이 있으면 `Sync External Cron`을 다시 실행합니다. 동시에 Supabase `cron.job`의 `news-monitor-supabase-watchdog` 작업이 active인지 확인합니다.

## 2-1. Supabase Cron 보조 백업

Supabase Cron은 `pg_cron`과 `pg_net`으로 Edge Function을 호출합니다. 이 저장소의 백업 작업 이름은 `news-monitor-supabase-watchdog`이며 5분마다 실행됩니다.

- 호출 대상: `trigger-news-collection` Edge Function의 `watchdog` 액션
- 실행 주기: `*/5 * * * *`
- 인증값 저장: Supabase Vault의 `news_monitor_project_url`, `news_monitor_publishable_key`
- 실제 동작: 일일 보고서, 주간/월간 보고서, 부정기사 감시가 늦어진 경우에만 GitHub Actions를 다시 dispatch

처음 연결하는 프로젝트에서는 마이그레이션 적용 전에 Supabase Vault에 아래 값을 저장합니다. 값 자체는 저장소에 커밋하지 않습니다.

```sql
select vault.create_secret('<SUPABASE_PROJECT_URL>', 'news_monitor_project_url');
select vault.create_secret('<SUPABASE_PUBLISHABLE_KEY>', 'news_monitor_publishable_key');
```

설치/갱신 SQL은 `supabase/migrations/20260531070408_supabase_watchdog_cron.sql`에 있습니다. 적용 후 확인 쿼리는 아래와 같습니다.

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname = 'news-monitor-supabase-watchdog';

select jobid, runid, status, start_time, end_time
from cron.job_run_details
where jobid = (
  select jobid from cron.job where jobname = 'news-monitor-supabase-watchdog'
)
order by start_time desc
limit 5;
```

## 3. 일일 보고서 호출

외부 cron 서비스에서 아래 URL을 호출합니다.

- Method: `POST`
- URL:

```text
https://api.github.com/repos/your-github-id/your-repo/actions/workflows/news-briefing.yml/dispatches
```

- Headers는 위와 동일합니다.

### 08:00 보고서

```json
{
  "ref": "main",
  "inputs": {
    "period_reports": "none",
    "send_kakao": "true",
    "report_slot": "08"
  }
}
```

### 13:00 보고서

```json
{
  "ref": "main",
  "inputs": {
    "period_reports": "none",
    "send_kakao": "true",
    "report_slot": "13"
  }
}
```

### 18:00 보고서

```json
{
  "ref": "main",
  "inputs": {
    "period_reports": "none",
    "send_kakao": "true",
    "report_slot": "18"
  }
}
```

권장 cron:

```text
0 23 * * 0-4   # KST 08:00, UTC 23:00 전일
0 4 * * 1-5    # KST 13:00
0 9 * * 1-5    # KST 18:00
```

외부 cron 서비스가 KST 시간대를 지원하면 각각 `08:00`, `13:00`, `18:00` 평일로 설정하면 됩니다.

## 4. 주간/월간 보고서 호출

주간 보고서는 매주 월요일 07:00 KST, 월간 보고서는 매월 1일 07:00 KST에 호출합니다.

### 주간 보고서

```json
{
  "ref": "main",
  "inputs": {
    "period_reports": "weekly",
    "send_kakao": "true",
    "report_slot": "auto"
  }
}
```

### 월간 보고서

```json
{
  "ref": "main",
  "inputs": {
    "period_reports": "monthly",
    "send_kakao": "true",
    "report_slot": "auto"
  }
}
```

## 5. 추천 운영 방식

- GitHub Actions `schedule`은 백업으로 유지합니다.
- 외부 cron을 주 트리거로 사용합니다.
- 외부 cron이 실패해도 GitHub 자체 schedule이 한 번 더 시도합니다.
- 중복 발송은 `.run-state`, `.watch-state`, Supabase `notification_sends.dedupe_key` 기록으로 막습니다.
- 지난 월 보고서를 수동 발행할 때는 `news-briefing.yml`의 `period_reports=monthly`, `report_month=YYYY-MM` 입력을 사용합니다.

## 6. 사용할 만한 외부 cron 서비스

- cron-job.org: 무료로 시작하기 좋고 HTTP POST 설정 가능
- EasyCron: 설정이 직관적이며 실패 알림 기능 제공
- UptimeRobot: 단순 ping/HTTP 호출에 적합
- Cronitor: 모니터링과 알림까지 강화하고 싶을 때 적합

초기에는 `cron-job.org`로 충분합니다.
