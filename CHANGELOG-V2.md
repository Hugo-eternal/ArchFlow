# 變更紀錄（V2 修正，`v2-fix` 分支）

以 V2.10.1 為基礎的修正。每一項註明 V2.10.1 的行為、修正後的行為與對應測試。清單與順序見 `docs/v2-fix-plan.md`。
（`CHANGELOG.md` 是暫停中的 V3 重構的紀錄。）

## V2.11（開發中）

### B2 + D9 版本號單一常數
- **V2.10.1**：存檔的 `applicationVersion` 是 `'1.8-rc4'`（8 個 `projectData` 包覆層依序寫入 `V2.10.1`、`1.3`、`1.4`…`1.8-rc4`，最後一層生效）；畫面版本字樣由 13 處程式反覆寫成 `V2.10.1`；頁面標題的版本寫死在 `index.html`。
- **現在**：唯一的版本常數 `AF_VERSION`（`legacy/app.*.html` 主程式開頭，目前 `V2.11-dev`）。存檔、畫面版本字樣、頁面標題（`node tools/pack.mjs` 從常數產生 `<title>`，殼層標題訊息帶 `version`）都讀它。刪除 7 個只改版本的 `projectData` 層、2 個只改版本字樣的 `render` 層，以及 11 處重複寫入。
- **測試**：`io.roundtrip` 的 `QUIRK: saved applicationVersion is 1.8-rc4` 改為檢查存檔與畫面都等於 `AF_VERSION`；E2E `smoke` 新增標題與版本字樣檢查；`layout` golden 的 `applicationVersion` 改成 `<AF_VERSION>` 佔位（不隨版本號變動）。

### B1 存開檔不再遺失文字框與時程外觀
- **V2.10.1**：`cleanTexts`（L495）只保留 id、文字、位置、寬、字級、顏色、粗體、斜體，文字框的 `align`、`background`、`font`、`padding` 重新開檔後消失；時程設計的驗證（L605）回傳 `texts: []` 且沒有 `theme`，**時程的文字框全部消失、字型主題被清除**。
- **現在**：`cleanTexts` 保留 `align`（left／center／right）、`background`（`transparent` 或 `#rrggbb`）、`font`（1–80 個英數、空白、`.-_` 字元）、`padding`（限制在 0–40）；不合法的值丟棄（使用預設外觀）。時程驗證改用 `cleanTexts(raw.texts)` 與 `cleanTheme(raw.theme)`。
- **測試**：`io.roundtrip` 的 `KNOWN_LOSS` 改為全部空集合；新增功能與時程的文字框欄位驗證測試；`layout` golden 的電源與 scrambled 快照多出文字框的 `align`／`background`（重新開檔後保留）。
