# 自動整理（RC4）呼叫圖 — 3.36

V3 步驟 3.37（autoArrange）與 3.38（整理預覽）的移植清單。依 plan §3 R7：只搬 `v4Generate` 實際用到的函式。

- 產生方式：`node scripts/audit/layout-callgraph.mjs`（`--json` 輸出完整資料）。腳本從 `v4Generate`、`v4Select`、`v4Draw`、`v4Locate` 與「套用」按鈕的處理函式（L1851）出發，只沿引擎前綴（`v4` / `ui` / `ro` / `ss` / `rc` / `gg` 加大寫字母）展開；`const X=Y;` 形式的覆寫別名會解析回前一層。其他名稱列為「外部依賴」，不再追。
- 結果：**62 個引擎函式，約 40 KB 原始碼**（行號指 `legacy/app.zh-Hant.html`）。
- 方塊圖的「自動整理」按鈕在 V2.10.1 是 `autoArrange = () => v4Open()`（L1850）：開啟整理預覽對話框。時程設計的 `autoArrange` 走 `rcAutoEngine`，V3 已由 `designs/schedule` 的「重新排列」取代（3.29），不在此清單。

## 1. 流程

```
v4Open ──► v4Generate（模式：routes「整理線路」/ layout「依連接關係分層」）
  │   檢查：layout 模式不可有選取的線；上限 60 方塊、100 線
  │   m = 模型副本；geo = roGeometry()；paths = roCurrentPaths()；labels = uiLiveLabels()
  │   base = 原圖；base.metrics = v4Measure(base)
  ├─► 每種候選 kind（routes: preserved；layout: preserved / expanded / layered）
  │     uiCandidate(m, geo, paths, labels, permissions, kind)
  │       ├ uiLayout（layout 模式才動方塊；凍結 uiFrozenNodes）→ uiOrderPorts（接腳排序）→ uiGeo
  │       ├ uiRoutes → uiRouteOne / ssRouteOne（候選路徑：roAdapters → roFind；成本 uiRouteCost / ssCost）
  │       ├ uiArrangeLabels（標籤位置；尊重 v4Mark 手動標記）
  │       ├ uiChanges（差異清單 blocks / ports / routes / labels）
  │       └ uiVerify（保護檢查：連接與電氣資料不可變、鎖定的方塊 / 接腳 / 線不可動、不可重疊）
  │     p.metrics = v4Measure(p)
  ├─► v4Refine（逐條改善：最多 3 輪、3.5 s 預算；每條線試 preserved 版本或單線重繞，只接受分數降低且 v4Allowed）
  ├─► 選最佳：v4HasChanges && invalid 0 && v4Allowed && v4Score < base；都沒有時選分數最低的候選
  └─► v4Select(index)：前後對照圖（v4Draw → uiDraw）、指標差異、可否套用
套用（L1851）：再比對 v4GeometryFingerprint（原圖已改就拒絕）→ 寫回模型（一步復原）→ render / commit
```

評分（`v4Score`）：`invalid × 1e12 + crossings × 1e8 + labelConflicts × 1e6 + unwanted × 1e4 + bends × 500 + length`。
可套用（`v4Allowed`）：沒有無效線、方塊不重疊（`uiNoOverlap`），交叉、非預期共線（unwanted = unrelated + rejoined）與標籤衝突都不比原圖多。

## 2. 引擎函式與 V3 落點

「行」有多個表示覆寫鏈，最後一個是實際執行的版本（先前的層由別名呼叫，也要一起移植）。V3 落點是建議的 `src/layout/` 檔案（plan §1.1；`layout/` 只能 import core / model / router）。

### 2.1 量測與評分（RC2 `ro*`、`ss*`、RC4 `v4*`）→ `layout/metrics.ts`

