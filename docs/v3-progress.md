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
- [x] 2.17 確認每個測試都有模組標註；整套在 V2.10.1 全部通過；寫 `tests/README.md`

## 階段 3：模組化重構為 V3（依 `docs/v3-plan.md` §3.2）
### 3A 骨架
- [x] 3.1 TypeScript + Vite 骨架：`package.json` scripts、`tsconfig`、單檔輸出 `dist/ArchFlow.html`（L4）
- [x] 3.2 建置產物檢查：無外部 URL、大小記錄（L4）
- [x] 3.3 i18n 框架 `core/i18n.ts` + `i18n/zh-Hant.json`、`i18n/en.json` + 檢查腳本（key 對齊、src 無中日韓字元）（L1）
- [x] 3.4 `styles/tokens.css` design token 骨架（L1）
- [x] 3.5 `scripts/extract-vendor.mjs`：從 V2.10.1 逐字抽出 vendor 檔、產生 `VENDOR.md` 與 SHA-256；CI 驗證雜湊（L4）
### 3B 測試轉接
- [x] 3.6 `tests/tools/v2-to-v3.ts`：golden 專案轉 V3 格式（只在測試使用）（L3）
- [x] 3.7 結構化 SVG 比對工具（容差、token 顏色）（L3）
- [x] 3.8 `docs/v3-port-checklist.md`：由 audit §1.4 產生逐層移植清單（L0）
### 3C 底層
- [x] 3.9 `core/ids`、`core/geometry`（L3）
- [x] 3.10 `core/store`、`core/history`（含 `history.batch`）（L3）
- [x] 3.11 `core/commands`、`core/camera`、`core/grid`（L3）
- [x] 3.12 `model/types` + `model/diagram` 純函式（L3）
- [x] 3.13 `io/schema`（V3 schema，plan §2）+ 驗證測試（L4）
- [x] 3.14 `io/project-file`：存開檔、非 V3 顯示「不支援舊版格式」、`io/migrate.ts` 框架（L3）
### 3D 繞線
- [x] 3.15 `router/find-path`（A* + 成本）（L3）
- [x] 3.16 `router/full-path`（stub、手動路徑、共用線段）（L3）
- [x] 3.17 `router/junctions`（分支、T 型正規化）（L3）
### 3E 畫面
- [x] 3.18 `render`：方塊、接腳（L3）
- [x] 3.19 `render`：連線、接點、文字框（L3）
- [x] 3.20 `interaction`：選取、拖曳、拉線、框選、鍵盤（L3）
- [x] 3.21 `inspector` 框架與欄位元件（L3）
- [x] 3.22 `export`：SVG / PNG / 頁面 / 可讀性（L3）
### 3F 最小殼層
- [x] 3.23 `shell`：啟動畫面、設計清單、畫布、屬性面板外框（可操作 function）（L3）
### 3G 設計類型（每項完成即跑 `designs:<x>` 的 unit / golden / E2E）
- [x] 3.24 `designs/function` 基本方塊圖（L2）
- [x] 3.25 `designs/function`：零件庫、符號、電壓徽章（L2）
- [x] 3.26a 區域外框（3.26 拆成兩步：外框屬於所有方塊圖共用，放在 model / render / interaction / inspector）（L3）
- [x] 3.26b `designs/function`：連接器、LCD 範本（L2）
- [x] 3.26c 方塊圖合併（規劃步驟）：「功能方塊圖」與「電源架構」合併為一種設計類型 `function`（介面名稱「方塊圖」），同一份資料以 `BlockDiagram.view`（`'function' | 'power'`）切換「功能檢視 / 電源檢視」；只改計畫與存檔格式，不寫新功能（L4）
- [x] 3.27a `designs/function` 檢視切換：畫布上方兩段式切換「功能檢視 / 電源檢視」與快捷鍵 Shift+V（只改呈現、不改資料、不記復原，`view` 存檔，切換標記未存檔）；依檢視呈現（功能檢視：隱藏電壓 / 電流 / 效率、角色配色、需求 vs 額定，電源線照畫但無數值標籤；電源檢視：顯示上述標註與電源線電壓 / 電流標籤，訊號線變淡）；屬性面板依檢視列欄位（資料兩邊都保留）；新方塊 / 新線路預設值跟著檢視（model 已在 3.26c 改為讀 `view`）；匯出依目前檢視、對話框可另選檢視（L3：會改到 render / inspector / shell / export）
- [x] 3.27b `designs/function` 電源檢視的電源功能（3.27b 拆成兩步，範本移到 3.27c）：角色、量測欄位（電壓 / 電流 + 單位 / 功率 / 效率、顯示開關）與量測表繪製（與 V2 golden power 匯出比對）、線路電氣欄位（`wire.electrical`）、需求 vs 額定、電源檢視新方塊預設電源接腳（L3：改到 render / export / model / shell）
- [x] 3.27c `designs/function`「入門電源樹 / Starter power tree」範本（V2 引擎產生並轉成 V3，`data.view: 'power'`，加到 `functionDesign.templates`；新增設計對話框選它時以電源檢視開啟）；golden power 在電源檢視下完整 `compareSvg` 比對 V2 匯出（方塊標題位置含量測帶）；角色配色（使用者決定新增）（L2）（實際跑 L3：改到 render / styles）
- [x] 3.28 `designs/schedule`：時間軸版面與渲染（實際跑 L3：改到 shell / designs/module / styles）
- [x] 3.29 `designs/schedule`：任務 / 間隔編輯、外觀、匯出（實際跑 L3：改到 shell / inspector / export / io/schema）
- [x] 3.29b `designs/function` 方塊圖兩種檢視的 UI/UX 優化（L2；若改到 render / styles 共用檔則跑 L3）（a～e 各一個 commit，皆跑 L3）
- [x] 3.30 `designs/sequence` vendor 轉接（實際跑 L3：改到 core / shell / interaction）
- [x] 3.31 `designs/flowchart` vendor 轉接（實際跑 L3：改到 interaction / shell）
### 3H 工具
- [x] 3.32 `tools/bom`（實際跑 L3：工具框架改到 shell）
- [x] 3.33 `tools/edid`（L2）
- [x] 3.34 `tools/hex`（L2）
- [x] 3.35 `tools/pattern`（L2）
### 3I 自動整理
- [x] 3.36 `layout/` 呼叫圖：以 `v4Generate` 為入口列出實際用到的函式（L0）
- [x] 3.37a `layout/` golden 錄製（V2 引擎在 golden 圖上的候選結果）＋資料轉接層＋量測 / 幾何（`roMetrics`、`ssClassify`、`roGeometry` 等，與 V2 base 指標一致）（L3）
- [x] 3.37b `layout/` 繞線（`roAdapters`、`roFind`、`uiRouteOne`、`ssRouteOne`、`uiRoutes`；routes 模式的路徑與 V2 一致）（L3）
- [x] 3.37c `layout/` 線路標籤（`uiDefaultLabels`、`uiLiveLabels`、`uiArrangeLabels`、`uiLabelRect`；與 V2 一致）（L3）
- [x] 3.37d `layout/` 排列、候選、保護檢查、逐條改善與入口 `organize()`（layout 模式與 V2 一致、決定性）（L3）
- [x] 3.38 `layout/` 整理預覽（RC4）（實際 L4：存檔欄位 `wire.label.auto`）
### 3J 完整殼層
- [x] 3.39 `shell`：app bar、命令列（L3）
- [x] 3.40 `shell`：指令面板、快捷鍵（L3）
- [x] 3.41 `shell`：Tools 中心、狀態列、提示、語系切換（不重新載入）（L3）
- [x] 3.41b `designs/function`：版面設定——對齊 / 格線（V2 workspaceManage 面板）、版面與字體（V2 #chineseFont / #englishFont 與字級）、依連線排列接腳（V2 afArrangeSelectedIO）（L3；改到 render 字型時加跑 golden）
### 3K 收尾
- [x] 3.42 CSS 整併：移除重複規則與多餘 `!important`（L1；改到 package.json，實際跑 L3 + 產物檢查）
- [x] 3.43a 移植清單逐列分類（☑ 寫 V3 位置、✂ 寫不移植原因）、audit §4 刪除項目以測試確認未移植（`tests/unit/dead-code.test.ts`）；找出的 16 列功能缺口排入 3.43b–3.43e（L0 + 新測試）
- [x] 3.43b `designs/schedule`：編輯語意補齊——「接續任務」插在選取任務之後（V2 L3583）、刪除中間任務接回後續（L772）、新任務預設日期與不重複名稱（af16 fillDefaults L3567）、沿用分支顏色（L800）；順便評估 af16 的「順延衝突」（fixConflicts L3604）與畫布上直接改名（startRename）（L2）
- [x] 3.43c `designs/function` / `inspector`：方塊尺寸與名稱——自由尺寸開關與精確寬高（V2.9 L10587）、無名稱方塊開關（`showTitle`，V2.9 L10565）、文字隨方塊縮放（V2.10 L10627）、每方塊字級（V2.7 L10399）（L3）
- [x] 3.43d `interaction` / `model`：線路路徑手動編輯——選取線段的平移把手（L1552–L1562）、轉角把手（L2141）、Shift 拖曳接腳沿方塊邊移動（L1553 / V1 project）（L3）
- [x] 3.43d2 `render` / `inspector` / `interaction`：線路標籤手動標記的拖曳 / 旋轉與屬性欄位（L1802 / L1805 / L1885）、標籤與相鄰同名接腳去重（L3099 dedupeLabels）、新方塊沿用多數方塊的名稱位置與編號規則（L3097 adopt）（L3）
- [x] 3.43e `interaction`：零件端點拖到方塊本體自動新增接腳並連線、拖到線上新增分支點（V2 finish L4209）（L3）
- [x] 3.43f 非覆寫功能區塊盤點（`docs/v3-port-checklist.md` 新增一節；L0）
- [x] 3.43g `designs/*`：補齊範本——方塊圖兩個 10 模組範例（V2 LIB.function0 / function1）、電源樹兩個 9 節點範例（LIB.current0 / current1）、時程「產品開發時程」與「工程變更流程」（PLANS.product / eco）（L2；golden 以 V2 實際產出比對，同 3.25–3.28 的做法）
- [ ] 3.43h `designs/schedule`：時程總覽——總天數與起訖、狀態進度條與圖例、有問題的任務清單（點選前往）（V2 af16 overview L3430）（L2）
- [ ] 3.43i `designs/function`：零件數值——自動補單位、常用值清單（V2 L4267 normValue）（L2）
- [ ] 3.43 移植清單全部勾選（3.43b–e 完成後表中沒有 ☐）；確認刪除項目（audit §4）都未移植（L3）
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
- **目前階段**：階段 3（模組化重構）——3K 收尾：3.43g 完成；剩 3.43h、3.43i，然後 3.43
- **下一步**：3.43h 時程總覽。V2 af16 `overview(panel)`（legacy L3430–L3451）：沒有選取時屬性面板最上方「時程總覽」——總天數與起訖（所有任務最早開始到最晚結束，含首尾）、依狀態（完成 / 進行中 / 待辦）的比例條與圖例、有日期問題（衝突 / 逾期）的任務清單按鈕（點選即選取並捲到該任務），以及 3.43b 的「一鍵順延」。V3：`src/designs/schedule/fields.ts` 的 `designFields()`（目前只有 `note('count')` 與 fixAll），清單按鈕需要 `selectItem` → custom 欄位拿不到 shell；可在 `CustomContext` 加一個 `select?(sel)`（inspector panel options 提供）或讓 InspectorPane 傳入。
- **已排入**：（3.29b 已完成，範圍見 plan §2.2.2。）
- **已知問題**：
  - **目錄（3.1 起）**：V2.10.1 原始碼在 `legacy/app.zh-Hant.html`、`legacy/app.en.html`（`index.html` 仍是 V2 發佈檔，`node tools/pack.mjs` / `unpack.mjs` 對應 `legacy/`）；`src/` 是 V3 原始碼，`npm run build` 產出 `dist/ArchFlow.html`（不提交，`.gitignore`）。audit / code-map 的行號仍指 `legacy/` 檔案。現有測試全部對 `legacy/`（V2）執行，直到 3.44 改為對 `dist/`。
  - en 版在約 L2361 之後行號比 zh-Hant 多約 8 行（en 獨有 `v147-en-text-tidy`）。
  - V2 React 介面沒有原始碼，使用者已確認採 vendor 隔離（audit §5.3）；V3 殼層以 React + TS 重寫。
  - 已實測確認：存檔的 `applicationVersion` 是 `'1.8-rc4'`。階段 2 只記錄現行 bug、不修（plan §3.1 R10）。
  - 2.4 鎖定的現行怪異行為（測試名稱以 `QUIRK:` 開頭）：方塊標題長度無上限；超過 8 MB 的檔案只顯示通用訊息「載入失敗，原專案已保留。」（L563 的 8 MB 專屬訊息被外層 loader 蓋掉）。V3 修正時要更新這些測試並寫入 CHANGELOG。
  - **2.5 發現的資料遺失 bug**（`tests/unit/io.roundtrip.test.js` 的 `KNOWN_LOSS`）：存檔後重新載入，功能 / 電源設計的文字框遺失 `align`、`background`；**時程設計的文字框全部消失、`theme` 被清除**。V3 必須修正。
  - 2.6 發現：L624 把 `scheduleLabel` 直接換成 `intervalState(e).label`，時程規則的 `count: 'inclusive'`（含頭尾）完全無作用（測試 `QUIRK: scheduleLabel ignores the inclusive counting rule`）。
  - 2.15 的匯出檔名疑點**已由使用者確認不是 bug**：在實際 Chrome / Edge 從本機開啟 `index.html` 匯出 SVG，檔名正常。Playwright 回報 `download` 只是自動化瀏覽器對 `blob:null` 來源的行為差異；E2E 繼續以「程式要求的檔名」驗證。V3 不需為此修改下載方式。
  - V2 golden 專案是 V2 格式，V3 需測試專用轉換器（plan R1、步驟 3.6）；SVG 快照要用結構化比對（R2）。
  - 階段 2 的 Playwright 一律 `--trace off`，用預裝 chromium，不要執行 `playwright install`。
