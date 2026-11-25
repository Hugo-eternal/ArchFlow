# V3 逐層移植清單

由 `node scripts/audit/port-checklist.mjs` 產生（來源：`scripts/audit/find-overrides.mjs`、`docs/v3-audit.md` §1、§4）。重新產生時會保留已手動修改的「狀態」與「備註」。

每個 V3 模組完成時，把它涵蓋的列改為 ☑（已移植）或 ✂（刻意刪除，備註寫原因）。3.43 要求本表沒有 ☐。

狀態：☐ 待移植　☑ 已移植　✂ 刻意刪除　⤳ 已被後層取代（不移植）

合計 327 層：☐ 225　☑ 47　✂ 34　⤳ 21

## core / interaction

| 目標 | 行 | 標記 | 位置 | 目的 | 狀態 | 備註 |
|---|---|---|---|---|---|---|
| `commit` | 1123 |  | script#2 | Discard fixed trunk waypoints: the orthogonal router owns geometry after normalization. | ☑ | `router/junctions.cleanJunctions`（3.17），V3 只在提交與載入時執行一次 |
| `commit` | 1348 | `*` 取代 | script#2 |  | ✂ | 由 `history.batch()`（src/core/history.ts）取代暫時把 commit 換成空函式 |
| `commit` | 1535 |  | script#2 |  | ☑ | `core/grid` 的 `normalize` / `protect`（3.11）；提交流程在 3.20 由命令呼叫 |
| `commit` | 1648 | `↶` 回退 | script#2 | Restore automatic-layout wording, direction and density. A separate preflight makes its scope explicit. | ✂ | 由 `history.batch()` 取代；失敗時自動回滾 |
| `commit` | 3564 | `*` 取代 | af15-ux2 | run fn as one undoable step even if it calls commit() internally | ✂ | 由 `history.batch()` 取代 |
| `fit` | 601 |  | script#1 |  | ☐ | 時程 fit → `designs/schedule` 提供 `FitOptions` / 外框（3.28）；共用計算為 `core/camera.fit` |
| `fit` | 632 |  | script#1 |  | ☐ | 同上（3.28） |
| `fit` | 669 |  | script#1 |  | ☐ | 同上（3.28） |
| `fit` | 3587 | `*` 取代 | af15-ux2 | ---------- "continue" inserts after the selected task; "branch" forks ---------- | ✂ | 暫停 fit 的技巧不需要：V3 的 fit 只在命令 `view.fit` 執行時才呼叫 |
| `fit` | 4445 |  | af15-ux2 | "Fit to screen" also takes frames into account (they may reach past the blocks) | ☐ | 外框納入 fit 範圍 → `designs/function` 的外框（3.26），共用 `core/camera.unionBounds` |
| `select` | 646 |  | script#1 | Edit interval days directly beside the clicked axis segment. | ☐ |  |
| `select` | 842 |  | script#1 | Remove now-empty containers, keeping all existing input handlers intact. | ☐ |  |
| `select` | 893 |  | script#2 |  | ☐ |  |
| `select` | 1396 |  | script#2 |  | ☐ |  |
| `status` | 875 |  | script#2 | Progressive enhancement: original model, file format and editing engine remain intact. | ☐ |  |
| `status` | 1003 |  | script#2 | The toolbar may wrap in English. Size the canvas from actual chrome height. | ☐ |  |
| `status` | 1624 |  | script#2 | Persist route metadata independently of manual routes, preserving every original field. | ☐ |  |
| `status` | 1657 |  | script#2 | Multi-selection is UI state, never part of the electrical project. | ☐ |  |
| `$('#add').onclick` | 327 | `*` 取代 | script#1 |  | ☑ | `model/diagram.makeBlock` / `addBlock`（3.12）；放在畫面中央由命令 `block.add` 決定位置（3.20） |
| `$('#add').onclick` | 600 |  | script#1 |  | ☐ |  |
| `$('#add').onclick` | 664 |  | script#1 | Schedule graph v1: directed trees, no cycles and no merging branches. | ☐ |  |
| `refreshSelection` | 480 |  | script#1 | Context-sensitive deletion protects against accidental destructive clicks. | ☐ |  |
| `refreshSelection` | 508 |  | script#1 |  | ☐ |  |
| `refreshSelection` | 667 |  | script#1 |  | ☐ |  |
| `removeSelection` | 505 |  | script#1 |  | ☑ | `model/diagram.remove`（3.12）：方塊、接腳、線、接點、文字框、外框一次處理 |
| `removeSelection` | 674 |  | script#1 |  | ☐ |  |
| `removeSelection` | 772 |  | script#1 | Delete a middle task without blocking browser dialogs; preserve descendants and reconnect. | ☐ |  |
| `finish` | 4209 |  | af15-ux2 | pressing near a lead end starts a wire, not a move: the lead dots are small | ☐ |  |
| `finish` | 4569 |  | af15-ux2 | ---------- snap onto a frame edge after a move ---------- | ☐ |  |
| `updateExplorer` | 763 |  | script#1 | Export uses the same palette and typography as the editor, including moved axis points. | ☐ |  |
| `updateExplorer` | 775 |  | script#1 | Rebind the toolbar too: older handlers retained a previous remove function. | ☐ |  |
| `addPin` | 1256 |  | script#2 |  | ☐ | 點擊位置 → `core/grid.portAt` + `model/diagram.addPort`（已完成）；指標事件 → interaction（3.20） |
| `newFreeText` | 2285 |  | text-design-v22-js |  | ☑ | 預設寬 180 → `model/diagram.TEXT_DEFAULT`（3.12） |
| `openHeading` | 1197 | `*` 取代 | script#2 | Heading creation is retired. Legacy data stays readable but no heading is rendered/exported. | ✂ |  |
| `preview` | 1566 |  | script#2 |  | ☐ |  |
| `redo` | 2322 |  | archflow-known-fixes-v3 |  | ☑ | src/core/history.ts：undo / redo 都標 dirty |
| `start` | 1295 |  | script#2 |  | ☐ |  |
| `undo` | 2321 |  | archflow-known-fixes-v3 |  | ☐ |  |