| 函式 | 行 | 位元組 | 作用 |
|---|---|---|---|
| `roMetrics` | 1587 | 711 | 無效線、彎折、長度、交叉、重疊 |
| `roCross` | 1586 | 307 | 兩線段是否交叉（水平 × 垂直） |
| `roOverlap` | 1585 | 365 | 共線重疊長度 |
| `roPairs` / `roRect` / `roSame` / `roCopy` / `roLocked` | 1572–1579 | 小 | 工具；`roLocked` = 線被鎖（V3：`wire.locked`） |
| `roValid` | 1584 | 649 | 路徑是否合法（兩端在接腳、正交、不穿方塊）——V3 已有 `router/full-path` 的驗證，比對後重用 |
| `ssClassify` | 1752 | 525 | 共用 / 無關 / 重新匯合的線段統計 |
| `ssCommonPrefix` / `ssOverlap` / `ssSource` | 1749–1751 | 中 | 同源線的共同前段、重疊、來源鍵 |
| `uiLabelConflicts` / `uiRectOverlap` / `uiNoOverlap` | 1693, 1710, 1715 | 小 | 標籤衝突、矩形重疊、方塊不重疊 |
| `v4Measure` / `v4Score` / `v4Allowed` / `v4HasChanges` | 1819–1822 | 小 | 指標彙整、分數、可否套用、是否有變更 |

### 2.2 幾何（RC2）→ `layout/geometry.ts`

| 函式 | 行 | 位元組 | 作用 |
|---|---|---|---|
| `roGeometry` | 1580, 1679 | 1069 | 方塊外框、接腳錨點、格距；第二層在 `m === model` 時用 DOM 量測尺寸。**V3**：方塊尺寸就是 `x/y/w/h`（3.16 CHANGELOG），錨點用 `core/grid.portPoint`，不需 DOM |
| `roCurrentPaths` | 1589 | 149 | 目前每條線的路徑。**V3**：`router/full-path.routeAll` |
| `roDir` | 1583 | 146 | 接腳方向 |
| `uiGeo` | 1702 | 592 | 候選模型的幾何（保留原尺寸） |
| `ggOn` | 1476 | 61 | 值是否在格點上 |

### 2.3 繞線（RC2 / RC3）→ `layout/route.ts`

| 函式 | 行 | 位元組 | 作用 |
|---|---|---|---|
| `uiRoutes` | 1708, 1758 | 1287 | 依權限（全部 / 選取）重繞可動的線；第二層加入同源線（`ssRouteOne`） |
| `uiRouteOne` | 1706 | 1004 | 單線：兩端轉接點組合取成本最低。**只被第一層 `uiRoutes`（L1708）呼叫，第二層完全取代，實際不執行——3.37b 未移植** |
| `ssRouteOne` | 1754 | 1657 | 同源線版本（鼓勵共用前段、避免重新匯合） |
| `roAdapters` | 1594 | 849 | 接腳外的轉接點（格點對齊） |
| `roFind` | 1596 | 2374 | 轉接點之間的正交路徑搜尋（有期限 `deadline`）。**注意**：與 V3 `router/find-path`（V2 `findPath` 的 A*）是不同的演算法，要獨立移植並以 golden 鎖定 |
| `uiRouteCost` / `ssCost` | 1705, 1753 | 322 / 602 | 路徑成本（`uiRouteCost` 同上，不執行、未移植） |

### 2.4 方塊與接腳排列（RC3）→ `layout/place.ts`

| 函式 | 行 | 位元組 | 作用 |
|---|---|---|---|
| `uiLayout` | 1695 | 2515 | 三種排列：preserved（不動方塊）、expanded（拉開間距）、layered（依連接關係分層）；對齊格點 |
| `uiFrozenNodes` / `uiPortFrozen` | 1691, 1692 | 小 | 鎖定的方塊 / 接腳（含被鎖定線連著的）不動 |
| `uiOrderPorts` | 1703 | 1711 | 依對側位置重排接腳（`permissions.sides` 時可換邊；RC4 預設 `ports: false, sides: false`） |
| `uiPrepareModel` | 1694 | 69 | 模型副本 |

### 2.5 線路標籤（RC3 / RC4）→ `layout/labels.ts`

| 函式 | 行 | 位元組 | 作用 |
|---|---|---|---|
| `uiArrangeLabels` | 1714, 1762, 1814 | 2965 | 為每條有名稱的線找不衝突的標籤位置；第三層（L1814）保留手動標記 `v4Mark` |
| `uiDefaultLabels` | 1712 | 703 | 預設位置（最長線段中點，同 V3 `render/wires.labelPosition`） |
| `uiLiveLabels` | 1713, 1812 | 465 | 畫面上目前的標籤；第二層套用手動標記 |
| `uiLabelRect` | 1709, 1813 | 574 | 標籤外框；第二層處理旋轉角度 |
| `uiMeasure` | 1711 | 184 | 文字寬度（canvas）。**V3**：`render/texts` 的 `Measure` |
| `v4Mark` | 1797 | 143 | 手動標記（V3：`wire.label.mark`） |

