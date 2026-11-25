# vendor/tools

**Do not edit.** Extracted byte for byte from ArchFlow V2.10.1 by `scripts/extract-vendor.mjs`;
`npm run check:vendor` fails if any file here changes. There is no source code for these bundles
(docs/v3-audit.md §5); V3 talks to them only through the host interface below.

| File | V2 variable | Lines in legacy/app.zh-Hant.html | Bytes | SHA-256 |
|---|---|---|---|---|
| `edid.html` | `mg` | 5992-6763 | 89883 | `ae632b3fd915bd67…` |
| `hex.html` | `vg` | 6763-7486 | 60441 | `ac37fb251525ef58…` |
| `pattern.html` | `xg` | 7486-10374 | 247142 | `0c42bfaf68cc9f4c…` |

## What it is

- `edid.html`: EDID Generator (standalone page)
- `hex.html`: Hex/Bin Editor & Compare (standalone page)
- `pattern.html`: Pattern Generator (standalone page)

## Host interface (provided by V3, see src/designs/* or src/tools/*)

```
window.afEdidHost = { lang, close(), toast(text) }
```

## How V2 mounted it

Each `.html` file is a complete page, loaded as the `srcdoc` of an `af2-tool-frame` iframe.
