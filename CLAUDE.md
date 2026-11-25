# ArchFlow — 工作規則

正在進行 V3.0.0 重構。計畫與各階段要求：`docs/v3-prompts.md`；進度：`docs/v3-progress.md`；現行程式地圖：`docs/code-map.html`。

## Session 開始時
1. 切到 `v3-refactor` 分支並 `git pull`。
2. 讀 `docs/v3-progress.md` 底部的「## 交接」。
3. 從第一個未勾選（`- [ ]`）的步驟繼續。若上一步只做了一半（有未提交的變更或測試失敗），先判斷要修完還是還原，並在交接中說明。

## 每完成一步
1. 跑該步對應層級的驗證（L0–L4，定義見 `docs/v3-prompts.md` 第 1 節）。
2. 通過後在 `docs/v3-progress.md` 勾選該步，並更新「交接」：目前階段、下一步、已知問題、最後通過的驗證層級。
3. commit 並 push 到 `v3-refactor`。

## 禁止事項
- 不可一次做好幾步才提交；每一步一個 commit。
- 額度或時間快用完時，優先更新交接並 push。
- 除非是有意的行為修正（需記錄於 `CHANGELOG.md`），不得為了讓測試通過而修改黃金檔。

## 現行程式（V2.10.1）注意事項
- `index.html` 是發佈檔，第 2 行為 base64，不要直接改。修改 `src/app.zh-Hant.html` 與 `src/app.en.html`（兩份都要改），再執行 `node tools/pack.mjs`；只有新的 `index.html` 時先執行 `node tools/unpack.mjs`。
