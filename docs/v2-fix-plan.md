# V2.10.1 死碼與待修清單（改回以 V2 為主體修正）

使用者決定：V2 的視覺化 UI／UX 體驗較好，改回 V2.10.1 修正，不再以 V3 取代。本文件列出 V2 的死碼（可刪除）與待修缺陷，作為之後逐步修正的依據。

- 來源：`docs/v3-audit.md`（§1 覆寫鏈、§4 死碼）、`tests/legacy/`（V2 行為測試，`QUIRK:` 與 `KNOWN_LOSS`）、V3 移植時發現並記在 `CHANGELOG.md` 的 V2 錯誤。
- 行號都是 `legacy/app.zh-Hant.html`。`legacy/app.en.html` 在約 L2361 之後多約 8 行（en 獨有的 `v147-en-text-tidy`），修改時兩份都要改。
- 死碼的判斷在盤點時已用瀏覽器實測（建立專案後檢查元素是否存在、呼叫函式看實際開啟哪個對話框）。**刪除前每一項都要再用 `tests/legacy` 確認一次**，因為之後修改可能改變行號。

## 0. 工作方式

1. 修改 `legacy/app.zh-Hant.html` 與 `legacy/app.en.html`（兩份都改），再執行 `node tools/pack.mjs` 產生 `index.html`（第 2 行是 base64，不要直接改）。
2. 驗證：`npm run test:legacy`（單元與 golden）、`npm run test:legacy:e2e`（E2E）。黃金檔只能在有意的行為修正時更新，並寫進變更紀錄。
3. 一項一個 commit，修正前後各跑一次測試。
4. V2 的 React 殼層（`af20-shell` bundle）沒有原始碼，只能改它外面的 HTML／JS／CSS，或在殼層之後加補丁層。殼層透過「點擊隱藏的 V1 按鈕」驅動引擎（audit §4.1 列出的 42 個 id），**這些隱藏按鈕不是死碼，不能刪**。

## 1. 死碼（可刪除）

### 1.1 已廢止的功能

| # | 項目 | 位置 | 證據 | 刪除風險 |
|---|---|---|---|---|
| D1 | 工作區標題（heading） | CSS L26、L28；HTML L247、L251（`#headingDialog`）；`cleanHeading`／`renderHeading`／`headingBounds`／`appendHeadingExport`／`openHeading` L458–463；`render` L310、`fit` L336、`exportSvgDocument` L390／L398、`validateDiagram` L360 中的呼叫；L1197 換成空函式 | `#headingBtn` 已不在 DOM，L240 以 CSS 隱藏 `.workspace-heading`，L1195 註明停用 | 低。舊檔若有 heading 欄位，驗證時要繼續忽略而不是報錯 |
| D2 | 隱藏的 `both` 專案類型 | `allowedWorkspace` L465、`createWorkspaceProject` L470、L2329、`acceptLoadedProject` L474、L3370、L3526；啟動畫面卡片 L246（`hidden`） | 卡片隱藏，殼層 bundle 也把它濾掉 | 低 |
| D3 | V1 雙工作區（circuit／current 分頁） | `workspaces`、`switchWorkspace`、`updateWorkspaceUI` L340–346；`#tab-circuit`、`#tab-current` | 分頁隱藏，已被多設計（`designs[]`）取代 | **中**：`activeWorkspace` 仍被大量拿來判斷「是不是電源設計」，要先把判斷改成看設計類型，再刪分頁 |
| D4 | `version: 4` 專案格式轉換 | L363、L560、L2332 | 只在載入舊檔時轉換 | **高**：刪掉後 V2 打不開 v4 舊檔。建議保留，除非確定沒有 v4 檔 |
| D5 | 時程舊銅色主題轉換 | L817–818 | 只在載入舊檔時把 amber 主題轉為自訂樣式 | 中（同 D4，影響舊檔外觀） |
| D6 | 舊圖未對齊格線的端點轉接 | `roLegacyNote` L1593–1613、`ggLegacy` L1483／L1514、L1542 | 只對未對齊格線的舊檔接點產生短轉接線 | 中（同 D4） |
| D7 | 範本綁定推論 | `afInferLegacyBindings` L971、L976 | 只在讀舊檔時推論 `archflowLocalization` 綁定 | 中（同 D4） |
| D8 | 舊接點網路拒絕載入 | L1325–1327 | 載入檢查 | 中（同 D4） |
| D9 | 版本字樣反覆改寫 | 3 個 `render` 層各自把 `.af-brand-version` 改成 V2.10.1（L1745、L1779、L1858），`archflow-v13-release-lock`（L2352–2360）定時覆寫 | 同一件事做 4 次 | 低；改成單一版本常數，同時修 B2 |