### 2.6 候選與保護 → `layout/candidate.ts`

| 函式 | 行 | 位元組 | 作用 |
|---|---|---|---|
| `uiCandidate` | 1718, 1759 | 1094 | 產生一種候選（排列 → 接腳 → 繞線 → 標籤 → 差異 → 檢查）；第二層加 `ssClassify` 指標 |
| `uiChanges` | 1716 | 700 | 與原圖的差異清單 |
| `uiVerify` / `uiProtected` | 1717, 1690 | 1059 / 267 | 保護檢查：去掉座標後模型必須相同（連接、名稱、電氣資料不變）；鎖定項目不動；不重疊 |
| `v4Refine` | 1823 | 1607 | 逐條改善（見流程） |
| `v4Generate` | 1847 | 3237 | 入口：組候選、選最佳（UI 部分移到殼層，運算部分成為 `layout/plan.ts` 的純函式 `organize(data, options)`；V2 以 `setTimeout` 讓出主執行緒、`v4Token` 取消——V3 可用 async 迴圈或 Worker，3.37 決定） |
| `v4GeometryFingerprint` | 1842 | 86 | 套用前確認原圖未變。**V3**：比較 store 中的 data 是否仍是產生計畫時那份 |

### 2.7 預覽介面（RC3 / RC4）→ 殼層（3.38），不放在 `layout/`

| 函式 | 行 | 作用 | V3 |
|---|---|---|---|
| `v4Select` | 1845 | 顯示一個候選：前後對照、指標、可否套用 | `shell` 的整理對話框 |
| `v4Draw` / `uiDraw` / `uiAllBounds` / `uiSyncView` / `v4SetView` / `v4Locate` | 1720–1846 | 對照圖繪製、共同視窗、縮放、定位到某條線 | 用 V3 `render/*` VNode（`blocksLayer` / `wiresLayer`）畫兩張圖，不移植 V2 的 DOM 繪製 |
| `rcEndLabel` / `roSvgText` / `roT` / `v4Q` / `uiQ` | — | 文字、DOM 工具 | i18n 與 React 取代 |

## 3. 外部依賴（腳本列出、不追）在 V3 的對應

腳本的外部清單含有與區域變數同名的雜訊（`e`、`n`、`p`、`t`、`key`…），以下只列真正的 V2 函式：

| V2 | V3 |
|---|---|
| `model`、`node`、`edge`、`size` | `model/diagram`（`blockOf`、`wireOf`；尺寸 = `b.w / b.h`） |
| `fullPath`、`routes` | `router/full-path`（`routeAll`） |
| `simplify`、`dir`、`same`、`boxes`、`anchor`、`snap`、`round` | `core/geometry`、`core/grid`（`portPoint`、`gridSize`） |
| `edgeLabel` | `render/wires.wireLabel` |
| `commit`、`undo`、`redo`、`render`、`notify` | `interaction/commit.commitEdit`（一步復原）、`Shell.notify` |
| `svg`、`$`、`el` | `render/vnode`、React |
| `cancel`、`ready`、`ok`（對話框） | 殼層對話框 |

## 4. 3.37 / 3.38 要先鎖定的行為

- V2 的 `tests/legacy/unit/core.arrange.test.js`：已整齊的圖沒有可套用的候選；routes 模式方塊不動、線都合法、可復原；layout 模式方塊不重疊、線都合法；layout 模式結果固定（決定性）。
- golden：建議以 golden function / power 與一張打亂座標的圖（同 `core.arrange.test.js` 的 SCRAMBLED）在 V2 引擎跑 `uiCandidate` 各 kind，把 paths / 方塊座標 / metrics 存成快照，V3 `layout/` 對同一份資料輸出相同結果。
- 上限：60 方塊、100 條線；逐條改善 3 輪、3.5 秒。
- 決定性：V2 用 `performance.now()` 預算，超時時結果可能不同——V3 測試應以固定預算或關閉時間限制比較。
