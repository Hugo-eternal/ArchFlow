# ArchFlow V3.0.0 重構進度

規則：一次只做一步。完成 → 跑該步標示的驗證層級 → 勾選 → 更新底部「交接」→ commit 並 push 到 `v3-refactor`。
各階段的完整要求見 `docs/v3-prompts.md` 第 3 節；層級定義見第 1 節「修改層級與驗證範圍」。

## 階段 0：初始化
- [x] 0.1 建立 `v3-refactor` 分支、`docs/v3-prompts.md`、`docs/v3-progress.md`、`CLAUDE.md`（L0）

## 階段 1：盤點（只讀，不改程式；全部為 L0）
- [x] 1.1 寫一支只讀分析腳本 `scripts/audit/find-overrides.mjs`：在 `src/app.zh-Hant.html` 找出所有 `const X=fn; fn=function` 覆寫，輸出函式名、層數、行號
- [x] 1.2 依 1.1 的結果寫 `docs/v3-audit.md` §1：每個被覆寫函式的每一層目的（inspector、render、drawEdges、validateDiagram、projectData、exportSvgDocument 優先）
- [x] 1.3 `docs/v3-audit.md` §2：列出 model 欄位（nodes / edges / junctions / texts / theme…），標示「使用中／僅相容舊檔」
- [x] 1.4 `docs/v3-audit.md` §2 續：列出專案 JSON 頂層欄位（project、designs、customStyles、applicationVersion…）與 V3 處置
- [x] 1.5 寫 `scripts/audit/diff-locales.mjs`：比對 zh-Hant 與 en，濾掉翻譯字串，輸出非翻譯差異；結果寫入 `docs/v3-audit.md` §3
- [x] 1.6 `docs/v3-audit.md` §4：死碼與已廢止功能（heading、隱藏的 both 類型、RC 實驗分支、legacy copper / off-grid 轉換）及行號
- [x] 1.7 `docs/v3-audit.md` §5：af20-shell React bundle 的原始碼判斷（搜尋 sourcemap、註解、repo 歷史）；找不到時提出 `vendor/` 隔離方案
- [x] 1.8 盤點內建工具（BOM / EDID / Hex / Pattern）、電源時序、流程圖的邊界與資料格式，寫入 `docs/v3-audit.md` §6
- [x] 1.9 `docs/v3-plan.md`：模組切分（core、model、router、render、inspector、io、export、shell、designs/<type>、tools/<tool>）與依賴方向
- [x] 1.10 `docs/v3-plan.md`：V3 schema 草案（`schemaVersion: 3`）與每種圖面類型的策略物件介面
- [x] 1.11 `docs/v3-plan.md`：風險清單、階段 3 的模組遷移順序（逐一列出步驟），並據此細化本檔階段 3 的步驟

## 階段 2：測試安全網（針對現行 V2.10.1，不改功能）
- [x] 2.1 建立 `package.json`（Vitest、jsdom、Playwright 使用預裝 chromium）與 `npm test` 指令；加入空的冒煙測試（L4）
- [x] 2.2 測試輔助：在 jsdom 載入 `src/app.zh-Hant.html` 並取得引擎全域函式（`tests/helpers/load-app.ts`）（L4）——改用 Chromium，見交接
- [x] 2.3 Unit：`findPath`——路徑為正交、不穿越方塊、不與既有路徑重疊（標註 router）
- [x] 2.4 Unit：`validateDiagram` 資料驗證——合法／非法輸入、上限（100 方塊／400 線／8 MB）（標註 io）
- [x] 2.5 Unit：存檔 ↔ 載入結果一致（`projectData` → `acceptLoadedProject`）（標註 io）
- [x] 2.6 Unit：時程日期計算（scheduleDay、intervalState、手動天數）（標註 designs:schedule）
- [x] 2.7 Unit：自動排列 `autoArrange`——決定性、無重疊（標註 core）
- [x] 2.8 Golden：`tests/golden/function` 代表性專案 + SVG 匯出快照
- [x] 2.9 Golden：`tests/golden/power`
- [x] 2.10 Golden：`tests/golden/schedule`
- [x] 2.11 Golden：`tests/golden/sequence`（電源時序）
- [x] 2.12 Golden：`tests/golden/flowchart`
- [x] 2.13 E2E（Playwright, chromium, `--trace off`）：建立專案、新增方塊與連線
- [x] 2.14 E2E：切換設計、存檔後重開
- [x] 2.15 E2E：匯出 PNG / SVG、切換語系
- [x] 2.16 E2E：開啟每個內建工具（BOM / EDID / Hex / Pattern）
- [ ] 2.17 確認每個測試都有模組標註；整套在 V2.10.1 全部通過；寫 `tests/README.md`