### 1.2 自動整理：RC 實驗分支的死入口

最後生效的是 RC4（`v4Open`，L1848）：方塊圖的「整理預覽」開 `v4Dialog`，時程走 `rcAutoEngine`。下列入口與對話框已經沒有任何路徑會開到：

| # | 項目 | 位置 |
|---|---|---|
| D10 | RC2 整合預覽對話框 `#uiDialog` 與 `uiOpen()` 本體 | L1681–1745 |
| D11 | RC3 預覽介面 `#ssPreview`、`#ssMode`、`#ssScope` | L1747–1781 |
| D12 | 路線整理 `ro*` 對話框入口、`#rcPortDialog`（接點評估）、`#rcAutoDialog` 的介面 | 散在 L1560–1650 |

**注意**：RC2／RC3 的計算函式仍被 RC4 使用，不能一起刪：`uiCandidate`、`uiRoutes`、`uiNoOverlap`、`uiArrangeLabels`、`uiVerify`、`roGeometry`、`roLocked`、`roCurrentPaths`、`rcEndLabel`，以及時程用的 `rcAutoEngine`。只刪介面與入口。

### 1.3 被後面的層完全蓋掉的實作

V2 用「後面的程式再包一層」的方式修改函式，同一個函式最多有 37 層（audit §1）。下列各層已經沒有效果：

| # | 函式 | 已無作用的層 | 實際生效 |
|---|---|---|---|
| D13 | `render` | 596、626 的時程分支 | 691 以後各層 |
| D14 | `drawEdges` | 597、629、668 的時程分支 | 688 以後 |
| D15 | `inspector` | 599、631、673 的時程分支；797 被 844 回退 | 741 以後 |
| D16 | `exportSvgDocument` | 606、634、698 的時程分支 | 754、760 |
| D17 | `scheduleExample` | 620、677 | 925 之後的包覆 |
| D18 | `axisLayout` | 618、657 | 685＋722 |
| D19 | `autoArrange` | 378 本體、1214、1647、1736、1771 | 1850 |
| D20 | `projectData` | 520（被 555 整個取代） | 555 起 |
| D21 | `workspaceExample` | L602 的時程範例分派層：L907 存了 `afOriginalExample` 卻從未呼叫 | 907 |
| D22 | 時程輔助函式舊版 | `scheduleTask`、`taskHeight`、`graphBounds`、`graphAutoFit`、`storeWorkspace`、`allowedWorkspace` 的舊定義（L619、721、689、692／736、547、548 被取代） | 取代後的版本 |
| D23 | `openScheduleTemplates` | L769（被 861 取代） | 861 |

刪除方式：一次刪一層，刪完跑 `test:legacy` 與 `test:legacy:e2e`。這是風險最低、也最能減少日後「改了沒效果」的部分。

### 1.4 換成空函式的舊功能

| # | 項目 | 位置 |
|---|---|---|
| D24 | 舊接點修復與轉角分支：`repairJunctionGeometry`、`drawBranchCorners`、`beginCornerBranch`、`afNormalizeSharedBranches`、`splitAtCorner` | L1109、L1305、L1306、L1304；被換成空函式或 `return 0`，`splitAtCorner` 沒有任何呼叫者 |

刪除時要連同呼叫端一起刪，不能只刪定義（呼叫端仍會呼叫空函式）。

### 1.5 沒有用的欄位

| # | 欄位 | 情況 |
|---|---|---|
| D25 | `review` | 只有讀取（L308，加上的 `.review-tag` 被 CSS L14 隱藏）與驗證（L359），沒有任何地方設定它，五種範例存檔都沒有此欄位 |
| D26 | `ioConfig` | 電源設計的接腳槽位（L451–456），V2.4 之後接腳改用接腳表格管理；**刪除前要先用測試確認它是否仍影響畫面** |

### 1.6 英文版獨有的程式

