# ArchFlow V2.10.1 盤點報告（V3 重構用）

範圍：`src/app.zh-Hant.html`（行號以此檔為準；en 版 L2361 之後約 +8 行）。
產生方式：`node scripts/audit/find-overrides.mjs`（只讀分析），再逐層人工閱讀。

- §1 覆寫鏈
- §2 model 與專案 JSON 欄位（待 1.3、1.4）
- §3 zh-Hant / en 非翻譯差異（待 1.5）
- §4 死碼與已廢止功能（待 1.6）
- §5 React 殼層原始碼（待 1.7）
- §6 內建工具與 React 編輯器邊界（待 1.8）

---

## §1 覆寫鏈

### 1.1 閱讀方式
- 覆寫寫法：`const base = X; X = function(...a){ … base(...a) … }`。**最後定義的那層最先被呼叫**，再由它往內呼叫較早的層。
- 下表「Layers」是重新指派的次數；標 `*` 的行沒有保留前一層的 alias，代表**捨棄**目前為止的整條鏈，或回退到更早存下的某一層。
- 「script#N」指沒有 id 的 `<script>`：script#1 = L251（V1 引擎與早期補丁）、script#2 = L863（V1.x 補丁主體）、script#3–#7 = L1943–2160 的面板 IIFE、script#9 = L2184。
- af20-shell（L5319–10375，React bundle）不在統計範圍內。

### 1.2 統計
- **75 個目標、304 層覆寫**；zh-Hant 與 en 結構完全相同。
- 前 6 名占 145 層（48%）：`inspector` 37、`render` 31、`validateDiagram` 28、`drawEdges` 24、`projectData` 14、`exportSvgDocument` 11。
- 加上 `scheduleChrome` 12、`workspaceExample` 10，前 8 名占 167 層（55%）。
- 13 個目標有 `*` 層：其中 `window.ArchFlowSession` L959、`$('#add')` L327、`$('#examplesBtn')` L423、`$('#exportBtn')` L400、`$('#file')` L363 只是原始定義；其餘為真正的取代 / 回退，見 §1.5。

### 1.3 全部目標

