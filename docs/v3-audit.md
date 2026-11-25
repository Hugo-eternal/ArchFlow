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

---

## §2 model 與專案 JSON 欄位

來源：`node scripts/audit/dump-project-shape.mjs`（在 Chromium 實際建立五種設計的範例專案並呼叫 `projectData()`），加上 `validateDiagram` 各層保留的欄位（§1.4）。實測已確認：**存檔的 `applicationVersion` 為 `'1.8-rc4'`**，`version` 為 5。

處置代號：**保留**＝V3 schema 照收（可改名）；**合併**＝與其他欄位重複，V3 只留一個；**衍生**＝可由其他欄位重算，不存檔；**刪除**＝只為相容舊檔或已廢止。

### 2.1 設計（diagram）層級欄位

| 欄位 | 適用類型 | 處置 | 說明 / 依據 |
|---|---|---|---|
| `nodes` / `edges` / `junctions` | 全部 | 保留 | sequence / flowchart 這三個陣列恆為空，資料在 `sequence` / `flowchart` 物件內 |
| `texts` | 功能 / 電源 / 時程 | 保留 | 自由文字框（L495） |
| `theme` | 功能 / 電源 / 時程 | 保留 | 字型與字級（L426–431） |
| `afGrid` | 全部 | 保留 | `{version,size,show,enabled}`；V3 去掉 `version` |
| `afPinLabels` | 功能 / 電源 | 保留 | 接腳名稱預設放置（inside…），L3140 |
| `afFrames` | 功能 | 保留 | 區域外框（L4431） |
| `afLineDefaults` / `afLinePresets` | 功能 / 電源 | 保留 | 線條預設格式與自訂預設（L1403） |
| `afPresentation` | 功能 / 電源 | 保留（待確認） | 只有 `'clean'` 一個值（L1443），可改成 boolean |
| `heading` | 功能 / 電源 | **刪除** | 標題功能已停用，只為讀舊檔保留（L1195） |
| `schedule` | 時程 | **刪除** | 舊的類型判別旗標；V3 以 `design.type` 判斷 |
| `scheduleGraph`、`graphVersion` | 時程 | **刪除** | 時程版面 v1→v3 升級用（L675–737） |
| `scheduleAppearance` | 時程 | 保留 | 時程主題、字型 |
| `scheduleRules` | 時程 | 保留 | 天數計算規則：`endpoint` start/end、`difference`/`inclusive`（L576） |
| `scheduleSnapEnabled` / `scheduleSnapRange` | 時程 | 保留 | 磁吸（L2349） |
| `engineeringStyle` / `savedEngineeringStyle` / `customStyleActive` | 時程 | **合併** | 三個欄位描述「目前樣式 + 一個自訂槽」；L818 的 legacy copper 轉換可刪；V3 合併進 `scheduleAppearance` |
| `scheduleDesign` | 時程 | 衍生（待確認） | 只在 L2244 schedule-release-patch 讀寫 |
| `afNeedsPortAlignment` | 功能 / 電源範本 | **刪除** | 範本載入後的暫時旗標（L1176），不應存檔 |
| `sequence` | sequence | 保留 | `{name, tk, rails[]}`，見 2.4 |
| `flowchart` | flowchart | 保留 | `{title, lanes[], nodes[], edges[], lineDefault}`，見 2.5 |

### 2.2 方塊（node）欄位：功能 / 電源

