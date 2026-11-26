# V3 逐層移植清單

由 `node scripts/audit/port-checklist.mjs` 產生（來源：`scripts/audit/find-overrides.mjs`、`docs/v3-audit.md` §1、§4）。重新產生時會保留已手動修改的「狀態」與「備註」。

每個 V3 模組完成時，把它涵蓋的列改為 ☑（已移植）或 ✂（刻意刪除，備註寫原因）。3.43 要求本表沒有 ☐。

狀態：☐ 待移植　☑ 已移植　✂ 刻意刪除　⤳ 已被後層取代（不移植）

合計 327 層：☐ 0　☑ 252　✂ 54　⤳ 21

## core / interaction

| 目標 | 行 | 標記 | 位置 | 目的 | 狀態 | 備註 |
|---|---|---|---|---|---|---|
| `commit` | 1123 |  | script#2 | Discard fixed trunk waypoints: the orthogonal router owns geometry after normalization. | ☑ | `interaction/commit.prepare` 呼叫 `cleanJunctions`（3.17 / 3.20） |
| `commit` | 1348 | `*` 取代 | script#2 |  | ✂ | 由 `history.batch()`（src/core/history.ts）取代暫時把 commit 換成空函式 |
| `commit` | 1535 |  | script#2 |  | ☑ | `interaction/commit.prepare`：normalize + protect（3.11 / 3.20） |
| `commit` | 1648 | `↶` 回退 | script#2 | Restore automatic-layout wording, direction and density. A separate preflight makes its scope explicit. | ✂ | 由 `history.batch()` 取代；失敗時自動回滾 |
| `commit` | 3564 | `*` 取代 | af15-ux2 | run fn as one undoable step even if it calls commit() internally | ✂ | 由 `history.batch()` 取代 |
| `fit` | 601 |  | script#1 |  | ☑ | 時程 fit → `designs/schedule` 提供 `FitOptions` / 外框（3.28）；共用計算為 `core/camera.fit` 3.28 `scheduleDesign.canvas.bounds` + `Shell.fitView` |
| `fit` | 632 |  | script#1 |  | ☑ | 時程 fit：`scheduleDesign.canvas.bounds` + `Shell.fitView`（3.28） |
| `fit` | 669 |  | script#1 |  | ☑ | 同上（分支圖範圍，3.28） |
| `fit` | 3587 | `*` 取代 | af15-ux2 | ---------- "continue" inserts after the selected task; "branch" forks ---------- | ✂ | 暫停 fit 的技巧不需要：V3 的 fit 只在命令 `view.fit` 執行時才呼叫 |
| `fit` | 4445 |  | af15-ux2 | "Fit to screen" also takes frames into account (they may reach past the blocks) | ☑ | 3.26a 殼層 `fitView` 的範圍含外框（`unionBounds`） |
| `select` | 646 |  | script#1 | Edit interval days directly beside the clicked axis segment. | ☑ | 點連線改天數：改在屬性面板「連接設定」（`schedule/fields` link days，3.29）；不做畫布上的行內輸入框 |
| `select` | 842 |  | script#1 | Remove now-empty containers, keeping all existing input handlers intact. | ☑ | 外觀目標隨選取：`schedule/fields` 依選取顯示任務 / 連線顏色（3.29） |
| `select` | 893 |  | script#2 |  | ✂ | 窄螢幕選取時自動展開屬性面板：V3 面板固定顯示 / 窄螢幕在下方（shell.css @media 900px） |
| `select` | 1396 |  | script#2 |  | ☑ | 對齊範圍 = 選取的方塊：`model/arrange.alignable`（3.41b） |
| `status` | 875 |  | script#2 | Progressive enhancement: original model, file format and editing engine remain intact. | ☑ | 狀態列數量：`DesignModule.stats`（3.41） |
| `status` | 1003 |  | script#2 | The toolbar may wrap in English. Size the canvas from actual chrome height. | ☑ | 英文複數：i18n `status.stats.*`（3.41） |
| `status` | 1624 |  | script#2 | Persist route metadata independently of manual routes, preserving every original field. | ✂ | 時程隱藏整理列：V3 命令列依設計類型顯示（3.39） |
| `status` | 1657 |  | script#2 | Multi-selection is UI state, never part of the electrical project. | ☑ | 多選狀態：`Gestures.selection`（3.20），不存入檔案 |
| `$('#add').onclick` | 327 | `*` 取代 | script#1 |  | ☑ | `model/diagram.makeBlock` / `addBlock`（3.12）；放在畫面中央由命令 `block.add` 決定位置（3.20） |
| `$('#add').onclick` | 600 |  | script#1 |  | ☑ | 時程新增任務：命令 `schedule.append`（3.28） |
| `$('#add').onclick` | 664 |  | script#1 | Schedule graph v1: directed trees, no cycles and no merging branches. | ☑ | 同上 |
| `refreshSelection` | 480 |  | script#1 | Context-sensitive deletion protects against accidental destructive clicks. | ☑ | 刪除鈕依選取啟用：`selection.delete` 的 enabled（3.20） |
| `refreshSelection` | 508 |  | script#1 |  | ☑ | 文字框選取樣式：`render/texts` selected（3.19） |
| `refreshSelection` | 667 |  | script#1 |  | ☑ | 分支鈕依選取啟用：`schedule.addBranch` enabled（3.28） |
| `removeSelection` | 505 |  | script#1 |  | ☑ | `model/diagram.remove`（3.12）：方塊、接腳、線、接點、文字框、外框一次處理 |
| `removeSelection` | 674 |  | script#1 |  | ☑ | 被 L772 取代的舊規則（見下一列） |
| `removeSelection` | 772 |  | script#1 | Delete a middle task without blocking browser dialogs; preserve descendants and reconnect. | ☑ | `schedule/edit.removeItems`：後續任務接回上一個任務（3.43b） |
| `finish` | 4209 |  | af15-ux2 | pressing near a lead end starts a wire, not a move: the lead dots are small | ☑ | `model/part-wiring`（connectToBody / freeLead / nearestWirePoint / tapWire）+ `Gestures.dropOnBody`（3.43e） |
| `finish` | 4569 |  | af15-ux2 | ---------- snap onto a frame edge after a move ---------- | ☑ | 3.26b `DesignModule.afterMove` → `snapConnectorsToFrames`（Gestures `adjustMove`） |
| `updateExplorer` | 763 |  | script#1 | Export uses the same palette and typography as the editor, including moved axis points. | ✂ | Project Explorer 的方塊 / 任務清單：由指令面板「前往項目」取代（3.40） |
| `updateExplorer` | 775 |  | script#1 | Rebind the toolbar too: older handlers retained a previous remove function. | ✂ | 同上 |
| `addPin` | 1256 |  | script#2 |  | ☑ | 新增接腳：命令 `port.add` → `model/diagram.addPort` + `growForPorts`（3.12 / 3.20） |
| `newFreeText` | 2285 |  | text-design-v22-js |  | ☑ | 預設寬 180 → `model/diagram.TEXT_DEFAULT`（3.12） |
| `openHeading` | 1197 | `*` 取代 | script#2 | Heading creation is retired. Legacy data stays readable but no heading is rendered/exported. | ✂ |  |
| `preview` | 1566 |  | script#2 |  | ☑ | `Gestures.previewPoints`：有目標時用 `routeWire` 的實際路徑，否則吸附格線的 L 形（3.20） |
| `redo` | 2322 |  | archflow-known-fixes-v3 |  | ☑ | src/core/history.ts：undo / redo 都標 dirty |
| `start` | 1295 |  | script#2 |  | ☑ | 鎖定項目不可拖：`interaction/commit` 經 `core/grid.protect` 拒絕並保留原狀（3.20） |
| `undo` | 2321 |  | archflow-known-fixes-v3 |  | ☑ | `history.undo` 命令（`interaction/commands`，3.20）；復原標記 dirty 由 History 處理（3.10） |

## designs/* (templates)

