# vendor/fonts

**Do not edit.** Extracted byte for byte from ArchFlow V2.10.1 by `scripts/extract-vendor.mjs`;
`npm run check:vendor` fails if any file here changes. There is no source code for these bundles
(docs/v3-audit.md §5); V3 talks to them only through the host interface below.

| File | V2 variable | Lines in legacy/app.zh-Hant.html | Bytes | SHA-256 |
|---|---|---|---|---|
| `source-han-sans-tc.css` | `AF_FONT_CSS` (index.html) | 3-3 | 5670948 | `49341234a9fdccd7…` |

## What it is

- `source-han-sans-tc.css`: Source Han Sans TC subset, regular and bold, as @font-face with woff2 data URLs (SIL OFL 1.1)

## How V2 used it

The V2 wrapper (index.html) inserted it as `<style id="af2-fonts">` into the app and into the
sequence, flowchart and BOM frames. V3 does the same (src/styles/fonts.ts). Licence: SIL Open Font License 1.1 (THIRD_PARTY.md).
