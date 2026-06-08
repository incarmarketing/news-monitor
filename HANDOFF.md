# 작업 인수인계 메모

이 저장소는 공유용 템플릿입니다. 운영 데이터는 포함하지 않고, 새 사용자가 자기 저장소와 Supabase 프로젝트를 연결해 다시 생성하는 구조입니다.

## 새 PC에서 이어서 작업할 때

1. GitHub에서 자기 저장소를 clone합니다.
2. `.env.example`을 `.env`로 복사합니다.
3. `COMPANY_NAME`, `OWN_NAMES`, `MONITOR_KEYWORDS`를 자기 업무에 맞게 바꿉니다.
4. Supabase 프로젝트를 만들고 `supabase_schema.sql`을 적용합니다.
5. GitHub Secrets와 Supabase Function Secrets를 채웁니다.
6. GitHub Pages를 GitHub Actions 방식으로 켭니다.
7. Actions에서 보고서 워크플로우를 한 번 수동 실행해 연결 상태를 확인합니다.

## 공유용 브랜치의 원칙

- `main` 운영 브랜치를 직접 바꾸지 않습니다.
- 운영 산출물은 커밋하지 않습니다.
- API 키와 토큰은 문서나 코드에 적지 않습니다.
- 회사명과 사람 이름은 샘플값으로 둡니다.
- 실제 업무 적용은 새 저장소나 새 Supabase 프로젝트에서 합니다.

## 꼭 확인할 문서

- `README.md`: 처음 시작하는 사람을 위한 전체 설명
- `docs/CUSTOMIZATION_GUIDE.md`: 업무별 커스터마이즈 상세 설명
- `docs/SHARING_CHECKLIST.md`: 공유 전 민감정보 점검표
- `.env.example`: 필요한 환경변수 목록
- `monitoring.profile.example.json`: 조직별 모니터링 기준 예시