| 目標 | 行 | 標記 | 位置 | 目的 | 狀態 | 備註 |
|---|---|---|---|---|---|---|
| `workspaceExample` | 602 |  | script#1 |  | ⤳ |  |
| `workspaceExample` | 907 | `*` 取代 | script#2 | Localized template catalog and session-safe language switching. | ☑ | 3.24 `designs/function` 範本文字為 i18n key（`@i18n:` 由 `localize` 依目前語言替換） |
| `workspaceExample` | 964 |  | script#2 | Bind only generated labels. User-authored names are never translated. | ☑ | 3.24 只有範本文字經 i18n；使用者輸入的名稱不翻譯 |
| `workspaceExample` | 1059 |  | script#2 | Release identity: retain the author name without a role label. | ☑ | 範本是 V2 實際產出存成的 JSON（3.25–3.27c），建構過程不移植 |
| `workspaceExample` | 1110 |  | script#2 | The old alignment helper moved a junction without moving its saved wire bends. | ☑ | 範本是 V2 實際產出存成的 JSON（3.25–3.27c），建構過程不移植 |
| `workspaceExample` | 1176 |  | script#2 | Align generated templates using measured port positions, never a guessed card height. | ☑ | 範本是 V2 實際產出存成的 JSON（3.25–3.27c），建構過程不移植 |
| `workspaceExample` | 1331 |  | script#2 | Reject an unsupported legacy graph rather than silently dropping a connection. | ☑ | 範本是 V2 實際產出存成的 JSON（3.25–3.27c），建構過程不移植 |
| `workspaceExample` | 1538 |  | script#2 |  | ☑ | 範本是 V2 實際產出存成的 JSON（3.25–3.27c），建構過程不移植 |
| `workspaceExample` | 3145 |  | af15-ux2 | New designs and templates put pin names inside blocks; older files keep their look until changed. | ☑ | 範本是 V2 實際產出存成的 JSON（3.25–3.27c），建構過程不移植 |
| `workspaceExample` | 3369 |  | af15-ux2 |  | ☑ | 範本是 V2 實際產出存成的 JSON（3.25–3.27c），建構過程不移植 |
| `loadWorkspaceExample` | 603 |  | script#1 |  | ☑ | 從範本新增設計：新增設計對話框 / `design.loadExample`（3.39） |
| `loadWorkspaceExample` | 957 |  | script#2 |  | ✂ | 「以範本取代目前設計」改為新增一張設計，不覆蓋（不需要確認對話框） |
| `loadWorkspaceExample` | 1015 |  | script#2 | Replace duplicate dropdowns with accessible template choice cards. | ☑ | 3.24 啟動畫面 / 新增設計對話框以 radio 選擇範本或空白 |
| `loadWorkspaceExample` | 3544 |  | af15-ux2 | Give the new design a name that matches the starter template. | ☑ | 3.24 範本設計名稱 = 範本名稱（`create().name`） |
| `loadWorkspaceExample` | 10434 |  | af-v270-sizing | new projects start compact and readable | ☑ | 新專案緊湊字級：範本 JSON 已含 V2 compactTheme 的 `theme` |
| `$('#examplesBtn').onclick` | 423 | `*` 取代 | script#1 |  | ☑ | 3.24 由 `DesignChooser` 取代 |
| `$('#examplesBtn').onclick` | 604 |  | script#1 |  | ☑ | 3.24 由 `DesignChooser` 取代 |
| `$('#examplesBtn').onclick` | 678 |  | script#1 |  | ☑ | 3.24 由 `DesignChooser` 取代 |

## designs/schedule

| 目標 | 行 | 標記 | 位置 | 目的 | 狀態 | 備註 |
|---|---|---|---|---|---|---|
| `scheduleChrome` | 625 |  | script#1 | Single-axis schedule, integrated with the existing ArchFlow workspace. | ☑ | 標題 / 提示文字：時程畫布 `schedule.canvas.label`、空白提示 `hint.empty.schedule`（3.28 / 3.41） |
| `scheduleChrome` | 649 |  | script#1 | Edit interval days directly beside the clicked axis segment. | ☑ | 同上；天數在屬性面板編輯 |
| `scheduleChrome` | 666 |  | script#1 |  | ☑ | 時程命令鈕（接續任務、分支、自動調整）：命令列「時程」群組（3.39） |
| `scheduleChrome` | 695 |  | script#1 | Route axes from fixed task points; dragging a frame never changes dependencies or dates. | ☑ | 匯出 / 提示：`export.open`（3.28） |
| `scheduleChrome` | 739 |  | script#1 |  | ☑ | 屬性面板標題依選取：`InspectorPane`（3.28） |
| `scheduleChrome` | 768 |  | script#1 | Dedicated, always available appearance region, not a modal. | ☑ | 外觀區：屬性面板「外觀」群組（`schedule/fields` summary，3.29） |
| `scheduleChrome` | 793 |  | script#1 |  | ☑ | 自訂色盤：`schedule/appearance`（3.29） |
| `scheduleChrome` | 816 |  | script#1 | Three presets plus one persistent custom slot. Presets never erase the custom slot. | ☑ | 三個預設 + 一個保留的自訂：`schedule/appearance` customActive / savedCustom（3.29） |
| `scheduleChrome` | 845 |  | script#1 | Bypass the older branch-only inspector extension; all color controls live in this region. | ☑ | 線寬與分支色：`schedule/appearance` geometry、`task.branchColor`（3.29） |
| `scheduleChrome` | 892 |  | script#2 |  | ✂ | 屬性 / 外觀分頁：V3 用可收合群組，不分頁 |
| `scheduleChrome` | 2203 |  | script#9 |  | ☑ | 時程文字框對齊：`render/texts` + inspector text align（3.19 / 3.21） |
| `scheduleChrome` | 3708 |  | af15-ux2 | ---------- hints ---------- | ☑ | 提示：空白畫布提示 `emptyHint`（3.41） |
| `scheduleExample` | 620 | `*` 取代 | script#1 | Single-axis schedule, integrated with the existing ArchFlow workspace. | ⤳ |  |
| `scheduleExample` | 677 | `*` 取代 | script#1 |  | ⤳ |  |
| `scheduleExample` | 925 | `*` 取代 | script#2 |  | ☑ | 入門時程範本 `schedule/templates/starter.json`（3.28） |
| `scheduleExample` | 965 |  | script#2 | Bind only generated labels. User-authored names are never translated. | ☑ | 範本文字以 `@i18n:` 綁定（3.28） |
| `scheduleExample` | 1082 |  | script#2 | Branching at a bend first splits the original wire and creates a real shared junction. | ☑ | 範本的 blue 主題與分支色在 JSON 中 |
| `scheduleExample` | 3489 |  | af15-ux2 |  | ☑ | 同上（V2 af16 範本日期 → `shiftToWeek`） |
| `axisLayout` | 657 | `*` 取代 | script#1 | Schedule graph v1: directed trees, no cycles and no merging branches. | ⤳ |  |
| `axisLayout` | 685 | `*` 取代 | script#1 | Compact layout and persistent, independent task-frame positions. | ☑ | `schedule/layout.layout`（3.28） |
| `axisLayout` | 722 |  | script#1 | V7: independent axis-point dragging, quiet inspector, reusable templates and typography. | ☑ | 軸點 / 任務框各自位移：`task.offset.axis / card`（3.28） |
| `graphAutoFit` | 692 | `*` 取代 | script#1 | Route axes from fixed task points; dragging a frame never changes dependencies or dates. | ☑ | 被 L736 取代 |
| `graphAutoFit` | 736 | `*` 取代 | script#1 |  | ☑ | `schedule.autoArrange` → `resetOffsets`（3.28） |
| `openScheduleTemplates` | 769 | `*` 取代 | script#1 | Dedicated, always available appearance region, not a modal. | ✂ | 捲動到外觀區：V3 外觀是屬性面板的群組 |
| `openScheduleTemplates` | 861 | `*` 取代 | script#1 | Collapsible appearance controls; moving existing elements preserves input handlers. | ✂ | 同上 |
| `graphAppend` | 3583 |  | af15-ux2 | ---------- "continue" inserts after the selected task; "branch" forks ---------- | ☑ | `schedule/edit.appendTask`：插在選取任務之後、預設日期與不重複名稱（3.43b） |
| `graphBounds` | 689 | `*` 取代 | script#1 | Route axes from fixed task points; dragging a frame never changes dependencies or dates. | ☑ | `schedule/layout.scheduleBounds`（3.28） |
| `graphBranch` | 3594 |  | af15-ux2 | insert-after: the selected task's previous single successor now follows the new task | ☑ | `schedule/edit.addBranch`：新任務預設日期 / 名稱（3.43b） |
| `graphCreateTask` | 800 |  | script#1 | Newly appended tasks inherit their parent's independent branch color. | ☑ | `schedule/edit` newTask：沿用上一個任務的分支顏色（任務與連線，3.43b） |
| `openInlineTime` | 670 |  | script#1 |  | ☑ | 見 `select` L646：天數在屬性面板編輯 |
| `scheduleLabel` | 624 | `*` 取代 | script#1 | Single-axis schedule, integrated with the existing ArchFlow workspace. | ☑ | 3.28 `dates.interval`（修正 inclusive 無作用） |
| `scheduleTask` | 619 | `*` 取代 | script#1 | Single-axis schedule, integrated with the existing ArchFlow workspace. | ☑ | 3.28 範本與 `emptySchedule` |
| `taskHeight` | 721 | `*` 取代 | script#1 | V7: independent axis-point dragging, quiet inspector, reusable templates and typography. | ☑ | `schedule/layout` cardMetrics（3.28） |