## designs/* (templates)

| 目標 | 行 | 標記 | 位置 | 目的 | 狀態 | 備註 |
|---|---|---|---|---|---|---|
| `workspaceExample` | 602 |  | script#1 |  | ⤳ |  |
| `workspaceExample` | 907 | `*` 取代 | script#2 | Localized template catalog and session-safe language switching. | ☐ |  |
| `workspaceExample` | 964 |  | script#2 | Bind only generated labels. User-authored names are never translated. | ☐ |  |
| `workspaceExample` | 1059 |  | script#2 | Release identity: retain the author name without a role label. | ☐ |  |
| `workspaceExample` | 1110 |  | script#2 | The old alignment helper moved a junction without moving its saved wire bends. | ☐ |  |
| `workspaceExample` | 1176 |  | script#2 | Align generated templates using measured port positions, never a guessed card height. | ☐ |  |
| `workspaceExample` | 1331 |  | script#2 | Reject an unsupported legacy graph rather than silently dropping a connection. | ☐ |  |
| `workspaceExample` | 1538 |  | script#2 |  | ☐ |  |
| `workspaceExample` | 3145 |  | af15-ux2 | New designs and templates put pin names inside blocks; older files keep their look until changed. | ☐ |  |
| `workspaceExample` | 3369 |  | af15-ux2 |  | ☐ |  |
| `loadWorkspaceExample` | 603 |  | script#1 |  | ☐ |  |
| `loadWorkspaceExample` | 957 |  | script#2 |  | ☐ |  |
| `loadWorkspaceExample` | 1015 |  | script#2 | Replace duplicate dropdowns with accessible template choice cards. | ☐ |  |
| `loadWorkspaceExample` | 3544 |  | af15-ux2 | Give the new design a name that matches the starter template. | ☐ |  |
| `loadWorkspaceExample` | 10434 |  | af-v270-sizing | new projects start compact and readable | ☐ |  |
| `$('#examplesBtn').onclick` | 423 | `*` 取代 | script#1 |  | ☐ |  |
| `$('#examplesBtn').onclick` | 604 |  | script#1 |  | ☐ |  |
| `$('#examplesBtn').onclick` | 678 |  | script#1 |  | ☐ |  |

## designs/schedule

