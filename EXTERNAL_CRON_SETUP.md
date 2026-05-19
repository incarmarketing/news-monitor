# 외부 Cron으로 GitHub Actions 호출하기

GitHub Actions의 `schedule`은 지연될 수 있으므로, 안정성이 더 필요한 실행은 외부 cron 서비스가 GitHub workflow를 직접 깨우는 방식으로 보완합니다.

## 1. GitHub 토큰 만들기

1. GitHub 우측 상단 프로필 > Settings
2. Developer settings > Personal access tokens > Fine-grained tokens
3. Generate new token
4. Repository access: `incarmarketing/news-monitor`만 선택
5. Permissions
   - Actions: Read and write
   - Contents: Read-only
6. 생성된 토큰을 복사합니다.

주의: 이 토큰은 외부 cron 서비스에 입력되므로, 저장 후 노출되지 않게 관리해야 합니다.

## 2. 부정기사 10분 감지 호출

외부 cron 서비스에서 아래 요청을 10분마다 실행합니다.

- Method: `POST`
- URL:

```text
https://api.github.com/repos/incarmarketing/news-monitor/actions/workflows/negative-watch.yml/dispatches
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
*/10 * * * *
```

감시 스크립트 안에서 평일 07:00~18:59 KST만 실제 감지하고, 그 외 시간에는 조용히 종료합니다.

## 3. 일일 보고서 호출

외부 cron 서비스에서 아래 URL을 호출합니다.

- Method: `POST`
- URL:

```text
https://api.github.com/repos/incarmarketing/news-monitor/actions/workflows/news-briefing.yml/dispatches
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
- 중복 발송은 `.run-state`, `.watch-state` 기록으로 막습니다.

## 6. 사용할 만한 외부 cron 서비스

- cron-job.org: 무료로 시작하기 좋고 HTTP POST 설정 가능
- EasyCron: 설정이 직관적이며 실패 알림 기능 제공
- UptimeRobot: 단순 ping/HTTP 호출에 적합
- Cronitor: 모니터링과 알림까지 강화하고 싶을 때 적합

초기에는 `cron-job.org`로 충분합니다.
