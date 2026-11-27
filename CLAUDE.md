# ArchFlow — 工作規則（v2-fix）

**目前方向**：以 V2.10.1 為主體修正（使用者決定 V2 的視覺化 UI／UX 體驗較好）。清單、順序與進度：`docs/v2-fix-plan.md`；V2 盤點報告：`docs/v3-audit.md`；現行程式地圖：`docs/code-map.html`。
V3 重構已暫停，最後狀態在 `v3-refactor` 分支（`docs/v3-progress.md` 的「交接」）；本分支保留 V3 的 `src/` 與測試作為參考，不在這裡繼續 V3。

## Session 開始時
1. 切到 `v2-fix` 分支並 `git pull`。
2. 讀 `docs/v2-fix-plan.md` 底部的「## 進度與交接」。
3. 從第一個未勾選（`- [ ]`）的項目繼續。若上一項只做了一半（有未提交的變更或測試失敗），先判斷要修完還是還原，並在交接中說明。

## 每完成一項
1. 驗證：`npm run test:legacy` 與 `npm run test:legacy:e2e -- --workers=1` 全部通過；修改後 `node tools/pack.mjs` 重新產生 `index.html`。
2. 有新行為就補 `tests/legacy` 的測試；刪死碼前先用測試確認它真的沒有作用。
3. 在 `docs/v2-fix-plan.md` 勾選該項，更新「進度與交接」：下一項、已知問題、最後通過的驗證。
4. 行為改變記在 `CHANGELOG-V2.md`（V2 修正專用的變更紀錄）。
5. commit 並 push 到 `v2-fix`。

## 禁止事項
- 不可一次做好幾項才提交；每一項一個 commit。
- 額度或時間快用完時，優先更新交接並 push。
- 除非是有意的行為修正（需記錄於 `CHANGELOG-V2.md`），不得為了讓測試通過而修改黃金檔或 `QUIRK:` / `KNOWN_LOSS` 的預期值。

## V2.10.1 程式注意事項
- `index.html` 是發佈檔，第 2 行為 base64，不要直接改。修改 `legacy/app.zh-Hant.html` 與 `legacy/app.en.html`（兩份都要改），再執行 `node tools/pack.mjs`；只有新的 `index.html` 時先執行 `node tools/unpack.mjs`。
- `index.html` 第 3 行是內嵌字型（`AF_FONT_CSS`），不要改。
- en 版在約 L2361 之後行號比 zh-Hant 多約 8 行（en 獨有 `v147-en-text-tidy`）。
- React 殼層（`af20-shell` bundle）沒有原始碼；它靠點擊隱藏的 V1 按鈕驅動引擎（`docs/v3-audit.md` §4.1 的 42 個 id），這些按鈕不是死碼。要改殼層行為，在殼層之後加補丁層。
- Playwright 一律 `--trace off`，用預裝 chromium，不要執行 `playwright install`。

## 專案 skill
- `.claude/skills/ui-ux-pro-max`（第三方，MIT，上游 commit 見 `UPSTREAM_COMMIT`）：UI / UX 設計規則與搜尋資料。搜尋腳本：`python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain <domain>`。不要修改此目錄內容；要更新時整個目錄換成新版。