| 目標 | 行 | 標記 | 位置 | 目的 | 狀態 | 備註 |
|---|---|---|---|---|---|---|
| `scheduleChrome` | 625 |  | script#1 | Single-axis schedule, integrated with the existing ArchFlow workspace. | ☐ |  |
| `scheduleChrome` | 649 |  | script#1 | Edit interval days directly beside the clicked axis segment. | ☐ |  |
| `scheduleChrome` | 666 |  | script#1 |  | ☐ |  |
| `scheduleChrome` | 695 |  | script#1 | Route axes from fixed task points; dragging a frame never changes dependencies or dates. | ☐ |  |
| `scheduleChrome` | 739 |  | script#1 |  | ☐ |  |
| `scheduleChrome` | 768 |  | script#1 | Dedicated, always available appearance region, not a modal. | ☐ |  |
| `scheduleChrome` | 793 |  | script#1 |  | ☐ |  |
| `scheduleChrome` | 816 |  | script#1 | Three presets plus one persistent custom slot. Presets never erase the custom slot. | ☐ |  |
| `scheduleChrome` | 845 |  | script#1 | Bypass the older branch-only inspector extension; all color controls live in this region. | ☐ |  |
| `scheduleChrome` | 892 |  | script#2 |  | ☐ |  |
| `scheduleChrome` | 2203 |  | script#9 |  | ☐ |  |
| `scheduleChrome` | 3708 |  | af15-ux2 | ---------- hints ---------- | ☐ |  |
| `scheduleExample` | 620 | `*` 取代 | script#1 | Single-axis schedule, integrated with the existing ArchFlow workspace. | ⤳ |  |
| `scheduleExample` | 677 | `*` 取代 | script#1 |  | ⤳ |  |
| `scheduleExample` | 925 | `*` 取代 | script#2 |  | ☐ |  |
| `scheduleExample` | 965 |  | script#2 | Bind only generated labels. User-authored names are never translated. | ☐ |  |
| `scheduleExample` | 1082 |  | script#2 | Branching at a bend first splits the original wire and creates a real shared junction. | ☐ |  |
| `scheduleExample` | 3489 |  | af15-ux2 |  | ☐ |  |
| `axisLayout` | 657 | `*` 取代 | script#1 | Schedule graph v1: directed trees, no cycles and no merging branches. | ⤳ |  |
| `axisLayout` | 685 | `*` 取代 | script#1 | Compact layout and persistent, independent task-frame positions. | ☐ |  |
| `axisLayout` | 722 |  | script#1 | V7: independent axis-point dragging, quiet inspector, reusable templates and typography. | ☐ |  |
| `graphAutoFit` | 692 | `*` 取代 | script#1 | Route axes from fixed task points; dragging a frame never changes dependencies or dates. | ☐ |  |
| `graphAutoFit` | 736 | `*` 取代 | script#1 |  | ☐ |  |
| `openScheduleTemplates` | 769 | `*` 取代 | script#1 | Dedicated, always available appearance region, not a modal. | ☐ |  |
| `openScheduleTemplates` | 861 | `*` 取代 | script#1 | Collapsible appearance controls; moving existing elements preserves input handlers. | ☐ |  |
| `graphAppend` | 3583 |  | af15-ux2 | ---------- "continue" inserts after the selected task; "branch" forks ---------- | ☐ |  |
| `graphBounds` | 689 | `*` 取代 | script#1 | Route axes from fixed task points; dragging a frame never changes dependencies or dates. | ☐ |  |
| `graphBranch` | 3594 |  | af15-ux2 | insert-after: the selected task's previous single successor now follows the new task | ☐ |  |
| `graphCreateTask` | 800 |  | script#1 | Newly appended tasks inherit their parent's independent branch color. | ☐ |  |
| `openInlineTime` | 670 |  | script#1 |  | ☐ |  |
| `scheduleLabel` | 624 | `*` 取代 | script#1 | Single-axis schedule, integrated with the existing ArchFlow workspace. | ☐ |  |
| `scheduleTask` | 619 | `*` 取代 | script#1 | Single-axis schedule, integrated with the existing ArchFlow workspace. | ☐ |  |
| `taskHeight` | 721 | `*` 取代 | script#1 | V7: independent axis-point dragging, quiet inspector, reusable templates and typography. | ☐ |  |

## export

| 目標 | 行 | 標記 | 位置 | 目的 | 狀態 | 備註 |
|---|---|---|---|---|---|---|
| `exportSvgDocument` | 606 |  | script#1 | **時程**：前兩代時程匯出（不呼叫 base，已被 698 / 754 取代，為死碼） | ⤳ |  |
| `exportSvgDocument` | 634 |  | script#1 | **時程**：前兩代時程匯出（不呼叫 base，已被 698 / 754 取代，為死碼） | ⤳ |  |
| `exportSvgDocument` | 676 |  | script#1 | 時程：分支圖匯出後處理 | ☐ |  |
| `exportSvgDocument` | 698 |  | script#1 | **時程**：預覽 / PNG / SVG 共用的獨立 SVG（不呼叫 base） | ⤳ |  |
| `exportSvgDocument` | 754 |  | script#1 | **時程**：套用外觀與字型的匯出（取代 698） | ☐ |  |
| `exportSvgDocument` | 760 |  | script#1 | 時程匯出後處理（色盤） | ☐ |  |
| `exportSvgDocument` | 1469 |  | script#2 | p13：匯出前重繪連線、套用 clean 簡報樣式 | ☐ |  |
| `exportSvgDocument` | 1567 |  | script#2 | 格線：移除格線把手 | ☐ |  |
| `exportSvgDocument` | 1674 |  | script#2 | RC：移除選取高亮 | ☐ |  |
| `exportSvgDocument` | 1744 |  | script#2 | 移除統一標籤引線 | ☐ |  |
| `exportSvgDocument` | 1856 |  | script#2 | 移除標記外框、保留標記旋轉與位置 | ☐ |  |
| `$('#exportBtn').onclick` | 400 | `*` 取代 | script#1 |  | ☐ |  |
| `$('#exportBtn').onclick` | 708 |  | script#1 | Export and preview live together in one dialog. No external library or connection required. | ☐ |  |
| `appendFreeTextExport` | 4125 |  | af15-ux2 | ---------- exports draw the badges and icons ---------- | ☐ |  |
| `appendFreeTextExport` | 4433 |  | af15-ux2 | exports: frames go first so they sit behind blocks and wires | ☐ |  |
| `$('#doExport').onclick` | 488 |  | script#1 | Keep existing help accurate after removing direct pin creation. | ☐ |  |
| `appendHeadingExport` | 1197 | `*` 取代 | script#2 | Heading creation is retired. Legacy data stays readable but no heading is rendered/exported. | ✂ |  |
| `headingBounds` | 1197 | `*` 取代 | script#2 | Heading creation is retired. Legacy data stays readable but no heading is rendered/exported. | ✂ |  |
| `readabilityReport` | 611 |  | script#1 | Preserve the discriminator even for a newly created empty schedule. | ☐ |  |
| `updateReadability` | 10426 |  | af-v270-sizing | readability on a PPT slide | ☐ |  |

