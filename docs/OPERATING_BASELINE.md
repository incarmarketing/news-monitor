# 인카 모니터링 시스템 운영 기준

이 문서는 개선점 검토 때 이미 반영된 항목을 다시 신규 개선점으로 제안하지 않기 위한 현재 기준표입니다.

## 알림과 감시

- 기본 부정기사 감시 주기: 24시간, 10분 기준
- 기본 검사 범위: `minutes_back=10`
- 부정기사 감시 workflow: `.github/workflows/negative-watch.yml`
- 감시 실행 코드: `negative_watch.py`
- 감시 로그 테이블: `negative_watch_runs`
- 최신 운영 문구: `10분 주기`, `검사 10분`

## 발송 채널

- 기본 발송 채널: Slack
- 발송 이력 테이블: `notification_sends`
- Kakao 발송 코드는 삭제하지 않고 `legacy/kakao/`에 격리

## 보고서 구조

- 프론트 리포트 UI: `frontend/src/reportComponents.jsx`
- 리포트 계산 모델: `frontend/src/reportModel.js`
- 리포트 전용 스타일: `frontend/src/report.css`

## 점검 원칙

- 개선점 보고 시 `이미 반영된 기준`, `남은 결함`, `신규 제안`을 분리한다.
- 단순 잔존 문구 정리는 신규 기능 개선으로 보고하지 않는다.
- 운영 기준과 충돌하는 문구는 코드 검색으로 먼저 확인한다.