| 欄位 | 處置 | 說明 |
|---|---|---|
| `id`、`x`、`y`、`w`、`h` | 保留 | |
| `title`、`partNumber`、`ref`、`text` | 保留 | 名稱、料號、參考編號、副標 |
| `ports[]` | 保留 | 見 2.3 |
| `appearance` | 保留 | `{fill,border,accent,text,subtitle,titleSize…}`（L432） |
| `color` | **刪除** | 舊版單色欄位，已由 `appearance` 取代；L1332 在載入時轉換 |
| `role` | 保留 | 電源角色 source / converter / distribution / load（電源）；功能設計用於配色（L3249） |
| `voltage`、`current`、`power`、`efficiency`、`showMetrics` | 保留 | 方塊量測標註（L366–371） |
| `afCurrentUnit` | **合併** | 與連線的 `currentUnit` 同義，V3 統一為 `unit` 結構 |
| `ioConfig` | 衍生（待確認） | 電源設計的接腳槽位設定（L451–455），階段 2 確認能否由 ports 重算 |
| `afLayout` | 保留 | 標題位置 9 宮格（L3052–3062） |
| `afLocked` | 保留 | 鎖定方塊 |
| `afFont` | 保留 | V2.7 每方塊字級 `{subtitle,label,metric}` |
| `afFree`、`afNoName` | 保留 | V2.9 自由尺寸、無名稱 |
| `afRails`、`afPart`、`afSym`、`afRot`、`afSize`、`afBoth` | 保留 | V2.3 零件 / 符號 / 電壓徽章（L4116） |
| `afConn`、`afMpn`、`afPin`、`afEnd`、`afRows` | 保留 | V2.4.1 連接器（L4579） |
| `note`、`showNote` | **刪除** | `projectData` 在存檔前就刪掉（L361） |
| `review` | 待確認 | 出現在基礎驗證（L358），需在 1.6 確認是否為死欄位 |

V3：`af*` 前綴全部去掉，依功能分組（例如 `part: {kind, rot, size, rails}`、`connector: {mpn, rows, pins}`）。

### 2.3 接腳（port）、連線（edge）、接點、文字框

| 物件.欄位 | 處置 | 說明 |
|---|---|---|
| port `id`、`name`、`side`、`t`、`type` | 保留 | `side` ∈ l/r/t/b，`t` 為邊上相對位置 0–1 |
| port `showLabel`、`afLabelPos` | **合併** | `afLabelPos`（inside / outside / hidden，V2.8）已涵蓋 `showLabel` |
| port `afGridOffset` | 衍生 | 由格線正規化計算（L1489） |
| port `afLocked` | 保留 | 鎖點 |
| edge `id`、`a`、`b` | 保留 | `a`/`b` = `{node,port}` 或 `{junction}` |
| edge `name`、`kind` | 保留 | `kind` ∈ signal / power / clock / bus…（L285） |
| edge `manual` | 保留 | 手動路徑點 |
| edge `afLineFormat` | 保留 | `{color,width,dash,arrow…}` |
| edge `color`、`arrow`、`arrowSize` | **合併** | 與 `afLineFormat` 重複（L1400 會互相複製） |
| edge `voltage`、`current`、`currentUnit`、`afShowElectrical` | 保留 | 電源支路標註 |
| edge `afLabelSize`、`afLabelPreset` | 保留 | 標籤字級與位置預設 |
| edge `afUnifiedLabel` | **刪除** | RC2 標籤位置，已被 RC4 的 `afLabelMark` 取代 |
| edge `afLabelMark` | 保留 | 手動標記位置 / 角度 |
| edge `afRouteOnly` | 待確認 | 「整理預覽」套用後的路徑記錄（L1581–1623），可能與 `manual` 合併 |
| edge `afGridLocked`、`afLocked`、`locked` | **合併** | 三個同義鎖定旗標 → `locked` |
| edge `afCleanRoute` | **刪除** | 舊版路徑清理標記（L1184–1199） |
| junction `id`、`x`、`y`、`name` | 保留 | |
| text `id`、`text`、`x`、`y`、`w`、`size`、`color`、`bold`、`italic`、`align`、`background` | 保留 | |

### 2.4 時程（schedule）node / edge