## inspector

| 目標 | 行 | 標記 | 位置 | 目的 | 狀態 | 備註 |
|---|---|---|---|---|---|---|
| `inspector` | 478 |  | script#1 | 把「尺寸與外觀」以下的欄位包進可收合的 `<details>` | ☐ |  |
| `inspector` | 493 |  | script#1 | 選取文字框時改走 `textInspector()`；記住 advanced 區塊開合 | ☐ |  |
| `inspector` | 519 |  | script#1 | 方塊加入「自訂樣式」欄位 | ☐ |  |
| `inspector` | 599 |  | script#1 | **時程**：整個面板改成任務欄位（不呼叫 base） | ⤳ |  |
| `inspector` | 631 |  | script#1 | **時程**：連線改為「間隔編輯器」（取代 599 的時程分支） | ⤳ |  |
| `inspector` | 647 |  | script#1 | **時程**：連線改為行內天數編輯 | ☐ |  |
| `inspector` | 673 |  | script#1 | **時程**：分支圖版本的任務 / 連線面板（再次取代時程分支） | ⤳ |  |
| `inspector` | 693 |  | script#1 | **時程**：加「任務框位置 / 重設」 | ☐ |  |
| `inspector` | 741 |  | script#1 | **時程**：「安靜」面板，只留控制項與驗證訊息（再次取代時程分支） | ☐ |  |
| `inspector` | 770 |  | script#1 | **時程**：移除舊樣式按鈕，改用常駐的外觀區 | ☐ |  |
| `inspector` | 797 |  | script#1 | **時程**：分支 / 連線配色區 | ⤳ |  |
| `inspector` | 844 | `↶` 回退 | script#1 | **回退到 797 之前的 alias**（`engineeringBaseInspector`），等於把 797 那層拿掉 | ☐ |  |
| `inspector` | 1406 |  | script#2 | 線條樣式（ux）面板與選取範圍同步 | ☐ |  |
| `inspector` | 1463 |  | script#2 | 非時程的連線改用 p13 線條面板（不呼叫 base） | ☐ |  |
| `inspector` | 1565 |  | script#2 | 格線啟用時加入格線相關欄位 | ☐ |  |
| `inspector` | 1805 |  | script#2 | 連線加「手動標記」位置 / 角度 | ☐ |  |
| `inspector` | 1885 |  | script#2 | 同步標記面板（mSyncInspector） | ☐ |  |
| `inspector` | 1929 |  | script#2 | RC4.10：「重新繞線」按鈕留在標記設定外 | ☐ |  |
| `inspector` | 1951 |  | script#3 | 面板分組（可收合群組、全部展開 / 收折） | ☐ |  |
| `inspector` | 1998 |  | script#4 | 電源設計：電源欄位分組 | ☐ |  |
| `inspector` | 2060 |  | script#5 | 電源設計：電流單位等量測欄位 | ☐ |  |
| `inspector` | 2082 |  | script#6 | 保護性路線欄位 | ☐ |  |
| `inspector` | 2219 |  | script#9 | 時程文字對齊控制 | ☐ |  |
| `inspector` | 2254 |  | schedule-release-patch | 時程：改寫區段標題（路線 → 連接設定） | ☐ |  |
| `inspector` | 2273 |  | text-ux-v19-js | 文字 UX v19：microtask 中掛載文字控制 | ☐ |  |
| `inspector` | 2288 |  | text-design-v22-js | 文字設計 v22：清理外觀區 | ☐ |  |
| `inspector` | 2303 |  | text-controller-v24-js | 文字控制 v24：`setTimeout` 同步外觀模式 | ☐ |  |
| `inspector` | 3047 |  | af15-ux2 | V1.5：接腳表格（enhance + 2 層 microtask） | ☐ |  |
| `inspector` | 3125 |  | af15-ux2 | V1.5：線條樣式 / 方塊字型（enhance + 3 層 microtask） | ☐ |  |
| `inspector` | 3244 |  | af15-ux2 | V1.5：角色配色（enhance + 4 層 microtask） | ☐ |  |
| `inspector` | 3509 |  | af15-ux2 | V1.5：範本與時程線條樣式修正（再加 `setTimeout 30`） | ☐ |  |
| `inspector` | 3703 |  | af15-ux2 | V1.6 時程：工期 / 快速修正（`setTimeout 40、120`） | ☐ |  |
| `inspector` | 3843 |  | af15-ux2 | V2.2.4 電源：需求 vs 額定（`setTimeout 50`） | ☐ |  |
| `inspector` | 4108 |  | af15-ux2 | V2.3.0：電壓徽章、箭頭「一鍵套用」 | ☐ |  |
| `inspector` | 10536 |  | af-v280-ux | V2.8：記住區段開合（`setTimeout 0/80/250`） | ☐ |  |
| `inspector` | 10587 |  | af-v290-free | V2.9：自由尺寸開關、精確寬高（`setTimeout 0/80/250`） | ☐ |  |
| `inspector` | 10627 |  | af-v2100-scale | V2.10：文字隨方塊縮放開關（`setTimeout 0/80/250/500`） | ☐ |  |
| `ioSettings` | 492 |  | script#1 | Keep existing help accurate after removing direct pin creation. | ☐ |  |
| `ioSettings` | 1241 |  | script#2 | Function blocks own their port arrays. Power and schedule behavior is unchanged. | ☐ |  |
| `ioSettings` | 1277 |  | script#2 |  | ☐ |  |
| `afPortUpdate` | 1276 |  | script#2 |  | ☐ |  |
| `afPortUpdate` | 1563 |  | script#2 |  | ☐ |  |
| `rfApply` | 1795 |  | script#2 | Move the sole organizer and selection state to Edit; no always-visible second toolbar. | ☐ |  |
| `rfApply` | 1882 |  | script#2 |  | ☐ |  |
| `uxSync` | 1424 |  | script#2 |  | ☐ |  |
| `uxSync` | 1464 |  | script#2 |  | ☐ |  |
| `afArrangeIO` | 1564 |  | script#2 |  | ☐ |  |
| `junctionInspector` | 1281 |  | script#2 |  | ☐ |  |

