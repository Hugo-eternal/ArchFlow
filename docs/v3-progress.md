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
- [ ] 1.10 `docs/v3-plan.md`：V3 schema 草案（`schemaVersion: 3`）與每種圖面類型的策略物件介面
- [ ] 1.11 `docs/v3-plan.md`：風險清單、階段 3 的模組遷移順序（逐一列出步驟），並據此細化本檔階段 3 的步驟

## 階段 2：測試安全網（針對現行 V2.10.1，不改功能）
- [ ] 2.1 建立 `package.json`（Vitest、jsdom、Playwright 使用預裝 chromium）與 `npm test` 指令；加入空的冒煙測試（L4）
- [ ] 2.2 測試輔助：在 jsdom 載入 `src/app.zh-Hant.html` 並取得引擎全域函式（`tests/helpers/load-app.ts`）（L4）
- [ ] 2.3 Unit：`findPath`——路徑為正交、不穿越方塊、不與既有路徑重疊（標註 router）
- [ ] 2.4 Unit：`validateDiagram` 資料驗證——合法／非法輸入、上限（100 方塊／400 線／8 MB）（標註 io）
- [ ] 2.5 Unit：存檔 ↔ 載入結果一致（`projectData` → `acceptLoadedProject`）（標註 io）
- [ ] 2.6 Unit：時程日期計算（scheduleDay、intervalState、手動天數）（標註 designs:schedule）
- [ ] 2.7 Unit：自動排列 `autoArrange`——決定性、無重疊（標註 core）
- [ ] 2.8 Golden：`tests/golden/function` 代表性專案 + SVG 匯出快照
- [ ] 2.9 Golden：`tests/golden/power`
- [ ] 2.10 Golden：`tests/golden/schedule`
- [ ] 2.11 Golden：`tests/golden/sequence`（電源時序）
- [ ] 2.12 Golden：`tests/golden/flowchart`
- [ ] 2.13 E2E（Playwright, chromium, `--trace off`）：建立專案、新增方塊與連線
- [ ] 2.14 E2E：切換設計、存檔後重開
- [ ] 2.15 E2E：匯出 PNG / SVG、切換語系
- [ ] 2.16 E2E：開啟每個內建工具（BOM / EDID / Hex / Pattern）
- [ ] 2.17 確認每個測試都有模組標註；整套在 V2.10.1 全部通過；寫 `tests/README.md`

## 階段 3：模組化重構為 V3（步驟會在 1.11 依 v3-plan.md 細化）
- [ ] 3.1 建立 TypeScript + Vite 骨架與單檔建置（產出 `dist/ArchFlow.html`，字型與資源內嵌，無外部請求）（L4）
- [ ] 3.2 i18n 框架：`i18n/zh-Hant.json`、`i18n/en.json` 與 `t()`（L1）
- [ ] 3.3 design token CSS 骨架（`src/styles/`）（L1）
- [ ] 3.4 `model` 模組與 V3 schema（`schemaVersion: 3`）＋單一 schema 驗證（L3）
- [ ] 3.5 `io` 模組：存檔／載入、非 V3 檔顯示「不支援舊版格式」、`io/migrate.ts` 框架（L3）
- [ ] 3.6 `router` 模組（findPath、fullPath）（L3）
- [ ] 3.7 `render` 模組（方塊、接腳、連線、接點）（L3）
- [ ] 3.8 `core` 模組（互動、選取、復原／重做、格線、自動排列）（L3）
- [ ] 3.9 `inspector` 模組（單一實作 + 由 design 策略提供欄位）（L3）
- [ ] 3.10 `export` 模組（SVG / PNG、頁面、可讀性）（L3）
- [ ] 3.11 `designs/function`（含零件庫、符號、外框、連接器、LCD 範本）（L2）
- [ ] 3.12 `designs/power`（L2）
- [ ] 3.13 `designs/schedule`（L2）
- [ ] 3.14 `designs/sequence`（電源時序）（L2）
- [ ] 3.15 `designs/flowchart`（L2）
- [ ] 3.16 `shell`：取得原始碼則納入 `src/shell`，否則放入 `vendor/` 隔離（L3）
- [ ] 3.17 `tools/bom`、`tools/edid`、`tools/hex`、`tools/pattern`（各一個提交）（L2）
- [ ] 3.18 CSS 整併：移除重複規則與多餘的 `!important`（L1）
- [ ] 3.19 刪除只為相容舊檔而存在的程式與死碼（L3）
- [ ] 3.20 全部 unit / golden / E2E 對 `dist/ArchFlow.html` 通過；有意的行為修正記錄在 `CHANGELOG.md`（L3）
- [ ] 3.21 版本號統一為 V3.0.0（L4）

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
- **目前階段**：階段 1（盤點）
- **下一步**：1.10 `docs/v3-plan.md` §2：V3 schema（`schemaVersion: 3`）與 `DesignModule` 策略介面
- **已知問題**：
  - 程式碼目前為 V2.10.1，`index.html` 以 base64 內嵌 `src/app.zh-Hant.html` 與 `src/app.en.html`；改 `src/` 後需執行 `node tools/pack.mjs`。
  - en 版在約 L2361 之後行號比 zh-Hant 多約 8 行。
  - V2 殼層、電源時序、流程圖、BOM 為 minified React bundle（L5319–10374），repo 與 bundle 中**找不到原始碼**（audit §5）。使用者已確認**沒有原始碼，採 vendor 隔離**（audit §5.3）；V3 重寫殼層（React + TS）。
  - 尚無 `package.json` 與任何測試；階段 2 之前只能跑 L0 驗證。
  - 已實測確認：存檔的 `applicationVersion` 是 `'1.8-rc4'`（L1857 覆寫了 L1057 的 V2.10.1）。
  - §2 中標「待確認」的欄位（`afPresentation`、`scheduleDesign`、`ioConfig`、`review`、`afRouteOnly`）留到 1.6 / 階段 2 判斷。
- **工具**：`.claude/skills/ui-ux-pro-max`（UI/UX 規則，階段 3 用）；`node scripts/audit/diff-locales.mjs`（語系結構差異）；`node scripts/audit/find-overrides.mjs`（覆寫鏈）、`node scripts/audit/dump-project-shape.mjs`（在 Chromium 建五種範例專案並列出存檔欄位）。
- 1.5 發現：兩語系只差 252 行（7 處結構差異，其餘為寫死的翻譯字串）；React bundle 兩語系完全相同。
- 1.6 發現：V1 介面在 V2 中全部隱藏，殼層靠點擊約 40 個隱藏元素 id 驅動引擎（清單見 audit §4.1，V3 需改為明確 API）；自動整理只有 RC4 `v4Open` 生效，但它仍呼叫 RC2/RC3 的計算函式。
- **最後通過的驗證層級**：L0（1.9：模組對照表逐項對應 audit 行號；1.8：輸入輸出格式以各工具字串中的 accept / 下載檔名交叉確認；1.7：bundle 組成以字串邊界解析與 host 介面搜尋確認；1.6：可見性與 autoArrange 行為以 Chromium 實測確認；1.5：diff 腳本結果以原始逐行比對交叉驗證（252 行不同）；1.4：頂層欄位以實測輸出與讀寫行號交叉核對；1.3：欄位清單由瀏覽器實測輸出產生，五種設計皆建立成功、無頁面錯誤）
