"""Optional Google redirect resolution, isolated from collection and delivery."""

import json
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import urlparse


def resolve_google_original(url: str) -> str:
    try:
        parsed = urlparse(url)
        if (parsed.scheme != "https" or parsed.netloc != "news.google.com"
                or not re.fullmatch(r"/(?:rss/)?(?:articles|read)/[A-Za-z0-9_-]{30,5000}", parsed.path)):
            return ""
        result = subprocess.run([sys.executable, str(Path(__file__).resolve()), url],
                                capture_output=True, text=True, encoding="utf-8", timeout=15,
                                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        if result.returncode:
            return ""
        payload = json.loads(result.stdout)
        candidate = payload.get("decoded_url", "") if payload.get("status") else ""
        target = urlparse(candidate)
        if target.scheme in {"http", "https"} and target.hostname and target.hostname != "news.google.com":
            return candidate
    except (ValueError, OSError, subprocess.TimeoutExpired):
        pass
    return ""


if __name__ == "__main__":
    from googlenewsdecoder import gnewsdecoder
    print(json.dumps(gnewsdecoder(sys.argv[1]), ensure_ascii=True))