- 覆寫掃描已修正（2.6 後）：現為 96 個目標 / 327 層，`*` 整個取代 43 層、`↶` 回退 3 層（audit §1.2、§1.5 已更新）。
- **黃金測試做法**（2.8 建立）：`tests/golden/golden.js` 提供 `loadGolden`（第一次執行時由 bootstrap 產生 `tests/golden/<type>/project.json` 並提交，之後一律經 `#file` 載入此固定檔）、`diagramSummary`（方塊 / 接腳 / 線路座標，取 0.5 px）、`svgStructure`（SVG 結構化比對）。快照在 `tests/golden/<type>/__snapshots__/`，以 Vitest `toMatchFileSnapshot` 比對；只有刻意的行為修正才可用 `npx vitest run tests/golden -u` 更新並記入 CHANGELOG。
- **測試輔助已改為注入內嵌字型**（與 `index.html` 相同的 Source Han Sans TC），並從空白 `file://` 頁面以 `setContent` 載入（與正式版 iframe srcdoc 相同；`about:blank` 會讓流程圖編輯器讀不到 localStorage）。
- vendor 編輯器（時序 / 流程圖）的匯出在 iframe 內攔截：Playwright 的 download 事件抓不到 srcdoc iframe 的錨點下載，改為暫時掛勾 iframe 的 `URL.createObjectURL` 與 `HTMLAnchorElement.prototype.click`（見 `tests/golden/flowchart.test.js` 的 `runExport`）。
- E2E 寫法（2.13 建立）：`tests/e2e/helpers.js`。啟動畫面的設計類型、「範本 / 空白設計」都是 **radio**（不是 button）；`engine(page)` = `page.frame({ name: 'app' })`，只用來讀 model 驗證，操作一律走介面。
- 2.14：設計切換鈕的名稱就是目前設計的名稱（例如「入門方塊圖」），選單有「新增設計…」等項目；新增設計對話框用 V1 隱藏欄位 id（`#managedDesignName`、`#managedDesignType`、`#managedDesignExample`）。殼層「儲存」可用 Playwright `download` 事件攔截；啟動畫面要用「開啟 JSON 專案」按鈕（filechooser 事件可用）。
- 指令：`npm run build`（`dist/ArchFlow.html`）、`npm run check:dist`（外部請求檢查 + 大小與 V2.10.1 比較）、`npm run typecheck`；`npm run test:all` 依序跑模組標註 → 型別 → 建置 → 產物檢查 → Vitest → Playwright。
- i18n（3.3）：`src/core/i18n.ts` 的 `t(key, vars)`，key 為扁平字串（`area.item`），型別由 `i18n/zh-Hant.json` 推導；文字一律放 `i18n/*.json`，`npm run check:i18n` 會擋 `src/` 中的中日韓字元與兩語系 key / 佔位符不一致。localStorage 鍵為 `archflow:locale`（plan：統一 `archflow:` 前綴）。V3 原始碼的單元測試直接 import TS，不需要瀏覽器。
- design token（3.4）：`src/styles/tokens.css` 是唯一可寫裸色碼的檔案（亮色 + 深色兩組，深色同時有 `@media` 與 `[data-theme="dark"]`），其餘 CSS 只能用 `var(--…)`；`npm run check:tokens` 檢查未定義 token、裸色碼與 18 組文字 / 背景對比（亮、暗各一次）。
- vendor（3.5）：`vendor/` 9 個檔案逐字取自 V2.10.1 shell（電源時序 / 流程圖 / RSI BOM 各 bundle.js + style.css，EDID / Hex / Pattern 各一個 html），`vendor/manifest.json` 記 SHA-256；`npm run check:vendor` 重新抽取比對，任何修改都會失敗；`tests/unit/vendor.test.js` 確認與 V2 執行時注入 iframe 的 srcdoc 完全相同。iframe 組裝方式與 host 介面寫在各目錄 `VENDOR.md`。
- V3 存檔型別（3.6）：`src/io/schema-types.ts`（純型別，依 plan §2 並對照實際 V2 欄位修正：連接器為 `{kind, side, pins[], only, mpn, visibleRows, hiddenRows}`，接腳有 `pin`/`end`）。`tests/tools/v2-to-v3.ts` 是只給測試用的 V2→V3 轉換器，五種 golden 轉換結果存在 `tests/golden/<type>/__snapshots__/project.v3.json`（之後 V3 載入 golden 用這份）。`tsconfig` 的 include 加了 `tests/tools`。
- SVG 比對（3.7）：`tests/tools/svg-compare.ts` 的 `compareSvg(expected, actual, { tolerance, colorRoles, ignore })`：比較標籤數量、文字集合、同標籤元素以最近幾何配對（容差預設 1 px，忽略順序與巢狀），顏色先轉成角色再比（`V2_COLOR_ROLES` + `V3_COLOR_ROLES` 合併傳入）。
- 移植清單（3.8）：`docs/v3-port-checklist.md`（327 層：☐ 301、✂ 5、⤳ 21），依 V3 模組分節；`node scripts/audit/port-checklist.mjs` 重新產生時保留手動改過的狀態 / 備註。每完成一個模組就把它的列改為 ☑ 或 ✂。
- core 基礎（3.9）：`src/core/geometry.ts`（near / same / orth / dir / inside / cuts / clear / simplify / rectOf / pathLength / toPathData，純函式）與 `src/core/ids.ts`（`uid` 與 V2 同格式、可注入亂數；`isValidId`；`clone`）。測試以 400 組固定亂數輸入在 V2 引擎與 V3 同時執行比對，結果完全一致。
- 狀態與歷史（3.10）：`src/core/history.ts`（`History<T>`：JSON 快照、`update`、`batch`（巢狀合併、例外回滾）、undo / redo 皆標 dirty、上限）與 `src/core/store.ts`（`Store`：專案名、設計清單各自一份 History、目前設計、選取、鏡頭、`toFile()` / `load()`、訂閱）。
- 命令 / 鏡頭 / 格線（3.11）：`src/core/commands.ts`（`CommandRegistry<C>`：id 與快捷鍵唯一、`enabled()` 例外視為停用、`handleKey` 在文字欄位只接受 Mod 組合鍵；`V2_HIDDEN_ELEMENT_COMMANDS` 把 audit §4.1 的 42 個隱藏元素 id 對應到 V3 命令 id，殼層（3.39–3.41）必須註冊每個非 null 的命令）。`src/core/camera.ts`（純函式：`zoomAt` / `zoomBy` / `wheelFactor` / `fit(bounds, viewport, FitOptions)` / `unionBounds` / `centreOn`；時程與外框的 fit 差異改由設計模組傳 `FitOptions` 與外框）。`src/core/grid.ts`（`normalize` 回傳新 diagram 或丟 `GridError(code, id)`、`protect`、`checks`、`portAt`、`portPoint`、`endPoint`）。測試與 V2 比對：zoomAt 60 組、function 範例的 fit、打亂座標後的 ggNormalize（格距 10 / 20 / 40）全部一致。
  - V2 的 `gg*` 函式不是頁面全域，測試從 `legacy/app.zh-Hant.html` 取出原始碼在頁面中執行（`tests/unit/core.camera-grid.test.ts` 的 `v2GridSource`）。
  - 與 V2 的差異（有意）：V3 接點沒有自己的鎖定（V2 `junction.afLocked`），normalize 一律對齊；V2 只對 `manual` 對齊、不對齊 `afRouteOnly`，V3 兩者合併為 `route`，一律對齊。V2 的 `afShape`（文字形狀方塊，最小 40）在 V3 schema 與轉換器中都沒有對應欄位——3.25 處理零件庫時要確認它是否需要加入 schema。
- model（3.12）：`src/model/types.ts`（重新匯出存檔型別、`LIMITS`（100 方塊 / 400 線 / 每方塊 100 接腳 / 文字 20000 字）、`ItemRef`、`ModelError(code, id)`）與 `src/model/diagram.ts`（純函式，輸入不變、回傳新 data：`makeBlock` / `addBlock` / `updateBlock` / `moveItems` / `addPort` / `updatePort` / `growForPorts` / `connect` / `reconnect` / `clearRoutes` / `addJunction` / `addText` / `updateText` / `addFrame` / `remove`、查詢 `wiresAt` / `danglingWires` / `nextRef`）。路徑是否可行不在 model 檢查，由 router（3.15）負責。
  - 與 V2 比對：刪除方塊 / 接腳後留下的線與 V2 `removeSelection` 相同；連續新增 5 個接腳再經格線正規化，名稱、位置、方塊尺寸與 V2 `afAddFunctionPort` + `commit` 完全相同。
  - 已釐清的 V2 行為：格線開啟時，新增接腳**不會移動既有接腳**（V2 的 `afGridOffset` 蓋過重新平均分布），新接腳放在該側 n/(n+1)，再由正規化推開；方塊因接腳數加高時保持接腳絕對位置。格線關閉時才整側平均分布。V3 照此實作（`addPort` 依 `grid.snap` 分支）。
  - V2 在 render 中依接腳數加大方塊（L1257），V3 改為 model 規則 `growForPorts`，由 `addPort` 呼叫；之後 3.18 / 3.20 其他會增加接腳的操作也要呼叫它。
- schema（3.13）：`src/io/schema.ts`，無外部套件，以小型組合子（`obj` / `arr` / `str` / `num` / `oneOf` / `tagged` / `union` / `opt`）寫成。**未知欄位一律報錯**（vendor 文件 sequence / flowchart 除外，只驗外層與 4 MB 上限）。錯誤為 `{ path, code, detail }`，最多 50 筆。入口：`validateProject(raw)`、`parseProject(text)`（先檢查 8 MB）、`validateData(type, data)`、`isV3(raw)`、`DATA_SCHEMAS`（給 3.24 起的 `DesignModule.schema`）。另外檢查：id 唯一（每張圖共用一個命名空間）、線兩端 / 時程連線兩端存在、`activeDesignId` 存在、日期格式。上限集中在 `FILE_LIMITS`。
  - 五份 golden 的 V3 轉換檔與 store 輸出的檔案都通過；V2 檔回傳 `version` 錯誤（3.14 用它顯示「不支援舊版格式」）。
  - `scheduleSchema.appearance` 目前只驗為 JSON 物件（≤ 200 KB），形狀在 3.29 補上。
  - **人工驗收**（L4 項目）：這一步沒有使用者可見的介面，留到 3.14 開檔流程與 3.45 發版時一併驗收。遷移測試：`io/migrate.ts` 在 3.14 才建立，屆時補上。
