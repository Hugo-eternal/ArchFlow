# ArchFlow V3.0.0 重構計畫與 Prompt 集

## 0. 使用方式
1. 第一次：貼上「Prompt 0」，並把整份檔案附在後面。
2. 之後每次額度重置：只貼「續跑 Prompt」（第 4 節）。
3. 選用：建立排程任務，在額度重置時間自動執行「續跑 Prompt」，直到 `docs/v3-progress.md` 全部勾選完成。

---

## 1. 需求摘要

### 現況（V2.10.1）
- `index.html`（12.6 MB）以 base64 內嵌中、英兩份完整程式，兩份各約 1 萬行，修一個 bug 要改兩次。
- 核心引擎（約 L252–862）全部是全域變數與全域函式。
- 補丁層使用 `const baseX = X; X = function(){…}` 覆寫鏈，同一個函式最多被包 10 層以上，是 bug 的主要來源。
- CSS 分成多段，大量使用 `!important`。
- V2 殼層是 minified 的 React bundle（L5319–10374），沒有原始碼。
- 沒有自動化測試。

### V3 必須保持不變
1. 使用者仍只需開一個離線 HTML 檔，不需要伺服器或網路。
2. 現有功能全部保留：功能方塊、電源架構、專案時程、電源時序、流程圖、四個內建工具、PNG/SVG 匯出、中英切換。
3. **不需要**相容 V1.x / V2.x 的舊 JSON 檔。

### 整理目標
- 原始碼與發佈分離：`src/` 是模組化原始碼，建置後產出單一檔 `dist/ArchFlow.html`。
- 程式碼只留一份，文字抽到 `i18n/zh-Hant.json` 與 `i18n/en.json`。
- 消除覆寫鏈：每個函式只有一個實作；不同圖面類型的差異由 `designs/<type>` 的策略物件分派。
- 模組劃分：core、model、router、render、inspector、io、export、shell、designs/<type>、tools/<tool>。
- 全新 V3 專案格式（`schemaVersion: 3`）；開啟舊檔時顯示「不支援舊版格式」。
- CSS 整併為一套 design token；刪除死碼和只為相容舊檔而存在的程式。

