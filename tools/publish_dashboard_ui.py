"""Publish a UI repair without reading the database or rewriting archived data."""

import hashlib
import json
from pathlib import Path
import shutil


def publish_ui(root: Path) -> None:
    public = root / "public"
    dist = root / "frontend" / "dist"
    if not (public / "index.html").is_file() or not any((public / "reports").rglob("*.html")):
        raise RuntimeError("Restore a complete published site with report pages before UI-only publishing")
    snapshot = json.loads((public / "data" / "operations.json").read_text(encoding="utf-8"))
    if not snapshot.get("articles") or not snapshot.get("articles_generated_at"):
        raise RuntimeError("A dated, nonempty operations backup is required for UI-only publishing")
    config = json.loads((public / "data" / "supabase.json").read_text(encoding="utf-8"))
    if not config.get("url") or not config.get("anon_key"):
        raise RuntimeError("Existing public connection configuration is required")
    index = (dist / "index.html").read_text(encoding="utf-8")
    assets = list((dist / "assets").iterdir())
    if not index.strip() or not assets:
        raise RuntimeError("Built dashboard assets are required")

    # Hash everything outside the UI surface so a repair cannot replace report data.
    def protected_hashes():
        return {
            str(path.relative_to(public)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in public.rglob("*")
            if path.is_file() and path != public / "dashboard.html"
            and "assets" not in path.relative_to(public).parts[:1]
        }

    before = protected_hashes()
    target_assets = public / "assets"
    target_assets.mkdir(exist_ok=True)
    for asset in assets:
        if asset.is_file():
            shutil.copy2(asset, target_assets / asset.name)
    (public / "dashboard.html").write_text(index, encoding="utf-8")
    if protected_hashes() != before:
        raise RuntimeError("UI-only publish modified protected site content")
    print(f"UI-only publish: preserved {len(before)} files; article backup {snapshot['articles_generated_at']}")


if __name__ == "__main__":
    publish_ui(Path(__file__).resolve().parents[1])
