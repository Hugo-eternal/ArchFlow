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

### B3 開檔失敗時說明原因
- **V2.10.1**：超過 8 MB、不是 JSON、或不是專案物件的檔案，外層 loader（L2332）一律只顯示「載入失敗，原專案已保留。」，內層的「檔案超過 8 MB」訊息永遠看不到。
- **現在**：外層 loader 依原因顯示「檔案超過 8 MB」「檔案不是有效的 JSON」「檔案不是 ArchFlow 專案」，並註明原專案已保留（中英兩版）。內容驗證失敗時仍由內層顯示原本的原因。
- **測試**：`io.validate` 的 8 MB 測試改為檢查專屬訊息，新增「不是 JSON」「不是專案」與英文版 8 MB 測試。

### O5 `batch(fn, mode)` 取代暫換 `commit`
- **V2.10.1**：新增方塊（L1348）、自動編排（L1648）、時程 `oneStep`（L3564）各自「暫時把 `commit` 換成空函式」來合併復原步驟；例外時模型停在改到一半的狀態。
- **現在**：`batch(fn, mode)`（L288，緊接 `commit` 定義）是唯一合併復原步驟的方式：`'auto'` 有呼叫 commit 才記一步，`'always'` 一律重繪並記一步（原 `oneStep`），`'none'` 由呼叫端自己 commit；巢狀 batch 併入外層；`fn` 丟出例外時還原模型並重新丟出。三處改用 `batch`，行為不變。
- **測試**：新增 `tests/legacy/unit/core.batch.test.js`（5 項）；`layout` golden（自動編排）不變。

### F1 區域框移動被拒時不再誤報「已移動」
- **V2.10.1**：拖曳區域框讓框內方塊壓到別的方塊時，引擎拒絕並還原（「未套用，原圖已保留：方塊不重疊」），但區域框隨即用「已移動區域框與框內 N 個項目。」蓋掉拒絕訊息。
- **現在**：只有 `commit()` 真的記下這次移動時才顯示「已移動」；被拒時保留引擎的原因。拖曳中若框內方塊會與框外方塊重疊（與引擎「方塊不重疊」檢查同一規則），框線變成橘紅色並在狀態列提示「放開後…這次移動不會套用」。
- **測試**：新增 `tests/legacy/unit/frames.test.js`（被拒：拖曳中警告、放開後保留原因、圖面與復原歷史不變；成功：顯示已移動、一個復原步驟）。

### F4 畫完或取消區域框後清除提示
- **V2.10.1**：畫完區域框後，狀態列仍顯示「在畫布上拖曳畫出區域框…按 Esc 取消。」；按 Esc 或再按一次指令取消時也不會更新。
- **現在**：畫完顯示「已新增區域框；輸入名稱後按 Enter。」，按 Esc 或再按一次指令顯示「已取消畫區域框。」。
- **測試**：`frames.test.js` 新增畫框與兩種取消方式的狀態列檢查。