| Target | Kind | Defined at | Layers | Override lines |
|---|---|---|---|---|
| `inspector` | global | 314 | 37 | 478, 493, 519, 599, 631, 647, 673, 693, 741, 770, 797, 844*, 1406, 1463, 1565, 1805, 1885, 1929, 1951, 1998, 2060, 2082, 2219, 2254, 2273, 2288, 2303, 3047, 3125, 3244, 3509, 3703, 3843, 4108, 10536, 10587, 10627 |
| `render` | global | 308 | 31 | 596, 609, 626, 648, 691, 735, 759, 794, 1122, 1205, 1257, 1401, 1534, 1745, 1779, 1858, 1864, 2199, 2248, 2311, 3097, 3234, 3506, 3707, 3857, 4044, 4424, 10399, 10480, 10565, 10617 |
| `validateDiagram` | global | 358 | 28 | 605, 633, 675, 694, 737, 798, 817, 850, 1125, 1199, 1297, 1332, 1403, 1443, 1539, 1623, 1739, 1815, 2059, 2349, 3062, 3139, 3387, 4116, 4431, 4579, 10467, 10557 |
| `drawEdges` | global | 299 | 24 | 597, 629, 668, 688, 733, 795, 849, 1124, 1171, 1187, 1212, 1400, 1465, 1562, 1656, 1738, 1802, 2141, 2249, 3099, 3235, 3507, 10481, 10618 |
| `projectData` | global | 361 | 14 | 520, 555*, 1008, 1057, 1126, 1359, 1471, 1540, 1625, 1675, 1740, 1779, 1857, 2325 |
| `scheduleChrome` | global | 580 | 12 | 625, 649, 666, 695, 739, 768, 793, 816, 845, 892, 2203, 3708 |
| `exportSvgDocument` | global | 390 | 11 | 606, 634, 676, 698, 754, 760, 1469, 1567, 1674, 1744, 1856 |
| `workspaceExample` | global | 408 | 10 | 602, 907, 964, 1059, 1110, 1176, 1331, 1538, 3145, 3369 |
| `scheduleExample` | global | 579 | 6 | 620*, 677*, 925*, 965, 1082, 3489 |
| `autoArrange` | global | 378 | 5 | 1214*, 1647, 1736*, 1771*, 1850* |
| `commit` | global | 288 | 5 | 1123, 1348, 1535, 1648*, 3564 |
| `createWorkspaceProject` | global | 470 | 5 | 554*, 967, 2329, 3543, 10433 |
| `fit` | global | 336 | 5 | 601, 632, 669, 3587, 4445 |
| `loadWorkspaceExample` | global | 422 | 5 | 603, 957, 1015, 3544, 10434 |
| `fullPath` | global | 282 | 4 | 1189, 1211, 1529, 1591 |
| `select` | global | 291 | 4 | 646, 842, 893, 1396 |
| `status` | global | 289 | 4 | 875, 1003, 1624, 1657 |
| `window.ArchFlowSession` | window | — | 4 | 959*, 1007, 1032, 1358 |
| `$('#add').onclick` | dom-handler | — | 3 | 327*, 600, 664 |
| `$('#examplesBtn').onclick` | dom-handler | — | 3 | 423*, 604, 678 |
| `$('#file').onchange` | dom-handler | — | 3 | 363*, 487, 558* |
| `applyCamera` | global | 290 | 3 | 1510, 3100, 4425 |
| `axisLayout` | global | 618 | 3 | 657*, 685*, 722 |
| `drawJunctions` | global | 356 | 3 | 1081, 1173, 1298 |
| `ioSettings` | global | 456 | 3 | 492, 1241, 1277 |
| `refreshSelection` | global | 292 | 3 | 480, 508, 667 |
| `removeSelection` | global | 329 | 3 | 505, 674, 772 |
| `syncProjectChrome` | global | 466 | 3 | 549*, 995, 1357 |
| `$('#exportBtn').onclick` | dom-handler | — | 2 | 400*, 708 |
| `activateDesign` | global | 550 | 2 | 1334, 1402 |
| `afAlignTemplatePorts` | global | 1177 | 2 | 1508, 1680 |
| `afNormalizeSharedBranches` | global | 1135 | 2 | 1294, 1304 |
| `afPortUpdate` | global | 1238 | 2 | 1276, 1563 |
| `appendFreeTextExport` | global | 507 | 2 | 4125, 4433 |
| `applyBlockAppearance` | global | 435 | 2 | 1432, 1509 |
| `finish` | global | 319 | 2 | 4209, 4569 |
| `renderFreeTexts` | global | 499 | 2 | 2201, 2273 |
| `rfApply` | global | 1421 | 2 | 1795, 1882 |
| `uiArrangeLabels` | global | 1714 | 2 | 1762, 1814 |
| `updateExplorer` | global | 347 | 2 | 763, 775 |
| `uxSync` | global | 1379 | 2 | 1424, 1464 |
| `$('#doExport').onclick` | dom-handler | — | 1 | 488 |
| `acceptLoadedProject` | global | 474 | 1 | 521 |
| `addPin` | global | 307 | 1 | 1256 |
| `afArrangeIO` | global | 1263 | 1 | 1564 |
| `afRefreshTemplates` | global | 948 | 1 | 1012 |
| `anchor` | global | 265 | 1 | 1504 |
| `appendMetrics` | global | 369 | 1 | 2053 |
| `downloadBlob` | global | 388 | 1 | 565 |
| `emptyDiagram` | global | 401 | 1 | 3144 |
| `ensureBlockWidth` | global | 490 | 1 | 1506 |
| `ggRoute` | global | 1523 | 1 | 1592 |
| `graphAppend` | global | 661 | 1 | 3583 |
| `graphCreateTask` | global | 659 | 1 | 800 |
| `junctionInspector` | global | 352 | 1 | 1281 |
| `newFreeText` | global | 497 | 1 | 2285 |
| `normalizeSlots` | global | 451 | 1 | 1507 |
| `notify` | global | 287 | 1 | 3126 |
| `openInlineTime` | global | 641 | 1 | 670 |
| `placePorts` | global | 305 | 1 | 1299 |
| `preview` | global | 316 | 1 | 1566 |
| `project` | global | 304 | 1 | 1505 |
| `readabilityReport` | global | 442 | 1 | 611 |
| `roGeometry` | global | 1580 | 1 | 1679 |
| `splitAtCorner` | global | 353 | 1 | 1080 |
| `start` | global | 293 | 1 | 1295 |
| `uiCandidate` | global | 1718 | 1 | 1759 |
| `uiLabelRect` | global | 1709 | 1 | 1813 |
| `uiLiveLabels` | global | 1713 | 1 | 1812 |
| `uiOpen` | global | 1728 | 1 | 1770 |
| `uiShow` | global | 1725 | 1 | 1776 |
| `undo` | global | 331 | 1 | 2321 |
| `updateReadability` | global | 443 | 1 | 10426 |
| `updateWorkspaceUI` | global | 346 | 1 | 595 |
| `window.alert` | window | — | 1 | 2332 |

