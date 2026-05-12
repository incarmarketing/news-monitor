# 카카오톡 보고서 버튼 링크 설정

카카오톡 메시지 버튼이 `localhost`로 열리면 코드 문제가 아니라 카카오 앱의 제품 링크 도메인 설정이 남아있는 경우가 많습니다.

## 설정 위치

1. [Kakao Developers](https://developers.kakao.com/) 접속
2. `내 애플리케이션` > `뉴스알림봇`
3. `앱 설정` > `제품 링크`
4. `웹 도메인`에 아래 도메인 추가

```text
https://incarmarketing.github.io
```

`/news-monitor/`까지 넣지 말고 도메인까지만 등록합니다.

## 남아 있으면 제거하거나 우선순위 확인

아래 값이 웹 도메인 또는 기본 링크에 남아 있으면 카카오톡 버튼이 로컬 PC로 열릴 수 있습니다.

```text
http://localhost:8080
http://localhost
http://127.0.0.1
```

OAuth Redirect URI에는 `http://localhost:8080/callback`이 남아 있어도 됩니다. 토큰 발급용 주소라서 보고서 버튼 주소와는 별개입니다.

## 코드 쪽 방어

코드는 이미 `localhost`, `127.0.0.1`, `file:` 주소를 보고서 버튼 링크로 쓰지 않도록 막아두었습니다. 그래도 버튼이 `localhost`로 열리면 카카오 앱의 제품 링크 도메인 설정을 확인해야 합니다.