- 存開檔（3.14）：`src/io/project-file.ts`——`readProjectText` / `readProjectBlob`（先檢查 8 MB）→ `migrate` → `validateProject`；結果 `reason` 為 `too-large` / `not-json` / `legacy-format` / `newer-format` / `invalid`，`openMessage(r)` 給 i18n key（`file.*`，`file.invalid` 帶 `{count}`）。`openProjectText(store, text)` 失敗時 store 完全不變。`saveProject(store)` 先自我驗證（失敗代表程式錯誤，直接丟例外）、回傳 `{ name, text }` 並標記已存；檔名 `fileNameFor`（去除非法字元，副檔名 `.archflow.json`）；`downloadText` 為瀏覽器下載。`src/io/migrate.ts`：`MIGRATIONS[n]` 把 n 版升到 n+1，目前為空；低於 3 → legacy，高於目前 → newer。
  - 有意的行為修正已寫入新建的 `CHANGELOG.md`（不讀舊檔、存開檔不再遺失文字框 / 時程 theme、8 MB 專屬訊息、嚴格驗證、`app` 欄位）。之後每次有意修正都加在這裡。
  - 人工驗收（3.13 留下的 L4 項目）：開檔流程還沒有介面，等 3.23 最小殼層接上「開啟」後，請使用者實際開一個 V2 檔確認顯示「不支援舊版格式」。
- 繞線搜尋（3.15）：`src/router/find-path.ts`，單一 A* 引擎 `findPath(start, end, rects, options)` + 三組預設：`gridSearch(g, segments)`（V2 ggFind：外擴 5g、轉彎 2g、重疊每 px 3 + 2g）、`freeSearch(segments, junctions)`（V2 afFindRoute + afRouteCost：外擴 45、轉彎 38、重疊每 px 4 + 30、交叉 60、接點座標加入搜尋線）、`BASIC_SEARCH`（V2 L274 findPath，V2 只剩拉線預覽在用）。另有 `gridBoxes`（ggBoxes）。Heap 照 V2 移植以保持同分時的順序。與 V2 在 450 組隨機案例（格距 10 / 20、非格線座標）結果**完全相同**。
- 完整路徑（3.16）：`src/router/full-path.ts`——`routeWire(wire, diagram, segments)` → `{ ps, valid, failed }`（`ps` 已簡化，不像 V2 頭尾重複一點）；`routeAll(diagram)` 依線的順序排，每條排好的線段加入後面線的重疊成本（同 V2 drawEdges 順序）；`legalOnGrid`（ggPathLegal）、`blockRects`、`segmentsOf`。格線開啟 = ggRoute（stub 一格），關閉 = L1211 fullPath（stub 30、外擴 16 再 6）+ L277 手動路徑（bridge）。
  - `route` 的意義：第一點等於起點 → 完整路徑（V2 `afRouteOnly`）；否則為轉折點（V2 `manual`）。
  - **有意修正**（已寫入 CHANGELOG）：不合法且未鎖定的 `route` 一律改回自動繞線（V2 只在格線模式這樣做）；格線關閉時以存檔的 `w` / `h` 繞線（V2 用 DOM 量測尺寸）。
  - 與 V2 比對：golden function / power 每條線，格線開啟時**直接**完全相同；格線關閉時，在套用 V2 量測尺寸後完全相同。
- 接點（3.17）：`src/router/junctions.ts`——`cleanJunctions(diagram)` → `{ data, changed }`（V2 afCleanJunctions：刪除無效 / 自接的線；少於 2 條線的接點連線刪除；剛好 2 條時合併回一條線，保留第一條的 id 與格式、取第二條的箭頭、捨棄 route；刪除沒連到方塊的接點孤島）、`junctionDegrees`。與 V2 原始碼在 300 組隨機拓撲上完全相同。V3 只在提交（3.20 的命令流程）與載入時呼叫一次，render 不得修改資料（V2 在 render / 繪製 / 存檔時都會改資料）。
  - V2 的轉角分支（`splitAtCorner`）沒有任何呼叫者，自動共用接點也已停用，都標 ✂ 不移植。目前使用者無法自行新增接點（V2 也一樣，接點只來自範本 / 檔案）。若之後要提供「從線上分支」，屬於新功能，需另外規劃。
- render 方塊（3.18）：**決定：畫布整個用 SVG**（V2 方塊是 HTML、線是 SVG，匯出時再從 DOM 重建 SVG）。`src/render/vnode.ts`：與 DOM 無關的節點樹 `h(tag, attrs, children|text)`，`mount()` 產生 SVG 元素（文字一律 `textContent`）、`toMarkup()` 產生 SVG 字串（3.22 匯出直接用）、`find()`。`src/render/blocks.ts`：`blocksLayer(diagram, { selected, theme, decorate })` / `blockNode`——方塊外框 = model 的 x/y/w/h、接腳點 = `core/grid.portPoint`；文字行 = 標題（料號優先）/ 第二行 / 副標 / 量測值；`titleAlign` 九宮格；接腳名稱 inside / outside / hidden。零件（`part`）不畫外框，符號由 `decorate`（3.25）補上。樣式在 `src/styles/canvas.css`，方塊自訂顏色以 CSS 自訂屬性 `--block-fill` 等寫在 `style`；每塊字級用 inline style（SVG 屬性會被 CSS class 蓋掉）。新增 token：`--block-*`、`--port-*`、`--selection-stroke`（亮 / 暗，`check:tokens` 新增 7 組對比）。
  - 與 V2 比對：golden function / power 的方塊外框、每個接腳中心、標題文字完全相同（V2 對無名方塊顯示「未命名 IC」，V3 不顯示）。
- render 連線 / 文字（3.19）：`src/render/wires.ts`——`wiresLayer(diagram, routes, { selected })`（routes 由呼叫端用 `routeAll` 算一次傳入）：每條線一個 `g[data-wire]`，路徑 class `af-wire af-wire-<kind>`（顏色寬度由 token，`line.color` / `line.width` 以 inline style 覆蓋），虛線 `8 5` / 點線 `2 4`，箭頭 marker 依顏色與大小共用 `<defs>`（接到接點的一端不畫箭頭、無效路線不畫箭頭並加 `is-invalid`），標籤在最長線段中點（`label.mark` 優先）、`wireLabel`（名稱 · 電壓 · 電流，µA 照 V2）；接點 r=5 畫在所有線之上；`invalidCount`。`src/render/texts.ts`——文字框 SVG：字級存的是 **pt**（`ptToPx`），自行斷行 `wrapText`（空白 / 每個中日韓字元之間 / 過長單字逐字切），量寬函式可注入（`canvasMeasure` 給瀏覽器，`estimateWidth` 給 Node），背景 rect、對齊、粗斜體。
  - 與 V2 比對：golden function / power 每條線的點、箭頭有無、標籤文字與座標都與 V2 `drawEdges` 相同。
  - src/ 不能出現中日韓字元：正規式的字元範圍要寫成 `\uXXXX` 跳脫（見 `render/texts.ts` 的 `CJK`）。注意：用工具寫檔時 `\u` 可能被先轉成實際字元，寫完用 `npm run check:i18n` 確認。
  - 標籤去重（V2 L3099）、外框 frames（3.26）尚未做。
- 互動（3.20）：`src/interaction/`——
  - `commit.ts`：**唯一的提交流程** `commitEdit(store, edit)` / `prepare(before, after)`：格線開啟時 `normalize` + `protect`，然後 `cleanJunctions`，最後 `store.commit`（新增，一次一步復原）。鎖定擋下時不提交，回傳 `{ ok: false, error }`（`GridError` / `ModelError`），殼層用 i18n `canvas.refused`（帶 `{reason}`）顯示。**之後所有修改（inspector、命令、自動排列）都要經過 `commitEdit`。**
  - `hit.ts`：世界座標命中測試（接腳 > 接點 > 文字 > 線 > 方塊 > 外框邊），容差以螢幕 px 除以縮放；`itemsInRect` 框選（整個在框內；兩端都被選的線也選）；`nearestPort`（拉線吸附 22 px）。文字框高度用 `render/texts.textLayout`（3.20 新增，畫與命中共用）。
  - `gestures.ts`：與 DOM 無關的指標狀態機 `Gestures(host)`：`down / move / up / cancel / wheel`、`selection`（多選 `ItemRef[]`，第一個同步到 `store.select`）、`preview`、`draft()`（拖曳中畫這份，放開才提交）、`previewPoints()`。操作對照寫在檔頭（空白拖 = 平移、Shift 拖 = 框選、接腳拖 = 拉線、接點拖 = 拉線 / Shift 拖 = 移動、中鍵 = 平移）。
  - `commands.ts`：`canvasCommands()`——復原 / 重做（Mod+Z、Mod+Shift+Z、Mod+Y）、刪除（Delete / Backspace）、全選、Escape（取消手勢或清除選取）、方向鍵移動一格（無格線 1 px）、Shift+方向鍵十格。i18n：`cmd.*`、`canvas.refused*`。
  - 測試在 Node 中以真 `Store` + 合成指標序列跑完整手勢；拖曳吸附公式與 V2 `snap` 比對一致。
- inspector（3.21）：`src/inspector/fields.ts`（`FieldSpec<D, S>`：text / textarea / number（unit、min/max/step）/ select / segmented / toggle / color（`empty` / `emptyLabel` / `fallback`）/ group / custom，`get` / `set` 為純函式、`validate` 可選；`parseValue` 依種類驗證並回傳 `inspector.error.*`）；`src/inspector/panel.ts`（`InspectorPanel`：`show(specs, sel)` 一次同步建好 DOM；`sync()` 只更新值（游標不動），可見欄位集合改變時才重建並保留焦點；文字 / 數字 / 顏色輸入 debounce（預設 400 ms）後提交一次，Enter（textarea 為 Mod+Enter）/ blur / change 立即提交，Escape 放棄；錯誤以 `aria-describedby` + `aria-invalid` 顯示且不提交；提交被拒時 `onRefused(outcome, sel)` 並把控制項還原）；`src/inspector/common.ts`（`blockFields` / `portFields` / `wireFields` / `textFields` / `commonFields(sel)`，以及 `blockInspector(root, store)`：經 `commitEdit` 提交、訂閱 store 跟著復原 / 重做更新、選取項目消失時改顯示空白訊息；設計專屬欄位以 `show(sel, extra)` 的 `extra` 附加在後）。樣式 `src/styles/inspector.css`（只用 token，已由 `main.ts` 匯入）。測試 `tests/unit/inspector.test.ts` 在 jsdom 中跑（第二行 `// @vitest-environment jsdom`）。
  - 尚未做（之後的步驟補上）：群組「全部展開 / 收折」與開合狀態持久化（V2 L1951、L10536，殼層 3.23）、接腳表格（L3047）、方塊字型 / 角色配色 / 自訂樣式（L3125、L3244、L519）、格線 / 標記 / 電源欄位（L1565、L1805、L1998、L2060，3.24 起的 design 模組）。