## io

| 目標 | 行 | 標記 | 位置 | 目的 | 狀態 | 備註 |
|---|---|---|---|---|---|---|
| `validateDiagram` | 605 |  | script#1 | **時程**：整份時程資料另寫一套驗證（不呼叫 base） | ☑ | `io/schema`（3.13）：`scheduleSchema` 單一驗證 |
| `validateDiagram` | 633 |  | script#1 | 時程：`side`、`note` | ☑ | `io/schema`（3.13）：`task.side` / `note` |
| `validateDiagram` | 675 |  | script#1 | 時程：`scheduleGraph`、`graphVersion=1` | ✂ | `scheduleGraph` / `graphVersion` 是版面快取，V3 刪除（plan §2.3） |
| `validateDiagram` | 694 |  | script#1 | 時程：`cardDx/cardDy`、`graphVersion=2` | ☑ | `io/schema`（3.13）：`task.offset.card` |
| `validateDiagram` | 737 |  | script#1 | 時程：`axisDx/axisDy`、`graphVersion=3` | ☑ | `io/schema`（3.13）：`task.offset.axis` |
| `validateDiagram` | 798 |  | script#1 | 時程：`engineeringStyle` | ☐ | schema 目前只驗 `appearance` 為 JSON 物件；欄位形狀在 designs/schedule（3.29）補上 |
| `validateDiagram` | 817 |  | script#1 | 時程：`savedEngineeringStyle` | ☐ | schema 目前只驗 `appearance` 為 JSON 物件；欄位形狀在 designs/schedule（3.29）補上 |
| `validateDiagram` | 850 |  | script#1 | 時程：兩種 style 的 `lineWidth` | ☐ | schema 目前只驗 `appearance` 為 JSON 物件；欄位形狀在 designs/schedule（3.29）補上 |
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
| `validateDiagram` | 4116 |  | af15-ux2 | V2.3.0 零件 / 電壓徽章欄位 | ☑ | `io/schema`（3.13）：`part`（含 `rails`） |
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
| `createWorkspaceProject` | 554 | `*` 取代 | script#1 |  | ☐ |  |
| `createWorkspaceProject` | 967 |  | script#2 | Bind only generated labels. User-authored names are never translated. | ☐ |  |
| `createWorkspaceProject` | 2329 |  | archflow-known-fixes-v3 |  | ☐ |  |
| `createWorkspaceProject` | 3543 |  | af15-ux2 | Give the new design a name that matches the starter template. | ☐ |  |
| `createWorkspaceProject` | 10433 |  | af-v270-sizing | new projects start compact and readable | ☐ |  |
| `window.ArchFlowSession` | 959 | `*` 取代 | script#2 | Snapshot preserves user content, camera positions and undo stacks across locale changes. | ☐ |  |
| `window.ArchFlowSession` | 1007 |  | script#2 | Carry bindings through language changes and project files. | ☐ |  |
| `window.ArchFlowSession` | 1032 |  | script#2 | Full native language names remain recognizable in either locale. | ☐ |  |
| `window.ArchFlowSession` | 1358 |  | script#2 | Inherit appearance only, not labels, connections, locks or port counts. | ☐ |  |
| `$('#file').onchange` | 363 | `*` 取代 | script#1 | Strict project loader: sanitize text and endpoint IDs; no HTML is imported. | ☑ | `io/schema` 嚴格驗證（3.13）；文字一律以純文字處理，render 不得用 innerHTML |
| `$('#file').onchange` | 487 |  | script#1 | Keep existing help accurate after removing direct pin creation. | ☐ |  |
| `$('#file').onchange` | 558 | `*` 取代 | script#1 | Validate the complete import before replacing the open project. | ☑ | `io/project-file.openProjectText`：整份驗證通過才取代目前專案（3.14） |
| `syncProjectChrome` | 549 | `*` 取代 | script#1 |  | ☐ |  |
| `syncProjectChrome` | 995 |  | script#2 | The toolbar may wrap in English. Size the canvas from actual chrome height. | ☐ |  |
| `syncProjectChrome` | 1357 |  | script#2 | Inherit appearance only, not labels, connections, locks or port counts. | ☐ |  |
| `activateDesign` | 1334 |  | script#2 | History and locale snapshots are migrated without changing task schedules. | ☐ |  |
| `activateDesign` | 1402 |  | script#2 |  | ☐ |  |
| `acceptLoadedProject` | 521 |  | script#1 |  | ☑ | `core/store.load`（3.10）經 `io/project-file`（3.14） |
| `allowedWorkspace` | 548 | `*` 取代 | script#1 |  | ✂ |  |
| `downloadBlob` | 565 |  | script#1 | Export images for the active design; export JSON for the whole project. | ☐ |  |
| `emptyDiagram` | 3144 |  | af15-ux2 | New designs and templates put pin names inside blocks; older files keep their look until changed. | ☐ |  |
| `storeWorkspace` | 547 | `*` 取代 | script#1 |  | ☐ |  |

