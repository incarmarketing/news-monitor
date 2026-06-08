# 관심키워드 및 모니터링 자동화 템플릿

이 저장소는 내가 정한 키워드를 자동으로 검색하고, 관련 없는 자료를 걸러내고, AI가 요약·분류·보고서화한 뒤 대시보드와 알림으로 보여주는 모니터링 자동화 템플릿입니다.

뉴스 모니터링으로 시작했지만 구조 자체는 PR 업무에만 묶여 있지 않습니다. 수집 대상을 바꾸면 공시, 보도자료, 블로그, 경쟁사 웹사이트, 고객 리뷰, 채용공고, 사내 업무 로그처럼 반복적으로 확인해야 하는 거의 모든 자료를 모니터링할 수 있습니다.

## 아주 쉽게 말하면

```text
키워드 입력
  -> 자동 검색
  -> 중복/무관 자료 제거
  -> AI 요약·분류
  -> Supabase에 누적
  -> 대시보드와 보고서 생성
  -> 필요하면 카카오톡 알림 발송
```

사람이 매번 검색창을 열고 확인하던 일을 자동화하는 구조입니다. 중요한 건 단순히 “검색 결과를 모으는 것”이 아니라, 모인 자료를 업무 판단에 쓸 수 있게 정리하는 것입니다.

## 무엇을 바꾸면 다른 업무에 쓸 수 있나

| 바꿀 부분 | 설명 | 예시 |
| --- | --- | --- |
| 모니터링 키워드 | 무엇을 찾을지 정합니다. | 회사명, 제품명, 경쟁사명, 정책 키워드 |
| 수집기 | 어디서 가져올지 정합니다. | 뉴스, 공시, 보도자료, 리뷰, 웹사이트 |
| 문맥 필터 | 키워드만 맞고 무관한 자료를 걸러냅니다. | 동명이인, 스포츠, 채용, 이벤트 제외 |
| 분류 기준 | 자료를 어떤 업무 항목으로 나눌지 정합니다. | 당사, 경쟁사, 정책, 고객 반응 |
| 논조 기준 | 긍정·중립·주의·부정 기준을 정합니다. | 성과 보도, 규제 신호, 사고 기사 |
| 보고서 양식 | 어떤 형식으로 보고할지 정합니다. | 일간, 주간, 월간, 임원용 한 장 |
| 알림 방식 | 누가 언제 받을지 정합니다. | 카카오톡, 이메일, Slack, Teams |

## 바로 시작하는 방법

### 1. 저장소를 복제합니다

GitHub에서 이 저장소를 템플릿으로 복제하거나, ZIP으로 내려받아 새 저장소에 올립니다.

```powershell
git clone https://github.com/your-github-id/your-repo.git
Set-Location -LiteralPath ".\your-repo"
```

### 2. 환경 파일을 만듭니다

`.env.example`을 복사해 `.env`를 만들고, 내 값으로 채웁니다.

```powershell
Copy-Item .env.example .env
notepad .env
```

처음에 꼭 바꿀 값은 아래입니다.

```env
COMPANY_NAME=내회사명
TEAM_NAME=내부서명
OWN_NAMES=내회사명,내서비스명
MONITOR_KEYWORDS=내회사명,내서비스명,경쟁사명,업계 키워드,정책 키워드
EXCLUDE_KEYWORDS=채용,구인,무관 스포츠,무관 이벤트
```

### 3. API 키를 준비합니다

필수에 가까운 항목:

- Naver News API: 네이버 뉴스 검색용
- Gemini API: 기사 요약, 분류, 보고서 작성용
- Supabase: 누적 데이터베이스와 대시보드 데이터용

선택 항목:

- Kakao API: 카카오톡 나에게 보내기 알림
- cron-job.org: GitHub Actions 지연을 줄이는 외부 예약 호출
- Groq API: Gemini 장애 시 일부 요약 보조

### 4. Supabase 테이블을 만듭니다

Supabase 프로젝트를 만든 뒤 SQL Editor에서 `supabase_schema.sql`을 실행합니다.

이후 `supabase/migrations` 폴더의 SQL은 기능이 추가될 때 순서대로 적용합니다. 처음 구축하는 사람은 SQL 파일을 모두 확인하고, 조직에 맞지 않는 샘플 키워드는 실행 전에 바꿔도 됩니다.

### 5. GitHub Secrets를 넣습니다

GitHub 저장소의 `Settings > Secrets and variables > Actions`에 아래 값을 넣습니다.

```text
NAVER_CLIENT_ID
NAVER_CLIENT_SECRET
GEMINI_API_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_ANON_KEY 또는 SUPABASE_PUBLISHABLE_KEY
REPORT_PUBLIC_URL
```

