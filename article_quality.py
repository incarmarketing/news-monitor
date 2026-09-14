"""Network-free checks for search results that are media assets, not articles."""

import html
import re
from urllib.parse import unquote, urlparse


def is_media_url(value: str) -> bool:
    try:
        parsed = urlparse(str(value or ""))
    except ValueError:
        return True
    path = unquote(parsed.path).lower()
    return bool(re.search(r"\.(?:jpe?g|png|gif|webp|svg|avif|mp4)$", path)
                or re.search(r"/(?:img_view|image_view|photo_view|image_popup)\.(?:html?|php)$", path))


def is_photo_caption(title: str) -> bool:
    title = html.unescape(re.sub(r"<[^>]*>", "", str(title or "")))
    # Require a caption sentence AND an explicit credit/position marker.
    # A normal '[포토] 후원금 전달' headline is still a valid photo article.
    return bool(re.search(r"(?:촬영|포즈|전달|설명).{0,25}(?:하고\s*있다|하는\s*모습|모습이다)", title)
                and re.search(r"[（(]\s*(?:사진\s*[=:：]|왼쪽|오른쪽)", title))


def is_non_article_result(article: dict) -> bool:
    return is_media_url(article.get("link", "")) or is_photo_caption(article.get("title", ""))