## 階段 3：模組化重構為 V3（依 `docs/v3-plan.md` §3.2）
### 3A 骨架
- [ ] 3.1 TypeScript + Vite 骨架：`package.json` scripts、`tsconfig`、單檔輸出 `dist/ArchFlow.html`（L4）
- [ ] 3.2 建置產物檢查：無外部 URL、大小記錄（L4）
- [ ] 3.3 i18n 框架 `core/i18n.ts` + `i18n/zh-Hant.json`、`i18n/en.json` + 檢查腳本（key 對齊、src 無中日韓字元）（L1）
- [ ] 3.4 `styles/tokens.css` design token 骨架（L1）
- [ ] 3.5 `scripts/extract-vendor.mjs`：從 V2.10.1 逐字抽出 vendor 檔、產生 `VENDOR.md` 與 SHA-256；CI 驗證雜湊（L4）
### 3B 測試轉接
- [ ] 3.6 `tests/tools/v2-to-v3.ts`：golden 專案轉 V3 格式（只在測試使用）（L3）
- [ ] 3.7 結構化 SVG 比對工具（容差、token 顏色）（L3）
- [ ] 3.8 `docs/v3-port-checklist.md`：由 audit §1.4 產生逐層移植清單（L0）
### 3C 底層
- [ ] 3.9 `core/ids`、`core/geometry`（L3）
- [ ] 3.10 `core/store`、`core/history`（含 `history.batch`）（L3）
- [ ] 3.11 `core/commands`、`core/camera`、`core/grid`（L3）
- [ ] 3.12 `model/types` + `model/diagram` 純函式（L3）
- [ ] 3.13 `io/schema`（V3 schema，plan §2）+ 驗證測試（L4）
- [ ] 3.14 `io/project-file`：存開檔、非 V3 顯示「不支援舊版格式」、`io/migrate.ts` 框架（L3）
### 3D 繞線
- [ ] 3.15 `router/find-path`（A* + 成本）（L3）
- [ ] 3.16 `router/full-path`（stub、手動路徑、共用線段）（L3）
- [ ] 3.17 `router/junctions`（分支、T 型正規化）（L3）
### 3E 畫面
- [ ] 3.18 `render`：方塊、接腳（L3）
- [ ] 3.19 `render`：連線、接點、文字框（L3）
- [ ] 3.20 `interaction`：選取、拖曳、拉線、框選、鍵盤（L3）
- [ ] 3.21 `inspector` 框架與欄位元件（L3）
- [ ] 3.22 `export`：SVG / PNG / 頁面 / 可讀性（L3）
### 3F 最小殼層
- [ ] 3.23 `shell`：啟動畫面、設計清單、畫布、屬性面板外框（可操作 function）（L3）
### 3G 設計類型（每項完成即跑 `designs:<x>` 的 unit / golden / E2E）
- [ ] 3.24 `designs/function` 基本方塊圖（L2）
- [ ] 3.25 `designs/function`：零件庫、符號、電壓徽章（L2）
- [ ] 3.26 `designs/function`：區域外框、連接器、LCD 範本（L2）
- [ ] 3.27 `designs/power`（L2）
- [ ] 3.28 `designs/schedule`：時間軸版面與渲染（L2）
- [ ] 3.29 `designs/schedule`：任務 / 間隔編輯、外觀、匯出（L2）
- [ ] 3.30 `designs/sequence` vendor 轉接（L2）
- [ ] 3.31 `designs/flowchart` vendor 轉接（L2）
### 3H 工具
- [ ] 3.32 `tools/bom`（L2）
- [ ] 3.33 `tools/edid`（L2）
- [ ] 3.34 `tools/hex`（L2）
- [ ] 3.35 `tools/pattern`（L2）
### 3I 自動整理
- [ ] 3.36 `layout/` 呼叫圖：以 `v4Generate` 為入口列出實際用到的函式（L0）
- [ ] 3.37 `layout/` autoArrange（L3）
- [ ] 3.38 `layout/` 整理預覽（RC4）（L3）
### 3J 完整殼層
- [ ] 3.39 `shell`：app bar、命令列（L3）
- [ ] 3.40 `shell`：指令面板、快捷鍵（L3）
- [ ] 3.41 `shell`：Tools 中心、狀態列、提示、語系切換（不重新載入）（L3）
### 3K 收尾
- [ ] 3.42 CSS 整併：移除重複規則與多餘 `!important`（L1）
- [ ] 3.43 移植清單全部勾選；確認刪除項目（audit §4）都未移植（L3）
- [ ] 3.44 全部 unit / golden / E2E 對 `dist/ArchFlow.html` 通過；行為修正寫入 `CHANGELOG.md`（L3）
- [ ] 3.45 版本號統一為 V3.0.0（L4）