| 欄位 | 處置 | 說明 |
|---|---|---|
| node `id`、`title`、`ref`、`note`、`side` | 保留 | `side` ∈ top / bottom |
| node `timeType`、`startDate`、`endDate`、`deadline` | 保留 | `timeType` ∈ none / range / deadline |
| node `afStatus`、`afMilestone` | 保留 | V1.6 狀態 todo / doing / done、里程碑 |
| node `cardDx`、`cardDy`、`axisDx`、`axisDy` | 保留 | 使用者對任務框 / 軸點的手動位移 |
| node `x`、`y`、`w`、`h`、`baseX`、`baseY`、`axisX`、`axisY`、`axisBaseX`、`axisBaseY`、`graphLane`、`graphDepth` | **衍生** | 都由 `axisLayout()` 重算（L618、L657、L722），不需存檔 |
| node `ports` | **刪除** | 時程任務恆為空陣列 |
| node `branchColor` | 保留 | 分支配色 |
| edge `id`、`a`、`b`、`timeMode`、`manualDays` | 保留 | `timeMode` ∈ auto / manual |

### 2.5 React 編輯器資料（sequence / flowchart）
- **sequence**：`{name, tk, rails:[{id,name,kind,v,color,note,tk,on:{after,delay,ramp},off:{after,delay,ramp}}]}`。`tk` 是時序鍵（例如 `mcu.per`）。全部保留。
- **flowchart**：`{title, lanes[], nodes:[{id,type,text,x,y,w,h,color,lane,img,att,alt,border}], edges:[{id,from,to,label,color,width,fromSide,toSide,dash}], lineDefault:{color,width,dash}}`。全部保留；流程圖另有獨立的 `.flow.json` 匯出格式（`{app:'archflow-flow', version:1, …}`，L5563），V3 決定是否保留。
- 這兩種設計的 `nodes` / `edges` / `junctions` 外層陣列恆為空，只是為了通過引擎的 `validateDiagram`；V3 不需要。

### 2.6 專案 JSON 頂層欄位（現行 `version: 5`）

實測輸出（`scripts/audit/dump-project-shape.mjs`）：

| 欄位 | 寫入 | 讀取 | 處置 | 說明 |
|---|---|---|---|---|
| `version` | L555（=5） | L559（5）、L363 / L560（4） | **改名** → `schemaVersion: 3` | V3 只接受 3；其他值顯示「不支援舊版格式」 |
| `project.name` | L555 | L562 | 保留 | 上限 100 字 |
| `activeDesignId` | L555 | L559 | 保留 | |
| `designs[]` | L555 | L559 | 保留 | 每筆 `{id, name, type, diagram, camera}`；上限 100 張 |
| `designs[].type` | | | 保留 | function / power / schedule / sequence / flowchart |
| `designs[].camera` | L2325 | L559、L2332 | 保留 | `{x, y, z}` |
| `customStyles` | L520 / L555 | L521、L562 | 保留 | 使用者自訂方塊樣式；同時存在 localStorage（`circuit-studio-custom-styles-v1`，L514），V3 需決定以哪邊為準 |
| `archflowLocalization.locale` | L1008 | L1009 | 保留 → `locale` | 建檔時的介面語系 |
| `archflowLocalization.bindings` | L1008 | L1009 | **刪除** | 「系統產生的標籤 ↔ 範本字串」對照，用來在切換語系時翻譯範本名稱；V3 範本名稱改用 i18n key 即可 |
| `archflowLocalization.catalog` | L1008 | L1009 | **刪除** | 每個存檔都**完整複製一份範本文字目錄**（`AF` 物件，約 20 個欄位），只為了上一項的翻譯 |
| `applicationVersion` | L1057、L1471…L1857 | L1539、L1623、L1739（只寫不判斷） | 保留，改為單一常數 | 現況 bug：實際寫入 `'1.8-rc4'` |
| `wiringMode` | L1359（固定 `'direct-ports'`） | 無 | **刪除** | 只寫不讀 |
| `camera` | L2325 | L2332 | **刪除** | 與 `designs[activeDesignId].camera` 重複 |
| `cameras.circuit` / `cameras.current` | L2325 | L2332（僅 `version 4`） | **刪除** | V1.x 兩個工作區時代的鏡頭 |

只在讀舊檔時出現（V3 全部刪除）：
- `version: 4` 格式：`diagrams.circuit` / `diagrams.current`、`active`、`project.type`（含隱藏的 `both`），讀取於 L363、L560、L2332。
- 無 `version` 的單張圖：直接當成 diagram 交給 `validateDiagram`。