### 1.4 主要函式逐層說明

#### `inspector`（定義 L314，37 層）
| 行 | 目的 |
|---|---|
| 478 | 把「尺寸與外觀」以下的欄位包進可收合的 `<details>` |
| 493 | 選取文字框時改走 `textInspector()`；記住 advanced 區塊開合 |
| 519 | 方塊加入「自訂樣式」欄位 |
| 599 | **時程**：整個面板改成任務欄位（不呼叫 base） |
| 631 | **時程**：連線改為「間隔編輯器」（取代 599 的時程分支） |
| 647 | **時程**：連線改為行內天數編輯 |
| 673 | **時程**：分支圖版本的任務 / 連線面板（再次取代時程分支） |
| 693 | **時程**：加「任務框位置 / 重設」 |
| 741 | **時程**：「安靜」面板，只留控制項與驗證訊息（再次取代時程分支） |
| 770 | **時程**：移除舊樣式按鈕，改用常駐的外觀區 |
| 797 | **時程**：分支 / 連線配色區 |
| 844\* | **回退到 797 之前的 alias**（`engineeringBaseInspector`），等於把 797 那層拿掉 |
| 1406 | 線條樣式（ux）面板與選取範圍同步 |
| 1463 | 非時程的連線改用 p13 線條面板（不呼叫 base） |
| 1565 | 格線啟用時加入格線相關欄位 |
| 1805 | 連線加「手動標記」位置 / 角度 |
| 1885 | 同步標記面板（mSyncInspector） |
| 1929 | RC4.10：「重新繞線」按鈕留在標記設定外 |
| 1951 | 面板分組（可收合群組、全部展開 / 收折） |
| 1998 | 電源設計：電源欄位分組 |
| 2060 | 電源設計：電流單位等量測欄位 |
| 2082 | 保護性路線欄位 |
| 2219 | 時程文字對齊控制 |
| 2254 | 時程：改寫區段標題（路線 → 連接設定） |
| 2273 | 文字 UX v19：microtask 中掛載文字控制 |
| 2288 | 文字設計 v22：清理外觀區 |
| 2303 | 文字控制 v24：`setTimeout` 同步外觀模式 |
| 3047 | V1.5：接腳表格（enhance + 2 層 microtask） |
| 3125 | V1.5：線條樣式 / 方塊字型（enhance + 3 層 microtask） |
| 3244 | V1.5：角色配色（enhance + 4 層 microtask） |
| 3509 | V1.5：範本與時程線條樣式修正（再加 `setTimeout 30`） |
| 3703 | V1.6 時程：工期 / 快速修正（`setTimeout 40、120`） |
| 3843 | V2.2.4 電源：需求 vs 額定（`setTimeout 50`） |
| 4108 | V2.3.0：電壓徽章、箭頭「一鍵套用」 |
| 10536 | V2.8：記住區段開合（`setTimeout 0/80/250`） |
| 10587 | V2.9：自由尺寸開關、精確寬高（`setTimeout 0/80/250`） |
| 10627 | V2.10：文字隨方塊縮放開關（`setTimeout 0/80/250/500`） |

觀察：
- 時程分支被「整段重寫」至少 5 次（599 → 631 → 673 → 741 …），較早的時程分支都是死碼。
- 後期各層靠 **microtask / setTimeout 延遲執行 `enhance()`** 去改前一層已產生的 DOM（最多 4 層 microtask 加 4 個 timer）。面板內容依時間先後決定，是 UI 閃動與競態錯誤的主要來源。V3 必須改為「欄位由 design 策略一次產生」。

