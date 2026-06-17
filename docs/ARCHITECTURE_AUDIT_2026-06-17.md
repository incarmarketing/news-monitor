# 인카 모니터링 시스템 구조 점검 메모

점검일: 2026-06-17

## 1. 현재 운영 구조

현재 운영 기준 코드는 GitHub `main`과 로컬 `feature/stock-market-dashboard`가 같은 커밋을 가리키고 있다.

핵심 운영 흐름은 다음과 같다.

1. GitHub Actions `news-briefing.yml`
   - 5분 간격 watchdog 방식으로 실행된다.
   - `schedule_guard.py`가 실제 발송 슬롯을 판단한다.
   - 일일 보고서는 `run_once.py` -> `news_collector.py` -> `analyzer.py` -> `ai_briefing.py` -> `publish_report.py` -> `slack_notify.py` 순서로 처리된다.
   - 주간/월간 보고서는 `period_report.py`에서 생성하고 Slack 링크를 발송한다.

2. GitHub Actions `negative-watch.yml`
   - 10분 간격으로 부정/주의 후보를 감시한다.
   - 신규 리스크가 있으면 Slack 발송과 대시보드 갱신을 유도한다.

3. GitHub Actions `pages-dashboard.yml`
   - React 대시보드를 빌드하고 GitHub Pages에 배포한다.
   - Supabase 데이터를 읽어 `public/data/articles.json` 등 정적 스냅샷을 만든다.
   - 금융당국 보도자료, GA 경쟁사 지표, 주가/공시 데이터도 이 단계에서 보강된다.

4. Supabase
   - 운영 원장 역할을 한다.
   - 주요 테이블은 `news_articles`, `monitor_keywords`, `monitor_context_rules`, `classification_feedback`, `notification_sends`, `job_runs`, `article_scraps`, `ga_*` 계열 테이블이다.

5. React 대시보드
   - 현재 실제 운영 UI는 `frontend/src/main.jsx`와 `frontend/src/liveData.js`가 중심이다.
   - `templates/dashboard.html`은 구형 대시보드 또는 fallback 성격이 강하다.

## 2. 레거시/정리 후보

아래 항목은 바로 삭제하지 말고, 먼저 `legacy/` 또는 문서상 비활성 영역으로 격리한 뒤 참조가 완전히 끊겼는지 확인하는 방식이 안전하다.

| 후보 | 현재 판단 | 정리 방향 |
| --- | --- | --- |
| `kakao_report_send.py`, `kakao_period_send.py`, `kakao_report_image_send.py`, `kakao_token_setup.py` | Slack 전환 이후 운영 발송 흐름에서 제외됨 | `legacy/kakao/`로 이동하거나 README에서 비활성 안내 |
| `KAKAO_LINK_SETUP.md` | 카카오 링크 문제 해결용 과거 문서 | `legacy/docs/`로 이동 |
| `run_briefing.bat`, `run_briefing_hidden.vbs`, `scheduler.py` | PC 상시 실행 방식의 초기 로컬 스케줄러 | 운영 문서에서 제거, 보관용으로 격리 |
| `EXTERNAL_CRON_SETUP.md`의 `send_kakao` 예시 | 현재 Slack 기준과 불일치 | Slack 기준으로 수정 |
| `README.md`의 카카오 API 안내 | 현재 운영 방식과 혼재 | Slack/Supabase/GitHub Actions 기준으로 재작성 |
| `templates/dashboard.html` | React 대시보드가 우선이며 fallback으로만 사용 | 참조 여부 확인 후 fallback 명시 또는 제거 |
| `period_reports/weekly.html`, `period_reports/monthly.html` | 생성 산출물이 Git에 남는 구조 | 필요 시 산출물 디렉터리 정책 재정의 |

주의: `templates/period_report.html`, `templates/email.html`은 보고서/링크 테스트에서 참조되고 있어 즉시 삭제 대상이 아니다.

## 3. 키워드/분류 DB 현재 구조

현재 DB는 두 층으로 나뉜다.

### 3.1 수집 키워드: `monitor_keywords`

역할:
- 어떤 키워드로 뉴스를 수집할지 결정한다.
- `match_mode`, `context_terms`, `exclude_terms`, `priority`로 수집 품질을 보정한다.

현재 분포:
- 당사: 3개
- 경쟁사: 2개
- 업계동향: 10개
- 정책/규제: 3개
- 문맥 필수 키워드: 2개

예:
- `메가`: `context` 방식, 보험/GA/설계사 문맥 필수, 메가커피/메가박스 등 제외
- `글로벌금융`: `context` 방식, 글로벌 금융시장/금융위기 등 제외

### 3.2 문맥 판정 룰: `monitor_context_rules`

역할:
- 수집된 기사에 대해 분류와 논조를 보정한다.
- 빅카인즈 샘플 기반의 오탐 제거 룰이 이미 들어가 있다.

현재 주요 룰:
- `own_incidental_name_noise`: 당사명이 우연히 노출된 기사 제외
- `short_incar_culture_travel_noise`: 인카/잉카 문화·관광 오탐 제외
- `short_incar_profile_sports_noise`: 인물·스포츠 오탐 제외
- `short_incar_vehicle_tech_noise`: 차량·모빌리티 오탐 제외
- `own_stock_market_notice`: 주가/증시성 자동 기사 중립 처리
- `own_performance_positive`: 당사 성과·홍보 활용 후보
- `own_direct_risk_caution`: 당사 직접 리스크 주의
- `ga_sales_commission_1200`: 1200%룰·GA 판매수수료 문맥

