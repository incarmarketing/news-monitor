"""One-time Kakao OAuth helper for issuing KAKAO_REFRESH_TOKEN.

Prerequisites:
- .env contains KAKAO_REST_API_KEY
- Kakao Developers redirect URI includes http://localhost:8080/callback
- Kakao Login is enabled and talk_message consent is available
"""

from __future__ import annotations

import os
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import requests
from dotenv import load_dotenv

BASE_DIR = Path(__file__).parent
ENV_PATH = BASE_DIR / ".env"
REDIRECT_URI = "http://localhost:8080/callback"
AUTH_URL = "https://kauth.kakao.com/oauth/authorize"
TOKEN_URL = "https://kauth.kakao.com/oauth/token"


def read_env_value(key: str) -> str | None:
    load_dotenv(ENV_PATH)
    value = os.getenv(key)
    return value.strip() if value else None


def upsert_env(key: str, value: str) -> None:
    lines = []
    found = False
    if ENV_PATH.exists():
        lines = ENV_PATH.read_text(encoding="utf-8").splitlines()

    next_lines = []
    for line in lines:
        if line.startswith(f"{key}="):
            next_lines.append(f"{key}={value}")
            found = True
        else:
            next_lines.append(line)

    if not found:
        if next_lines and next_lines[-1].strip():
            next_lines.append("")
        next_lines.append(f"{key}={value}")

    ENV_PATH.write_text("\n".join(next_lines) + "\n", encoding="utf-8")


def exchange_code(rest_api_key: str, code: str) -> dict:
    data = {
        "grant_type": "authorization_code",
        "client_id": rest_api_key,
        "redirect_uri": REDIRECT_URI,
        "code": code,
    }
    client_secret = read_env_value("KAKAO_CLIENT_SECRET")
    if client_secret:
        data["client_secret"] = client_secret

    response = requests.post(
        TOKEN_URL,
        data=data,
        timeout=20,
    )
    if not response.ok:
        raise RuntimeError(f"{response.status_code} {response.text}")
    return response.json()


class CallbackHandler(BaseHTTPRequestHandler):
    server_version = "KakaoTokenSetup/1.0"

    def log_message(self, format, *args):  # noqa: N802
        return

    def do_GET(self):  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(parsed.query)

        if parsed.path != "/callback":
            self.send_response(404)
            self.end_headers()
            self.wfile.write("Not found".encode("utf-8"))
            return

        if "error" in query:
            message = f"Kakao authorization failed: {query.get('error_description', query['error'])[0]}"
            self.server.result = {"ok": False, "message": message}
            self.respond("인증 실패", message)
            return

        code = query.get("code", [None])[0]
        if not code:
            message = "callback URL에 code 파라미터가 없습니다."
            self.server.result = {"ok": False, "message": message}
            self.respond("인증 코드 없음", message)
            return

        try:
            token = exchange_code(self.server.rest_api_key, code)
            refresh_token = token.get("refresh_token")
            if not refresh_token:
                raise RuntimeError("응답에 refresh_token이 없습니다. 동의항목과 scope를 확인하세요.")

            upsert_env("KAKAO_REFRESH_TOKEN", refresh_token)
            self.server.result = {"ok": True, "message": "KAKAO_REFRESH_TOKEN 저장 완료"}
            self.respond(
                "토큰 저장 완료",
                "KAKAO_REFRESH_TOKEN이 .env에 저장되었습니다. 이 창은 닫아도 됩니다.",
            )
        except Exception as exc:  # noqa: BLE001
            self.server.result = {"ok": False, "message": str(exc)}
            self.respond("토큰 발급 실패", str(exc))

    def respond(self, title: str, message: str) -> None:
        body = f"""<!doctype html>
<html lang="ko">
<head><meta charset="utf-8"><title>{title}</title></head>
<body style="font-family: Malgun Gothic, sans-serif; padding: 32px;">
  <h1>{title}</h1>
  <p>{message}</p>
</body>
</html>"""
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))


def build_authorize_url(rest_api_key: str) -> str:
    params = {
        "client_id": rest_api_key,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": "talk_message",
    }
    return AUTH_URL + "?" + urllib.parse.urlencode(params)


def main() -> None:
    rest_api_key = read_env_value("KAKAO_REST_API_KEY")
    if not rest_api_key:
        raise SystemExit("KAKAO_REST_API_KEY가 .env에 없습니다.")

    server = HTTPServer(("localhost", 8080), CallbackHandler)
    server.rest_api_key = rest_api_key
    server.result = None

    auth_url = build_authorize_url(rest_api_key)
    print("\n아래 URL을 브라우저에서 열고 카카오 로그인을 완료하세요:\n", flush=True)
    print(auth_url, flush=True)
    print("\n대기 중: http://localhost:8080/callback\n", flush=True)

    def shutdown_when_done() -> None:
        while server.result is None:
            time.sleep(0.3)
        time.sleep(1)
        server.shutdown()

    threading.Thread(target=shutdown_when_done, daemon=True).start()
    server.serve_forever()

    result = server.result or {"ok": False, "message": "알 수 없는 오류"}
    print(result["message"], flush=True)
    if not result["ok"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
