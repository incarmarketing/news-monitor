"""Check PDF downloads against their visible headlines and embedded CJK fonts."""

import argparse
import json
from pathlib import Path
import re
import sys
from urllib.request import urlopen


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory",type=Path)
    parser.add_argument("--library-path",type=Path)
    parser.add_argument("--check-notice-urls",action="store_true")
    args=parser.parse_args()
    if args.library_path:
        sys.path.insert(0,str(args.library_path.resolve()))
    from pypdf import PdfReader

    summary=json.loads((args.directory / "summary.json").read_text(encoding="utf-8"))
    compact=lambda text: re.sub(r"\s+","",text)
    result=[]
    checked_notices=set()
    for report in summary["reports"]:
        source=args.directory / f"{report['period']}.pdf"
        reader=PdfReader(source)
        notices=re.findall(r"https?://[^\s]+",str(reader.metadata["/Subject"]))
        assert len(notices)==3, "PDF library/font license notices were dropped"
        if args.check_notice_urls:
            for url in notices:
                if url not in checked_notices:
                    with urlopen(url,timeout=15) as response:
                        assert response.status==200 and b"Copyright" in response.read(32000), f"license notice unavailable: {url}"
                    checked_notices.add(url)
        content="".join(page.extract_text() for page in reader.pages)
        expected=report["articleTitles"]+report.get("expectedTexts",[])
        for text in expected:
            if compact(text) not in compact(content):
                raise AssertionError(f"{report['period']}: missing PDF text {text!r}")
        links=[]
        fonts=set()
        for page in reader.pages:
            assert abs(float(page.mediabox.width)-841.89)<1, "not landscape A4"
            assert abs(float(page.mediabox.height)-595.28)<1, "not landscape A4"
            assert int(page.get("/Rotate",0))==0, "rotated page contents"
            for font in page["/Resources"].get("/Font",{}).values():
                fonts.add(str(font.get_object().get("/BaseFont","")))
            for item in page.get("/Annots",[]):
                action=item.get_object().get("/A",{})
                if action.get("/URI"):
                    links.append(str(action["/URI"]))
        assert len(links)>=len(report["articleTitles"]), "article links were dropped"
        for name in report.get("expectedFonts",[]):
            assert any(name in font for font in fonts), f"fallback font missing: {name}"
        result.append({"period":report["period"],"pages":len(reader.pages),"verifiedTexts":len(expected),"links":len(links),"fonts":sorted(fonts)})
    print(json.dumps(result,ensure_ascii=False))


if __name__ == "__main__":
    main()