| # | 項目 | 位置 |
|---|---|---|
| D27 | `v147-en-text-tidy` | en L2361–2368，只存在英文版。要嘛兩份都保留，要嘛把它的修正併入共用程式後刪除，讓兩份結構一致 |

## 2. 待修清單（V2 缺陷）

### P1：會遺失資料或存錯資料

| # | 缺陷 | 位置／證據 | 修正方向 |
|---|---|---|---|
| B1 | **存檔後重新開啟會遺失資料**：功能／電源設計文字框的 `align`、`background` 遺失；**時程設計的文字框全部消失、外觀 `theme` 被清除** | `validateDiagram`／`projectData` 的層沒有保留這些欄位；`tests/legacy/unit/io.roundtrip.test.js` 的 `KNOWN_LOSS` 鎖定現況 | 在驗證與存檔的最後一層補上這些欄位；修好後把 `KNOWN_LOSS` 改成空集合 |
| B2 | 存檔的 `applicationVersion` 是 `'1.8-rc4'`，不是 V2.10.1 | L1057 寫入後被 L1471…L1857 依序覆寫；測試 `QUIRK: saved applicationVersion is 1.8-rc4` | 單一版本常數（同 D9） |
| B3 | 超過 8 MB 的檔案只顯示「載入失敗，原專案已保留。」，專屬訊息被外層 loader 蓋掉 | L563 | 讓外層 loader 顯示帶有原因的錯誤 |

### P2：功能結果錯誤

| # | 缺陷 | 位置／證據 | 修正方向 |
|---|---|---|---|
| B4 | 時程「含頭尾」天數規則完全沒有作用 | L624 把 `scheduleLabel` 換成 `intervalState(e).label`；測試 `QUIRK: scheduleLabel ignores the inclusive counting rule` | `intervalState` 依 `count: 'inclusive'` 加一天 |
| B5 | 零件數值把所有 k／M 補成 kΩ／MΩ（晶振 `32.768k` 變成 `32.768kΩ`） | `normValue` L4268 | 只對以歐姆計的零件補 Ω，其他零件依單位補（例如晶振補 Hz） |
| B6 | 時程的「專案內容」分組標題寫成「功能方塊」 | 時程版 `updateExplorer`（L775）沿用 HTML 的「功能方塊」分組標題（L248） | 時程時顯示「任務」 |
| B7 | 格線關閉時，失效的手動路徑原樣保留並顯示為錯誤；格線開啟時才改回自動繞線 | `fullPath` 與格線層（L1591 前後） | 兩種模式一致：未鎖定的線改回自動繞線 |
| B8 | 繞線用畫面量到的方塊大小（例如高 267.094），不是存檔的 `w`／`h` | 格線關閉時的繞線 | 一律用方塊的存檔尺寸 |
| B9 | 中文版與英文版判斷「載入失敗」訊息的規則不同 | L563（audit §3.2 第 1 項） | 統一成同一套規則 |
| B10 | 方塊標題長度沒有上限 | 測試 `QUIRK: does not cap block title length` | 設上限（例如 200 字） |
| B11 | 新增方塊一律放在畫面中央，常疊在既有方塊上 | `$('#add').onclick` L327 | 從中央往外找最近的空位 |

### P3：體驗與可讀性

| # | 缺陷 | 位置／證據 | 修正方向 |
|---|---|---|---|
| B12 | 屬性面板分好幾層延遲改寫（最多 4 層 microtask 加 4 個 timer），會閃動，也有時序造成的錯誤 | `inspector` 後期各層的 `enhance()`（audit §1.4） | 把延遲修補改成同步一次產生；風險高，建議最後做、分多步 |
| B13 | 電源量測的單位文字對比約 3.6:1（`#6f84a0` 在 `#f0f5fc` 上），低於 4.5:1 | 量測帶 CSS | 加深單位顏色 |
| B14 | 說明寫「雙擊線段可插入直角繞線」，實際上雙擊是行內改名 | 說明文字 L251 | 改說明文字 |
| B15 | 匯出檔名固定為 `circuit-architecture.svg`／`current-architecture.png` | 匯出程式 L399 起 | 改用「專案名 - 設計名」 |
| B16 | 小工具視窗沒有「關閉」按鈕，也不能按 Esc 關閉 | `af2-tool-scrim` | 加關閉按鈕與 Esc（要在殼層外加補丁層） |
| B17 | 匯出 SVG 從畫面 DOM 複製樣式，必須有畫面才能匯出 | `exportSvgDocument` | 選做：把顏色、線寬、字型寫成屬性 |
| B18 | 開檔驗證會默默略過或修補錯誤資料（未知欄位、超出範圍、指向不存在接腳的線、重複 id） | `validateDiagram` | 選做：至少在狀態列告知「已修補 N 處」 |

