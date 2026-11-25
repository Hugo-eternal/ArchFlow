# ArchFlow 測試

V3 重構的安全網：先鎖定 V2.10.1 的現行行為（階段 2），重構後同一套測試要對 V3 通過（階段 3）。

## 指令

| 指令 | 內容 |
|---|---|
| `npm test` | Vitest：`tests/unit`、`tests/golden` |
| `npm run test:e2e` | Playwright（只用預裝 Chromium，已帶 `--trace off`）：`tests/e2e` |
| `npm run test:modules` | 檢查每個測試檔的模組標註，並列出「模組 → 測試檔」 |
| `npm run test:all` | 以上三項依序執行 |

不要執行 `playwright install`；`@playwright/test` 版本已對齊環境內建的瀏覽器。

## 目錄

| 目錄 | 內容 |
|---|---|
| `tests/unit/` | 單元測試：繞線、資料驗證、存檔↔載入、時程日期、自動排列 |
| `tests/golden/` | 黃金測試：每種設計一個固定專案（`<type>/project.json`）+ 行為摘要與匯出快照（`<type>/__snapshots__/`） |
| `tests/e2e/` | 端對端：經 `index.html` 與 V2 殼層的真實操作 |
| `tests/helpers/` | `load-app.js`：在 Chromium 載入 `legacy/app.<locale>.html` 並呼叫引擎函式 |

## 模組標註（必填）

每個測試檔第一行：

```js
// module: router — 說明
```

可列多個（逗號分隔）。允許的模組：`core`、`model`、`router`、`render`、`inspector`、`io`、`export`、`shell`、`layout`、`designs:<function|power|schedule|sequence|flowchart>`、`tools:<bom|edid|hex|pattern>`。階段 4 的 `scripts/classify-change.mjs` 依此挑選要跑的測試（修改層級見 `docs/v3-prompts.md` 第 1 節）。

## 為什麼單元測試也要開瀏覽器

V2 引擎在 jsdom 裡載入不會結束（依賴版面量測與計時器補丁），所以 `tests/helpers/load-app.js` 在 Vitest 中啟動 Chromium：

```js
const app = await openApp();                 // 或 openApp({ locale: 'en' })
await app.createProject('function');         // 與啟動畫面相同的建立方式
const ps = await app.eval((a, b) => findPath(a, b, []), {x: 0, y: 0}, {x: 100, y: 50});
await app.close();
```

載入方式比照正式版：注入 `index.html` 內嵌的思源黑體（版面不受系統字型影響），並從空白 `file://` 頁面以 `setContent` 載入（同 iframe srcdoc；`about:blank` 會讓流程圖編輯器讀不到 localStorage）。

## 黃金測試規則

- `project.json` 第一次執行時由測試中的 `bootstrap` 從內建範例產生並提交；之後一律經 `#file` 載入這份固定檔，不再重新產生。要重建就刻意刪掉它。
- 快照用 Vitest `toMatchFileSnapshot`。SVG 以「結構」比對（元素、文字、座標取 0.5 px），原始 `.svg` 另存供人工檢視。
- **只有刻意的行為修正才可以更新快照**：`npx vitest run tests/golden -u`，並把修正寫入 `CHANGELOG.md`。不得為了讓測試通過而改黃金檔。

## QUIRK 與 KNOWN_LOSS

測試名稱以 `QUIRK:` 開頭、或 `io.roundtrip.test.js` 中的 `KNOWN_LOSS`，代表**鎖定的 V2.10.1 現行 bug**（例如重新載入後時程文字框消失、存檔的 `applicationVersion` 是 `1.8-rc4`）。階段 2 只記錄不修；V3 修正時，同步改這些測試並寫入 CHANGELOG。清單見 `docs/v3-progress.md` 的「交接」。

## iframe 內的下載與剪貼簿

- 殼層的「儲存」「匯出」可用 Playwright `download` 事件攔截；但檔名會被 Chromium 報成 `download`（blob 來源為 `null`），因此 E2E 另外掛勾 `HTMLAnchorElement.prototype.click` 取得程式要求的檔名。
- 時序 / 流程圖編輯器（巢狀 srcdoc iframe）的下載抓不到 `download` 事件：在該 iframe 內暫時掛勾 `URL.createObjectURL` 與 `HTMLAnchorElement.prototype.click`（見 `tests/golden/flowchart.test.js` 的 `runExport`）。
- 剪貼簿（時序表、Mermaid）以替換該 iframe 的 `navigator.clipboard` 取得內容。