## export

| 目標 | 行 | 標記 | 位置 | 目的 | 狀態 | 備註 |
|---|---|---|---|---|---|---|
| `exportSvgDocument` | 606 |  | script#1 | **時程**：前兩代時程匯出（不呼叫 base，已被 698 / 754 取代，為死碼） | ⤳ |  |
| `exportSvgDocument` | 634 |  | script#1 | **時程**：前兩代時程匯出（不呼叫 base，已被 698 / 754 取代，為死碼） | ⤳ |  |
| `exportSvgDocument` | 676 |  | script#1 | 時程：分支圖匯出後處理 | ☑ | 時程匯出：`CanvasDrawing.render(forExport)` + `export/svg`（3.28） |
| `exportSvgDocument` | 698 |  | script#1 | **時程**：預覽 / PNG / SVG 共用的獨立 SVG（不呼叫 base） | ⤳ |  |
| `exportSvgDocument` | 754 |  | script#1 | **時程**：套用外觀與字型的匯出（取代 698） | ☑ | 3.29 `export/svg.exportDrawing` + `canvas.render({ forExport })` |
| `exportSvgDocument` | 760 |  | script#1 | 時程匯出後處理（色盤） | ☑ | 時程配色匯出：`schedule/appearance` 的 CSS 自訂屬性經 inline-style 寫入（3.29） |
| `exportSvgDocument` | 1469 |  | script#2 | p13：匯出前重繪連線、套用 clean 簡報樣式 | ☑ | 3.22 `export/svg.ts` 直接用 render 的 VNode 產生，固定為 clean 樣式 |
| `exportSvgDocument` | 1567 |  | script#2 | 格線：移除格線把手 | ☑ | 3.22 匯出不畫格線把手，無需移除 |
| `exportSvgDocument` | 1674 |  | script#2 | RC：移除選取高亮 | ☑ | 3.22 匯出不傳選取，無需移除 |
| `exportSvgDocument` | 1744 |  | script#2 | 移除統一標籤引線 | ☑ | 3.22 V3 沒有標籤引線元素 |
| `exportSvgDocument` | 1856 |  | script#2 | 移除標記外框、保留標記旋轉與位置 | ☑ | 3.22 V3 沒有標記外框元素；標記位置由 render 處理 |
| `$('#exportBtn').onclick` | 400 | `*` 取代 | script#1 |  | ☑ | 3.23 命令 `export.open` → `ExportDialog` |
| `$('#exportBtn').onclick` | 708 |  | script#1 | Export and preview live together in one dialog. No external library or connection required. | ☑ | 3.23 匯出與可讀性在同一個對話框 |
| `appendFreeTextExport` | 4125 |  | af15-ux2 | ---------- exports draw the badges and icons ---------- | ☑ | 3.25 符號與徽章由 `decorate` 直接畫進匯出（`exportSvg({ decorate })`），外框加 `decorationBounds` |
| `appendFreeTextExport` | 4433 |  | af15-ux2 | exports: frames go first so they sit behind blocks and wires | ☑ | 3.26a `render/frames.framesLayer` 是匯出的第一層；外框邊界含名稱標籤 |
| `$('#doExport').onclick` | 488 |  | script#1 | Keep existing help accurate after removing direct pin creation. | ☑ | 3.23 `ExportDialog` 的「下載」 |
| `appendHeadingExport` | 1197 | `*` 取代 | script#2 | Heading creation is retired. Legacy data stays readable but no heading is rendered/exported. | ✂ |  |
| `headingBounds` | 1197 | `*` 取代 | script#2 | Heading creation is retired. Legacy data stays readable but no heading is rendered/exported. | ✂ |  |
| `readabilityReport` | 611 |  | script#1 | Preserve the discriminator even for a newly created empty schedule. | ☑ | 時程可讀性說明：匯出對話框（3.28） |
| `updateReadability` | 10426 |  | af-v270-sizing | readability on a PPT slide | ☑ | 3.22 `export/readability.ts`（PPT 頁面倍率） |

## inspector

