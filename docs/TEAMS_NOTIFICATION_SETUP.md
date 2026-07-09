# Microsoft Teams 추가 발송 설정

Slack 발송은 그대로 유지하고, Microsoft Teams를 추가 발송 채널로 붙이는 설정입니다.
Teams Secret이 없으면 기존처럼 Slack만 발송됩니다.

## GitHub Secrets

GitHub 저장소에서 아래 위치로 이동합니다.

`Settings > Secrets and variables > Actions > New repository secret`

필요한 Secret은 다음과 같습니다.

| Secret | 용도 |
| --- | --- |
| `TEAMS_REPORT_WEBHOOK_URL` | 일일, 주간, 월간 보고서 Teams 발송 |
| `TEAMS_ALERT_WEBHOOK_URL` | 부정/주의 기사 감시 알림 Teams 발송 |
| `TEAMS_WEBHOOK_URL` | 전용 URL이 없을 때 쓰는 공통 fallback |

권장 구성은 보고서 채널과 긴급 알림 채널을 분리하는 것입니다.

- 보고서 채널: `TEAMS_REPORT_WEBHOOK_URL`
- 긴급 알림 채널: `TEAMS_ALERT_WEBHOOK_URL`

## 동작 방식

1. Slack 발송은 기존과 동일하게 먼저 실행됩니다.
2. Teams Secret이 있으면 같은 보고서를 Teams Adaptive Card로 추가 발송합니다.
3. Teams 발송 성공/실패는 Supabase `notification_sends`에 `channel=teams`로 기록합니다.
4. Teams 발송에 실패해도 Slack 성공 기록은 유지합니다. Teams 실패는 별도 이력으로만 남깁니다.

## Teams 메시지 구성

Teams에는 Adaptive Card 형태로 발송됩니다.

- 보고서 제목
- 기준 구간
- 리스크, 분석, 긍정, 중립, 부정 지표
- 핵심 이슈 헤드라인
- 보고서 열기 버튼
- 대시보드 버튼

## 테스트 방법

GitHub Actions에서 `AI News Briefing` 워크플로우를 실행합니다.

1. `Generate period report preview`: `none`
2. `Send Slack notification`: 체크
3. `Force resend`: 필요 시 체크
4. `Daily report slot`: `08`, `13`, `18` 중 선택

Teams Secret이 등록되어 있으면 Slack과 Teams가 같이 발송됩니다.