- export（3.22）：`src/export/inline-style.ts`（不需 DOM 的小型 CSS 解析：`parseTokens(tokens.css, theme)`、`parseRules(canvas.css)`（只支援 tag / .class / [attr="v"] 與後代選擇器，遇到其他語法直接丟錯，測試確保 canvas.css 全部可解析）、`resolveVars`、`inlineStyles(vnode)`：依特異性與順序套用，寫成呈現屬性並移除 `class` / `data-*`）；`src/export/svg.ts`（`exportSvg(data, { transparent, theme, measure, extras, routes })` → `{ source, width, height, viewBox, defs, content, background }`；外框 = 方塊 / 文字框 / 外框 / 接點 / 路徑點 + 48 px（V2 L390）；順序：extras.below → 線 → 方塊 → 文字 → extras.above；`EXPORT_HIDDEN` 移除接腳圓點（V2 匯出也沒有）；`contentBounds`、`styleDrawing`、`exportFileName`）；`src/export/page.ts`（`PAGE_SIZES`、`fitPage`：邊界 3 %、最多 3×、置中）；`src/export/png.ts`（`pngSize` 上限 16000 px / 64 Mpx、`svgToPng` 瀏覽器專用）；`src/export/readability.ts`（V2 公式：1366 × 768 螢幕、標題 < 16 px 或標籤 < 10 px 警告；另加無效路線與文字框重疊）；`src/export/errors.ts`（`ExportError` code → `export.error.*`）。`io/project-file` 新增 `safeFileName`、`downloadBlob`。CSS 以 `?raw` 匯入，因此 `vitest.config` 加了 `css: true`。
  - 測試：`tests/unit/export.test.ts`（jsdom）與 golden function / power 的 V2 匯出比對已移植的部分（線路路徑、方塊外框、線路標籤、箭頭顏色、viewBox ≤ 6 px）；零件符號、外框、連接器、電源量測表要等 3.25–3.27 的 `exportExtras` 補上後，再加完整的 `compareSvg` 比對。`tests/unit/export.png.test.ts`（node 環境：esbuild 在 jsdom 下不能跑）用 esbuild 打包 `png.ts` 注入 Chromium，檢查 2× PNG 尺寸與有內容。
  - 有意修正（已寫入 CHANGELOG「匯出」）：SVG 不依賴 CSS、外框以文字框為準、檔名用專案 / 設計名稱、可讀性多兩項檢查。
  - 字型尚未內嵌到匯出（V2 匯出也只寫 font-family）；dist 目前也還沒有內嵌字型，3.23 / 3.44 處理。
- shell（3.23）：React 19（`react` / `react-dom` 19.1，`tsconfig` `jsx: react-jsx`，`vite.config.ts` `esbuild.jsx: 'automatic'`；不用 React 外掛）。`src/main.tsx`（取代 `main.ts`）→ `src/app.ts`（`createApp()`，之後在這裡註冊 design / tool）→ `src/shell/`：
  - `controller.ts`：`Shell`（不依賴 React）持有 `Store`、`CommandRegistry<Shell>`、`Gestures`、`ui` emitter、screen（start / workspace）、message、dialog、viewport、measure；`shellCommands()`：`project.new/open/save`、`design.add/rename/delete/switch`、`block.add`（B）、`port.add`（P）、`text.add`（T）、`view.fit`（F）、`view.zoomIn/zoomOut`、`view.toggleInspector`、`export.open`（Mod+E），加上 `canvasCommands()`。未儲存時新專案 / 開檔先確認。`refusalText` 把鎖定 / 上限錯誤轉成 i18n。
  - `App.tsx`（啟動畫面、app bar 工具列、設計清單、狀態列；全域鍵盤走 `registry.handleKey`；`beforeunload` 提醒未存檔）、`Canvas.tsx`（一個 `<svg>`，每次變更以 `vnode.mount` 重畫，拖曳中畫 `gestures.draft()`；指標 → `Gestures`，滾輪縮放；點狀格線用 `--grid-size/x/y`）、`InspectorPane.tsx`（`blockInspector`；群組開合存 `archflow:inspector-groups`，`InspectorPanel` 新增 `groupState` 選項）、`Dialogs.tsx`（prompt / confirm / 匯出；焦點鎖在對話框、Escape 關閉、關閉後焦點回原處）、`use-store.ts`（`useSyncExternalStore`）。樣式 `src/styles/shell.css`（token；900 px 以下改為上下排列）。
  - `window.archflow` 掛著 `Shell`，**只給測試 / 除錯讀取**。
  - 測試：`tests/unit/shell.controller.test.ts`、`tests/e2e/v3-shell.spec.ts`（對 `dist/ArchFlow.html`，需先 `npm run build`；`test.use({ locale: 'zh-TW' })`；下載檔名用掛勾 `HTMLAnchorElement.prototype.click` 取得程式要求的名稱）。
  - 目前只有 function 可建立（啟動畫面只列這一種）；電源檢視在 3.27a / 3.27b（3.26c 起不再有 power 設計類型），schedule / sequence / flowchart 在 3.28 起接上。dist 現為 322 KB（含 React）。
  - **3.13 / 3.14 的人工驗收**：E2E 已自動確認開 V2 檔顯示「不支援舊版格式」且畫面不變；仍請使用者在實際 Chrome / Edge 開 `dist/ArchFlow.html`（`npm run build` 後）試開一個 V2 專案檔確認，並試用新增方塊、拉線、改名、存檔、匯出。
- designs（3.24）：`src/designs/module.ts`——`DesignModule`（plan §2.5：type、label、schema、templates、`create({ template })` → `{ name, data, camera? }`、`editor`、`blockDiagram?: { flavour }`、`decorate`、`renderExtras`、`inspectorFields(sel, d)`、`commands`、`exportExtras`）、`DesignRegistry`（`register` / `get` / `require` / `list`）、`localize`（範本 JSON 中 `"@i18n:key"` 字串換成目前語言文字）、`templateKeys`。`src/app.ts` 是唯一 import 所有 design 並註冊的地方（`createRegistry()`）；`Shell` 建構子改為 `new Shell(registry)`，`isBlockDiagram` / flavour / 新專案 / 新增設計 / canvas 的 decorate 與 extras / inspector 的 extra 欄位 / 匯出的 decorate 與 extras 全部經 `shell.module`（不再判斷 type 字串）。
  - `src/designs/function/index.ts` + `templates/starter.json`：V2.10.1「入門方塊圖 / Starter block diagram」範本（用 V2 引擎產生、經 `tests/tools/v2-to-v3.ts` 轉換；中英文幾何相同，文字為 `template.function.starter.*`）。建立時鏡頭改為 `pendingFit`（canvas 量到尺寸後 fit），不沿用 V2 依其視窗算的鏡頭。
  - 殼層：啟動畫面與新增設計對話框共用 `DesignChooser`（設計類型 radio + 「範本：…」/「空白設計」radio，預設第一個範本，同 V2）；新增設計改為對話框（名稱留空則用範本名稱）。`export/svg` 新增 `decorate` 選項。
  - 測試：`tests/golden/function.template.test.ts`（模組 create / schema / i18n；與 V2 引擎現場產生的 starter 比較：中英兩語系的方塊、接腳、線、文字完全相同，匯出線路路徑與 V2 匯出相同）、`tests/e2e/v3-function.spec.ts`。`v3-shell.spec.ts` 改為先選「空白設計」。
- parts（3.25）：`src/designs/function/parts.ts`——V2 零件庫的被動元件 / 符號 12 種（`PARTS`，名稱 i18n `part.*`）、`GLYPH`（與 V2 相同的路徑，結構化成 VNode）、`partSize`（S / M / L，雙腳元件可轉 90°）、`symbolPins`（保留接腳 id，線不會斷）、`makePart`、`reshapePart`（保持中心）、`setPartValue`（電源符號的值同時是接腳名稱）、`normRail` / `cleanRails` / `railBand`（V2 railColor 的電壓色帶 → token `--rail-*`）、`partNode`（符號 + 數值標籤）、`badgesNode`（電壓標示，V2 實測幾何：上緣 −9、右緣內縮 13、高 22、間距 4）、`decorationBounds`。`functionDesign` 新增 `decorate`、`inspectorFields`（零件：數值 / 大小 / 方向；一般方塊：電壓標示）、`commands`（`part.insert.<kind>` 群組 `parts`、`part.rotate` 快捷鍵 R）、`exportExtras`（徽章 / 標籤外框）。`DesignCommandContext`（design 命令可用的殼層能力，designs 不 import shell）。殼層工具列 `CommandPicker` 依 `group` 列出 design 命令（「插入零件」下拉選單）。
  - **存檔型別修正**（3.6 放錯位置，尚未發版所以直接改、未提高 schemaVersion）：電壓標示 `part.rails` → `block.rails`（V2 只在一般方塊顯示）；`part.bothSides` 刪除，改為 `line.bothEnds`（V2 `edge.afBoth` 是線路的雙向箭頭）。轉換器同步更新，golden 快照沒有變化。render 已畫 `marker-start`，共用線路欄位多了「雙向箭頭」。
  - `model/diagram.freeSpot`（新增方塊 / 零件時找空位，有意修正，CHANGELOG）。`render/blocks`：零件方塊不畫標題 / 代號。`export/inline-style` 支援 `color` 屬性（符號用 currentColor）。
  - 修正 3.21 的 bug：切換選取時被移除的輸入框會觸發 `change`，套用到新選取（`InspectorPanel.stale`，已加回歸測試）。
  - 測試：`tests/golden/function.parts.test.ts`（含與 V2 golden 匯出比對每個符號的位置與路徑、V2 實測徽章位置）、`v3-function.spec.ts` 第 2 項。
- 區域外框（3.26a）：`model/diagram` 新增 `FRAME`（最小 120 × 80、預設 400 × 260、邊界 30、樣式 dash / solid / fill、顏色 teal / blue / amber / gray）、`updateFrame`、`frameMembers`（V2 規則：方塊 / 文字以中心判斷、接點在框內、內層外框整個在框內）、`fitFrame`；`addFrame` 預設改為 dash（同 V2）。`render/frames.ts`：`frameTab`（名稱標籤幾何，畫圖 / 命中 / 匯出外框共用）、`framesLayer`（選取時畫四角把手）；token `--frame-<color>-line/tab/ink`（亮 / 暗，對比已檢查）。畫布與匯出把外框放在最底層；`hit` 名稱標籤也能選到外框；`Gestures`：拖曳外框時框內內容一起移動、選取單一外框時拖四角縮放（`FRAME_HANDLE` 8 px）。屬性面板 `frameFields`（名稱、樣式、顏色、寬高、貼合內容按鈕）；殼層命令 `frame.add`（框住選取，否則中央預設框）。測試：`tests/unit/frames.test.ts`（含與 V2 golden 匯出比對外框 / 標籤 / 名稱位置）、`v3-function.spec.ts` 第 3 項。
- 連接器與 LCD 範本（3.26b）：`src/designs/function/connector.ts`——`CONN`（列距 20、寬 30、最多 80 腳、名稱 24 字）、`DEFAULT_PINS`、`layoutConnector`（V2 layout：可見列 / 「+N」/ 保留接腳 id / 刪除接在已移除腳位的線並回報條數）、`makeConnector`、`updateConnector`、`nextConnectorName`（CNn）、`cleanPins`（Excel 整欄貼上）、`snapConnectorsToFrames`（移動後靠近外框左右邊 30 px 內貼齊）、`connectorNode`（色條 / 中央虛線 / 圓角、腳位編號 / 名稱 / 標題，幾何依 V2 `.af41-*`）、`connectorBounds`。`src/designs/function/lcd.ts`——`insertLcd` / `lcdOrigin`（V2 afTpl.lcd：8 個方塊含 FPC 與兩顆 LED、外框「LCD 面板」、9 條線，一步復原後 fit）。`functionDesign`：`connectorFields`（名稱 / 類型 / 接線側 / 腳位數 / 腳位名稱 / 只顯示已接線 / 料號）、命令 `part.insert.conn_<kind>`（群組 `connectors`）與 `template.lcd`（群組 `templates`）、`afterMove`。`DesignModule.afterMove` + `GestureHost.adjustMove`（拖曳結束、提交前調整）；`DesignCommandContext` 加 `fitView` / `notify`。殼層零件選單改為分組（`<optgroup>`）。token `--conn-num`、`--conn-name-both`。
  - 測試：`tests/golden/function.connector.test.ts`（連接器規則、golden FPC 與 V2 匯出比對圖形 / 標籤；LCD 範本與 V2 引擎現場執行 `afTpl.lcd()` 的結果比對，中英兩語系，經 `prepare` 提交流程後方塊 / 接腳 / 外框 / 連線完全相同）、`v3-function.spec.ts` 第 4 項。
  - **已知問題**：golden function 的完整逐元素 `compareSvg` 仍無法通過——V2 匯出的文字 x 是字形左緣（HTML 量測），V3 用 `text-anchor`；V2 線路路徑有重複點、群組層數不同。需要在 `tests/tools/svg-compare.ts` 加正規化（文字依錨點與估計寬度換算左緣、路徑去重複點）後再做，建議在 3.44（測試改對 dist）一併處理。目前已逐項比對：線路、方塊外框、符號、徽章、外框、連接器、線路標籤。
  - 變更連接器造成線被刪除時沒有提示（V2 有），已記入 CHANGELOG。