### 2.7 瀏覽器 localStorage（不在專案檔內，但 V3 要決定去留）

| key | 用途 | 位置 |
|---|---|---|
| `archflow-language-v2` | 介面語系 | `index.html:4`、`index.html:7` |
| `circuit-studio-custom-styles-v1` | 自訂方塊樣式（與專案檔 `customStyles` 重複） | L514 |
| `archflow-v2-recent` | 最近專案 | L5766（殼層） |
| `archflow-v2-tips-seen` | 提示是否看過 | L10374（殼層） |
| `archflow-seq-demo-v2`、`archflow-rsi-demo-v1` | 電源時序 / BOM 示範資料 | 殼層 bundle |
| `edid-web-lang`、`hexbin-lang`、`pg-web-*` | 三個內建工具各自的語系 | 工具內 |

V3 建議：統一前綴 `archflow:`；語系由殼層統一提供給工具，不再各存一份。

### 2.8 V3 schema 草案方向（細節在 1.10 寫入 `docs/v3-plan.md`）
```jsonc
{
  "schemaVersion": 3,
  "app": "ArchFlow 3.0.0",
  "locale": "zh-Hant",
  "project": { "name": "…" },
  "activeDesignId": "…",
  "customStyles": [ … ],
  "designs": [
    { "id": "…", "name": "…", "type": "function", "camera": {"x":0,"y":0,"z":1},
      "data": { /* 依 type 而定：function/power 用 nodes/edges/junctions/texts/frames…；
                   schedule 用 tasks/links；sequence 用 rails；flowchart 用 lanes/nodes/edges */ } }
  ]
}
```
重點：每種 type 只存自己需要的欄位（不再為了通過共用驗證而帶空的 `nodes/edges/junctions`），衍生欄位一律不存。

---

## §3 zh-Hant 與 en 的非翻譯差異

工具：`node scripts/audit/diff-locales.mjs`（遮蔽所有字串字面值、HTML 文字節點、`\uXXXX` 與非 ASCII 字元後逐行比對）。

### 3.1 結論
- 兩份檔案共 10,631 / 10,639 行，**只有 252 行內容不同**，其中 245 行只是翻譯文字；**結構差異只有 7 處**。
- React bundle 的大行（L5563、L5765、L5766、L10374，數十萬字元）在兩份檔案中**完全相同**：殼層、電源時序、流程圖、工具中心本來就以執行期 `c(zh, en)` 切換語言。
- 多數補丁（af15-ux、af15-ux2、V2.x）也已經用 `const EN = document.documentElement.lang==='en', T=(zh,en)=>…` 在執行期切換。
- 也就是說，「兩份程式」實際上是**同一份程式 + 約 250 行寫死的中文 / 英文字串**。V3 的 i18n 抽取工作量比預期小。

### 3.2 七處結構差異

| # | zh-Hant | en | 差異 | V3 處置 |
|---|---|---|---|---|
| 1 | L563 | L563 | 載入失敗訊息的判斷不同：zh 版在錯誤訊息含中日韓字元時顯示原訊息；en 版在含空白且不像 JS 例外（`Cannot read`、`undefined`…）時顯示 | **行為差異**：統一為「錯誤物件帶 i18n key 時顯示對應文字，否則顯示通用訊息」 |
| 2 | L572 | L572 | 註解文字不同（「專案時程設計」vs "Project schedule design"） | 無影響 |
| 3 | — | L2361–2368 | **en 獨有** `<script id="v147-en-text-tidy">`：用 MutationObserver 持續清理英文文字的多餘空白與標點前空格 | 不移植；V3 的英文字串直接寫正確即可。這也是 en 版在 L2361 之後行號 +8 的原因 |
| 4 | L10395 | L10403 | af-v270-sizing：`const EN=false` / `true` 寫死 | 改由 i18n 提供 |
| 5 | L10463 | L10471 | af-v280-ux：同上 | 同上 |
| 6 | L10550 | L10558 | af-v290-free：同上 | 同上 |
| 7 | L10597 | L10605 | af-v2100-scale：同上 | 同上 |