## layout

| 目標 | 行 | 標記 | 位置 | 目的 | 狀態 | 備註 |
|---|---|---|---|---|---|---|
| `autoArrange` | 1214 | `*` 取代 | script#2 | Treat each connected junction network as one net, not as extra block ranks. | ⤳ |  |
| `autoArrange` | 1647 |  | script#2 | Restore automatic-layout wording, direction and density. A separate preflight makes its scope explicit. | ⤳ |  |
| `autoArrange` | 1736 | `*` 取代 | script#2 | One workflow from all three legacy entry points; wording retained. | ⤳ |  |
| `autoArrange` | 1771 | `*` 取代 | script#2 | Place per-destination labels on their individual branch, not on a shared trunk. | ⤳ |  |
| `autoArrange` | 1850 | `↶` 回退 | script#2 |  | ☐ |  |
| `uiArrangeLabels` | 1762 |  | script#2 | Place per-destination labels on their individual branch, not on a shared trunk. | ☐ |  |
| `uiArrangeLabels` | 1814 |  | script#2 | Manual marks participate in preview collision checks and remain pinned during auto organization. | ☐ |  |
| `afRefreshTemplates` | 1012 |  | script#2 | Replace duplicate dropdowns with accessible template choice cards. | ☐ |  |
| `roGeometry` | 1679 |  | script#2 | Selection highlights belong to the editor, never to SVG/PNG output. | ☐ |  |
| `uiCandidate` | 1759 |  | script#2 | RC3: simple preview/apply workflow and source-aware shared-prefix routing. | ☐ |  |
| `uiLabelRect` | 1813 |  | script#2 | Manual marks participate in preview collision checks and remain pinned during auto organization. | ☐ |  |
| `uiLiveLabels` | 1812 |  | script#2 | Manual marks participate in preview collision checks and remain pinned during auto organization. | ☐ |  |
| `uiMetricScore` | 1760 | `*` 取代 | script#2 |  | ☐ |  |
| `uiOpen` | 1770 |  | script#2 | Place per-destination labels on their individual branch, not on a shared trunk. | ☐ |  |
| `uiRoutes` | 1758 | `*` 取代 | script#2 | RC3: simple preview/apply workflow and source-aware shared-prefix routing. | ☐ |  |
| `uiShow` | 1776 |  | script#2 |  | ☐ |  |

## render