- 方塊圖合併（3.26c，規劃 + 存檔格式）：
  - `DesignType` 移除 `'power'`，`DATA_SCHEMAS` 只剩 function / schedule / sequence / flowchart；`BlockDiagram.view: 'function' | 'power'`（必填）；`BlockView` 由 `io/schema-types` 匯出、`model/types` 轉出。schemaVersion 維持 3、無遷移（V3 未發版）。
  - 預留欄位（選填、未實作）：方塊 `size`（S / M / L）、`style.color`；線路 `routing`（auto / manual，標示 `route` 是否為手動；不另設 `waypoints`）、`labelOffset`；`groups`（id、name、members（方塊 id，schema 檢查存在）、bounds；id 與其他項目共用命名空間）。
  - `BlockFlavour` 刪除：`makeBlock(d, at, view = d.view)`、`connect(d, a, b, opts, view = d.view)`、`emptyDiagram(view = 'function')`；`GestureHost.flavour()` 刪除；`DesignModule.blockDiagram` 改為 `true`。`commitEdit` / 畫布命令 / schema 參照檢查只認 `'function'`。
  - 轉換器：V2 power → `type: 'function'`、`view: 'power'`；V2 function → `view: 'function'`。golden function / power 的 `project.v3.json` 已重新產生（只多 `view`、power 的 `type` 改為 `function`），寫入 CHANGELOG「專案檔」。
  - 測試裡的 `golden('power')` 指的是 golden **目錄名稱**（`tests/golden/power/`），目錄維持不變；`export.test` / `export.png.test` 改以 `type === 'function' && data.view === <name>` 取設計。
  - 計畫：`docs/v3-plan.md` §1.1、§1.3、§1.4、§2.1、§2.2（新增 §2.2.1「兩種檢視」對照表）、§2.5、§3.2 已更新；3.28 之後的步驟沒有引用 `'power'` 設計類型，不需修改。
  - 使用者確認（3.26c 追加 commit）：切換檢視快捷鍵 Shift+V；移除預留的 `waypoints`（路徑點只存在 `route`，`routing` 標示是否手動）；切換檢視標記未存檔；格線 / 吸附繼續存在檔案（`grid` 影響方塊對齊與繞線結果）。
- 檢視切換（3.27a）：`core/history` 新增 `amend(fn)`（把 fn 套用到目前狀態與所有復原 / 重做快照，不新增復原步驟、標記 dirty；批次中呼叫會丟錯），`core/store.amend(fn)`。殼層 `Shell.view` / `setView(view)` 與命令 `view.mode.function`、`view.mode.power`（群組 `view-mode`）、`view.mode.toggle`（Shift+V）；`ViewSwitch`（`role="group"` + 兩個 `aria-pressed` 按鈕）浮在畫布上方（`.af-view-switch`）。呈現依 `d.view`：`render/blocks` 只在電源檢視畫量測列；`render/wires` 的 `wireLabel(w, view)` 只在電源檢視加電壓 / 電流，`isMuted(w, view)`（電源檢視中非 power 線）加 `is-muted`（token `--wire-muted-opacity: 0.35`，匯出寫成 `opacity`）。`exportSvg` 新增 `view` 選項（換掉 data 的 `view` 再畫，線路與外框不變）；匯出對話框新增「檢視」radio（預設目前檢視，標「（目前）」）。`inspector/common.inView(view, field)`（給 3.27b 的電源欄位）。i18n：`design.type.function` 改為「方塊圖 / Block diagram」，刪除 `design.type.power`；新增 `view.mode.*`、`export.view*`。測試：`tests/unit/view-mode.test.ts`、`v3-function.spec.ts` 第 5 項。
  - 另修測試：`tests/golden/sequence.test.js` 的匯出預覽會印出今天日期，跨日後就與快照不符（與 3.27a 無關、黃金檔未改）；`tests/helpers/load-app.js` 的 `openApp` 新增 `now` 選項（`page.clock.setFixedTime`），sequence golden 固定在錄製日 2026/11/25。
- 電源功能（3.27b）：`src/designs/function/power.ts`——`metricStrip`（V2 `.block-metrics` 幾何：底部帶 padding 7 / 12、項目間距 10、列距 5、標籤 11 px + 5、單位 = 量測字級 − 2、前距 4，基線 = 列底 + 3；只在電源檢視、零件 / 連接器不畫）、`shownValue` / `storedValue` / `unitOf` / `metricText`（電流存 A，mA 顯示 ×1000，同 V2）、`fedBy` / `demand` / `load` / `amps`（V2 af24）、`powerBlockFields()`（群組 `power`：角色、說明、每個量測的值 + 顯示開關、電流單位、下游需求自訂欄位；輸入值到隱藏的量測會自動開啟顯示，同一步復原；值須為空或數字，可負）、`powerWireFields()`（群組 `electrical`）。兩者都用 `inView('power', …)`。`render/blocks`：移除舊的單行量測文字（`metricText` 移到 power.ts），新增 `BlockRenderOptions.footer`（標題列在 footer 上方區域置中）；`DesignModule.blockFooter(b, d, measure)`，Canvas / `exportSvg({ footer })` / 匯出對話框都傳入。`model/diagram.makeBlock` 電源檢視接腳改為 VIN / OUT（power）。`render/texts.estimateWidth`：`.,:;'|!` 改為 0.27 em（原 0.55，對照 V2 實測），其他測試不受影響。token `--metric-*`（亮 / 暗，`check:tokens` 新增 4 組對比）；`inspector.css` 新增 `.af-field-note`、`.af-power-load*`。測試：`tests/unit/power.test.ts`、`v3-function.spec.ts` 第 6 項、`function.parts.test.ts` 欄位清單更新。
- 入門電源樹與角色配色（3.27c）：`src/designs/function/templates/power-starter.json`（V2 `createWorkspaceProject('power')` 的範例，以 `tests/tools/v2-to-v3.ts` 轉換，文字為 `@i18n:template.power.starter.*`，`data.view: 'power'`；第一個方塊角色改為 source），`functionDesign.templates` 新增 `power-starter`（名稱 key `template.power.starter.label`）。角色配色：`render/blocks` 在電源檢視給非零件方塊 `data-role`，`canvas.css` `[data-role="…"]` 設 `--block-accent: var(--role-…)`（inline 的自訂強調色優先；匯出的 inline-style 支援規則中的自訂屬性）；token `--role-source / converter / distribution / load`（亮 / 暗，對 `--block-fill` 3:1）。
  - **已知差異（未修）**：(1) 有量測帶的方塊，V2 標題與第二行（副標）之間多約 20 px（V2 第二行基線 b.y+84，V3 依行高堆疊在 b.y+58 附近），第一行位置一致（`power.test`「power view export vs V2」只比第一行）；(2) 英文版 V2 範本方塊會自動加高，V3 不會（V3 尚未實作依文字自動調整方塊高度）；(3) 文字框位置與 V2 差數 px～30 px（3.19 / 3.22 既有差異）。之後若做方塊排版調整（V3.0.0 之後的 UI/UX 優化）可一併處理 (1)(2)。
- 時程版面與繪製（3.28）：`src/designs/schedule/`——`dates.ts`（`day` / `formatDate` / `visibleDates` / `endpoint` / `interval`（含 inclusive 修正）/ `issues` / `today`）、`layout.ts`（`structure`（合流 / 閉環 / 端點錯誤丟 `ScheduleError`）、`layout`（V2 L685 + L722：lane / depth、帶高、軸 y、卡片位置含 offset、編號 T01…）、`cardMetrics`、`textSizes`、`stem`、`linkRoute`、`scheduleBounds`）、`render.ts`（`scheduleLayer`：連線 / 箭頭 / 天數框 → 軸點 / 起訖短線 / 分支環 / 圓點 / 里程碑 → 卡片；`canvas: true` 時加狀態 / 里程碑 / 問題標記與分支標籤；`fit` 省略號）、`index.ts`（`scheduleDesign`、`emptySchedule`、`shiftToWeek`）、`templates/starter.json`（V2 af16 simple 範本，anchor 2026-03-10）。`DesignModule.canvas`（`render` → `{ node, error }`、`bounds`），`Shell.fitView` 支援；`Canvas.tsx` 的 `DrawingCanvas`（拖曳平移、滾輪縮放、版面錯誤顯示 `.af-canvas-error`）。`app.ts` 註冊 schedule（`as unknown as DesignModule`，泛型不相容）。token `--sched-*`（亮 / 暗，新增 9 組對比）。測試：`tests/golden/schedule.layout.test.ts`、`shell.controller.test` 新增時程一項、`v3-shell.spec.ts` 新增時程 E2E。
- 時程編輯、外觀、匯出（3.29）：`designs/schedule/edit.ts`（`appendTask` / `addBranch` / `removeItems` / `setParent` / `descendants` / `updateTask` / `updateLink` / `setTimeType` / `drag`（卡片自由移動；圓點吸附：相連任務優先、`snap.range` 螢幕 px、Shift 鎖方向、Alt 停用）/ `nudge` / `resetOffsets`，上限 100）、`appearance.ts`（`THEMES`、`THEME_SWATCH`（只給顏色選擇器與 token 測試用）、`setTheme` / `useCustom` / `setCustom` / `setSizes` / `setBranchColor`、`lookStyle`（自訂外觀寫成 inline 自訂屬性）、`geometry`）、`fields.ts`（`scheduleFields(sel, d)`：task / link / design 三種）。`DesignModule.canvas` 擴充：`label`、`target`（依元素 data-* 屬性：`data-task-point` = 圓點、`data-task` = 任務框、`data-link`）、`drag`、`nudge`、`remove`、`exists`、`fields`、`refusal`、render 的 `guides` / `forExport`。`DesignCommandContext` 加 `editDesign` / `selectItem`（`Shell` 實作；`Shell.item` 為目前選取，已不存在時為 null）。`Canvas.tsx` `DrawingCanvas`：點選、拖曳草稿（放開才提交、Esc 取消）、方向鍵、Delete。`InspectorPane` 的 `DrawingInspector`：`InspectorPanel<D, CanvasSelection>`，store 變更時若選取的項目已消失就先切換欄位再 sync（否則 `get` 丟例外會中斷重畫——3.29 修過的 bug）。`inspector/fields`：`TextField.inputType: 'date'`、`FieldOption.text`（顯示使用者文字）。`export/svg.exportDrawing(node, bounds, opts)`；匯出對話框對 canvas 設計用它（不顯示檢視選項與可讀性報告）。`export.open` 對 canvas 設計啟用；工具列的方塊類按鈕只在方塊圖顯示，design 命令群組 `schedule` 以按鈕顯示；主要按鈕停用樣式修正。schema：`scheduleAppearance`（theme / 字級範圍 / engineering / savedCustom / customActive / lineWidth）、連線 `branchColor`、手動天數上限 999999。token：`--sched-<mint|slate|amber>-*`、`--sched-card-width` / `--sched-link-width` / `--sched-thin-width`，canvas.css `[data-sched-theme]` 切換。測試：`tests/unit/schedule.edit.test.ts`、`v3-shell.spec.ts` 新增時程編輯 E2E。
  - 未做：V2 的原地天數編輯器（點天數標籤直接輸入，L641–L645）改由面板處理；深色主題下 mint / slate / amber 沿用亮色卡片顏色（只有工程藍有深色版本）。
