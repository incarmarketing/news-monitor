# 공유 전 점검표

이 저장소를 다른 사람에게 ZIP으로 공유하거나 GitHub Template 저장소로 공개하기 전에 아래를 확인합니다.

## 1. 운영 데이터 제거

아래 폴더는 템플릿 저장소에 포함하지 않습니다.

```text
data/
public/
logs/
.run-state/
.watch-state/
period_reports/
frontend/dist/
frontend/out/
```

확인 명령:

```powershell
git ls-files data public logs .run-state .watch-state period_reports
```

아무것도 나오지 않아야 합니다.

## 2. 민감정보 제거

아래 값은 절대 커밋하지 않습니다.

```text
NAVER_CLIENT_SECRET
GEMINI_API_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_ANON_KEY
KAKAO_REFRESH_TOKEN
GITHUB_DISPATCH_TOKEN
CRONJOB_API_KEY
CRON_DISPATCH_TOKEN
```

`.env.example`에는 이름만 남기고 실제 값은 비워 둡니다.

## 3. 회사/사람 정보 제거

아래 항목이 남아 있지 않은지 확인합니다.

- 실제 회사명
- 실제 직원 이름과 사번
- 실제 고객명
- 내부 URL
- 실제 보고서 링크
- 실제 발송 이력

확인 명령 예시:

```powershell
rg "실제회사명|실제직원이름|실제서비스명|github.io/운영저장소명"
```

## 4. 템플릿 기본값 확인

아래 파일은 공유 전에 반드시 봅니다.

| 파일 | 확인할 내용 |
| --- | --- |
| `.env.example` | 실제 키가 없는지 |
| `config.py` | 기본 회사명이 샘플값인지 |
| `monitoring.profile.example.json` | 실제 조직 정보가 없는지 |
| `supabase_schema.sql` | 초기 키워드가 샘플값인지 |
| `README.md` | 공유 대상이 따라 할 수 있는지 |

## 5. GitHub 저장소 설정

공유용 저장소를 만들 때 추천 설정:

- 저장소 이름: `monitoring-automation-template`처럼 범용 이름 사용
- `Settings > General > Template repository` 켜기
- 운영 저장소와 분리
- 공개 저장소라면 민감한 업무 데이터가 절대 생성되지 않게 주의

## 6. 공유 방식 추천

가장 쉬운 방식:

1. 공유용 브랜치 또는 별도 저장소를 만듭니다.
2. GitHub에서 Template repository 옵션을 켭니다.
3. 사용자는 `Use this template` 버튼으로 자기 저장소를 만듭니다.
4. 사용자는 README 순서대로 `.env`, Supabase, GitHub Secrets를 채웁니다.

회사 내부에서만 공유할 때:

1. 내부 GitHub 조직에 비공개 템플릿 저장소를 만듭니다.
2. README에 부서별 커스터마이즈 예시를 추가합니다.
3. 담당자가 Supabase 프로젝트와 API 키를 직접 발급하도록 안내합니다.