## 階段 4：Skill、CI、修改層級驗證
- [ ] 4.1 `CLAUDE.md`：架構概要、dev/test/build 指令、硬性規則（L0）
- [ ] 4.2 `.claude/skills/archflow-dev/SKILL.md`（L0）
- [ ] 4.3 `.claude/skills/archflow-release/SKILL.md`（L0）
- [ ] 4.4 `scripts/classify-change.mjs` + 其單元測試（L4）
- [ ] 4.5 `.github/workflows/ci.yml`：PR 依層級跑測試、`verify:full` 標籤、main 每晚 L3（L4）
- [ ] 4.6 CI：`v*` tag 建立 Release 並附 `dist/ArchFlow.html`（L4）
- [ ] 4.7 依賴檢查：禁止 `designs/*` 互相 import（L4）
- [ ] 4.8 更新 `docs/code-map` 對應 V3 模組結構（L0）

## 交接
- **目前階段**：階段 2（測試安全網）——階段 1 已全部完成
- **下一步**：2.17 確認每個測試檔第一行都有 `// module: <x>` 標註（unit、golden、e2e）；整套在 V2.10.1 全部通過；寫 `tests/README.md`（指令、目錄、模組標註規則、golden 更新規則、QUIRK 與 KNOWN_LOSS 的意義、iframe 下載攔截做法）。完成後階段 2 結束。
- **已知問題**：
  - 程式碼目前為 V2.10.1，`index.html` 以 base64 內嵌 `src/app.zh-Hant.html` 與 `src/app.en.html`；改 `src/` 後需執行 `node tools/pack.mjs`。階段 3 開始後 `src/` 會改放 V3 原始碼，屆時 V2 原始碼需先移到 `legacy/`（3.1 處理）。
  - en 版在約 L2361 之後行號比 zh-Hant 多約 8 行（en 獨有 `v147-en-text-tidy`）。
  - V2 React 介面沒有原始碼，使用者已確認採 vendor 隔離（audit §5.3）；V3 殼層以 React + TS 重寫。
  - 已實測確認：存檔的 `applicationVersion` 是 `'1.8-rc4'`。階段 2 只記錄現行 bug、不修（plan §3.1 R10）。
  - 2.4 鎖定的現行怪異行為（測試名稱以 `QUIRK:` 開頭）：方塊標題長度無上限；超過 8 MB 的檔案只顯示通用訊息「載入失敗，原專案已保留。」（L563 的 8 MB 專屬訊息被外層 loader 蓋掉）。V3 修正時要更新這些測試並寫入 CHANGELOG。
  - **2.5 發現的資料遺失 bug**（`tests/unit/io.roundtrip.test.js` 的 `KNOWN_LOSS`）：存檔後重新載入，功能 / 電源設計的文字框遺失 `align`、`background`；**時程設計的文字框全部消失、`theme` 被清除**。V3 必須修正。
  - 2.6 發現：L624 把 `scheduleLabel` 直接換成 `intervalState(e).label`，時程規則的 `count: 'inclusive'`（含頭尾）完全無作用（測試 `QUIRK: scheduleLabel ignores the inclusive counting rule`）。
  - **2.15 待人工確認的疑似 bug**：匯出 PNG / SVG（以及其他經 blob 下載的檔案）時，程式以 `<a download="入門方塊圖.svg">` 指定檔名，但 Chromium 回報的檔名是 `download`（沒有副檔名），因為 iframe 的 blob 網址來源是 `blob:null/…`（從 `file://` 開啟、srcdoc iframe）。需要在使用者實際的 Chrome / Edge 從本機開啟 `index.html` 匯出一次確認；若屬實，V3 要改為從頂層文件建立 blob 下載。E2E 目前檢查「程式要求的檔名」。
  - V2 golden 專案是 V2 格式，V3 需測試專用轉換器（plan R1、步驟 3.6）；SVG 快照要用結構化比對（R2）。
  - 階段 2 的 Playwright 一律 `--trace off`，用預裝 chromium，不要執行 `playwright install`。