| 目標 | 行 | 標記 | 位置 | 目的 | 狀態 | 備註 |
|---|---|---|---|---|---|---|
| `inspector` | 478 |  | script#1 | 把「尺寸與外觀」以下的欄位包進可收合的 `<details>` | ☑ | 3.21 `GroupField` → `<details>` |
| `inspector` | 493 |  | script#1 | 選取文字框時改走 `textInspector()`；記住 advanced 區塊開合 | ☑ | 3.21 `textFields()`；群組開合記在 panel |
| `inspector` | 519 |  | script#1 | 方塊加入「自訂樣式」欄位 | ☑ | 方塊自訂樣式：inspector `style` 群組（3.21） |
| `inspector` | 599 |  | script#1 | **時程**：整個面板改成任務欄位（不呼叫 base） | ⤳ |  |
| `inspector` | 631 |  | script#1 | **時程**：連線改為「間隔編輯器」（取代 599 的時程分支） | ⤳ |  |
| `inspector` | 647 |  | script#1 | **時程**：連線改為行內天數編輯 | ☑ | 3.29 連線欄位（自動 / 自行輸入天數） |
| `inspector` | 673 |  | script#1 | **時程**：分支圖版本的任務 / 連線面板（再次取代時程分支） | ⤳ |  |
| `inspector` | 693 |  | script#1 | **時程**：加「任務框位置 / 重設」 | ☑ | 3.29「重設任務框與圓點位置」 |
| `inspector` | 741 |  | script#1 | **時程**：「安靜」面板，只留控制項與驗證訊息（再次取代時程分支） | ☑ | 3.29 `designs/schedule/fields.ts` |
| `inspector` | 770 |  | script#1 | **時程**：移除舊樣式按鈕，改用常駐的外觀區 | ☑ | 3.29 外觀群組（無選取時） |
| `inspector` | 797 |  | script#1 | **時程**：分支 / 連線配色區 | ⤳ |  |
| `inspector` | 844 | `↶` 回退 | script#1 | **回退到 797 之前的 alias**（`engineeringBaseInspector`），等於把 797 那層拿掉 | ☑ | 回退層：V3 欄位由 FieldSpec 一次建立，沒有 alias 鏈 |
| `inspector` | 1406 |  | script#2 | 線條樣式（ux）面板與選取範圍同步 | ☑ | 3.21 `InspectorPanel.sync()`（store 變更後同步） |
| `inspector` | 1463 |  | script#2 | 非時程的連線改用 p13 線條面板（不呼叫 base） | ☑ | 3.21 `wireFields()` 線條格式群組 |
| `inspector` | 1565 |  | script#2 | 格線啟用時加入格線相關欄位 | ☑ | 格線欄位：「對齊／格線」對話框（3.41b） |
| `inspector` | 1805 |  | script#2 | 連線加「手動標記」位置 / 角度 | ☑ | 線路「名稱／數值標註」群組：X / Y / 角度、水平 / 直向 / 反向直排 / 反向、±15°、恢復自動位置（3.43d2） |
| `inspector` | 1885 |  | script#2 | 同步標記面板（mSyncInspector） | ☑ | 同上：面板由 store 訂閱同步（3.43d2） |
| `inspector` | 1929 |  | script#2 | RC4.10：「重新繞線」按鈕留在標記設定外 | ☑ | 線路「重新繞線」：命令 `wire.reroute`（3.39） |
| `inspector` | 1951 |  | script#3 | 面板分組（可收合群組、全部展開 / 收折） | ☑ | 可收合群組：`FieldSpec` group（3.21） |
| `inspector` | 1998 |  | script#4 | 電源設計：電源欄位分組 | ☑ | 3.27b `designs/function/power.ts` `powerBlockFields`（`inView('power')` 群組「電源設定」） |
| `inspector` | 2060 |  | script#5 | 電源設計：電流單位等量測欄位 | ☑ | 3.27b 電流存 A、以 A / mA 顯示（`shownValue` / `storedValue`）；V2 此層移除角色選單，V3 保留（見 CHANGELOG） |
| `inspector` | 2082 |  | script#6 | 保護性路線欄位 | ☑ | 鎖定欄位：inspector `locked`（3.21） |
| `inspector` | 2219 |  | script#9 | 時程文字對齊控制 | ☑ | 時程文字對齊：inspector text align（3.21） |
| `inspector` | 2254 |  | schedule-release-patch | 時程：改寫區段標題（路線 → 連接設定） | ☑ | 時程區段標題：`schedule/fields` 群組名稱（3.29） |
| `inspector` | 2273 |  | text-ux-v19-js | 文字 UX v19：microtask 中掛載文字控制 | ☑ | 3.21 一次同步產生，無 microtask |
| `inspector` | 2288 |  | text-design-v22-js | 文字設計 v22：清理外觀區 | ☑ | 3.21 `textFields()` |
| `inspector` | 2303 |  | text-controller-v24-js | 文字控制 v24：`setTimeout` 同步外觀模式 | ☑ | 3.21 `sync()` 取代 setTimeout |
| `inspector` | 3047 |  | af15-ux2 | V1.5：接腳表格（enhance + 2 層 microtask） | ☑ | 接腳表格：port 欄位（3.21）；V3 一次只編一個接腳 |
| `inspector` | 3125 |  | af15-ux2 | V1.5：線條樣式 / 方塊字型（enhance + 3 層 microtask） | ☑ | 線條樣式 / 方塊字級：inspector line 群組、`style.titleSize`（3.21） |
| `inspector` | 3244 |  | af15-ux2 | V1.5：角色配色（enhance + 4 層 microtask） | ☑ | 3.27c 依使用者決定新增角色配色（電源檢視、`data-role` + `--role-*`）；3.27b 查證：此層實際是線路標籤 / 接腳模式工具，不是角色配色；V2.10.1 沒有依角色上色（golden power 的顏色來自外觀預設） |
| `inspector` | 3509 |  | af15-ux2 | V1.5：範本與時程線條樣式修正（再加 `setTimeout 30`） | ☑ | 範本與時程線條樣式：同上（3.29） |
| `inspector` | 3703 |  | af15-ux2 | V1.6 時程：工期 / 快速修正（`setTimeout 40、120`） | ☑ | 3.29 工期（含首尾）與日期問題提示 |
| `inspector` | 3843 |  | af15-ux2 | V2.2.4 電源：需求 vs 額定（`setTimeout 50`） | ☑ | 3.27b `demand` / `load` + 自訂欄位（同步產生，無 setTimeout）；輸入數值自動開啟顯示；可輸入負電壓 |
| `inspector` | 4108 |  | af15-ux2 | V2.3.0：電壓徽章、箭頭「一鍵套用」 | ☑ | 3.25 `functionDesign.inspectorFields`（零件數值 / 大小 / 方向、電壓標示）；雙向箭頭為共用欄位 `bothEnds` |
| `inspector` | 10536 |  | af-v280-ux | V2.8：記住區段開合（`setTimeout 0/80/250`） | ☑ | 記住區段開合：`InspectorPanel` group open 狀態（3.21） |
| `inspector` | 10587 |  | af-v290-free | V2.9：自由尺寸開關、精確寬高（`setTimeout 0/80/250`） | ☑ | 方塊「尺寸與字級」群組：自由尺寸、寬 / 高（`model/diagram.resizeBlock`）；畫布上拖曳選取方塊右下角（`Gestures` blockResize，3.43c） |
| `inspector` | 10627 |  | af-v2100-scale | V2.10：文字隨方塊縮放開關（`setTimeout 0/80/250/500`） | ☑ | 「縮放時文字等比例縮放」：`core/prefs.scaleTextOn`（瀏覽器設定）+ `resizeBlock` scaleText（3.43c） |
| `ioSettings` | 492 |  | script#1 | Keep existing help accurate after removing direct pin creation. | ☑ | 接腳設定：port 欄位（3.21） |
| `ioSettings` | 1241 |  | script#2 | Function blocks own their port arrays. Power and schedule behavior is unchanged. | ☑ | 方塊自己的接腳陣列：`block.ports`（3.12） |
| `ioSettings` | 1277 |  | script#2 |  | ☑ | 「依連線排列接腳」：命令 `layout.arrangeSelectedPorts`（3.41b） |
| `afPortUpdate` | 1276 |  | script#2 |  | ☑ | 鎖定接腳不可移動：`core/grid.protect`（3.11 / 3.20） |
| `afPortUpdate` | 1563 |  | script#2 |  | ☑ | 格線下改接腳位置後正規化：`interaction/commit.prepare`（3.20） |
| `rfApply` | 1795 |  | script#2 | Move the sole organizer and selection state to Edit; no always-visible second toolbar. | ☑ | 整理 / 選取工具放在「編輯」：app bar 選單（3.39） |
| `rfApply` | 1882 |  | script#2 |  | ☑ | 對齊／格線面板：`design.manage`（3.41b） |
| `uxSync` | 1424 |  | script#2 |  | ☑ | 對齊面板同步：`AlignGridDialog`（3.41b） |
| `uxSync` | 1464 |  | script#2 |  | ☑ | 已選數量：`align.count`（3.41b） |
| `afArrangeIO` | 1564 |  | script#2 |  | ☑ | **差異**：V2 格線開啟時「依連線排列」只做正規化；V3 一律排列再正規化（CHANGELOG 3.41b） |
| `junctionInspector` | 1281 |  | script#2 |  | ✂ | 接點鎖定：V3 接點沒有自己的鎖定（3.11 決定） |

## io

