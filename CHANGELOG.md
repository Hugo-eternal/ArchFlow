# 變更紀錄

V3 重構期間的**有意行為修正**記在這裡（CLAUDE.md：除非是有意的行為修正，不得為了讓測試通過而修改黃金檔）。每一項註明 V2 行為、V3 行為與對應測試。

## V3.0.0（開發中）

### 專案檔
- **不再讀取 V1 / V2 專案檔。** 開啟非 V3 格式（沒有 `schemaVersion: 3`）的檔案時顯示「不支援舊版格式」，目前的專案保持不變。（3.14；`tests/unit/io.project-file.test.ts`）
- **存檔後重新開啟不再遺失資料。** V2 會遺失功能 / 電源設計文字框的 `align`、`background`，時程設計的文字框全部消失且 `theme` 被清除（`tests/unit/io.roundtrip.test.js` 的 `KNOWN_LOSS`）。V3 存開檔完整保留。（3.14；`tests/unit/io.project-file.test.ts`「text box align / background …」）
- **驗證更嚴格。** 未知欄位、超出範圍的數值、指向不存在接腳 / 接點 / 任務的連線、重複 id 都會讓檔案無法開啟並列出位置（V2 會默默略過或修補）。（3.13；`tests/unit/io.schema.test.ts`）
- **8 MB 上限有專屬訊息。** V2 的 8 MB 訊息被外層 loader 蓋掉，只顯示通用的「載入失敗」（2.4 的 `QUIRK`）。V3 顯示「檔案超過 8 MB」。（3.14）
- 存檔欄位 `applicationVersion`（V2 誤寫為 `1.8-rc4`）改為 `app`（例如 `ArchFlow 3.0.0`）。