- 覆寫掃描已修正（2.6 後）：現為 96 個目標 / 327 層，`*` 整個取代 43 層、`↶` 回退 3 層（audit §1.2、§1.5 已更新）。
- **黃金測試做法**（2.8 建立）：`tests/golden/golden.js` 提供 `loadGolden`（第一次執行時由 bootstrap 產生 `tests/golden/<type>/project.json` 並提交，之後一律經 `#file` 載入此固定檔）、`diagramSummary`（方塊 / 接腳 / 線路座標，取 0.5 px）、`svgStructure`（SVG 結構化比對）。快照在 `tests/golden/<type>/__snapshots__/`，以 Vitest `toMatchFileSnapshot` 比對；只有刻意的行為修正才可用 `npx vitest run tests/golden -u` 更新並記入 CHANGELOG。
- **測試輔助已改為注入內嵌字型**（與 `index.html` 相同的 Source Han Sans TC），並從空白 `file://` 頁面以 `setContent` 載入（與正式版 iframe srcdoc 相同；`about:blank` 會讓流程圖編輯器讀不到 localStorage）。
- vendor 編輯器（時序 / 流程圖）的匯出在 iframe 內攔截：Playwright 的 download 事件抓不到 srcdoc iframe 的錨點下載，改為暫時掛勾 iframe 的 `URL.createObjectURL` 與 `HTMLAnchorElement.prototype.click`（見 `tests/golden/flowchart.test.js` 的 `runExport`）。
- E2E 寫法（2.13 建立）：`tests/e2e/helpers.js`。啟動畫面的設計類型、「範本 / 空白設計」都是 **radio**（不是 button）；`engine(page)` = `page.frame({ name: 'app' })`，只用來讀 model 驗證，操作一律走介面。
- 2.14：設計切換鈕的名稱就是目前設計的名稱（例如「入門方塊圖」），選單有「新增設計…」等項目；新增設計對話框用 V1 隱藏欄位 id（`#managedDesignName`、`#managedDesignType`、`#managedDesignExample`）。殼層「儲存」可用 Playwright `download` 事件攔截；啟動畫面要用「開啟 JSON 專案」按鈕（filechooser 事件可用）。
- **工具**：`.claude/skills/ui-ux-pro-max`（UI/UX 規則，階段 3 用）；`node scripts/audit/find-overrides.mjs`（覆寫鏈）；`node scripts/audit/dump-project-shape.mjs`（存檔欄位實測）；`node scripts/audit/diff-locales.mjs`（語系結構差異）。
- **指令**：`npm test`（Vitest，`tests/unit`、`tests/golden`）；`npm run test:e2e`（Playwright，已帶 `--trace off`）。測試檔第一行以 `// module: <x>` 標註所屬模組。
- 2.2：jsdom 載入 V2 引擎會卡住（90 秒逾時，引擎依賴版面量測與計時器補丁），測試輔助 `tests/helpers/load-app.js` 改在 Vitest 中啟動預裝 Chromium：`const app = await openApp(); await app.eval(fn, ...args); await app.createProject(type); await app.close();`。單元測試也因此需要瀏覽器，每個檔案約 +1 秒。
- **最後通過的驗證層級**：L3（2.16：`npm run test:e2e` 10 項通過；新增 `tests/e2e/tools.spec.js`：四個工具開啟 / 內容 / 經 host.close() 關閉，Hex 工具實際載入 .bin 顯示位元組）
