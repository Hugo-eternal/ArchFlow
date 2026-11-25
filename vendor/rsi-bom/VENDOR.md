# vendor/rsi-bom

**Do not edit.** Extracted byte for byte from ArchFlow V2.10.1 by `scripts/extract-vendor.mjs`;
`npm run check:vendor` fails if any file here changes. There is no source code for these bundles
(docs/v3-audit.md §5); V3 talks to them only through the host interface below.

| File | V2 variable | Lines in legacy/app.zh-Hant.html | Bytes | SHA-256 |
|---|---|---|---|---|
| `bundle.js` | `fg` | 5766-5766 | 368271 | `276c9b43c23122b5…` |
| `style.css` | `gg` | 5766-5992 | 17363 | `0e990cbb19dbc3e1…` |

## What it is

- `bundle.js`: RSI BOM Converter (React 19.2.8 + JSZip 3.10.1 bundle)
- `style.css`: RSI BOM Converter styles

## Host interface (provided by V3, see src/designs/* or src/tools/*)

```
window.afRsiHost = { lang, close(), toast(text) }
```

## How V2 mounted it

An iframe whose `srcdoc` is:

```html
<!doctype html><html lang="zh-Hant|en"><head><meta charset="utf-8"><style>{embedded fonts}</style>
<style>{style.css}</style></head><body><div id="root"></div><script>{bundle.js}</script></body></html>
```