| 目標 | 行 | 標記 | 位置 | 目的 | 狀態 | 備註 |
|---|---|---|---|---|---|---|
| `render` | 596 |  | script#1 | **時程**：自行繪製任務卡（不呼叫 base） | ⤳ |  |
| `render` | 609 |  | script#1 | 確保時程 model 帶 `schedule=true` | ☐ |  |
| `render` | 626 |  | script#1 | **時程**：單軸時間軸版本（取代 596） | ⤳ |  |
| `render` | 648 |  | script#1 | 重繪前關閉行內時間編輯器 | ☐ |  |
| `render` | 691 |  | script#1 | **時程**：任務框可拖曳 | ☐ |  |
| `render` | 735 |  | script#1 | 時程外觀套用 | ☐ |  |
| `render` | 759 |  | script#1 | 時程主題 / 字型；移除節點清單的 ref | ☐ |  |
| `render` | 794 |  | script#1 | 時程分支配色 CSS 變數 | ☐ |  |
| `render` | 1122 |  | script#2 | 非拖曳時先清理接點拓撲 | ☑ | `router/junctions.cleanJunctions` 移到提交流程（3.17）；render 不修改資料 |
| `render` | 1205 |  | script#2 | 重繪後套用時程配色（afPaintSchedule） | ☐ |  |
| `render` | 1257 |  | script#2 | 功能設計的多接腳版面（af-function-multi） | ☑ | 加大規則 → `model/diagram.growForPorts`（3.12）；多接腳方塊繪製 → `render/blocks`（3.18） |
| `render` | 1401 |  | script#2 | 同步線條樣式面板 | ☐ |  |
| `render` | 1534 |  | script#2 | 格線：新設計自動啟用格線並正規化座標 | ☐ |  |
| `render` | 1745 |  | script#2 | 每次重繪把 `.af-brand-version` 改寫為 V2.10.1（3 層重複） | ✂ | 版本字樣改為 `src/version.ts` 單一常數，render 不再改寫 |
| `render` | 1779 |  | script#2 | 每次重繪把 `.af-brand-version` 改寫為 V2.10.1（3 層重複） | ✂ | 版本字樣改為 `src/version.ts` 單一常數，render 不再改寫 |
| `render` | 1858 |  | script#2 | 每次重繪把 `.af-brand-version` 改寫為 V2.10.1（3 層重複） | ✂ | 版本字樣改為 `src/version.ts` 單一常數，render 不再改寫 |
| `render` | 1864 |  | script#2 | 版本頁尾 | ☐ |  |
| `render` | 2199 |  | script#9 | 時程文字對齊 | ☐ |  |
| `render` | 2248 |  | schedule-release-patch | 時程樣式（microtask） | ☐ |  |
| `render` | 2311 |  | persistence-v25-js | persistence v25：microtask 中補回設計設定 | ☐ |  |
| `render` | 3097 |  | af15-ux2 | V1.5：新方塊採用樣式、連線標籤去重（rAF） | ☐ |  |
| `render` | 3234 |  | af15-ux2 | 接腳裝飾 | ☐ |  |
| `render` | 3506 |  | af15-ux2 | 時程裝飾、分支顏色（setTimeout 0） | ☐ |  |
| `render` | 3707 |  | af15-ux2 | 提示 | ☐ |  |
| `render` | 3857 |  | af15-ux2 | V2.2.4：電源設計新方塊預設電源接腳 | ☐ |  |
| `render` | 4044 |  | af15-ux2 | V2.3.0：零件庫插入位置 | ☐ |  |
| `render` | 4424 |  | af15-ux2 | V2.4.0：繪製區域外框 | ☐ |  |
| `render` | 10399 |  | af-v270-sizing | V2.7：每方塊字型 | ☐ |  |
| `render` | 10480 |  | af-v280-ux | V2.8：接腳名稱位置 | ☐ |  |
| `render` | 10565 |  | af-v290-free | V2.9：自由尺寸 / 無名稱方塊 | ☐ |  |
| `render` | 10617 |  | af-v2100-scale | V2.10：名稱置中 | ☐ |  |
| `applyCamera` | 1510 |  | script#2 |  | ☐ | 格線背景 → render（3.18）；位移 / 尺寸由 `core/camera.backgroundOf` |
| `applyCamera` | 3100 |  | af15-ux2 |  | ☐ |  |
| `applyCamera` | 4425 |  | af15-ux2 | ---------- engine hooks ---------- | ☐ |  |
| `drawJunctions` | 1081 |  | script#2 | Branching at a bend first splits the original wire and creates a real shared junction. | ☑ | 接點外觀 r=5、白色外圈 → `render/wires` + canvas.css（3.19） |
| `drawJunctions` | 1173 |  | script#2 | Keep real junction dots above all wire paths, in both editor and SVG export. | ☑ | 接點畫在所有線之上（`af-junctions` 群組最後畫，3.19）；匯出沿用同一棵樹 |
| `drawJunctions` | 1298 |  | script#2 | Keep the original schema version; restore only validated boolean lock flags. | ✂ | 接點鎖定標示：V3 接點沒有自己的鎖（3.11） |
| `afAlignTemplatePorts` | 1508 |  | script#2 |  | ☐ |  |
| `afAlignTemplatePorts` | 1680 |  | script#2 | Selection highlights belong to the editor, never to SVG/PNG output. | ☐ |  |
| `applyBlockAppearance` | 1432 |  | script#2 | V2.5.12: electrical information belongs to the connection, not detached text. | ☐ |  |
| `applyBlockAppearance` | 1509 |  | script#2 |  | ☐ |  |
| `renderFreeTexts` | 2201 |  | script#9 |  | ☐ |  |
| `renderFreeTexts` | 2273 |  | text-ux-v19-js |  | ☐ |  |
| `afSpreadPorts` | 1275 | `*` 取代 | script#2 |  | ☐ |  |
| `appendMetrics` | 2053 |  | script#5 |  | ☐ |  |
| `drawBranchCorners` | 1305 | `*` 取代 | script#2 | Direct endpoint wiring: no automatic shared junction creation. | ☐ |  |
| `edgeLabel` | 1442 | `*` 取代 | script#2 | Keep the editing row; advanced formatting starts closed. | ☑ | `render/wires.wireLabel`（3.19）；µA 顯示照 V2；已帶單位的值不再重複加單位 |
| `ensureBlockWidth` | 1506 |  | script#2 |  | ☐ |  |
| `normalizeSlots` | 1507 |  | script#2 |  | ☐ |  |
| `placePorts` | 1299 |  | script#2 | Keep the original schema version; restore only validated boolean lock flags. | ☐ |  |
| `project` | 1505 |  | script#2 |  | ☑ | `core/grid.portAt`（3.11） |
| `renderHeading` | 1197 | `*` 取代 | script#2 | Heading creation is retired. Legacy data stays readable but no heading is rendered/exported. | ✂ |  |

