# GitHub Actions 자동 실행 설정

이 방식은 PC가 꺼져 있어도 GitHub 서버에서 08:00, 13:00, 17:00에 보고서를 생성하고, GitHub Pages에 모바일용 HTML 보고서를 올린 뒤 카카오톡으로 링크를 보냅니다.

## 1. 저장소 만들기

1. GitHub에서 새 저장소를 만듭니다.
2. `C:\Users\User\Desktop\COWORK\news-monitor` 폴더 안의 파일들을 저장소 루트로 올립니다.
3. `.env`, `logs`, `data`, `out`, `__pycache__`는 올리지 않습니다.

## 2. GitHub Secrets 등록

GitHub 저장소에서 `Settings` > `Secrets and variables` > `Actions` > `New repository secret`로 아래 값을 등록합니다.

- `GEMINI_API_KEY`
- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`
- `KAKAO_REST_API_KEY`
- `KAKAO_REFRESH_TOKEN`
- `KAKAO_CLIENT_SECRET`는 카카오 Client Secret을 꺼두었으면 등록하지 않아도 됩니다.

로컬 `.env`에 있는 값을 그대로 복사하면 됩니다.

## 3. GitHub Pages 활성화

1. 저장소 `Settings` > `Pages`로 갑니다.
2. `Build and deployment`의 `Source`를 `GitHub Actions`로 설정합니다.

## 4. 테스트 실행

1. 저장소 `Actions` 탭으로 갑니다.
2. `AI News Briefing` 워크플로를 선택합니다.
3. `Run workflow`를 누릅니다.
4. 완료되면 카카오톡으로 `보고서 보기` 버튼이 포함된 메시지가 옵니다.

## 주의사항

- GitHub Pages URL을 아는 사람은 보고서를 열 수 있습니다. 민감한 내부 보고서라면 공개 저장소나 공개 Pages에 올리는 방식은 피하는 것이 좋습니다.
- 자동 실행 시간은 UTC 기준으로 등록되어 있습니다. 현재 기준시각은 한국시간 08:00, 13:00, 17:00, 18:00입니다.
- GitHub 예약 실행은 지연/누락될 수 있어 각 기준시각마다 05분, 15분, 30분, 45분에 백업 실행을 걸어두었습니다. 한 기준시각에서 이미 성공한 경우 `.run-state/` 마커로 중복 발송을 막습니다.
- 기존 Windows 작업 스케줄러 방식은 PC가 켜져 있어야만 실행됩니다. PC가 꺼져 있어도 동작하려면 GitHub Actions 같은 클라우드 실행 환경이 필요합니다.
- 카카오톡 `보고서 보기` 버튼이 `localhost`로 열리면 `KAKAO_LINK_SETUP.md`의 제품 링크 도메인 설정을 확인합니다.