| 目標 | 行 | 標記 | 位置 | 目的 | 狀態 | 備註 |
|---|---|---|---|---|---|---|
| `validateDiagram` | 605 |  | script#1 | **時程**：整份時程資料另寫一套驗證（不呼叫 base） | ☑ | `io/schema`（3.13）：`scheduleSchema` 單一驗證 |
| `validateDiagram` | 633 |  | script#1 | 時程：`side`、`note` | ☑ | `io/schema`（3.13）：`task.side` / `note` |
| `validateDiagram` | 675 |  | script#1 | 時程：`scheduleGraph`、`graphVersion=1` | ✂ | `scheduleGraph` / `graphVersion` 是版面快取，V3 刪除（plan §2.3） |
| `validateDiagram` | 694 |  | script#1 | 時程：`cardDx/cardDy`、`graphVersion=2` | ☑ | `io/schema`（3.13）：`task.offset.card` |
| `validateDiagram` | 737 |  | script#1 | 時程：`axisDx/axisDy`、`graphVersion=3` | ☑ | `io/schema`（3.13）：`task.offset.axis` |
| `validateDiagram` | 798 |  | script#1 | 時程：`engineeringStyle` | ☑ | schema 目前只驗 `appearance` 為 JSON 物件；欄位形狀在 designs/schedule（3.29）補上；3.29 `scheduleSchema.appearance.engineering` |
| `validateDiagram` | 817 |  | script#1 | 時程：`savedEngineeringStyle` | ☑ | schema 目前只驗 `appearance` 為 JSON 物件；欄位形狀在 designs/schedule（3.29）補上；3.29 `appearance.savedCustom` / `customActive` |
| `validateDiagram` | 850 |  | script#1 | 時程：兩種 style 的 `lineWidth` | ☑ | schema 目前只驗 `appearance` 為 JSON 物件；欄位形狀在 designs/schedule（3.29）補上；3.29 `lineWidth`（1–6） |
| `validateDiagram` | 1125 |  | script#2 | 清理孤立接點 | ☑ | `router/junctions.cleanJunctions`（3.17），V3 只在提交與載入時執行一次 |
| `validateDiagram` | 1199 |  | script#2 | `afCleanRoute`；heading 停用但仍讀得進來 | ✂ | `afCleanRoute` 與 heading 刪除（audit §4.2） |
| `validateDiagram` | 1297 |  | script#2 | `afLocked`（方塊 / 接腳） | ☑ | `io/schema`（3.13）：方塊 / 接腳 `locked` |
| `validateDiagram` | 1332 |  | script#2 | 舊圖轉 direct-ports 接線（afDirectConnections） | ✂ | 舊圖轉換，V3 不相容舊檔 |
| `validateDiagram` | 1403 |  | script#2 | `afLineDefaults`、`afLinePresets` | ☑ | `io/schema`（3.13）：`wireDefaults` / `wirePresets` |
| `validateDiagram` | 1443 |  | script#2 | `afPresentation`、連線電流單位等 | ☑ | `io/schema`（3.13）：`presentationClean`、`electrical.unit` |
| `validateDiagram` | 1539 |  | script#2 | `afGrid` | ☑ | `io/schema`（3.13）：`grid` |
| `validateDiagram` | 1623 |  | script#2 | `afRouteOnly`、`afGridLocked` / `locked` | ☑ | `io/schema`（3.13）：`route`、`wire.locked` |
| `validateDiagram` | 1739 |  | script#2 | `afUnifiedLabel` | ✂ | `afUnifiedLabel` 刪除（plan §2.2） |
| `validateDiagram` | 1815 |  | script#2 | `afLabelMark` | ☑ | `io/schema`（3.13）：`wire.label.mark` |
| `validateDiagram` | 2059 |  | script#5 | `afCurrentUnit` | ☑ | `io/schema`（3.13）：`metric.unit` |
| `validateDiagram` | 2349 |  | schedule-snap-compact-js | 時程磁吸 `scheduleSnapEnabled/Range` | ☑ | `io/schema`（3.13）：`snap` |
| `validateDiagram` | 3062 |  | af15-ux2 | 方塊標題版面 | ☑ | `io/schema`（3.13）：`titleAlign` |
| `validateDiagram` | 3139 |  | af15-ux2 | V1.5 新欄位（接腳標籤、線條標籤…） | ☑ | `io/schema`（3.13）：`port.label`、`wire.label` |
| `validateDiagram` | 3387 |  | af15-ux2 | V1.6 時程任務欄位（狀態、工期…） | ☑ | `io/schema`（3.13）：`task.status` / `milestone` / `time` |
| `validateDiagram` | 4116 |  | af15-ux2 | V2.3.0 零件 / 電壓徽章欄位 | ☑ | `io/schema`：`block.rails`（3.25 由 `part.rails` 移出）、`part`、`line.bothEnds` |
| `validateDiagram` | 4431 |  | af15-ux2 | `afFrames`（區域外框） | ☑ | `io/schema`（3.13）：`frames` |
| `validateDiagram` | 4579 |  | af15-ux2 | 連接器資料 | ☑ | `io/schema`（3.13）：`connector` |
| `validateDiagram` | 10467 |  | af-v280-ux | `afFont`、接腳名稱位置 | ☑ | `io/schema`（3.13）：`font`、`port.label` |
| `validateDiagram` | 10557 |  | af-v290-free | 自由尺寸、無名稱、空副標 | ☑ | `io/schema`（3.13）：`sizing` / `showTitle` / `subtitle` |
| `projectData` | 520 |  | script#1 | 加 `customStyles` | ⤳ |  |
| `projectData` | 555 | `*` 取代 | script#1 | 多設計格式 `version:5`：**整個取代**（內含 customStyles，所以 520 失效但不影響結果） | ☑ | `core/store.toFile` + `io/project-file.saveProject`（3.14） |
| `projectData` | 1008 |  | script#2 | `archflowLocalization`（語系、綁定、範本目錄） | ✂ | `archflowLocalization` 刪除；只保留 `locale`（plan §2.1） |
| `projectData` | 1057 |  | script#2 | `applicationVersion='V2.10.1'` | ✂ | `applicationVersion` 改為 `app`，由 `src/version.ts` 單一常數產生 |
| `projectData` | 1126 |  | script#2 | 存檔前清理每張設計的接點 | ☑ | `router/junctions.cleanJunctions`（3.17），V3 只在提交與載入時執行一次；存檔不另外改資料 |
| `projectData` | 1359 |  | script#2 | `wiringMode='direct-ports'` | ✂ | `wiringMode` 刪除（plan §2.1） |
| `projectData` | 1471 |  | script#2 | `applicationVersion='1.3'` | ✂ | `applicationVersion` 改為 `app`，由 `src/version.ts` 單一常數產生 |
| `projectData` | 1540 |  | script#2 | `applicationVersion='1.4'` | ✂ | `applicationVersion` 改為 `app`，由 `src/version.ts` 單一常數產生 |
| `projectData` | 1625 |  | script#2 | `applicationVersion='1.5-rc1'` | ✂ | `applicationVersion` 改為 `app`，由 `src/version.ts` 單一常數產生 |
| `projectData` | 1675 |  | script#2 | `applicationVersion='1.5-rc1'` | ✂ | `applicationVersion` 改為 `app`，由 `src/version.ts` 單一常數產生 |
| `projectData` | 1740 |  | script#2 | `applicationVersion='1.6-rc2'` | ✂ | `applicationVersion` 改為 `app`，由 `src/version.ts` 單一常數產生 |
| `projectData` | 1779 |  | script#2 | `applicationVersion='1.7-rc3'` | ✂ | `applicationVersion` 改為 `app`，由 `src/version.ts` 單一常數產生 |
| `projectData` | 1857 |  | script#2 | `applicationVersion='1.8-rc4'` | ✂ | `applicationVersion` 改為 `app`，由 `src/version.ts` 單一常數產生 |
| `projectData` | 2325 |  | archflow-known-fixes-v3 | known-fixes-v3：加 `camera` / `cameras` 與設計層資料 | ☑ | 每張設計的 `camera` 由 store 保存（3.10 / 3.14）；頂層 `camera` / `cameras` 刪除 |
| `createWorkspaceProject` | 554 | `*` 取代 | script#1 |  | ☑ | `Shell.newProject` / `project.create`（3.23 / 3.39） |
| `createWorkspaceProject` | 967 |  | script#2 | Bind only generated labels. User-authored names are never translated. | ☑ | 範本名稱：`DesignModule.create` 回傳 name（3.24） |
| `createWorkspaceProject` | 2329 |  | archflow-known-fixes-v3 |  | ✂ | 「功能 + 電源」兩張設計：V3 合併為一種方塊圖的兩種檢視（3.26c） |
| `createWorkspaceProject` | 3543 |  | af15-ux2 | Give the new design a name that matches the starter template. | ☑ | 新設計名稱 = 範本名稱（3.24） |
| `createWorkspaceProject` | 10433 |  | af-v270-sizing | new projects start compact and readable | ☑ | 見 `loadWorkspaceExample` L10434 |
| `window.ArchFlowSession` | 959 | `*` 取代 | script#2 | Snapshot preserves user content, camera positions and undo stacks across locale changes. | ✂ | 換語系時保存 / 還原工作階段：V3 換語系不重新載入（3.41），不需要 |
| `window.ArchFlowSession` | 1007 |  | script#2 | Carry bindings through language changes and project files. | ✂ | 換語系時保存 / 還原工作階段：V3 換語系不重新載入（3.41），不需要 |
| `window.ArchFlowSession` | 1032 |  | script#2 | Full native language names remain recognizable in either locale. | ✂ | 換語系時保存 / 還原工作階段：V3 換語系不重新載入（3.41），不需要 |
| `window.ArchFlowSession` | 1358 |  | script#2 | Inherit appearance only, not labels, connections, locks or port counts. | ✂ | 換語系時保存 / 還原工作階段：V3 換語系不重新載入（3.41），不需要 |
| `$('#file').onchange` | 363 | `*` 取代 | script#1 | Strict project loader: sanitize text and endpoint IDs; no HTML is imported. | ☑ | `io/schema` 嚴格驗證（3.13）；文字一律以純文字處理，render 不得用 innerHTML |
| `$('#file').onchange` | 487 |  | script#1 | Keep existing help accurate after removing direct pin creation. | ☑ | 開檔前確認捨棄：`project.open` confirmDiscard（3.23） |
| `$('#file').onchange` | 558 | `*` 取代 | script#1 | Validate the complete import before replacing the open project. | ☑ | `io/project-file.openProjectText`：整份驗證通過才取代目前專案（3.14） |
| `syncProjectChrome` | 549 | `*` 取代 | script#1 |  | ☑ | 專案名稱 / 設計數：app bar 與設計清單（3.39） |
| `syncProjectChrome` | 995 |  | script#2 | The toolbar may wrap in English. Size the canvas from actual chrome height. | ☑ | 英文文字：i18n（3.3） |
| `syncProjectChrome` | 1357 |  | script#2 | Inherit appearance only, not labels, connections, locks or port counts. | ☑ | 提示文字：說明對話框 / 空白提示（3.40 / 3.41） |
| `activateDesign` | 1334 |  | script#2 | History and locale snapshots are migrated without changing task schedules. | ☑ | 切換設計：`design.switch`，每張設計各自 History（3.10） |
| `activateDesign` | 1402 |  | script#2 |  | ☑ | 切換設計清除選取：`design.switch` → `gestures.select([])`（3.23） |
| `acceptLoadedProject` | 521 |  | script#1 |  | ☑ | `core/store.load`（3.10）經 `io/project-file`（3.14） |
| `allowedWorkspace` | 548 | `*` 取代 | script#1 |  | ✂ |  |
| `downloadBlob` | 565 |  | script#1 | Export images for the active design; export JSON for the whole project. | ☑ | 匯出檔名 = 設計名稱：`export` fileName（3.22） |
| `emptyDiagram` | 3144 |  | af15-ux2 | New designs and templates put pin names inside blocks; older files keep their look until changed. | ☑ | 新設計接腳名稱在內：`model/diagram.emptyDiagram` portLabels（3.12） |
| `storeWorkspace` | 547 | `*` 取代 | script#1 |  | ✂ | 工作區切換時保存狀態：V3 每張設計各自 History / 鏡頭（3.10） |