#### `render`（定義 L308，31 層）
| 行 | 目的 |
|---|---|
| 596 | **時程**：自行繪製任務卡（不呼叫 base） |
| 609 | 確保時程 model 帶 `schedule=true` |
| 626 | **時程**：單軸時間軸版本（取代 596） |
| 648 | 重繪前關閉行內時間編輯器 |
| 691 | **時程**：任務框可拖曳 |
| 735 | 時程外觀套用 |
| 759 | 時程主題 / 字型；移除節點清單的 ref |
| 794 | 時程分支配色 CSS 變數 |
| 1122 | 非拖曳時先清理接點拓撲 |
| 1205 | 重繪後套用時程配色（afPaintSchedule） |
| 1257 | 功能設計的多接腳版面（af-function-multi） |
| 1401 | 同步線條樣式面板 |
| 1534 | 格線：新設計自動啟用格線並正規化座標 |
| 1745、1779、1858 | 每次重繪把 `.af-brand-version` 改寫為 V2.10.1（3 層重複） |
| 1864 | 版本頁尾 |
| 2199 | 時程文字對齊 |
| 2248 | 時程樣式（microtask） |
| 2311 | persistence v25：microtask 中補回設計設定 |
| 3097 | V1.5：新方塊採用樣式、連線標籤去重（rAF） |
| 3234 | 接腳裝飾 |
| 3506 | 時程裝飾、分支顏色（setTimeout 0） |
| 3707 | 提示 |
| 3857 | V2.2.4：電源設計新方塊預設電源接腳 |
| 4044 | V2.3.0：零件庫插入位置 |
| 4424 | V2.4.0：繪製區域外框 |
| 10399 | V2.7：每方塊字型 |
| 10480 | V2.8：接腳名稱位置 |
| 10565 | V2.9：自由尺寸 / 無名稱方塊 |
| 10617 | V2.10：名稱置中 |

#### `validateDiagram`（定義 L358，28 層）
所有層都是「先呼叫前一層，再從 raw 把自己的欄位複製回 clean」，即每個功能的欄位清單分散在各層：

| 行 | 保留 / 轉換的欄位 |
|---|---|
| 605 | **時程**：整份時程資料另寫一套驗證（不呼叫 base） |
| 633 | 時程：`side`、`note` |
| 675 | 時程：`scheduleGraph`、`graphVersion=1` |
| 694 | 時程：`cardDx/cardDy`、`graphVersion=2` |
| 737 | 時程：`axisDx/axisDy`、`graphVersion=3` |
| 798 | 時程：`engineeringStyle` |
| 817 | 時程：`savedEngineeringStyle` |
| 850 | 時程：兩種 style 的 `lineWidth` |
| 1125 | 清理孤立接點 |
| 1199 | `afCleanRoute`；heading 停用但仍讀得進來 |
| 1297 | `afLocked`（方塊 / 接腳） |
| 1332 | 舊圖轉 direct-ports 接線（afDirectConnections） |
| 1403 | `afLineDefaults`、`afLinePresets` |
| 1443 | `afPresentation`、連線電流單位等 |
| 1539 | `afGrid` |
| 1623 | `afRouteOnly`、`afGridLocked` / `locked` |
| 1739 | `afUnifiedLabel` |
| 1815 | `afLabelMark` |
| 2059 | `afCurrentUnit` |
| 2349 | 時程磁吸 `scheduleSnapEnabled/Range` |
| 3062 | 方塊標題版面 |
| 3139 | V1.5 新欄位（接腳標籤、線條標籤…） |
| 3387 | V1.6 時程任務欄位（狀態、工期…） |
| 4116 | V2.3.0 零件 / 電壓徽章欄位 |
| 4431 | `afFrames`（區域外框） |
| 4579 | 連接器資料 |
| 10467 | `afFont`、接腳名稱位置 |
| 10557 | 自由尺寸、無名稱、空副標 |

V3：改為單一 schema（`schemaVersion: 3`），所有欄位集中定義；時程的 `graphVersion` 1→3 升級邏輯不需保留。

#### `drawEdges`（定義 L299，24 層）
| 行 | 目的 |
|---|---|
| 597、629、668 | **時程**：三代時程連線繪製，各自不呼叫 base（前兩代為死碼） |
| 688 | **時程**：固定任務點繞軸（目前實際使用的時程版本） |
| 733 | 時程連線主題、軸點標示 |
| 795 | 時程分支顏色 |
| 849 | 時程線寬 |
| 1124 | 繪製前清理接點 |
| 1171 | 共用線段合併（afNormalizeSharedBranches） |
| 1187 | 範本依實際接腳位置對齊 |
| 1212 | 成本式最短正交繞線的快取重置 |
| 1400 | 新連線套用預設線條格式 |
| 1465 | p13：連線標籤位置 |
| 1562 | 格線：同步幾何、選取線段把手 |
| 1656 | RC：同步多選狀態 |
| 1738 | 統一標籤的引線 |
| 1802 | 手動標記裝飾 |
| 2141 | 轉角拖曳把手 |
| 2249 | 時程樣式（microtask） |
| 3099 | 標籤去重（同步 + rAF） |
| 3235 | 接腳裝飾 |
| 3507 | 時程裝飾、分支顏色（setTimeout） |
| 10481 | V2.8 接腳名稱位置 |
| 10618 | V2.10 名稱置中 |