## 3. 可從 V3 帶回 V2 的改進（選做）

V3 已經做好、而且不影響 V2 介面風格的功能。要帶回需要另外移植成 V2 的寫法，每項都要個別評估：

1. 存開檔不遺失資料的完整驗證規則（對應 B1）。
2. 方塊「依連線排列接腳」以外的接腳表改進：改接腳所在的邊時，重新平均分配並清掉該接腳線路的手動路徑。
3. 匯出不依賴 CSS 的 SVG（對應 B17）與匯出檔名（對應 B15）。
4. 可讀性檢查加入「沒有合法路徑的線路數」與「重疊的文字框數」。
5. 新增方塊與零件避開既有內容（對應 B11）。
6. 時程總覽、零件數值常用值清單、線路標註手動固定等，V3 已補齊的 V2 半成品功能。

## 4. 建議順序

1. **先修 P1（B1–B3）**：會遺失資料，影響最大，範圍也小。
2. **刪 1.3 被蓋掉的層（D13–D23）與 1.2 的死入口（D10–D12）**：降低之後修改的難度，每刪一項跑一次測試。
3. **修 P2（B4–B11）**。
4. **刪 1.1、1.4、1.5 的其他死碼**：會影響舊檔相容性的 D4–D8 留到最後，或決定保留。
5. **P3 與第 3 節選做項目**，B12 最後做。

## 5. 需要決定的事

1. **分支**：在哪個分支修 V2？建議從 `main` 開新分支（例如 `v2-fix`），`v3-refactor` 保留不動。
2. **V3 的處置**：`v3-refactor` 分支、`src/`、`dist/`、V3 測試要保留（之後還可能用）或封存。
3. **`CLAUDE.md` 與 `docs/v3-*.md`**：目前的工作規則都是 V3 重構用的，改方向後要改寫成 V2 修正的流程，例如「每一步一個 commit、跑 `test:legacy`、更新本文件的勾選」。
4. **舊檔相容性**：D4–D8（v4 格式、舊主題、舊接點等載入轉換）要刪還是保留。
5. **版本號**：修正後的 V2 要叫 V2.10.2、V2.11 還是其他名稱。

## 進度與交接

依第 4 節的順序；每項一個 commit。

- [ ] B1 存開檔遺失文字框 align／background、時程文字框與 theme
- [ ] B2 + D9 存檔版本號與版本字樣改為單一常數
- [ ] B3 8 MB 專屬錯誤訊息
- [ ] D13–D23 刪除被後層蓋掉的實作（一個函式一個 commit）
- [ ] D10–D12 刪除自動整理 RC 死入口（保留計算函式）
- [ ] B4 時程「含頭尾」規則
- [ ] B5 零件數值單位
- [ ] B6 時程分組標題
- [ ] B7 失效手動路徑一律改回自動繞線
- [ ] B8 繞線用存檔尺寸
- [ ] B9 載入失敗訊息中英一致
- [ ] B10 方塊標題長度上限
- [ ] B11 新增方塊避開既有內容
- [ ] D1–D3、D24–D27 其他死碼（D4–D8 舊檔轉換：等使用者決定刪或留）
- [ ] P3（B12–B18）與第 3 節選做項目

### 交接
- **目前狀態**：`v2-fix` 分支建立（從 `v3-refactor` 的最後提交開出，所以保留 V2 的測試基礎設施 `tests/legacy`、`tools/pack.mjs`、盤點報告，以及暫停中的 V3 程式作為參考）。`CLAUDE.md` 已改為 V2 修正流程，新增 `CHANGELOG-V2.md`。
- **下一項**：B1。
- **尚待使用者決定**：D4–D8 舊檔轉換要刪或留；修正版的版本號（V2.10.2／V2.11…）。
- **最後通過的驗證**：基準 `npm run test:legacy`（76 項）與 `npm run test:legacy:e2e`（10 項）全部通過；`node tools/pack.mjs` 產生的 `index.html` 與現行相同。
