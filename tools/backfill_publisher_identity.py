"""Repair only publisher fields. Dry-run by default; never collect or send alerts."""

from __future__ import annotations

import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import sys
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import publisher_identity as publishers
import supabase_store


def scan_rows():
    cursor = 0
    while True:
        rows = supabase_store.request(
            "GET", f"news_articles?select=id,title,link,source,raw,updated_at&id=gt.{cursor}&order=id.asc&limit=500"
        ).json()
        if not rows:
            break
        yield from rows
        cursor = rows[-1]["id"]


def repair_patch(row):
    resolved = publishers.resolve_publisher(row)
    raw = row.get("raw") if isinstance(row.get("raw"), dict) else {}
    if row.get("source") == resolved["name"] and raw.get("source", resolved["name"]) == resolved["name"]:
        return None
    return {
        "source": resolved["name"],
        "raw": {
            **raw,
            "source_raw": raw.get("source_raw", raw.get("source") or row.get("source", "")),
            "source": resolved["name"],
            "publisher_resolution": resolved,
        },
    }


def apply_row(row):
    patch = repair_patch(row)
    if not patch:
        return "unchanged"
    if not row.get("updated_at"):
        return "conflict"
    # Compare-and-set prevents overwriting a classification/raw update by an
    # overlapping collector. Conflicts are left for the next run, never forced.
    response = supabase_store.request(
        "PATCH",
        f"news_articles?id=eq.{row['id']}&updated_at=eq.{quote(row['updated_at'], safe='')}&select=id",
        data=json.dumps(patch, ensure_ascii=False),
        headers={"Prefer": "return=representation"},
    )
    return "updated" if response.json() else "conflict"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--audit", default="out/publisher-identity-audit.json")
    args = parser.parse_args()
    publishers.configure_aliases(supabase_store.load_press_alias_rows())
    rows = list(scan_rows())
    changes = [row for row in rows if repair_patch(row)]
    unresolved = [row for row in rows if publishers.resolve_publisher(row)["method"] == "unresolved"]
    audit = {
        "scanned": len(rows), "planned": len(changes), "unresolved": len(unresolved),
        "changes": [
            {"id": row["id"], "before": row["source"], "after": publishers.resolve_publisher(row)}
            for row in changes
        ],
        "unresolved_articles": [
            {"id": row["id"], "source": row["source"], "title": row["title"], "link": row["link"]}
            for row in unresolved
        ],
    }
    if args.apply and not args.dry_run:
        with ThreadPoolExecutor(max_workers=4) as pool:
            audit["results"] = dict(Counter(pool.map(apply_row, changes)))
    path = Path(args.audit)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in audit.items() if key not in {"changes", "unresolved_articles"}}, ensure_ascii=False))


if __name__ == "__main__":
    main()
