# vendor/flowchart-editor

**Do not edit.** Extracted byte for byte from ArchFlow V2.10.1 by `scripts/extract-vendor.mjs`;
`npm run check:vendor` fails if any file here changes. There is no source code for these bundles
(docs/v3-audit.md §5); V3 talks to them only through the host interface below.

| File | V2 variable | Lines in legacy/app.zh-Hant.html | Bytes | SHA-256 |
|---|---|---|---|---|
| `bundle.js` | `$f` | 5563-5563 | 297335 | `7c1f9442f79d16cb…` |
| `style.css` | `Hf` | 5563-5765 | 17419 | `53fcb5fea5d7f4c2…` |

## What it is

- `bundle.js`: Flowchart editor (React 19.2.8 bundle)
- `style.css`: Flowchart editor styles

## Host interface (provided by V3, see src/designs/* or src/tools/*)

```
window.afFlowHost = { lang, images, getDoc(), change(doc, designId), title(), ready() }; editor sets window.afFlowApi = { load, undo, redo, openExport, closeMenus }
```

## How V2 mounted it

An iframe whose `srcdoc` is:

```html
<!doctype html><html lang="zh-Hant|en"><head><meta charset="utf-8"><style>{embedded fonts}</style>
<style>{style.css}</style></head><body><div id="root"></div><script>{bundle.js}</script></body></html>
```