### 修改層級與驗證範圍
| 層級 | 判定（依路徑，多項時取最高級） | 必跑驗證 |
|---|---|---|
| L0 文件 | docs/**、*.md、.claude/** | lint、連結檢查 |
| L1 外觀 | src/styles/**、i18n/** | build 檢查 + SVG 快照 + 1 個冒煙 E2E |
| L2 單一功能 | src/designs/<x>/**、src/tools/<x>/** | L1 + <x> 的 unit、golden、E2E |
| L3 共用核心 | src/core\|model\|router\|render\|inspector\|io\|export\|shell/** | 全部 unit、golden、E2E |
| L4 格式／發版 | schema/**、package.json、vite.config.*、.github/**、版本號檔 | L3 + 遷移測試 + 建置產物檢查 + 人工驗收 |

規則：
- PR 加上標籤 `verify:full` 可強制跑全套，但不能用標籤降低層級。
- main 分支每晚跑一次 L3 全套。
- designs/* 之間禁止互相 import。

### 斷點續跑機制
- 進度寫在 `docs/v3-progress.md`，每一步都是可以獨立提交的小步驟（`- [ ]`）。
- 每完成一步：驗證 → 勾選 → 更新「交接」段落 → commit 並 push。
- 所有工作固定在 `v3-refactor` 分支上進行。

---

## 2. Prompt 0：初始化（只執行一次）
```
這是 ArchFlow（hugo-eternal/archflow）。請從目前分支建立 v3-refactor 分支，完成以下事項後 commit 並 push：
1. 把本訊息附上的整份文件存成 docs/v3-prompts.md。
2. 建立 docs/v3-progress.md：依階段 1–4 拆成可獨立提交的小步驟（每步約 30 分鐘以內），用 - [ ] 列出；檔案底部加「## 交接」段落，內容包括目前階段、下一步、已知問題、最後通過的驗證層級。
3. 在 CLAUDE.md 寫入工作規則：
   - session 開始時：git pull，讀 docs/v3-progress.md 的「交接」，從第一個未勾選的步驟繼續。
   - 每完成一步：跑該步對應層級的驗證，通過後勾選、更新交接，commit 並 push。
   - 不可一次做好幾步才提交；額度或時間快用完時，優先更新交接並 push。
```

## 3. 各階段 Prompt

### 階段 1：盤點（只讀，不改程式）
```
index.html 以 base64 內嵌 src/app.zh-Hant.html 與 src/app.en.html（可用 tools/unpack.mjs / tools/pack.mjs 轉換）。可參考 docs/code-map.html。
本階段不修改程式，只產出文件：
1. 列出所有被「const base=X; X=function(){…}」覆寫的全域函式：覆寫層數、行號、每一層的目的。
2. 列出 model 與專案 JSON 的所有欄位，標出哪些仍在使用、哪些只為相容舊檔而存在（V3 會移除）。
3. 比對 zh-Hant 與 en 兩份程式，列出翻譯字串以外的差異。
4. 標出死碼與已廢止功能（heading、隱藏的 both 類型、RC 實驗分支、legacy copper/off-grid 轉換）。
5. 判斷 af20-shell 的 React bundle 能否找到原始碼；如果找不到，提出用 vendor/ 原樣隔離的方案。
產出 docs/v3-audit.md 與 docs/v3-plan.md，內容包括模組切分、V3 schema 草案、風險、執行步驟。
```

### 階段 2：測試安全網（重構前）
```
在不修改功能的前提下，為現行 V2.10.1 建立測試基準：
- Vitest + jsdom：findPath（路徑不重疊、不穿越方塊）、資料驗證、存檔↔載入結果一致、時程日期計算、自動排列。
- tests/golden/：function、power、schedule、sequence、flowchart 每種圖面類型各一份代表性專案，鎖定功能行為與 SVG 匯出快照。不需要舊版 JSON 樣本。
- Playwright（只用 chromium，執行時加 --trace off）：6–8 個關鍵情境，包括建立專案、新增方塊與連線、切換設計、存檔後重開、匯出、切換語系、開啟每個內建工具。
- 每個測試標註所屬模組（core/router/render/io/export/shell/designs:<x>/tools:<x>），供之後依層級挑選要跑的測試。
所有測試在現行版本上都必須通過。
```

### 階段 3：模組化重構為 V3
```
依 docs/v3-plan.md，把程式重構到 src/。使用 TypeScript + Vite，產出單一離線檔 dist/ArchFlow.html，所有資源與字型都內嵌，不得有任何外部網路請求：
- 程式碼只留一份，文字抽到 i18n/zh-Hant.json、i18n/en.json。
- 消除所有覆寫鏈：每個函式只有一個實作；不同圖面類型的差異用 src/designs/<type> 的策略物件分派；designs/* 之間禁止互相 import。
- 模組劃分：core、model、router、render、inspector、io、export、shell、designs/<type>、tools/<tool>。
- 全新 V3 專案格式（schemaVersion: 3），用單一 schema 驗證。刪除只為相容 V1/V2 舊檔而存在的程式；開啟非 V3 格式的檔案時，顯示「不支援舊版格式」，不得當機。io/migrate.ts 只保留框架，供日後 V3.x 之間升級用。
- CSS 整併為一套 design token，移除重複規則與多餘的 !important。
- React 殼層：找得到原始碼就納入 src/shell；找不到就放在 vendor/ 隔離。
- 每完成一個模組就跑該模組的測試，通過後才繼續下一個。除非是有意的行為修正，不得為了讓測試通過而修改黃金檔；有意的修正要記錄在 CHANGELOG。
- 最後把各處版本號統一改為 V3.0.0。
```

### 階段 4：Skill、CI、修改層級驗證
```
為 ArchFlow V3 建立以下項目：
1. CLAUDE.md：架構概要、常用指令（dev/test/build）、硬性規則：
   - 禁止覆寫鏈
   - designs/* 不得互相 import
   - 新增欄位時，必須更新 V3 schema 與黃金檔
   - 變更既有欄位時，必須提高 schemaVersion 並撰寫 V3.x 遷移
2. .claude/skills/archflow-dev/SKILL.md：「要修 X → 看哪個模組、跑哪個測試」對照表；新增圖面類型或工具的步驟；修改層級表。要求每次修改前先說明判定的層級，再執行對應驗證，並在 PR 描述中註明層級。
3. .claude/skills/archflow-release/SKILL.md：發版流程，包括版本號、CHANGELOG、build、L4 驗證、人工驗收清單、tag。
4. scripts/classify-change.mjs：依 git diff 的檔案路徑判定 L0–L4（規則見第 1 節表格），多項時取最高；L2 要輸出受影響的 <x>。
5. .github/workflows/ci.yml：
   - PR 時先執行 classify-change，只跑對應層級的測試集。
   - PR 標籤 verify:full 可強制跑全套，但不能用標籤降低層級。
   - main 每晚跑 L3 全套。
   - 推送 v* tag 時建立 Release，並附上 dist/ArchFlow.html。
   - 加一條依賴檢查，禁止 designs/* 之間互相 import。
6. 更新 docs/code-map，讓它對應 V3 的模組結構。
```

---

## 4. 續跑 Prompt（額度重置後貼這段）
```
繼續 ArchFlow V3 重構。請：
1. 切到 v3-refactor 分支並 git pull。
2. 讀 CLAUDE.md、docs/v3-progress.md 的「交接」段落，以及 docs/v3-prompts.md 中目前階段的 Prompt。
3. 從第一個未勾選的步驟開始，一次只做一步：完成 → 跑該步層級的驗證 → 勾選 → 更新交接 → commit 並 push。
4. 如果上一步只做了一半（有未提交的變更或測試失敗），先判斷要修完還是還原，並在交接中說明。
5. 持續進行，直到額度快用完或全部完成；結束前務必更新交接並 push。
```
