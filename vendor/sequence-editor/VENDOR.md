# vendor/sequence-editor

**Do not edit.** Extracted byte for byte from ArchFlow V2.10.1 by `scripts/extract-vendor.mjs`;
`npm run check:vendor` fails if any file here changes. There is no source code for these bundles
(docs/v3-audit.md §5); V3 talks to them only through the host interface below.

| File | V2 variable | Lines in legacy/app.zh-Hant.html | Bytes | SHA-256 |
|---|---|---|---|---|
| `bundle.js` | `Bf` | 5327-5327 | 294424 | `87764a33ea2ea69e…` |
| `style.css` | `Ef` | 5327-5563 | 16206 | `27be3365cadf5220…` |

## What it is

- `bundle.js`: Power-sequence editor (React 19.2.8 bundle)
- `style.css`: Power-sequence editor styles

## Host interface (provided by V3, see src/designs/* or src/tools/*)

```
window.afSeqHost = { lang, getDoc(), change(doc, designId) }; editor sets window.afSeqApi = { load, undo, redo, getDoc, designId, openExport, copyTable, canUndo, canRedo }
```

## How V2 mounted it

An iframe whose `srcdoc` is:

```html
<!doctype html><html lang="zh-Hant|en"><head><meta charset="utf-8"><style>{embedded fonts}</style>
<style>{style.css}</style></head><body><div id="root"></div><script>{bundle.js}</script></body></html>
```