## layout

| 目標 | 行 | 標記 | 位置 | 目的 | 狀態 | 備註 |
|---|---|---|---|---|---|---|
| `autoArrange` | 1214 | `*` 取代 | script#2 | Treat each connected junction network as one net, not as extra block ranks. | ⤳ |  |
| `autoArrange` | 1647 |  | script#2 | Restore automatic-layout wording, direction and density. A separate preflight makes its scope explicit. | ⤳ |  |
| `autoArrange` | 1736 | `*` 取代 | script#2 | One workflow from all three legacy entry points; wording retained. | ⤳ |  |
| `autoArrange` | 1771 | `*` 取代 | script#2 | Place per-destination labels on their individual branch, not on a shared trunk. | ⤳ |  |
| `autoArrange` | 1850 | `↶` 回退 | script#2 |  | ☑ | 整理對話框：`layout.arrangePreview` / `OrganizeDialog`（3.38） |
| `uiArrangeLabels` | 1762 |  | script#2 | Place per-destination labels on their individual branch, not on a shared trunk. | ☑ | `src/layout/`（3.36–3.38，呼叫圖見 docs/v3-layout-callgraph.md） |
| `uiArrangeLabels` | 1814 |  | script#2 | Manual marks participate in preview collision checks and remain pinned during auto organization. | ☑ | `src/layout/`（3.36–3.38，呼叫圖見 docs/v3-layout-callgraph.md） |
| `afRefreshTemplates` | 1012 |  | script#2 | Replace duplicate dropdowns with accessible template choice cards. | ☑ | 範本選擇卡（radio）：`DesignChooser`（3.23） |
| `roGeometry` | 1679 |  | script#2 | Selection highlights belong to the editor, never to SVG/PNG output. | ☑ | `src/layout/`（3.36–3.38，呼叫圖見 docs/v3-layout-callgraph.md） |
| `uiCandidate` | 1759 |  | script#2 | RC3: simple preview/apply workflow and source-aware shared-prefix routing. | ☑ | `src/layout/`（3.36–3.38，呼叫圖見 docs/v3-layout-callgraph.md） |
| `uiLabelRect` | 1813 |  | script#2 | Manual marks participate in preview collision checks and remain pinned during auto organization. | ☑ | `src/layout/`（3.36–3.38，呼叫圖見 docs/v3-layout-callgraph.md） |
| `uiLiveLabels` | 1812 |  | script#2 | Manual marks participate in preview collision checks and remain pinned during auto organization. | ☑ | `src/layout/`（3.36–3.38，呼叫圖見 docs/v3-layout-callgraph.md） |
| `uiMetricScore` | 1760 | `*` 取代 | script#2 |  | ☑ | `src/layout/`（3.36–3.38，呼叫圖見 docs/v3-layout-callgraph.md） |
| `uiOpen` | 1770 |  | script#2 | Place per-destination labels on their individual branch, not on a shared trunk. | ☑ | `OrganizeDialog` 模式（3.38） |
| `uiRoutes` | 1758 | `*` 取代 | script#2 | RC3: simple preview/apply workflow and source-aware shared-prefix routing. | ☑ | `src/layout/`（3.36–3.38，呼叫圖見 docs/v3-layout-callgraph.md） |
| `uiShow` | 1776 |  | script#2 |  | ☑ | `OrganizeDialog` 前後對照（3.38） |

## render

