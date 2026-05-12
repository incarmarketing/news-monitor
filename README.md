# 📰 AI 언론 모니터링 시스템

매일 자동으로 뉴스를 수집하고 AI가 브리핑을 작성해 이메일로 발송하는 파이프라인.

```
뉴스 RSS/API → 키워드 필터 → Gemini AI 브리핑 → HTML 이메일 발송
```

---

## 🚀 빠른 시작

```powershell
# 1. 패키지 설치
pip install -r requirements.txt

# 2. 환경 변수 설정
copy .env.example .env
# → .env 파일 열어서 API 키 입력

# 3. 1회 테스트 실행
python news_collector.py    # 수집만 테스트
python ai_briefing.py       # AI 브리핑만 테스트 (더미 데이터)

# 4. 자동 스케줄러 실행
python scheduler.py         # 로컬 PC용 예약 실행
```

---

## 🔑 네이버 뉴스 API 발급 (5분 소요)

### Step 1. 네이버 개발자 센터 접속
https://developers.naver.com 접속 → 우측 상단 **로그인** (네이버 계정)

### Step 2. 애플리케이션 등록
1. 상단 메뉴 → **Application** → **애플리케이션 등록**
2. 약관 동의 → **확인**
3. 휴대폰 본인인증 (최초 1회만)

### Step 3. 신청 정보 입력
| 항목 | 입력값 |
|------|--------|
| 애플리케이션 이름 | `인카금융_언론모니터링` (자유) |
| 사용 API | **검색** 체크 |
| 비로그인 오픈 API 환경 | **WEB 설정** 선택 |
| 웹 서비스 URL | `http://localhost` |

→ **등록하기** 클릭

### Step 4. 키 확인 및 복사
- 등록 완료 후 화면에 노출되는 두 값을 복사:
  - **Client ID** (예: `Abc123XyZ_456`)
  - **Client Secret** (예: `aBcDeF12`)

### Step 5. .env 파일에 입력
```env
NAVER_CLIENT_ID=여기에_Client_ID_붙여넣기
NAVER_CLIENT_SECRET=여기에_Client_Secret_붙여넣기
```

### 🚨 주의사항
- **하루 25,000건 무료** (검색 API 기준) — 본 시스템은 하루 약 300건 사용
- 키는 절대 GitHub 등에 올리지 말 것 (`.env`는 자동 제외됨)
- Secret 분실 시 재발급 가능: 내 애플리케이션 → 해당 앱 클릭 → "Client Secret 재발급"

---

## 🔑 Google Gemini API 발급 (무료, 3분)

> 무료 한도: Gemini 2.5 Pro 기준 분당 5회 / 일 100회 — 본 시스템 일 사용량 2회

1. https://aistudio.google.com/apikey 접속
2. 구글 계정으로 로그인
3. **Create API key** 클릭
4. "Create API key in new project" 선택 → 자동 생성
5. 표시되는 키 복사 (`AIza...`로 시작하는 39자리)
6. `.env`에 입력:
   ```env
   GEMINI_API_KEY=AIza여기에_복사한_키_붙여넣기
   ```

> 결제 카드 등록 불필요. 신용카드 입력 화면 나오면 무시하고 닫으면 됨.

### 모델 변경 (선택)
일 100회로 부족하면 `config.py`에서 모델 변경:
```python
GEMINI_MODEL = "gemini-2.5-flash"   # 일 250회, 품질도 거의 동급
# 또는
GEMINI_MODEL = "gemini-2.0-flash"   # 일 1,500회, 한도 압도적
```

---

## 📧 Gmail 앱 비밀번호 설정 (이메일 발송용)

> 보안 정책상 일반 비밀번호로는 SMTP 발송 불가 → **앱 비밀번호** 발급 필요

1. https://myaccount.google.com/security 접속
2. **2단계 인증** 활성화 (필수 선행조건)
3. 검색창에 `앱 비밀번호` 입력 → 클릭
4. 앱 이름: `news-monitor` → **만들기**
5. 16자리 비밀번호 복사 (예: `abcd efgh ijkl mnop`)
6. `.env`에 입력:
   ```env
   EMAIL_SENDER=your_email@gmail.com
   EMAIL_PASSWORD=abcdefghijklmnop      # 띄어쓰기 제거
   EMAIL_RECIPIENTS=받는사람1@회사.com,받는사람2@회사.com
   ```

---

## ⚙️ 설정 변경

### 키워드 추가/수정 → `config.py`
```python
KEYWORDS = [
    "인카금융",
    "보험 마케팅",
    # 여기에 추가
]
```

### 실행 시간 변경 → `config.py`
```python
SCHEDULE_TIMES = ["08:00", "17:00"]   # 24시간 형식
```

---

## 📁 폴더 구조

```
news-monitor/
├── config.py              ← 키워드/설정 (자주 수정)
├── news_collector.py      ← 뉴스 수집기
├── ai_briefing.py         ← AI 브리핑 + 이메일
├── scheduler.py           ← 로컬 PC용 자동 실행
├── templates/
│   └── email.html         ← 이메일 디자인
├── logs/                  ← 발송 로그 (자동 생성)
├── requirements.txt
└── .env                   ← API 키 (직접 생성)
```

---

## 🛠 트러블슈팅

| 증상 | 원인 / 해결 |
|------|-----------|
| `네이버 키 없음` 메시지 | `.env` 파일 위치 확인, 변수명 오타 확인 |
| 구글 뉴스 0건 | 회사 네트워크 차단 가능성 — 개인 네트워크에서 재시도 |
| 이메일 발송 실패 | Gmail 앱 비밀번호 오류 — 띄어쓰기 제거 확인 |
| `ModuleNotFoundError` | `pip install -r requirements.txt` 재실행 |
