# Supabase Edge Function으로 즉시 수집 실행하기

대시보드의 `새로고침` 버튼은 아래 순서로 동작합니다.

1. Supabase Edge Function `trigger-news-collection` 호출
2. Edge Function이 GitHub Actions `news-briefing.yml`을 `workflow_dispatch`로 실행
3. GitHub Actions가 기존 Python 로직으로 뉴스 수집, AI 분석, Supabase 저장 수행
4. 대시보드가 Supabase `news_articles`를 다시 조회해 화면 반영

## 1. GitHub Secret 확인

GitHub 저장소 `Settings > Secrets and variables > Actions`에 아래 값이 있어야 합니다.

- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`
- `GEMINI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`

## 2. Supabase SQL 실행

Supabase SQL Editor에서 `supabase_schema.sql`을 실행합니다.

중요: `anon`은 대시보드에 필요한 기사 컬럼만 읽을 수 있고, 저장/수정은 GitHub Actions의 `service_role`만 수행합니다.

## 3. Edge Function 배포

Supabase CLI 로그인 후 프로젝트에서 실행합니다.

```powershell
supabase functions deploy trigger-news-collection
supabase functions deploy generate-risk-response --no-verify-jwt
```

`generate-risk-response`는 GitHub Pages 대시보드의 publishable/anon key로 호출되므로 Supabase 기본 JWT 검증을 끄고, 함수 내부에서 `PUBLIC_SUPABASE_ANON_KEY`로 요청 키를 확인합니다.

## 4. Edge Function Secret 설정

```powershell
supabase secrets set GITHUB_DISPATCH_TOKEN="GitHub fine-grained token"
supabase secrets set GITHUB_OWNER="incarmarketing"
supabase secrets set GITHUB_REPO="news-monitor"
supabase secrets set GITHUB_WORKFLOW_FILE="news-briefing.yml"
supabase secrets set GITHUB_REF="main"
supabase secrets set GEMINI_API_KEY="Gemini API key"
supabase secrets set GEMINI_MODEL="gemini-2.5-flash"
```

`GITHUB_DISPATCH_TOKEN` 권한:

- Repository: `incarmarketing/news-monitor`
- Actions: Read and write
- Contents: Read

## 5. GitHub Pages 재배포

GitHub Actions `Publish Dashboard`를 한 번 실행하거나, main 브랜치에 push하면 `public/data/supabase.json`이 생성됩니다.

대시보드는 이 파일의 `SUPABASE_URL`, `SUPABASE_ANON_KEY`를 사용해 Supabase를 읽고, Edge Function을 호출합니다.