| 目標 | 行 | 標記 | 位置 | 目的 | 狀態 | 備註 |
|---|---|---|---|---|---|---|
| `render` | 596 |  | script#1 | **時程**：自行繪製任務卡（不呼叫 base） | ⤳ |  |
| `render` | 609 |  | script#1 | 確保時程 model 帶 `schedule=true` | ☑ | ✂ V3 以設計類型判斷，不需要 `schedule=true` 標記（3.28） |
| `render` | 626 |  | script#1 | **時程**：單軸時間軸版本（取代 596） | ⤳ |  |
| `render` | 648 |  | script#1 | 重繪前關閉行內時間編輯器 | ✂ | 關閉行內時間編輯器：V3 沒有行內編輯器 |
| `render` | 691 |  | script#1 | **時程**：任務框可拖曳 | ☑ | 3.29 `edit.drag`（任務框）+ `DrawingCanvas` |
| `render` | 735 |  | script#1 | 時程外觀套用 | ☑ | 3.29 `appearance.lookStyle` / 主題 token |
| `render` | 759 |  | script#1 | 時程主題 / 字型；移除節點清單的 ref | ☑ | 3.29 字級 title / body / time |
| `render` | 794 |  | script#1 | 時程分支配色 CSS 變數 | ☑ | 3.29 分支色（卡片 / 圓點 / 引線） |
| `render` | 1122 |  | script#2 | 非拖曳時先清理接點拓撲 | ☑ | `router/junctions.cleanJunctions` 移到提交流程（3.17）；render 不修改資料 |
| `render` | 1205 |  | script#2 | 重繪後套用時程配色（afPaintSchedule） | ☑ | 時程配色：`schedule/appearance`（3.29） |
| `render` | 1257 |  | script#2 | 功能設計的多接腳版面（af-function-multi） | ☑ | 加大規則 → `model/diagram.growForPorts`（3.12）；多接腳方塊繪製 → `render/blocks`（3.18） |
| `render` | 1401 |  | script#2 | 同步線條樣式面板 | ☑ | 線條樣式面板同步：inspector 由 store 訂閱同步（3.21） |
| `render` | 1534 |  | script#2 | 格線：新設計自動啟用格線並正規化座標 | ☑ | 新設計預設開啟格線：`model/diagram.emptyDiagram` DEFAULT_GRID（3.12） |
| `render` | 1745 |  | script#2 | 每次重繪把 `.af-brand-version` 改寫為 V2.10.1（3 層重複） | ✂ | 版本字樣改為 `src/version.ts` 單一常數，render 不再改寫 |
| `render` | 1779 |  | script#2 | 每次重繪把 `.af-brand-version` 改寫為 V2.10.1（3 層重複） | ✂ | 版本字樣改為 `src/version.ts` 單一常數，render 不再改寫 |
| `render` | 1858 |  | script#2 | 每次重繪把 `.af-brand-version` 改寫為 V2.10.1（3 層重複） | ✂ | 版本字樣改為 `src/version.ts` 單一常數，render 不再改寫 |
| `render` | 1864 |  | script#2 | 版本頁尾 | ☑ | 版本：啟動畫面 `app.version`（3.23）；3.45 統一為 V3.0.0 |
| `render` | 2199 |  | script#9 | 時程文字對齊 | ☑ | 時程文字框：`render/texts`（3.19） |
| `render` | 2248 |  | schedule-release-patch | 時程樣式（microtask） | ☑ | 時程樣式：`schedule/render`（3.28） |
| `render` | 2311 |  | persistence-v25-js | persistence v25：microtask 中補回設計設定 | ☑ | 設計設定存在檔案：`io/schema`（3.13） |
| `render` | 3097 |  | af15-ux2 | V1.5：新方塊採用樣式、連線標籤去重（rAF） | ☑ | `model/diagram.adoptNewBlock`（`block.add`）+ 標籤去重（3.43d2） |
| `render` | 3234 |  | af15-ux2 | 接腳裝飾 | ☑ | 接腳裝飾（名稱 inside / outside）：`render/blocks`（3.18） |
| `render` | 3506 |  | af15-ux2 | 時程裝飾、分支顏色（setTimeout 0） | ☑ | 時程裝飾、分支色：`schedule/render`（3.28 / 3.29） |
| `render` | 3707 |  | af15-ux2 | 提示 | ☑ | 提示：見 `scheduleChrome` L3708 |
| `render` | 3857 |  | af15-ux2 | V2.2.4：電源設計新方塊預設電源接腳 | ☑ | 3.27b `model/diagram.makeBlock`（電源檢視：VIN / OUT，類型 power） |
| `render` | 4044 |  | af15-ux2 | V2.3.0：零件庫插入位置 | ☑ | 3.25 插入位置改用 `model.freeSpot`（避開方塊 / 徽章 / 線路，CHANGELOG） |
| `render` | 4424 |  | af15-ux2 | V2.4.0：繪製區域外框 | ☑ | 區域外框：`render/frames`（3.26a） |
| `render` | 10399 |  | af-v270-sizing | V2.7：每方塊字型 | ☑ | 每方塊字級：inspector 名稱 / 副標 / 接腳 / 數值字級、「套用到全部方塊」（`applyFontsToAll`）；接腳名稱用 `block.font.label` / `theme.label`（3.43c） |
| `render` | 10480 |  | af-v280-ux | V2.8：接腳名稱位置 | ☑ | 接腳名稱位置：`port.label` + inspector（3.18 / 3.21） |
| `render` | 10565 |  | af-v290-free | V2.9：自由尺寸 / 無名稱方塊 | ☑ | 顯示主名稱開關（`showTitle`）、自由尺寸（3.43c） |
| `render` | 10617 |  | af-v2100-scale | V2.10：名稱置中 | ☑ | 名稱位置九宮格：`titleAlign`（3.18 / 3.21） |
| `applyCamera` | 1510 |  | script#2 |  | ☑ | `core/camera` + Canvas transform（3.11 / 3.20） |
| `applyCamera` | 3100 |  | af15-ux2 |  | ☑ | 同上 |
| `applyCamera` | 4425 |  | af15-ux2 | ---------- engine hooks ---------- | ☑ | 同上 |
| `drawJunctions` | 1081 |  | script#2 | Branching at a bend first splits the original wire and creates a real shared junction. | ☑ | 接點外觀 r=5、白色外圈 → `render/wires` + canvas.css（3.19） |
| `drawJunctions` | 1173 |  | script#2 | Keep real junction dots above all wire paths, in both editor and SVG export. | ☑ | 接點畫在所有線之上（`af-junctions` 群組最後畫，3.19）；匯出沿用同一棵樹 |
| `drawJunctions` | 1298 |  | script#2 | Keep the original schema version; restore only validated boolean lock flags. | ✂ | 接點鎖定標示：V3 接點沒有自己的鎖（3.11） |
| `afAlignTemplatePorts` | 1508 |  | script#2 |  | ✂ | 依量測對齊範本接腳：範本 JSON 已是對齊後結果 |
| `afAlignTemplatePorts` | 1680 |  | script#2 | Selection highlights belong to the editor, never to SVG/PNG output. | ✂ | 同上 |
| `applyBlockAppearance` | 1432 |  | script#2 | V2.5.12: electrical information belongs to the connection, not detached text. | ☑ | 方塊高度：model h（3.18） |
| `applyBlockAppearance` | 1509 |  | script#2 |  | ☑ | 方塊外觀：`render/blocks` style（3.18） |
| `renderFreeTexts` | 2201 |  | script#9 |  | ☑ | `render/texts`（3.19） |
| `renderFreeTexts` | 2273 |  | text-ux-v19-js |  | ☑ | 同上 |
| `afSpreadPorts` | 1275 | `*` 取代 | script#2 |  | ☑ | 接腳平均分布：`model/diagram.addPort`（格線關閉時，3.12） |
| `appendMetrics` | 2053 |  | script#5 |  | ☑ | 量測帶：`designs/function/power` blockFooter（3.27b） |
| `drawBranchCorners` | 1305 | `*` 取代 | script#2 | Direct endpoint wiring: no automatic shared junction creation. | ✂ | 轉角分支圓點已停用（V2 本身改為空函式） |
| `edgeLabel` | 1442 | `*` 取代 | script#2 | Keep the editing row; advanced formatting starts closed. | ☑ | `render/wires.wireLabel`（3.19）；µA 顯示照 V2；已帶單位的值不再重複加單位 |
| `ensureBlockWidth` | 1506 |  | script#2 |  | ☑ | 方塊寬度：model w；`growForPorts`（3.12） |
| `normalizeSlots` | 1507 |  | script#2 |  | ☑ | 接腳槽位：`core/grid.normalize`（3.11） |
| `placePorts` | 1299 |  | script#2 | Keep the original schema version; restore only validated boolean lock flags. | ☑ | 鎖定接腳標示：`render/blocks` port locked class（3.18） |
| `project` | 1505 |  | script#2 |  | ☑ | `core/grid.portAt`（3.11） |
| `renderHeading` | 1197 | `*` 取代 | script#2 | Heading creation is retired. Legacy data stays readable but no heading is rendered/exported. | ✂ |  |