- 3.29b-a 畫布警示：`power.ts` `loadBadgeText` / `loadBadgeBox` / `loadWarning`（電源檢視、非零件 / 連接器、有下游需求的方塊：方塊下方徽章「⚠ 下游需求 ≈ x / 額定 y (p%)」，≥85% 銅色虛線外框、>100% 紅色實線外框；圖示 + 百分比，不只靠顏色），經 `functionDesign.decorate` 畫在畫布與匯出，`exportExtras` 加入徽章與外框範圍。token `--load-*`（亮 / 暗，新增 5 組對比）。測試：`power.test`「load warnings」。
- 3.29b-b 電源線依電壓上色：`render/wires` 新增 `WireRenderOptions.tone(w)`（回傳色帶名稱時加 `is-rail-<band>`、箭頭用 `af-rail-<band>` 與對應 marker，且**不使用線自己的顏色**——V2 在每條線都寫了 #334e70，若自訂色優先就永遠不會上色；功能檢視仍用線自己的顏色）；`DesignModule.wireTone`、`exportSvg({ wireTone })`、Canvas / 匯出對話框傳入。`power.ts` `wireVoltage`（線的電氣標註，否則起點方塊的電壓）、`wireRail`（電源檢視的 power 線 → `railBand`）。canvas.css `.af-wire-group.is-rail-*`（放在 is-invalid 之前，無效路線仍顯示紅色）；`check:tokens` 新增 7 組 `--rail-*` 對畫布底色 3:1。測試：`power.test`「power wires coloured by rail voltage」。
- 3.29b-c 無關方塊變淡：`render/blocks` 新增 `BlockRenderOptions.faded(b, d)` → class `is-faded`（`--block-faded-opacity: 0.4`）；`DesignModule.blockFaded`、`exportSvg({ blockFaded })`。`power.ts` `unrelatedToPower`：電源檢視中，沒有 power / gnd 接腳、沒接 power 線、也不是電源 / 接地符號的方塊（gnd 也算電源相關——決定記錄於此）。測試：`power.test`「blocks unrelated to power are faded」。
- 3.29b-d 電壓圖例：`power.ts` `voltageLegend`（電源檢視中 power 線與方塊電壓的不重複值，高到低，各自 `railBand`）、`legendNode`（匯出用 SVG 圖例）；`DesignModule.legend(d)` → `{ title, items: { swatch, text }[] }`，殼層 `CanvasLegend` 以固定覆蓋層畫在畫布左下角（`.af-canvas-legend`，不隨平移縮放、`pointer-events: none`）；匯出由 `exportExtras.above` 畫在內容下方（左對齊、間距 24）並加入 bounds。i18n `power.legend.title`。測試：`power.test`「voltage legend」、`v3-function.spec` 入門電源樹那項檢查圖例。
- 3.29b-e 依檢視切換插入選單：`power.ts` `makePowerBlock(d, at, role)`（來源只有 OUT、負載只有 VDD（同 V2 電源範例），轉換器 / 分配為 VIN / OUT；名稱 = 角色名稱；量測欄位預先建立但隱藏，轉換器另有效率）；命令 `power.insert.<role>`（群組 `power-blocks`，只在電源檢視啟用）；`App.tsx` 工具列在電源檢視改用「插入電源方塊」選單（`POWER_GROUPS`），功能檢視維持「插入零件」。測試：`power.test`「power view insert menu」、`view-mode.test`、`v3-function.spec` 第 6 項。
- 3.29b 無障礙檢查：警示有圖示與百分比文字（不只靠顏色）、新增 token 都通過 `check:tokens`、沒有新增動畫（`prefers-reduced-motion` 不受影響）、圖例覆蓋層有 `aria-label`。
- 電源時序 vendor 轉接（3.30）：`src/designs/sequence/`——`index.ts`（`sequenceDesign`：`editor: 'embedded'`、`embedded: { title, srcdoc(lang), host: 'afSeqHost', api: 'afSeqApi', sanitize }`；`sequenceSrcdoc` 以 `?raw` 匯入 `vendor/sequence-editor/bundle.js` / `style.css`，同 V2 `o4`（尚未內嵌字型，3.44 處理）；空白設計 `{ name: '', rails: [] }`；範本照 V2 `Ff` 原樣不經清理）、`sanitize.ts`（V2 `jf` 移植：編輯器回傳的文件才清理，會補 `edge: 'end'` 等預設值）、`templates/templates.json`（V2 `bd` 的 4 個範本 display / lcd / fpga / mcu，兩語系文字改 `@i18n:template.sequence.*`，ASCII 且兩語相同的字串保留原文）。`DesignModule.embedded` / `EmbeddedApi`；`src/shell/embedded.ts`：`installHosts`（Shell 建構時把每個 embedded 模組的 host 物件掛到 window；vendor 在 bundle 啟動時讀 `window.parent[host]`）、`frameApi`。Host：getDoc（目前設計）、change（sanitize 後 `Store.setData` → `History.replace`：不進 V3 復原、清空歷史、標記未存檔，同 V2 重設 past）、status（狀態列 `.af-status-embedded`）、toast（`embedded.status` 訊息）、save、title、ready；palette / shortcuts / modal / poke 為空實作（V3 尚無命令面板）。`Shell`：`frame` / `setFrame` / `embeddedReady` / `embeddedStatus` / `embeddedHistory()`；`CanvasContext.embeddedHistory`——`history.undo` / `redo` 改呼叫編輯器的 undo / redo；`export.open` 對 embedded 設計呼叫 `api.openExport()`。`Canvas.tsx` `EmbeddedFrame`（iframe srcdoc，依設計 id 重新掛載）；屬性面板、「全圖」「屬性面板」按鈕、縮放比例對 embedded 設計隱藏。測試：`tests/golden/sequence.v3.test.ts`（範本 / 清理 / srcdoc、首個範本與 V2 建立的文件相同）、`tests/e2e/v3-sequence.spec.ts`、`core.history-store.test`。
  - 未做：V2 在切換語言時把範本來源的列名 / 備註換成另一語系（`a4`）；V2 的 toast「復原」按鈕（V3 用殼層復原鍵）。