카카오 알림을 쓸 경우 추가합니다.

```text
KAKAO_REST_API_KEY
KAKAO_REFRESH_TOKEN
```

### 6. GitHub Pages를 켭니다

`Settings > Pages > Build and deployment > Source`를 `GitHub Actions`로 설정합니다.

보고서와 대시보드는 GitHub Pages에 배포됩니다. 내부 자료를 다루는 경우 공개 저장소나 공개 Pages 사용은 피하고 접근 통제 방식을 별도로 정해야 합니다.

### 7. 워크플로우를 실행합니다

GitHub Actions에서 `AI News Briefing` 또는 `News Briefing` 워크플로우를 수동 실행합니다.

정상 흐름은 아래와 같습니다.

```text
뉴스/자료 수집
  -> AI 분석
  -> Supabase 저장
  -> 보고서 HTML 생성
  -> GitHub Pages 배포
  -> 알림 발송
```

## 커스터마이즈 핵심 파일

| 파일 | 역할 |
| --- | --- |
| `config.py` | 기본 회사명, 키워드, AI 모델, 보고서 수집량 설정 |
| `monitoring.profile.example.json` | 조직별 모니터링 기준 예시 |
| `analyzer.py` | 분류, 논조, 리스크 판정 규칙 |
| `news_collector.py` | 뉴스/자료 수집 로직 |
| `ai_briefing.py` | 일일 브리핑 작성 |
| `period_report.py` | 주간·월간 보고서 작성 |
| `dashboard_builder.py` | 정적 대시보드/보고서 생성 |
| `templates/dashboard.html` | GitHub Pages 대시보드 템플릿 |
| `frontend/src` | React 기반 대시보드 소스 |
| `supabase_schema.sql` | Supabase 기본 테이블 |
| `supabase/functions` | Supabase Edge Function |
| `.github/workflows` | GitHub Actions 자동 실행 |

## 다른 주제로 바꾸는 예시

### 고객 리뷰 모니터링

- 키워드: 제품명, 서비스명, 불만 유형
- 수집기: 리뷰 사이트, 블로그, 커뮤니티
- 분류: 칭찬, 불만, 장애, 가격, 배송
- 보고서: 주간 고객 반응 리포트

### 경쟁사 동향 모니터링

- 키워드: 경쟁사명, 제품명, 채용, 투자, 제휴
- 수집기: 뉴스, 보도자료, 채용공고, 공식 블로그
- 분류: 신제품, 마케팅, 조직 변화, 투자, 리스크
- 보고서: 월간 경쟁사 브리핑

### 규제/정책 모니터링

- 키워드: 법안명, 감독기관, 제도명, 공시 키워드
- 수집기: 정부/기관 보도자료, 국회 의안, 뉴스
- 분류: 법령, 행정지도, 감독, 제재, 시행 예정
- 보고서: 정책 영향 분석 보고서

## 운영 자동화 구성

기본 예약 예시는 아래입니다.

| 작업 | 기본 주기 |
| --- | --- |
| 부정/주의 이슈 감시 | 5분마다 |
| 일일 보고서 | 08:00, 13:00, 18:00 |
| 주간 보고서 | 매주 월요일 07:00 |
| 월간 보고서 | 매월 1일 07:00 |
| 대시보드 배포 | 보고서 생성 후 자동 |

GitHub Actions만으로도 운영할 수 있지만, 실행 지연이 발생할 수 있습니다. 지연을 줄이고 싶으면 cron-job.org나 Supabase Cron으로 GitHub Actions를 호출하는 보조 구조를 둡니다.

## 공유하기 전 체크리스트

- `.env` 파일이 커밋되지 않았는지 확인합니다.
- `data/`, `public/`, `.run-state/`, `.watch-state/`, `logs/` 같은 운영 산출물이 커밋되지 않았는지 확인합니다.
- 회사명, 사람 이름, 실제 고객 정보, 내부 링크가 남아 있지 않은지 확인합니다.
- GitHub Secrets, Supabase Service Role Key, Kakao Refresh Token은 절대 문서에 적지 않습니다.
- 템플릿 저장소는 가능하면 별도 저장소로 만들고 `Template repository` 옵션을 켭니다.

## 추천 공유 방식

가장 간편한 방식은 세 단계입니다.

1. 이 브랜치를 기준으로 별도 저장소를 만듭니다.
2. GitHub 저장소 설정에서 `Template repository`를 켭니다.
3. 사용자에게 README와 `monitoring.profile.example.json`부터 읽게 합니다.

그러면 다른 사람은 `Use this template` 버튼만 눌러 자기 저장소를 만들고, 회사명·키워드·API 키만 바꿔 시작할 수 있습니다.