#### `projectData`（定義 L361，14 層）
| 行 | 目的 |
|---|---|
| 520 | 加 `customStyles` |
| 555\* | 多設計格式 `version:5`：**整個取代**（內含 customStyles，所以 520 失效但不影響結果） |
| 1008 | `archflowLocalization`（語系、綁定、範本目錄） |
| 1057 | `applicationVersion='V2.10.1'` |
| 1126 | 存檔前清理每張設計的接點 |
| 1359 | `wiringMode='direct-ports'` |
| 1471 | `applicationVersion='1.3'` |
| 1540 | `applicationVersion='1.4'` |
| 1625、1675 | `applicationVersion='1.5-rc1'` |
| 1740 | `applicationVersion='1.6-rc2'` |
| 1779 | `applicationVersion='1.7-rc3'` |
| 1857 | `applicationVersion='1.8-rc4'` |
| 2325 | known-fixes-v3：加 `camera` / `cameras` 與設計層資料 |

**發現的 bug**：外層較晚執行，L1057 寫入的 `'V2.10.1'` 會被 L1471…L1857 依序覆寫，最後存檔的 `applicationVersion` 是 **`'1.8-rc4'`**，L2325 沒有再改它（除非 React 殼層另有存檔路徑；階段 2 以測試確認）。V3 用單一版本常數即可解決。

#### `exportSvgDocument`（定義 L390，11 層）
| 行 | 目的 |
|---|---|
| 606、634 | **時程**：前兩代時程匯出（不呼叫 base，已被 698 / 754 取代，為死碼） |
| 676 | 時程：分支圖匯出後處理 |
| 698 | **時程**：預覽 / PNG / SVG 共用的獨立 SVG（不呼叫 base） |
| 754 | **時程**：套用外觀與字型的匯出（取代 698） |
| 760 | 時程匯出後處理（色盤） |
| 1469 | p13：匯出前重繪連線、套用 clean 簡報樣式 |
| 1567 | 格線：移除格線把手 |
| 1674 | RC：移除選取高亮 |
| 1744 | 移除統一標籤引線 |
| 1856 | 移除標記外框、保留標記旋轉與位置 |

V2.3.0 徽章、外框、連接器、文字框不是覆寫 `exportSvgDocument`，而是覆寫 `appendFreeTextExport` 等輔助函式（L4125、L4433）。

### 1.5 取代 / 回退層（`*`）與暫時替換
| 目標 | 行 | 性質 |
|---|---|---|
| `inspector` | 844 | 回退到較早的 alias，拿掉 797 那層 |
| `projectData` | 555 | 改成多設計格式，整個取代 |
| `scheduleExample` | 620、677、925 | 三代範例，每代完全取代上一代 |
| `autoArrange` | 1214、1736、1771、1850 | 1214 引擎版 → 1647 RC 引擎 → 1736 / 1771 改開「整合預覽」 → 1850 最終：時程走 `rcAutoEngine`，其他開 v4 預覽 |
| `createWorkspaceProject` | 554 | 改成多設計專案建立，整個取代 |
| `commit` | 1348、1648、3564 | 執行期間**暫時**換成空函式或計數器（新增方塊、自動排列、插入任務），三處都以 finally / catch 還原 |
| `fit` | 3587 | 插入任務時暫時停用 fit（finally 還原） |
| `axisLayout` | 657、685 | 時程版面兩代，各自整個取代 |
| `syncProjectChrome` | 549 | 多設計版本整個取代 |
| `$('#file').onchange` 等 DOM handler | 363、558 | 第一行是原始定義；558 為多設計版本整個取代 |

### 1.6 對 V3 的結論
1. 8 個主要函式的行為散在 167 層中；V3 每個函式只有一個實作，差異由 `designs/<type>` 策略物件提供（例如 `design.inspectorFields(selection)`、`design.render(model)`、`design.schema`）。
2. 時程設計在 render / drawEdges / inspector / export / validate / example 都有 2–5 代互相取代的實作，只需移植**最後生效的一代**：render 691 以後、drawEdges 688 以後、inspector 741 以後、export 754 以後。
3. 延遲執行的 DOM 修補（microtask / rAF / setTimeout）全部改為同步、一次產生。
4. `applicationVersion` bug 在階段 2 以測試確認；V3 不再用「暫時把 `commit` 換掉」的方式控制歷史，改為顯式的交易 API（例如 `history.batch(fn)`）。