- 流程圖 vendor 轉接（3.31）：`src/designs/flowchart/`——`index.ts`（`flowchartDesign`：`embedded: { title, srcdoc, host: 'afFlowHost', api: 'afFlowApi', sanitize, hostExtras: () => ({ images }) }`；`images` 是 window 上的 `__afFlowImages` Map（同 V2 jd，圖片只在記憶體、不寫入專案檔——V2 也是如此）；範本經過一次清理，同 V2 `uu(qf())`）、`sanitize.ts`（V2 `Pf` 移植：10 種圖形與預設大小、上限 500 / 1000 / 12、配色 / 線寬清單、是 / 否 → Y / N；無法讀取時回傳空流程圖）、`templates/templates.json`（V2 的「LCD 面板上電流程」，由 V2 引擎產生（自動排版 `Bd` 不需移植），兩語系幾何相同，文字 @i18n）。`EmbeddedApi.canUndo / canRedo` 改為選填（流程圖編輯器沒有），沒有時殼層的復原 / 重做一直可按；`EmbeddedEditor.hostExtras`。測試：`tests/golden/flowchart.v3.test.ts`（範本與 V2 建立的文件相同、清理、srcdoc）、`tests/e2e/v3-flowchart.spec.ts`（流程圖編輯器的匯出是按鈕選單，不是 dialog）。
- 工具框架與 BOM（3.32）：`src/tools/module.ts`（`ToolModule { id, label, description, long, srcdoc(lang), host, allow?, allowFullscreen? }`、`ToolRegistry`）、`src/tools/bom/index.ts`（`vendor/rsi-bom` 以 `?raw` 組 srcdoc，同 V2 `Z4`，host `afRsiHost`）；`app.ts` `createTools()`，`new Shell(designs, tools)`（tools 選填，預設空）。殼層：`Shell.tool` / `openedTools` / `openTool` / `closeTool`，命令 `tool.open.<id>`（群組 `tools`）；`shell/embedded.ts` `installToolHosts`（`{ lang, close, toast }`，同 V2）。`App.tsx`：`ToolsSection`（啟動畫面「小工具」磚塊，V2 af2-tools-home）、`ToolsMenu`（工作區工具列下拉選單）、`ToolDialog`（全畫面遮罩 + role=dialog，開過的工具 iframe 保留、只顯示目前的；關閉：工具自己的 host.close、「關閉」按鈕、Esc（焦點在 iframe 外時）、點遮罩）；工具開啟時殼層快捷鍵停用。移除啟動畫面過時的「後續步驟接上」說明（`start.moreTypesLater`）。測試：`tests/unit/tools.test.ts`、`tests/e2e/v3-tools.spec.ts`。
- EDID（3.33）：`src/tools/edid/index.ts`——`vendor/tools/edid.html` 原樣當 srcdoc（完整頁面；語言由 host.lang 決定），host `afEdidHost`；`createTools` 註冊；測試：`tools.test`、`v3-tools.spec`。
- Hex（3.34）：`src/tools/hex/index.ts`——`vendor/tools/hex.html` 原樣，host `afHexHost`；E2E 載入 .bin 後顯示位元組。
- Pattern（3.35）：`src/tools/pattern/index.ts`——`vendor/tools/pattern.html` 原樣，host `afPgHost`，iframe `allow` 含 clipboard / fullscreen / window-management 與 `allowFullscreen`（同 V2）。3H 工具全部完成：`createTools` 依序註冊 bom、edid、hex、pattern。
- 自動整理呼叫圖（3.36）：`docs/v3-layout-callgraph.md`（流程、62 個引擎函式的行號 / 大小 / 作用 / V3 落點、覆寫鏈、外部依賴對照、要鎖定的行為）；產生腳本 `scripts/audit/layout-callgraph.mjs`（從 `v4Generate` 等入口沿引擎前綴展開，解析 `const X=Y;` 覆寫別名；`--json`）。
- 自動整理 3.37a：golden `tests/golden/layout.test.js`——V2 引擎在閉包內（`roCopy` 等全域都取不到），只能經 `window.ArchFlowRC4.plan()`：開啟整理對話框（`autoArrange()`）→ 等「完成」→ 讀 plan（base 與所有候選的 m / geo / paths / labels / metrics / changes）；切 `#v4Mode` 為 layout 再讀一次。三份：golden function、power、打亂座標的入門方塊圖（`tests/golden/layout/scrambled.project.json` 固定檔，因為新建專案的 id 是隨機的）。快照 `tests/golden/layout/__snapshots__/{function,power,scrambled}.json`（連跑三次一致）。V3：`src/layout/model.ts`（引擎資料形狀：nodes / edges、端點 `{ node, port }` / `{ junction }`、錨點以端點 JSON 為鍵——沿用 V2 用語以便逐行移植；`fromDiagram`、`geometry`（方塊尺寸 = w / h、錨點 = `core/grid.portPoint`）、`currentPaths`、`endDir`、`pairs` / `rect` / `sameAt` / `copy` / `endKey`）、`src/layout/metrics.ts`（`validPath`、`overlap`、`cross`、`pathMetrics`、`source` / `commonPrefix` / `pathOverlap` / `classify`、`labelRect`（含旋轉）、`rectOverlap`、`labelConflicts`、`noOverlap`、`measure`、`score`、`allowed`）。測試 `tests/unit/layout.metrics.test.ts`：三份 golden 的幾何、目前路徑、原圖與每個候選的指標都與 V2 相同。
- 自動整理 3.37b：`src/layout/route.ts`——`adapters`（V2 roAdapters）、`find`（V2 roFind：A* 在方塊 / 既有線附近的格線上，懲罰重疊、交叉與過近平行；與 `router/find-path` 不同）、`sharedCost` / `routeShared`（V2 ssCost / ssRouteOne：同源線共用起點）、`routes`（V2 uiRoutes 第二層：同源一起、長的先繞）；時間預算改為 `Clock { now, deadline }`（預設 `NO_LIMIT`）。V2 第一層 `uiRoutes`（L1708）與 `uiRouteOne` / `uiRouteCost` 被第二層完全取代、從不執行——未移植（呼叫圖文件已註記）。`router/find-path` 的 `Heap` 改為 export 重用。測試 `tests/unit/layout.route.test.ts`：三份 golden、routes / layout 模式每個候選（以 V2 候選的方塊位置為輸入）的路徑都與 V2 完全相同。golden 錄製改為不四捨五入接腳 `t`（3.37a 時誤差 0.5 會讓測試以為接腳位置不同），重錄 function 快照。
- 自動整理 3.37c：`src/layout/labels.ts`——`labelWidth`（量字 + 10，Measure 由外部傳入）、`defaultLabels`（V2 uiDefaultLabels；文字 = `render/wires.wireLabel(wire, view)`，`EngineModel` 新增 `view`）、`liveLabels`（V2 讀畫面標籤位置，V3 用 `render/wires.labelPosition`；手動標記釘住）、`arrangeLabels`（V2 三層：逐段試位置與計分、同源分支版本取衝突較少者、手動標記不動）。V2 `afUnifiedLabel`（上次整理存的標籤）V3 沒有對應欄位，該分支不移植。測試 `tests/unit/layout.labels.test.ts`（量字用 golden 記錄的寬度）：每個候選的標籤位置與 V2 相同（x 容差 0.5，因 golden 寬度四捨五入）；**已知差異**：scrambled 圖上 V3 畫布的標籤位置（最長段、上方 7 px）與 V2 畫面（最後一段 > 95 px 的水平段、避讓位移）不同，屬於 `render/wires` 與 V2 晚期標籤圖層的差異（3.19 記錄過標籤去重未移植），整理引擎本身一致。
- 自動整理 3.37d：`src/layout/place.ts`（`LayoutError`、`frozenNodes`、`portFrozen`、`place`（V2 uiLayout：expanded 自左上角放大 1.65 倍、layered 依連接分層，含接點時 layered 拒絕、有環拒絕））；`src/layout/plan.ts`（`changesOf`、`verify`（V2 uiVerify：去掉位置後模型不可變、未授權 / 凍結的方塊 / 接腳 / 線不可動、方塊不可重疊）、`candidate`（V2 uiCandidate 兩層）、`refine`（V2 v4Refine：最多 3 輪逐條改善）、`organize(d, { mode, ids, measure, clock, labels })`（V2 v4Generate 的運算：上限 60 方塊 / 100 線、routes 只有 preserved、layout 三種、refined 插在最前、選最佳）、`ready`、`hasChanges`、`LIMITS`）。`uiOrderPorts` 只在可移動接腳時呼叫，整理對話框永遠 `ports: false`——未移植。測試 `tests/unit/layout.plan.test.ts`：三份 golden 兩種模式，候選種類 / 順序 / 方塊座標 / 路徑 / 標籤 / 指標 / 變更數全與 V2 相同；打亂圖選中逐條改善且可套用；layout 模式有選取線、超過上限時拒絕；鎖定方塊不動；有接點時 layered 拒絕。
- 整理預覽 3.38：存檔新增 `wire.label.auto?: { x, y, signature }`（使用者決定；`io/schema` / `schema-types`、轉換器對應 V2 `afUnifiedLabel`；`render/wires.labelPosition` 在沒有手動 mark 且 signature = 目前路徑（simplify 後的 JSON）時使用）。`src/layout/apply.ts`：`applyCandidate`（再驗證一次、寫回方塊座標、變更的線（refined 時所有未鎖的線）寫入 `wire.route` + `routing: 'manual'`、標籤寫入 `label.auto`；寫回後 `routeAll` 必須等於預覽路徑，否則 `ApplyError('mismatch')`）、`routeSignature`、`previewOf`。殼層：命令 `layout.arrangePreview`（V2 隱藏按鈕對照表預定的 id；工具列「自動整理」，只在方塊圖）、`src/shell/OrganizeDialog.tsx`（模式 radio、候選 radiogroup 與「可套用」、前後對照（`render/*` 畫在共同 viewBox）、指標表、錯誤訊息 i18n、套用前以資料 JSON 比對是否已改變——`store.data()` 每次回傳新副本，不能用物件相等）；`Dialogs.Modal` 改為 export。計算目前同步執行（60 方塊 / 100 線上限內），尚未做 V2 的分段讓出與取消。測試：`tests/unit/layout.apply.test.ts`、`v3-function.spec`「organize」。
- 殼層 3.39：`src/shell/AppBar.tsx`——`AppBar`（`header.af-appbar`：品牌、專案名稱按鈕 → `project.rename`、未存檔「•」、目前設計；`nav.af-menubar` 的 `MenuButton`（WAI-ARIA menu button：ArrowDown / ArrowUp 開在第一 / 最後一項、Home / End、Esc 回到按鈕、Tab 或點外面關閉；沒註冊的命令與多餘分隔線自動略過）；右側 `project.save`、`export.open`、`LocaleSelect`）與 `CommandBar`（`.af-cmdbar` role=toolbar「工具列」：依設計類型分組 `af-cmd-group`，不換行、放不下時橫向捲動，≤ 1280 px 隱藏群組標題）。`CommandButton` / `CommandPicker` / `LocaleSelect` / `useLocale` 從 `App.tsx` 移到這裡。新增命令（controller）：`project.create`（參數 `{ name, choice }`，啟動畫面表單走它）、`project.newFromExamples`、`project.cancelNew`、`project.rename`、`design.duplicate`、`design.loadExample`、`wire.reroute`、`wire.clearRoutes`；時程命令 id 改為 `schedule.addBranch` / `schedule.autoArrange`。E2E 中未存檔標記改查 `.af-unsaved`（不再在專案名稱內）、「新專案」改從「檔案」選單、「小工具」改為選單按鈕（名稱相同的選單按鈕要用 `exact: true`，否則會同時匹配「新增設計」等按鈕）。
- 殼層 3.40：`src/shell/palette.ts`（`paletteItems(shell)`：recent / cmd / design / item 四段，隱藏需要參數或無意義的命令（`palette.open`、`design.switch`、`project.create`、`selection.nudge*`）與停用的命令；`filterPalette` 每個字都要出現；最近使用存在 `Shell.recentCommands`（`rememberCommand`，5 個，不存檔））、`src/shell/shortcuts.ts`（`shortcutLabel`：所有快捷鍵以「 / 」串接；`shortcutSections`：依命令 group 分節、同名命令併成一列）、`src/shell/PaletteDialog.tsx`（`PaletteDialog`：combobox + listbox、`aria-activedescendant`、上下鍵 / PageUp / PageDown / Ctrl+Home / Ctrl+End、Enter、Esc、點外面關閉、焦點回原處；`HelpDialog`：用法說明 + 快捷鍵表）。`DesignModule.findItems?(d)` → `FindItem { id, label, hint, at, select }`（function：方塊，料號優先；schedule：任務，提示為 T01…），`Shell.reveal(item)` 選取並 `centreOn`。命令：`palette.open`（Mod+K，需要專案）、`help.open`（Mod+?）。`formatShortcut` 方向鍵改為箭頭、Escape 改為 Esc。
- 殼層 3.41：狀態列（`App.tsx` Workspace footer：設計類型、`DesignModule.stats?(d)`、無法繞通、vendor 狀態、`af-spacer`、已儲存 / 未儲存、縮放）；通知 `Shell.toasts`（`notify` 同時設 `message`（測試與啟動畫面仍讀它）並推入 toasts，最多 `TOAST_MAX` 3、`dismissToast(id)`；`newProject` / 開檔成功時清空；`Toasts` 元件負責計時 3.2 s / 6 s）；`DesignModule.emptyHint?(d)` → `.af-empty-hint`；語系切換：`EmbeddedFrame` 的 srcdoc 依 `useLocale()` 重算、iframe `key={lang}`（重新 `setFrame`），`ToolDialog` 的文件快取 key 改為 `id:lang`。新 token `--color-toast` / `--color-on-toast`（深色模式 ink 與 on-accent 同色，不能共用）。V2 對照表 `stats` 改為 null（狀態列文字，不是命令）。修正 `inspector/common.blockInspector`：store 切到非方塊圖時不讀 `blocks`。
- 版面設定 3.41b：`src/model/arrange.ts`（`alignable` / `alignBlocks(d, ids, axis)`（V2 uxAlign）、`arrangePorts(d, block, 'LR'|'TB')`（V2 afArrangeIO orient=true；`tests/unit/model.arrange.test.ts` 直接以 `new Function` 執行 V2 原始碼比對））、`src/render/theme.ts`（`LATIN_FONTS` / `CJK_FONTS` / `DEFAULT_THEME` / `THEME_LIMITS`（px）/ `cleanTheme` / `fontStack` / `pxToPt` / `ptToPx`）；`render/blocks.blocksLayer` 有 theme 時在 `g.af-blocks` 設 `--block-font`（token 預設 `var(--font-ui)`，`.af-block text` 讀它；匯出經 inline-style 取 computed font-family）。`src/shell/LayoutDialogs.tsx`（`AlignGridDialog`、`FontsDialog`：數字欄 `step="any"`，範圍自己驗證——原生 step 0.5 會擋下範本的 9.75 pt）。命令 `design.manage`、`theme.fonts`、`layout.alignHorizontal` / `layout.alignVertical`、`layout.arrangeSelectedPorts`（group `layout`）；V2 對照表 chineseFont / englishFont → `theme.fonts`。
- CSS 3.42：V3 的 CSS 本來就沒有 `!important`（只有 V2 有）。新增 `scripts/check-css.mjs`（`npm run check:css`，已加入 `test:all`）：擋 `!important`、同一 @-context 中同一選擇器重複設定同一屬性（前一個是死的）、src/ 沒有任何檔案提到的 `af-*` class（以前綴動態組成的 class 視為有用）。清掉的：`.af-start-note`（未使用）、`.af-rail-unknown .af-rail-bolt` 的 fill 被後面 `fill: none` 蓋掉——保留實際生效的 `fill: none`，從前面的群組選擇器移除（畫面不變）。
- 移植清單 3.43a：`docs/v3-port-checklist.md` 現為 ☐ 16（全部是缺口，備註「缺口 → 3.43x」）／☑ 236／✂ 54／⤳ 21；`node scripts/audit/port-checklist.mjs` 重新產生不會改動手動狀態（已驗證）。主要 ✂ 理由：Project Explorer 清單 → 指令面板「前往項目」；換語系的工作階段快照 → 3.41 不重新載入；行內天數編輯器 → 屬性面板；「以範本取代目前設計」→ 改為新增設計；範本建構 / 量測對齊 → 範本 JSON 已是 V2 產出結果；接點鎖定 → 3.11 決定。已知差異：V2 格線開啟時「依連線排列接腳」只做正規化（L1564），V3 一律排列（CHANGELOG）。`tests/unit/dead-code.test.ts`：audit §4 的廢止功能（標題、both 類型、V1 雙工作區、version 4、舊版轉接、本地化推論、en tidy、版本字樣改寫、RC2 / RC3 對話框、點擊隱藏元素、review 欄位、單一版本常數）在 src/ 程式碼（去掉註解後）中都不存在。
- 時程 3.43b：`schedule/dates` 新增 `iso` / `weekday`（週末改週一）/ `spanOf` / `durationOf`；`schedule/edit`：`appendTask(d, title, parent?, { now })` 回傳 `inserted`（選取任務原本只有一個後續時插入）、新任務預設日期（上一個任務結束後的工作日起、長度同上一個或 5 天）、不重複名稱（「新任務 2」）、沿用分支色（任務與連線）；`addBranch` 同樣套用；`removeItems` 刪除任務時後續接回上一個任務（V2 L772）；`setDefaultRange`、`setDuration`、`conflictsBelow`、`shiftConflicts(d, from?)`（V2 af16 fixConflicts：從 from 的上一個任務往下，或所有起點）。屬性面板：「＋ 設定日期區間」、可編輯的「工期（含首尾）」、任務的「順延後續任務」與總覽的「一鍵順延」（`af-field-action`）；命令 `schedule.fixConflicts`。與 V2 不同：V2 新增分支時只對第一個新任務套用預設值（主線後續），V3 兩個都套用；名稱保留「主線後續任務」「分支任務」而非一律「新任務」。
- 方塊尺寸 3.43c：`model/diagram`：`BLOCK_SIZE`（一般 120 × 60、步距 10；自由尺寸最小 20、逐 px；格線開啟時以格距）、`resizeBlock(d, id, w, h, { scaleText, theme })`（文字依寬高較小的比例縮放：名稱 12–48 px、其他 8–32 px）、`applyFontsToAll`、`scaleBlockFonts`。`core/prefs.ts`（`archflow:scaleText`，預設開）。`inspector/common` 方塊「尺寸與字級」群組（零件 / 連接器不顯示）：顯示主名稱、自由尺寸、寬、高、縮放時文字等比例（custom，含說明）、名稱 / 副標 / 接腳 / 數值字級（pt）、套用到全部方塊。`render/blocks`：`resizable` 選項畫右下角把手 `.af-block-handle`；接腳名稱 font-size 用 `block.font.label` 或 `theme.label`（V2 --diagram-label-size；範本 theme.label 13 → 接腳字比之前的 11 px 大，與 V2 相同）。`interaction/gestures`：`blockResize` 狀態（`BLOCK_HANDLE` 12 px），`GestureHost.scaleText`。字型對話框加「整張圖文字比例 −10% / +10% / +25%」。未移植：V2.7「緊湊化此方塊」（依 DOM 量測縮到剛好包住文字），以及匯出對話框的 16:9 投影片字級資訊。
- 線路路徑 3.43d：`src/model/route-edit.ts`——`moveSegment(ps, index, delta, jog)`（端點段保留接腳、先拉出 jog（格線開啟時一格，否則 20）再轉彎）、`moveCorner(ps, index, q)`（V2 cornerPath）、`setManualPath`（存完整路徑 + `routing: 'manual'`）、`slidePort`（`core/grid.portAt` 最近邊、清掉該接腳線路的手動路徑）。`interaction/gestures`：選取單一未鎖定線路時，`wireHandles(id)` 的轉角 / 線段中點（`BLOCK_HANDLE` 12 px）開始 `path` 狀態；路徑以 `routeWire` 驗證——**手動路徑不合法時 router 會退回自動繞線**，所以要比對回傳路徑與手動路徑相同才算有效；無效時預覽 `invalidPath`（紅色虛線），放開時以 `ModelError('route-invalid')` 拒絕（i18n `canvas.refused.route-invalid`）。Shift 拖曳接腳 → `slide` 狀態（零件 / 連接器 / 鎖定不行）。Canvas overlay 畫 `.af-segment-handle` / `.af-corner-handle`。
- 線路標註 3.43d2：`model/route-edit.setLabelMark`（角度存 0–359；null 回到自動）；`render/wires`：`labelPosition` 回傳 angle、標籤 `transform: rotate(...)` 與 `data-wire-label`、`labelBox`、`duplicates()`（V2 dedupeLabels：標籤文字（不分大小寫、去空白）等於 14 px 內的接腳名稱時不畫；接腳名稱框由 `render/blocks.pinLabelBoxes` / `pinLabelAt` 估算）。`interaction/gestures`：`labelAt`（依角度反轉後測框）、`label` 狀態（拖曳 → mark、點一下只選線）；選取線路的把手判斷順序：畫出的把手框（6 px）→ 標籤 → 24 px 擴大範圍。`inspector/common` 線路「線路名稱／數值標註」群組（`markOf`：mark 或自動位置，routes 以 WeakMap 快取）。`model/diagram.adoptNewBlock`（`block.add`）。未移植：V2 按 R 旋轉已聚焦的標註（R 在 V3 是零件旋轉的快捷鍵），以及雙擊標籤行內改名。
- 零件連線 3.43e：`src/model/part-wiring.ts`——`blockAt`（6 px 邊距、上層優先）、`freeLead`（未用的端點優先，再取最近）、`connectToBody(d, from, target, p)`（任一端是零件時：目標是零件 → 它的空端點；一般方塊 → 最近的邊新增接腳，電源 / 接地符號時接腳名稱為 VCC 值 / GND、類型 power / gnd、名稱隱藏、線路為 power；`growForPorts`）、`nearestWirePoint`（12 px、對齊格距、離線段端點至少一格）、`tapWire`（新增接點「TAP n」，原線保留前半段並取消箭頭與手動路徑，後半段為複本）。`Gestures.dropOnBody`：拉線放開時沒有對到接腳才走這條路；新路徑（或拆線後所有路徑）必須有效，否則以 `route-invalid` 拒絕。V2 拖曳時對目標方塊加亮（af24-target）未移植。
- 範本 3.43g：V2 的六個完整範例由 V2 實際產生（在 V2 頁面設 `afTemplateMode = null`、把啟動畫面第 1 / 2 張範本卡設為 pressed，再 `createWorkspaceProject`；第 1 張卡 = variant 1、第 2 張 = variant 0），經 `convertProject` 轉成 V3，兩語系逐字比對：不同的字串改為 `@i18n:template.<x>.<id>.<路徑>`（b3.title、t0.text、task2.note…，共 118 個鍵），id 與數字取 zh-Hant；時程日期還原到 V2 PLANS 的原始日期並記 `anchor`（建立時 `shiftToWeek` 對到本週，同 V2）。範本名稱 = 圖上的標題文字。`function`：starter / platform / sensor / power-starter / power-car / power-zones；`schedule`：starter / product / eco。產生用的腳本沒有提交（一次性）；`tests/golden/templates.examples.test.ts` 每次都重新請 V2 建立並比對（zh-Hant：方塊、接腳、線、接點、文字、外框與匯出線路完全相同；en：文字相同，幾何沿用 zh-Hant，同 3.27c）。
- **工具**：`.claude/skills/ui-ux-pro-max`（UI/UX 規則，階段 3 用）；`node scripts/audit/find-overrides.mjs`（覆寫鏈）；`node scripts/audit/dump-project-shape.mjs`（存檔欄位實測）；`node scripts/audit/diff-locales.mjs`（語系結構差異）。
- **指令**：`npm test`（Vitest，`tests/unit`、`tests/golden`）；`npm run test:e2e`（Playwright，已帶 `--trace off`）。測試檔第一行以 `// module: <x>` 標註所屬模組。
- 2.2：jsdom 載入 V2 引擎會卡住（90 秒逾時，引擎依賴版面量測與計時器補丁），測試輔助 `tests/helpers/load-app.js` 改在 Vitest 中啟動預裝 Chromium：`const app = await openApp(); await app.eval(fn, ...args); await app.createProject(type); await app.close();`。單元測試也因此需要瀏覽器，每個檔案約 +1 秒。
- **最後通過的驗證層級**：L2+（3.43g：模組標註、i18n、token、css、型別、建置（dist 1.97 MB）、產物檢查、Vitest 59 檔 483 項（含 golden 12 項新範本比對）、Playwright 37 項（`--workers=1`）全數通過）。3.38 的人工驗收仍待使用者確認（開 `dist/ArchFlow.html`，拖亂方塊後「自動整理」→ 套用 → 復原；存檔再開啟，整理後的標籤位置保留）。
- **記憶體**：雲端 session 的記憶體上限下，`npm run test:all` 的 Playwright 多 worker 可能讓頁面因 OOM 當掉（3.11 時 BOM 工具測試 `Page crashed`）。遇到時改跑 `npx playwright test --trace off --workers=1` 確認。

