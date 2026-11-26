# ArchFlow 測試

V3 重構的安全網：先鎖定 V2.10.1 的現行行為（階段 2），重構後同一套測試要對 V3 通過（階段 3）。

## 指令

| 指令 | 內容 |
|---|---|
| `npm test` | Vitest（V3）：`tests/unit`、`tests/golden`——`src/` 模組，以及與 V2.10.1 的對照 |
| `npm run test:e2e` | Playwright（V3）：`tests/e2e/v3-*.spec.ts`，對 `dist/ArchFlow.html`（先 `npm run build`） |
| `npm run test:legacy` | Vitest（V2 對照組）：`tests/legacy/unit`、`tests/legacy/golden` |
| `npm run test:legacy:e2e` | Playwright（V2 對照組）：`tests/legacy/e2e`，對 `index.html`（V2.10.1） |
| `npm run test:modules` | 檢查每個測試檔的模組標註，並列出「模組 → 測試檔」 |
| `npm run test:all` | 模組標註、檢查、型別、建置、產物檢查、`npm test`、`npm run test:e2e`（不含 V2 對照組） |

Playwright 一律 `--workers=1`（雲端環境記憶體）與 `--trace off`。不要執行 `playwright install`；`@playwright/test` 版本已對齊環境內建的瀏覽器。

## 目錄

| 目錄 | 內容 |
|---|---|
| `tests/unit/` | V3 單元測試（直接 import `src/`）；與 V2 有關的會在 Chromium 開 V2 當對照（oracle） |
| `tests/golden/` | V3 黃金測試 + 黃金資料：每種設計一個固定專案（`<type>/project.json`）、V2 錄下的快照與 V3 轉換檔（`<type>/__snapshots__/`） |
| `tests/e2e/` | V3 端對端：對 `dist/ArchFlow.html` 的真實操作 |
| `tests/legacy/` | **V2 對照組**（階段 2 建立）：只描述 V2.10.1 行為的測試——`golden/*.test.js` 是 `tests/golden/<type>/__snapshots__` 的錄製者，`unit/*.test.js` 鎖定 V2 引擎行為（含 `QUIRK:` 與 `KNOWN_LOSS`），`e2e/*.spec.js` 經 V2 殼層操作 |
| `tests/helpers/` | `load-app.js`：在 Chromium 載入 `legacy/app.<locale>.html` 並呼叫引擎函式（V3 對照測試與 V2 對照組共用） |
| `tests/tools/` | 只給測試用的工具：`v2-to-v3.ts`（V2 檔 → V3）、`svg-compare.ts` |

### V2 對照組的用途與移除條件（3.44）

- 用途：V3 的黃金比對以 V2 的實際行為為準。`tests/legacy` 重新產生或驗證這些快照；V3 測試則讀快照，或在 Chromium 中直接請 V2 產生結果再比對（例如 `templates.examples.test.ts`、`function.template.test.ts`、`router.*`）。
- 每個 V2 E2E 在 V3 都有對應：smoke / create-and-wire / designs-save-reopen → `v3-shell.spec.ts`；export-and-language → `v3-shell.spec.ts`（SVG、語言）與 `v3-function.spec.ts`「export PNG」；tools → `v3-tools.spec.ts`。
- 移除條件：`legacy/` 從倉庫移除時，一併移除 `tests/legacy` 與 `tests/helpers/load-app.js`，並把仍在 Chromium 中呼叫 V2 的 V3 測試改為讀錄好的快照。

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