### 3.3 限制
- 遮蔽字串後才比對，因此字串**內部**的差異（例如兩語系範本資料中的數值不同）不會被列出；這類差異屬於範本內容，會在階段 3 抽成 i18n / 範本 JSON 時逐一對照。
- 嵌入的工具 HTML 位於跨行模板字串內，仍以逐行方式比對（行內字串被遮蔽），結果顯示兩語系相同。

---

## §4 死碼與已廢止功能

依據：靜態搜尋 + 在 Chromium 建立功能設計專案後，檢查元素是否存在 / 可見，並呼叫 `autoArrange()` 看實際開啟哪個對話框。

### 4.1 關鍵事實：V1 介面全部隱藏，殼層透過「點隱藏按鈕」驅動引擎
- 建立專案後，V1 的工具列、側欄按鈕（`#add`、`#exportBtn`、`#layoutBtn`、`#saveProject`、`#fit`…）**全部不可見**，畫面只有 V2 React 殼層。
- 殼層以 `z(id)`（= `document.getElementById(id).click()`）與 `B(id)` 操作這些隱藏元素。bundle 內引用到的 id（括號為次數）：
  `view`(9)、`add`(5)、`saveProject`(4)、`uiOpen`(3)、`inspector`(3)、`designSelect`(3)、`workspaceManage`(2)、`toggleInspector`(2)、`startScreen`(2)、`startExamples`(2)、`startCancel`(2)、`scheduleBranch`(2)、`scheduleAuto`(2)、`reroute`(2)、`projectName`(2)、`p13Name`(2)、`newProject`(2)、`managedDesignType`(2)、`managedDesignExample`(2)、`m2Reroute`(2)、`fit`(2)、`exportBtn`(2)、`chineseFont`(2)、`afArrangeSelectedIO`(2)、`addText`(2)、`undo`、`stats`、`startLoad`、`renameDesign`、`remove`、`rcClearRoutes`、`projectSaveState`、`notice`、`load`、`helpBtn`、`examplesBtn`、`englishFont`、`duplicateDesign`、`designBtn`、`deleteDesign`、`createProject`、`addDesign`。
- 這些 id 就是現行「殼層 → 引擎」的實際介面。V3 必須改為明確的函式 API（例如 `app.commands.addBlock()`），不再依賴隱藏 DOM。

### 4.2 已廢止功能

| 功能 | 狀態 | 相關程式 | V3 處置 |
|---|---|---|---|
| 工作區標題（heading） | `#headingBtn`、`#headingDialog` 已不在 DOM；L240 以 CSS 隱藏 `.workspace-heading`；L1195 註明停用 | CSS L26、L28；HTML L247、L251；`cleanHeading`/`renderHeading`/`headingBounds`/`appendHeadingExport`/`openHeading` L458–463；`render` L310、`fit` L336、`exportSvgDocument` L390/L398、`validateDiagram` L360 中的呼叫 | 全部刪除 |
| 隱藏的 `both` 專案類型 | 啟動畫面卡片 `hidden`（L246）；殼層也在 bundle 中把它濾掉 | `allowedWorkspace` L465、`createWorkspaceProject` L470、L2329、`acceptLoadedProject` L474、L3370、L3526 | 刪除；V3 一個專案本來就可含多張不同類型設計 |
| V1 雙工作區（circuit / current 分頁） | `#tab-circuit`、`#tab-current` 隱藏；多設計（designs[]）已取代 | `workspaces`、`switchWorkspace`、`updateWorkspaceUI` L340–346；`activeWorkspace` 仍被大量用來判斷「電源設計」 | 刪除工作區概念，改由 `design.type` 判斷 |
| `version: 4` 專案格式 | 只在載入時轉換 | L363、L560、L2332 | 刪除（V3 不相容舊檔） |
| 時程 legacy copper 樣式轉換 | 只在載入舊檔時把 amber 主題轉為自訂樣式 | L817–818 | 刪除 |
| 舊圖 off-grid 端點轉接 | 只對未對齊格線的舊檔接點產生短轉接線 | L1593–1613（`roLegacyNote`）、`ggLegacy` L1483 / L1514、L1542 | 刪除；V3 新檔一律在格線上 |
| `archflowLocalization` 綁定推論 | 讀舊檔時推論範本綁定 | `afInferLegacyBindings` L971、L976 | 刪除 |
| 舊 junction 網路拒絕載入 | 載入時檢查 | L1325–1327 | 刪除 |
| en 文字清理 | 只在 en 版存在 | en L2361–2368 `v147-en-text-tidy` | 不移植（§3） |
| 版本字樣反覆改寫 | 3 個 `render` 層各自把 `.af-brand-version` 改成 V2.10.1，另有 `archflow-v13-release-lock`（L2352–2360）定時覆寫 | L1745、L1779、L1858、L2353 | 改為單一版本常數 |

