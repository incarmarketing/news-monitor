"""Build the on-demand PDF CJK fallback from the pinned upstream TrueType font."""

import argparse
import hashlib
import json
from pathlib import Path
import sys

SOURCE_SHA256 = "194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252"
SOURCE_COMMIT = "b38c5c93af322c45f633e17ac440ec1e6c94d489"
CJK_RANGES = ((0x2E80,0x9FFF),(0xF900,0xFAFF),(0xFF00,0xFFEF),(0x20000,0x2FFFF))


def compact_ranges(points):
    result = []
    for point in sorted(points):
        if result and point == result[-1][1] + 1:
            result[-1][1] = point
        else:
            result.append([point,point])
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("font",type=Path)
    parser.add_argument("--fonttools-path",type=Path)
    parser.add_argument("--output",type=Path,default=Path("frontend/src/assets/fonts"))
    args = parser.parse_args()
    if args.fonttools_path:
        sys.path.insert(0,str(args.fonttools_path.resolve()))
    from fontTools import subset
    from fontTools.ttLib import TTFont
    from fontTools.varLib.instancer import instantiateVariableFont

    if hashlib.sha256(args.font.read_bytes()).hexdigest() != SOURCE_SHA256:
        raise ValueError("The supplied font does not match the pinned upstream source")
    base = Path("frontend/node_modules/pretendard/dist/web/static/woff")
    covered = set(TTFont(base / "Pretendard-Regular.woff").getBestCmap()) & set(TTFont(base / "Pretendard-Bold.woff").getBestCmap())
    args.output.mkdir(parents=True,exist_ok=True)
    coverage = None
    for weight,style in ((400,"Regular"),(700,"Bold")):
        font = TTFont(args.font,recalcTimestamp=False)
        if "glyf" not in font:
            raise ValueError("Use the TrueType upstream source to preserve glyph mapping")
        points = {point for point in font.getBestCmap() if point not in covered and any(start <= point <= end for start,end in CJK_RANGES)}
        options = subset.Options(name_IDs=["*"],name_legacy=True,name_languages=["*"],layout_features=[])
        reducer = subset.Subsetter(options=options)
        reducer.populate(unicodes=points)
        reducer.subset(font)
        font = instantiateVariableFont(font,{"wght":weight},inplace=True)
        names = {1:"Incar Report CJK",2:style,3:f"IncarReportCJK-{style}-2.004",4:f"Incar Report CJK {style}",6:f"IncarReportCJK-{style}",16:"Incar Report CJK",17:style}
        for record in font["name"].names:
            if record.nameID in names:
                record.string = names[record.nameID].encode(record.getEncoding())
        actual = set(font.getBestCmap())
        if not {ord(char) for char in "日韓美中銀車檢"}.issubset(actual):
            raise ValueError("Required headline characters are missing")
        if coverage is not None and coverage != actual:
            raise ValueError("Regular and bold coverage must agree")
        coverage = actual
        font.flavor = "woff"
        output = args.output / f"IncarReportCJK-{style}.woff"
        font.save(output)
        print(f"{output}: {output.stat().st_size:,} bytes, {len(actual):,} codepoints")
    (args.output / "cjk-coverage.json").write_text(json.dumps({"source_commit":SOURCE_COMMIT,"source_sha256":SOURCE_SHA256,"ranges":compact_ranges(coverage)},separators=(",",":"))+"\n",encoding="utf-8")


if __name__ == "__main__":
    main()