## router

| 目標 | 行 | 標記 | 位置 | 目的 | 狀態 | 備註 |
|---|---|---|---|---|---|---|
| `drawEdges` | 597 |  | script#1 | **時程**：三代時程連線繪製，各自不呼叫 base（前兩代為死碼） | ⤳ |  |
| `drawEdges` | 629 |  | script#1 | **時程**：三代時程連線繪製，各自不呼叫 base（前兩代為死碼） | ⤳ |  |
| `drawEdges` | 668 |  | script#1 | **時程**：三代時程連線繪製，各自不呼叫 base（前兩代為死碼） | ⤳ |  |
| `drawEdges` | 688 |  | script#1 | **時程**：固定任務點繞軸（目前實際使用的時程版本） | ☐ |  |
| `drawEdges` | 733 |  | script#1 | 時程連線主題、軸點標示 | ☐ |  |
| `drawEdges` | 795 |  | script#1 | 時程分支顏色 | ☐ |  |
| `drawEdges` | 849 |  | script#1 | 時程線寬 | ☐ |  |
| `drawEdges` | 1124 |  | script#2 | 繪製前清理接點 | ☑ | `router/junctions.cleanJunctions`（3.17），V3 只在提交與載入時執行一次；繪製時不再修改資料 |
| `drawEdges` | 1171 |  | script#2 | 共用線段合併（afNormalizeSharedBranches） | ✂ | 共用線段合併（afNormalizeSharedBranches）已在 V2 停用 |
| `drawEdges` | 1187 |  | script#2 | 範本依實際接腳位置對齊 | ☐ |  |
| `drawEdges` | 1212 |  | script#2 | 成本式最短正交繞線的快取重置 | ☐ |  |
| `drawEdges` | 1400 |  | script#2 | 新連線套用預設線條格式 | ☑ | 線條格式（顏色 / 寬 / 虛線 8 5、點線 2 4）→ `render/wires`（3.19） |
| `drawEdges` | 1465 |  | script#2 | p13：連線標籤位置 | ☑ | `render/wires.labelPosition` + `.af-wire-label` 樣式（字級 14、粗 500、白色描邊，3.19） |
| `drawEdges` | 1562 |  | script#2 | 格線：同步幾何、選取線段把手 | ☐ |  |
| `drawEdges` | 1656 |  | script#2 | RC：同步多選狀態 | ☐ |  |
| `drawEdges` | 1738 |  | script#2 | 統一標籤的引線 | ☐ |  |
| `drawEdges` | 1802 |  | script#2 | 手動標記裝飾 | ☐ |  |
| `drawEdges` | 2141 |  | script#7 | 轉角拖曳把手 | ☐ |  |
| `drawEdges` | 2249 |  | schedule-release-patch | 時程樣式（microtask） | ☐ |  |
| `drawEdges` | 3099 |  | af15-ux2 | 標籤去重（同步 + rAF） | ☐ |  |
| `drawEdges` | 3235 |  | af15-ux2 | 接腳裝飾 | ☐ |  |
| `drawEdges` | 3507 |  | af15-ux2 | 時程裝飾、分支顏色（setTimeout） | ☐ |  |
| `drawEdges` | 10481 |  | af-v280-ux | V2.8 接腳名稱位置 | ☐ |  |
| `drawEdges` | 10618 |  | af-v2100-scale | V2.10 名稱置中 | ☐ |  |
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
| `notify` | 3126 |  | af15-ux2 |  | ☐ |  |
| `updateWorkspaceUI` | 595 |  | script#1 |  | ☐ |  |
| `window.alert` | 2332 |  | archflow-known-fixes-v3 |  | ☐ |  |