### 4.3 自動整理：RC 實驗分支
最後生效的是 **RC4（`v4Open`，L1848）**：
- `autoArrange()` → 時程走 `rcAutoEngine`，其他設計開 `v4Dialog`（實測）。
- `#uiOpen` 按鈕（殼層用它開「整理預覽」）在 L1850 被重新綁到 `v4Open`；L1792 起 `uiOpen = v4Open`，`roOpen`、`rcPortAssess` 也改指向 `v4Open`。

因此下列**入口與對話框是死碼**：
- RC2 整合預覽對話框 `#uiDialog` 與 `uiOpen()` 本體（L1681–1745）。
- RC3 `ss*` 預覽 UI（L1747–1781，`#ssPreview`、`#ssMode`、`#ssScope`）。
- 路線整理 `ro*` 對話框入口、`#rcPortDialog`（接點評估）、`#rcAutoDialog` 對話框 UI。

但 **RC2 / RC3 的計算函式仍被 RC4 使用**：`v4Generate`（L1847）呼叫 `uiCandidate`、`uiRoutes`、`uiNoOverlap`、`uiArrangeLabels`、`uiVerify`、`roGeometry`、`roLocked`、`roCurrentPaths`、`rcEndLabel` 等；`rcAutoEngine` 仍是時程的自動排列。階段 3 移植時以 `v4Generate` 為入口，只搬它實際呼叫到的函式。

### 4.4 被後層遮蔽的實作（來自 §1）
| 函式 | 已無作用的層（時程分支） | 實際生效 |
|---|---|---|
| `render` | 596、626 的時程分支 | 691 以後各層 |
| `drawEdges` | 597、629、668 的時程分支 | 688 以後 |
| `inspector` | 599、631、673 的時程分支；797 被 844 回退 | 741 以後 |
| `exportSvgDocument` | 606、634、698 的時程分支 | 754、760 |
| `scheduleExample` | 620、677 | 925 之後的包覆 |
| `axisLayout` | 618、657 | 685 + 722 |
| `autoArrange` | 378 本體、1214、1647、1736、1771 | 1850 |
| `projectData` | 520（被 555 整個取代） | 555 + 後續 |

### 4.5 待確認欄位（承 §2）
| 欄位 | 結果 |
|---|---|
| `review` | 只有讀取（L308 若為 true 加上 `.review-tag`，但 CSS L14 將其 `display:none`）與驗證（L359），程式中沒有任何地方設定它；實測五種範例存檔皆無此欄位 → **刪除** |
| `afPresentation` | 只有 `'clean'`，由 p13 線條面板設定（L1443、L1469） → 保留為 boolean |
| `scheduleDesign` | 只在 schedule-release-patch（L2244）讀寫，用於記錄時程設計的樣式選擇 → 併入 `scheduleAppearance` |
| `ioConfig` | 電源設計接腳槽位（L451–456），V2.4 之後接腳改用接腳表格管理；階段 2 以測試確認是否仍影響渲染 |
| `afRouteOnly` | RC4 套用整理結果時寫入（L1581–1623），`fullPath` L1591 優先採用 → 保留，V3 與 `manual` 合併為 `route` |
