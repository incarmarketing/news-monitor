# PDF CJK Fallback

The two WOFF files contain the CJK, kana and full-width glyphs from Noto Sans KR
at weights 400 and 700, excluding glyphs already in Pretendard 1.3.9. They are used only by PDF text runs; they are not page
fonts or eager dashboard downloads. Korean and Latin text remains Pretendard.

Upstream: `google/fonts`, `ofl/notosanskr/NotoSansKR[wght].ttf` at commit
`b38c5c93af322c45f633e17ac440ec1e6c94d489`.

Source SHA-256: `194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252`.

License: SIL OFL 1.1; the unmodified notice is distributed at
`frontend/src/assets/licenses/NotoSansKR-OFL.txt`. The subset family is renamed
`Incar Report CJK`. Upstream copyright and license metadata are retained.

Regenerate with FontTools 4.60.2 from the repository root after `npm ci` in `frontend`:

```powershell
python tools/build_report_cjk_fonts.py path/to/NotoSansKR-variable.ttf
```

Use `--fonttools-path` for a workspace-local FontTools installation. This is a
development asset-generation tool, not a backend or deployment dependency.

License notices are emitted as hashed assets and linked in the generated PDF's
metadata, so normal and UI-only publishing preserve them with the font files.