### V3.0.0 之後的待辦
（3.26c 記錄；不在 V3.0.0 範圍內。存檔已預留對應欄位，實作時不需改格式，除非另有註明。）

#### 方塊圖 UI/UX 優化
- **P1**
  - 雙擊空白處新增方塊並直接進入改名。
  - 方塊四邊「＋」：快速延伸出新方塊並自動接線。
  - 接點吸附與正交自動走線（手動路徑仍存在 `wire.route`，以預留的 `wire.routing` 標示是否為手動）。
  - 原地改名（畫布上直接編輯標題）。
  - 對齊參考線與格線吸附（格線 / 吸附繼續存在檔案的 `BlockDiagram.grid`，3.26c 確認）。
  - 空白狀態引導（沒有內容時的說明與動作）。
- **P2**
  - 多選浮動工具列：對齊 / 分布 / 統一大小（使用預留的 `block.size`）。
  - 精簡右鍵選單。
  - 統一搜尋與最近使用（零件、命令）。
  - 快捷鍵：F2 改名、Ctrl+D 複製、方向鍵微調（方向鍵移動已在 3.20 完成）。切換檢視的 Shift+V 在 3.27a 就做。
- **P3**
  - 依電源樹自動排列的衍生版面（plan §2.2.2 延後項）。
  - 每種檢視各自的方塊座標（需改存檔格式，plan §2.2.2 延後項）。
  - 角色配色圖例。
  - 超過額定的 ⚠ 徽章與狀態列警示統計。
  - 電源預算總覽面板（只計算、不存檔；plan §2.2.2 延後項）。
- **通用**：WCAG AA、可用鍵盤完整操作、tooltip、小螢幕收合面板。
- 群組框（預留 `groups`）、一鍵配色（預留 `style.color`）、標籤拖曳偏移（預留 `wire.labelOffset`）。

#### 其他
- 零件拖到方塊上自動接線（V2 `attach`，L4240）。
- 最近使用零件清單。
- 變更連接器而刪除線路時的提示（V2 會顯示刪除條數，3.26b 未移植）。
- `tests/tools/svg-compare.ts` 正規化（文字依錨點換算左緣、路徑去重複點），讓 golden function 可做完整逐元素比對（建議在 3.44 一併處理；若 3.44 未做則留到此處）。

#### ui-ux-pro-max 檢查建議（只列建議，不擴大範圍）
以 `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain ux` 對照上列清單：
1. **（已決定：改用 Shift+V，3.27a 實作）「Tab 切換檢視」與鍵盤導覽衝突**（Keyboard Navigation，High）：Tab 是瀏覽器移動焦點的鍵，拿來切換檢視會讓鍵盤使用者無法離開畫布。建議改用不衝突的組合（例如 `Mod+1` / `Mod+2` 或 `Shift+V`），或只在畫布取得焦點且無選取時才攔截並提供跳出方式。
2. **角色配色不可只靠顏色**（Color Only，High）：角色配色要搭配圖例與文字 / 圖示（例如方塊上的角色縮寫）；超過額定用 ⚠ 圖示 + 文字（清單中的做法正確），不要只把邊框變紅。
3. **拖曳要有替代操作**（Dragging Movements，WCAG 2.5.7，High）：四邊「＋」、對齊參考線、接點吸附都是拖曳操作，需保留鍵盤 / 按鈕替代（屬性面板座標、方向鍵、命令「延伸方塊」）。
4. **點擊目標至少 24 × 24 CSS px**（Target Size，WCAG 2.2 AA，High）：「＋」把手與外框四角把手（目前 `FRAME_HANDLE` 8 px）的**命中範圍**應放大到 24 px，畫出來的大小可以較小。
5. **tooltip 不可只靠 hover**（Hover vs Tap，High）：鍵盤取得焦點時也要顯示、可用 Escape 關閉，觸控裝置有替代說明。
6. **右鍵選單要有鍵盤入口**：支援 ContextMenu 鍵 / Shift+F10，且選單內可用方向鍵移動。
7. **空白狀態**（Empty States，Medium）：說明 + 明確的動作按鈕（新增方塊 / 套用範本），可略過、不要強迫導覽。
8. **刪除用復原取代確認**（Undo for Reversible Actions，Medium）：連接器變更刪除線路時，建議用「已刪除 N 條線路・復原」的提示，而不是事前確認框。
9. **動畫尊重 `prefers-reduced-motion`**（High）：自動走線、參考線、面板收合的動畫在減少動態時關閉。
10. **小螢幕收合面板**：以 320 / 768 / 1024 / 1440 寬度測試，不可出現水平捲軸（Horizontal Scroll，High）。