## router

| 目標 | 行 | 標記 | 位置 | 目的 | 狀態 | 備註 |
|---|---|---|---|---|---|---|
| `drawEdges` | 597 |  | script#1 | **時程**：三代時程連線繪製，各自不呼叫 base（前兩代為死碼） | ⤳ |  |
| `drawEdges` | 629 |  | script#1 | **時程**：三代時程連線繪製，各自不呼叫 base（前兩代為死碼） | ⤳ |  |
| `drawEdges` | 668 |  | script#1 | **時程**：三代時程連線繪製，各自不呼叫 base（前兩代為死碼） | ⤳ |  |
| `drawEdges` | 688 |  | script#1 | **時程**：固定任務點繞軸（目前實際使用的時程版本） | ☑ | 3.28 `designs/schedule/render.ts` `linksLayer` / `pointsLayer` |
| `drawEdges` | 733 |  | script#1 | 時程連線主題、軸點標示 | ☑ | 3.28 間隔標籤寬度與字級（配色主題在 3.29） |
| `drawEdges` | 795 |  | script#1 | 時程分支顏色 | ☑ | 3.29 連線 / 任務 `branchColor` |
| `drawEdges` | 849 |  | script#1 | 時程線寬 | ☑ | 3.29 `--sched-link-width` / `--sched-thin-width` |
| `drawEdges` | 1124 |  | script#2 | 繪製前清理接點 | ☑ | `router/junctions.cleanJunctions`（3.17），V3 只在提交與載入時執行一次；繪製時不再修改資料 |
| `drawEdges` | 1171 |  | script#2 | 共用線段合併（afNormalizeSharedBranches） | ✂ | 共用線段合併（afNormalizeSharedBranches）已在 V2 停用 |
| `drawEdges` | 1187 |  | script#2 | 範本依實際接腳位置對齊 | ✂ | 範本依量測位置對齊：範本 JSON 已是結果 |
| `drawEdges` | 1212 |  | script#2 | 成本式最短正交繞線的快取重置 | ☑ | 繞線快取：`Shell.routesFor`（3.20） |
| `drawEdges` | 1400 |  | script#2 | 新連線套用預設線條格式 | ☑ | 線條格式（顏色 / 寬 / 虛線 8 5、點線 2 4）→ `render/wires`（3.19） |
| `drawEdges` | 1465 |  | script#2 | p13：連線標籤位置 | ☑ | `render/wires.labelPosition` + `.af-wire-label` 樣式（字級 14、粗 500、白色描邊，3.19） |
| `drawEdges` | 1562 |  | script#2 | 格線：同步幾何、選取線段把手 | ☑ | 選取線路的線段把手：拖曳平移整段（端點段先拉出一小段）`model/route-edit.moveSegment` + `Gestures` path（3.43d） |
| `drawEdges` | 1656 |  | script#2 | RC：同步多選狀態 | ☑ | 多選同步：Canvas 依 `gestures.selection` 重畫（3.20） |
| `drawEdges` | 1738 |  | script#2 | 統一標籤的引線 | ☑ | 統一標籤：`wire.label.auto` + `render/wires.labelPosition`（3.38） |
| `drawEdges` | 1802 |  | script#2 | 手動標記裝飾 | ☑ | 標註拖曳（`Gestures` label 狀態、`labelAt` 依角度命中）、旋轉（`render/wires` transform rotate）（3.43d2） |
| `drawEdges` | 2141 |  | script#7 | 轉角拖曳把手 | ☑ | 轉角把手 `moveCorner`（3.43d）。「雙擊線段插入直角」只在 V1 說明文字中，V2 實際生效的雙擊是行內改名（L3753），不移植 |
| `drawEdges` | 2249 |  | schedule-release-patch | 時程樣式（microtask） | ☑ | 時程線條樣式：`schedule/render`（3.29） |
| `drawEdges` | 3099 |  | af15-ux2 | 標籤去重（同步 + rAF） | ☑ | `render/wires` duplicates：標籤與 14 px 內同名接腳重複時不畫（3.43d2） |
| `drawEdges` | 3235 |  | af15-ux2 | 接腳裝飾 | ☑ | 接腳裝飾：`render/blocks`（3.18） |
| `drawEdges` | 3507 |  | af15-ux2 | 時程裝飾、分支顏色（setTimeout） | ☑ | 時程裝飾：`schedule/render`（3.28） |
| `drawEdges` | 10481 |  | af-v280-ux | V2.8 接腳名稱位置 | ☑ | 接腳名稱位置：`render/blocks`（3.18） |
| `drawEdges` | 10618 |  | af-v2100-scale | V2.10 名稱置中 | ☑ | 名稱置中：`titleAlign`（3.18） |
| `fullPath` | 1189 |  | script#2 | Aligned endpoints should be one straight segment, not a short offset dogleg. | ✂ | `afCleanRoute` 刪除（plan §2.2） |
| `fullPath` | 1211 |  | script#2 | Wire routing: shortest orthogonal paths with a cost for bends, crossings and overlaps. | ☑ | `router/full-path` 格線關閉模式（3.15 搜尋 + 3.16 stub / 手動 / 退回）；快取由 render 每格處理 |
| `fullPath` | 1529 |  | script#2 |  | ☑ | `router/full-path` 格線模式（ggRoute + ggPathLegal，3.16） |
| `fullPath` | 1591 |  | script#2 |  | ☑ | `route` 合併 `afRouteOnly`：從端點開始的 `route` 視為完整路徑（3.16） |
| `afNormalizeSharedBranches` | 1294 |  | script#2 | Drag gestures are captured before the legacy connect gesture. | ✂ | L1304 已換成 `return 0`，自動共用接點停用 |
| `afNormalizeSharedBranches` | 1304 | `*` 取代 | script#2 | Direct endpoint wiring: no automatic shared junction creation. | ✂ | 直接接到端點：不自動建立共用接點；V3 不移植 |
| `anchor` | 1504 |  | script#2 |  | ☑ | `core/grid.portPoint` / `endPoint`（3.11） |
| `beginCornerBranch` | 1306 | `*` 取代 | script#2 | Direct endpoint wiring: no automatic shared junction creation. | ✂ | V2 已換成空函式 |
| `ggRoute` | 1592 |  | script#2 |  | ☑ | 同上；格線模式下 `simplify([a, ...route, b])` 對完整路徑與轉折點都成立 |
| `repairJunctionGeometry` | 1109 | `*` 取代 | script#2 | The old alignment helper moved a junction without moving its saved wire bends. | ✂ | V2 已換成空函式 |
| `splitAtCorner` | 1080 |  | script#2 | Branching at a bend first splits the original wire and creates a real shared junction. | ✂ | V2 沒有任何呼叫者（`beginCornerBranch` L1306 為空函式），死碼 |

## shell

| 目標 | 行 | 標記 | 位置 | 目的 | 狀態 | 備註 |
|---|---|---|---|---|---|---|
| `notify` | 3126 |  | af15-ux2 |  | ☑ | 3.23 `Shell.notify` + i18n（V2 只修正文字，V3 文字直接寫對） |
| `updateWorkspaceUI` | 595 |  | script#1 |  | ☑ | 依設計類型切換介面：`Shell.module` + AppBar / CommandBar（3.39） |
| `window.alert` | 2332 |  | archflow-known-fixes-v3 |  | ☑ | 3.23 開檔錯誤以 `openMessage` 顯示在狀態列，不再暫時替換 alert |