## 4. 현재 문제

분류 성능 자체는 이전보다 좋아졌지만 운영 UX가 따라오지 못한다.

1. 키워드와 문맥 룰이 분리되어 있는데 화면은 이를 단계별로 보여주지 않는다.
2. 운영자가 키워드를 추가할 때 “이 키워드가 수집용인지, 필수 문맥인지, 제외어인지, 분류 보정인지” 바로 알기 어렵다.
3. 빅카인즈식 메타데이터 구조가 DB에 충분히 반영되어 있지 않다.
4. `classification_feedback`은 쌓이고 있으나, 피드백을 룰 후보로 승격하는 흐름이 약하다.
5. 카카오/로컬 스케줄러 문서와 코드가 남아 신규 운영자가 현재 구조를 오해할 수 있다.

## 5. 빅카인즈 샘플에서 배울 점

빅카인즈 엑셀은 다음 정보를 함께 제공한다.

- 뉴스 식별자
- 일자
- 언론사
- 기고자
- 제목
- 통합 분류1/2/3
- 사건/사고 분류1/2/3
- 인물
- 위치
- 기관
- 키워드
- 특성추출
- 본문
- URL
- 분석제외 여부

이 구조를 그대로 모두 복제할 필요는 없지만, 우리 DB에는 최소한 다음 축이 필요하다.

1. 수집어
   - 실제 검색 API에 들어가는 단어

2. 필수 문맥
   - 검색어가 의미를 갖기 위해 반드시 같이 있어야 하는 단어
   - 예: `메가` + 보험/GA/설계사

3. 제외 문맥
   - 검색어가 있어도 버려야 하는 단어
   - 예: 메가커피, 메가박스, 스포츠, 차량 인포테인먼트

4. 개체명
   - 기관, 인물, 장소, 경쟁사명, 당국명
   - 예: 금융감독원, 금융위원회, 지에이코리아, 한화생명금융서비스

5. 기사 도메인
   - 언론 기사, 금융당국 보도자료, 주가/증시 자동 기사, 스포츠/문화 노이즈

6. 분류/논조 결과
   - 당사, GA, 보험사, 정책/규제, 기타, 제외
   - 긍정, 중립, 주의, 부정, 제외

7. 검증 샘플
   - 이 규칙이 맞게 잡은 기사와 잘못 잡은 기사

## 6. 권장 개선안

### 6.1 키워드 관리 화면 개편

현재의 단일 입력 폼을 다음 단계형 화면으로 바꾼다.

1. 수집 키워드
   - 실제 검색어
   - 카테고리
   - 우선순위

2. 문맥 조건
   - 필수 포함어
   - 제외어
   - 정확 일치 여부

3. 개체명/출처 조건
   - 기관명
   - 언론사/도메인
   - 기자명

4. 분류 결과
   - 기본 분류
   - 기본 논조
   - AI 재검토 필요 여부

5. 검증
   - 최근 기사 10건 미리보기
   - 이 규칙으로 포함/제외되는 기사 목록

### 6.2 DB 구조 보강

기존 테이블을 당장 갈아엎기보다 보조 테이블을 추가하는 방식이 안전하다.

제안 테이블:

```sql
monitor_rule_profiles
monitor_rule_terms
monitor_rule_examples
```

개념:
- `monitor_rule_profiles`: 규칙 묶음 단위. 예: 1200%룰, 인카 오탐, 메가 GA 경쟁사
- `monitor_rule_terms`: 수집어/필수어/제외어/기관명/분류어를 단계별로 저장
- `monitor_rule_examples`: 정탐/오탐 기사 샘플 저장

기존 `monitor_keywords`, `monitor_context_rules`는 그대로 두고, 새 UI가 이 테이블을 조작하면 백엔드에서 기존 테이블로 동기화하는 방식이 안전하다.

### 6.3 피드백 루프 강화

현재 `classification_feedback`은 “잘못된 기사 수정 이력”이다.

개선 방향:
1. 피드백이 3회 이상 반복된 패턴을 자동 후보로 묶는다.
2. 후보를 운영자가 승인하면 `monitor_context_rules` 또는 `monitor_rule_terms`로 승격한다.
3. 승격 후 최근 30일 기사에 대해 재분류 시뮬레이션을 보여준다.

### 6.4 레거시 정리 순서

1. README와 운영 문서에서 카카오/로컬 스케줄러를 분리한다.
2. 카카오 스크립트는 `legacy/kakao/`로 이동한다.
3. 로컬 스케줄러 스크립트는 `legacy/local-scheduler/`로 이동한다.
4. `templates/dashboard.html`은 fallback 여부를 결정한다.
5. QA 통과 후 불필요 파일 삭제를 별도 PR/커밋으로 처리한다.

## 7. 다음 작업 제안

우선순위는 다음 순서가 좋다.

1. 키워드 관리 UI를 단계형으로 개편한다.
2. `monitor_rule_profiles` 계열 보조 스키마를 만든다.
3. 빅카인즈 샘플 기반으로 현재 룰을 프로필화한다.
4. 피드백 후보를 룰 후보로 보여주는 화면을 만든다.
5. 레거시 카카오/로컬 스케줄러 문서와 코드를 격리한다.

이 순서가 좋은 이유는, 분류 품질을 더 올리면서도 AI 호출 비용을 늘리지 않고 운영자가 직접 규칙을 관리할 수 있기 때문이다.
