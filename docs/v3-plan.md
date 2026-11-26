# ArchFlow V3.0.0 重構計畫

依據：`docs/v3-audit.md` §1–§6。需求與層級規則：`docs/v3-prompts.md` 第 1 節。

已定案：
- V2 React 介面沒有原始碼 → 電源時序、流程圖、BOM 與三個工具以 **vendor 原封隔離**（audit §5.3）；V3 自行重寫殼層。
- 不相容 V1 / V2 存檔。

- §1 模組切分與依賴方向
- §2 V3 schema 與 design 策略介面（待 1.10）
- §3 風險與階段 3 執行順序（待 1.11）

---

## §1 模組切分與依賴方向

### 1.1 目錄

```
src/
  main.ts                 進入點：建立 app、掛載殼層
  app.ts                  組裝所有模組（唯一知道全部模組的地方）
  core/                   與設計類型無關的基礎設施
    store.ts              專案狀態（designs、activeDesignId、selection）與訂閱
    history.ts            undo / redo；history.batch(fn) 取代「暫時把 commit 換掉」
    commands.ts           命令註冊表（殼層、快捷鍵、指令面板都只呼叫命令）
    camera.ts             平移 / 縮放 / fit
    grid.ts               格線與吸附
    ids.ts, geometry.ts   uid、點 / 矩形 / 正交線段工具
    i18n.ts               t(key)、語系切換（不重新載入頁面）
  model/                  型別與純資料操作（無 DOM）
    types.ts              Block、Port、Wire、Junction、Text、Frame…
    diagram.ts            新增 / 刪除 / 連線等純函式
  router/                 正交繞線（純函式，無 DOM）
    find-path.ts          A*（現行 L274）+ 成本（彎折 / 交叉 / 重疊，L1206）
    full-path.ts          端點 stub、手動路徑、共用線段（L282、L1171）
    junctions.ts          分支接點與 T 型正規化（L1079–1172）
  render/                 把 diagram 畫成 DOM / SVG（只讀 model）
    blocks.ts, ports.ts, wires.ts, junctions.ts, texts.ts, frames.ts
  interaction/            指標事件：拖曳、拉線、框選、鍵盤
  inspector/              屬性面板框架：依 design 策略提供的欄位描述一次產生 UI
    fields.ts             欄位元件（text、number、color、select、toggle…）
  layout/                 自動排列（L378）+ 整理預覽（RC4 v4Generate 及其實際呼叫的函式）
  io/
    schema.ts             V3 schema（單一來源）與驗證
    project-file.ts       存檔 / 開檔；非 V3 檔顯示「不支援舊版格式」
    migrate.ts            V3.x → V3.y 升級框架（初版為空）
  export/                 SVG / PNG / 頁面 / 可讀性檢查
  shell/                  V3 介面（React + TS）：app bar、命令列、指令面板、
                          設計清單、屬性面板外框、狀態列、啟動畫面、Tools 中心
  designs/
    function/             方塊圖（功能檢視 / 電源檢視，3.26c 合併）：零件庫、符號、外框、連接器、
                          LCD 範本；電源檢視的角色、量測、需求 vs 額定、入門電源樹範本
    schedule/             專案時程：時間軸版面、任務、間隔、外觀
    sequence/             電源時序：vendor 轉接（afSeqHost ↔ schema）
    flowchart/            流程圖：vendor 轉接（afFlowHost ↔ schema）
  tools/
    bom/, edid/, hex/, pattern/   各自的 vendor 轉接（lang、close、toast）
  styles/
    tokens.css            唯一一套 design token（顏色、字級、間距、圓角、陰影）
    *.css                 依模組分檔，只用 token
i18n/
  zh-Hant.json, en.json
vendor/                   逐字抽出的 V2 bundle（audit §5.3），附 VENDOR.md 與 SHA-256
  sequence-editor/, flowchart-editor/, rsi-bom/, tools/
tests/                    unit / golden / e2e（階段 2 建立）
```

### 1.2 依賴方向（只能由上往下 import）

```
main → app → shell
              ↓
        designs/* , tools/*            （彼此不得互相 import）
              ↓
   inspector, interaction, layout, export, io
              ↓
          render, router
              ↓
            model
              ↓
            core
```

規則：
1. `core`、`model`、`router` 不碰 DOM，可在 Node 中做 unit test。
2. `render` 只讀 model，不修改；所有修改經 `core/commands` → `model` 純函式 → `history`。
3. `designs/<type>` 只能 import 下層模組與 `vendor/` 中自己的那一份；不得 import 其他 design 或 `shell`。
4. `tools/<x>` 只能 import `core/i18n` 與自己的 vendor。
5. `shell` 只透過 `core/commands` 與 `core/store` 操作；不得直接改 model 或 DOM（取代現行「點隱藏按鈕」，audit §4.1）。
6. `app.ts` 是唯一同時 import 所有 design / tool 並註冊到 registry 的檔案。

### 1.3 design 策略的分派方式
- `designs/<type>/index.ts` 匯出一個 `DesignModule` 物件（介面在 1.10 定義），內容包括：schema、預設資料 / 範本、render 擴充、inspector 欄位、命令、匯出擴充、自動排列策略。
- 共用模組遇到差異時呼叫 `registry.get(design.type).xxx(...)`，**不寫 `if (isSchedule())`**，也不覆寫函式。
- **方塊圖只有一種設計類型 `function`（介面名稱「方塊圖」）**，V2 的「功能方塊圖」與「電源架構」合併為同一份資料的兩種檢視（`BlockDiagram.view`，3.26c，見 §2.2.1）。共用能力（方塊、接腳、繞線、外框）放在 `render` / `router` / `inspector` / `interaction`；電源檢視的呈現與欄位（角色配色、量測、需求 vs 額定）放在 `designs/function` 內，依 `view` 提供，不另設 design 模組。
- schedule 使用自己的版面（時間軸），不使用 router；sequence / flowchart 完全交給 vendor 編輯器，共用模組只負責專案層級的存檔、設計清單與 Tools 中心。

### 1.4 現行程式 → V3 模組對照

| 現行（audit 位置） | V3 模組 |
|---|---|
| L254–262 全域狀態、L288 `commit`、L331 undo/redo | `core/store`、`core/history` |
| L274–283 繞線、L1206 成本繞線、L1171 共用線段 | `router/` |
| L1079–1172 分支 / 接點正規化 | `router/junctions` |
| L299 `drawEdges`、L304–310 `render`、各層裝飾 | `render/` |
| L293、L315–319 拖曳與拉線、L1547 交易式拖曳 | `interaction/` |
| L314 `inspector` 及 37 層覆寫 | `inspector/`（框架）+ 各 `designs/*/inspector.ts`（欄位） |
| L358 `validateDiagram` 及 28 層、L361 `projectData` 及 14 層 | `io/schema`、`io/project-file` |
| L378 `autoArrange`、RC4 `v4Generate`（L1847）與其依賴 | `layout/` |
| L388–445 匯出、各層匯出後處理 | `export/` |
| L1474 格線 | `core/grid` |
| L904–1037 語系、兩份原始碼的寫死字串 | `core/i18n` + `i18n/*.json` |
| L349–351、L366、L3794 電源 | `designs/function`（電源檢視） |
| L573–860、L2185–2350、L3374–3709 時程 | `designs/schedule` |
| L3870–4653 零件庫、外框、連接器、LCD 範本 | `designs/function` |
| af15-theme、af20-shell-css 等 CSS | `styles/` |
| af20-shell 殼層本體 | `shell/`（重寫） |
| `Bf` / `$f` / `fg` / `mg` / `vg` / `xg` | `vendor/` + 對應 `designs/*` 或 `tools/*` 轉接 |

### 1.5 技術選擇
- **TypeScript + Vite**，以 `vite-plugin-singlefile` 類方式輸出單一 `dist/ArchFlow.html`；字型、vendor 檔、圖示全部內嵌，CI 檢查產物沒有任何外部 URL。
- **殼層用 React 19 + TS**：殼層有大量面板、選單與狀態，用元件框架較好維護；引擎（core 到 render）不依賴 React。
- 不引入狀態管理套件；`core/store` 以簡單的訂閱模式提供給 React（`useSyncExternalStore`）。
- 測試：Vitest（core / model / router / io 在 Node；render / inspector 用 jsdom）、Playwright（只用 chromium）。

---

## §2 V3 schema 與 design 策略介面

依據 audit §2 的欄位處置（保留 / 合併 / 衍生 / 刪除）。以 TypeScript 型別表示；`io/schema.ts` 以同一份定義產生執行期驗證。

### 2.1 專案檔

```ts
interface ProjectFile {
  schemaVersion: 3;                 // 其他值 → 「不支援舊版格式」
  app: string;                      // 例如 "ArchFlow 3.0.0"，單一常數（修正 applicationVersion bug）
  locale: 'zh-Hant' | 'en';         // 建檔時語系，僅供參考
  project: { name: string };        // ≤ 100 字
  activeDesignId: string;
  customStyles: BlockStyle[];       // ≤ 50；以專案檔為準，localStorage 只做「最近使用」
  designs: Design[];                // 1–100 張
}

type Design =
  | DesignOf<'function', BlockDiagram>     // 方塊圖：功能 / 電源兩種檢視（V2 'power' → 'function' + view: 'power'）
  | DesignOf<'schedule', ScheduleData>
  | DesignOf<'sequence', SequenceDoc>     // vendor 編輯器格式，原樣保存
  | DesignOf<'flowchart', FlowchartDoc>;  // vendor 編輯器格式，原樣保存

interface DesignOf<T extends string, D> {
  id: string; name: string; type: T;
  camera: { x: number; y: number; z: number };
  data: D;
}
```

刪除（audit §2.6）：`version`、`archflowLocalization`（含 `bindings`、`catalog`）、`wiringMode`、頂層 `camera` / `cameras`、`applicationVersion`（改為 `app`）。

### 2.2 方塊圖（`function`，功能 / 電源檢視）

以下為原始規劃；實際欄位以 `src/io/schema-types.ts` 為準（3.6、3.25、3.26c 已修正：`rails` 在方塊、`bothEnds` 在線路、連接器為 `{kind, side, pins, only, mpn, visibleRows, hiddenRows}`）。

```ts
interface BlockDiagram {
  view: 'function' | 'power';                  // 目前檢視，存在檔案裡（3.26c）
  blocks: Block[];  wires: Wire[];  junctions: Junction[];
  texts: TextBox[]; frames: Frame[];           // frames 只在 function 使用
  theme: Theme;                                // 字型、字級
  grid: { size: number; show: boolean; snap: boolean };
  portLabels: 'inside' | 'outside' | 'hidden'; // 原 afPinLabels
  wireDefaults?: LineFormat; wirePresets: LineFormat[];
  presentationClean: boolean;                  // 原 afPresentation==='clean'
  groups?: { id: string; name: string; members: string[]; bounds: Rect }[];  // 預留（3.26c）：群組框
}

interface Block {
  id: string; x: number; y: number; w: number; h: number;
  title: string; subtitle: string; partNumber: string; ref: string;
  ports: Port[];
  style: BlockStyle;              // 原 appearance；刪除舊 color
  titleAlign: TitleAlign;         // 原 afLayout（9 宮格）
  font?: { subtitle?: number; label?: number; metric?: number };  // 原 afFont
  sizing: 'auto' | 'free';        // 原 afFree
  size?: 'S' | 'M' | 'L';         // 預留（3.26c）：尺寸預設，給「統一大小」
                                  // style 另預留 color?: string（3.26c：一鍵配色）
  showTitle: boolean;             // 原 afNoName 取反
  locked: boolean;                // 原 afLocked
  role?: string;                  // 電源檢視：source / converter / distribution / load
  metrics?: Partial<Record<'voltage'|'current'|'power'|'efficiency', { value: string; unit?: string; show: boolean }>>;
                                  // 合併 voltage/current/power/efficiency/showMetrics/afCurrentUnit
  part?: { kind: string; rot: 0|90|180|270; size: 'S'|'M'|'L'; rails?: string[]; bothSides?: boolean }; // 原 afPart/afSym/afRot/afSize/afRails/afBoth
  connector?: { mpn: string; rows: number; side: 'l'|'r'|'both'; pin1: string; end: string };      // 原 afConn/afMpn/afRows/afPin/afEnd
}

interface Port {
  id: string; name: string; side: 'l'|'r'|'t'|'b'; t: number;   // t ∈ [0,1]
  type: string; label: 'inside' | 'outside' | 'hidden';         // 合併 showLabel + afLabelPos
  locked: boolean;
}

interface Wire {
  id: string;
  a: End; b: End;                 // End = { block, port } | { junction }
  name: string; kind: 'signal'|'power'|'clock'|'bus'|string;
  line: LineFormat;               // 合併 afLineFormat + color + arrow + arrowSize
  route?: Point[];                // 合併 manual + afRouteOnly；路徑點只存在這裡
  locked: boolean;                // 合併 afGridLocked / afLocked / locked
  routing?: 'auto' | 'manual';    // 預留（3.26c），預設 auto：標示 route 是否為使用者手動設定（不另設 waypoints）
  labelOffset?: Point;            // 預留（3.26c）：標籤相對自動位置的偏移
  electrical?: { voltage?: string; current?: string; unit?: 'A'|'mA'|'uA'; show: boolean };
  label?: { size?: number; preset?: string; mark?: { x: number; y: number; angle: number } }; // afLabelSize/afLabelPreset/afLabelMark
}
```

刪除（audit §2.1–2.3、§4.5）：`heading`、`afNeedsPortAlignment`、`afUnifiedLabel`、`afCleanRoute`、`afGridOffset`（衍生）、`ioConfig`（待階段 2 確認可衍生）、`review`、`note` / `showNote`、舊 `color`。

### 2.2.1 兩種檢視（3.26c）

同一張圖、同一份資料，畫布上方兩段式切換「功能檢視 / 電源檢視」。規則：

| 項目 | 功能檢視 | 電源檢視 |
|---|---|---|
| 電源標註（電壓 / 電流 / 效率、角色配色、需求 vs 額定） | 隱藏 | 顯示 |
| 電源線 | 照畫，不顯示數值標籤 | 顯示電壓 / 電流標籤 |
| 訊號線 | 正常 | 變淡 |
| 屬性面板電源欄位 | 不顯示（資料保留） | 顯示 |
| 新增線路預設 | 訊號線、無箭頭 | 電源線、帶箭頭、`electrical` |
| 新增方塊預設 | 無角色 | 角色「轉換器」、電壓 / 電流欄位 |
| 匯出 | 依目前檢視；對話框可另選 | 同左 |
| 範本 | 「入門方塊圖」 | 「入門電源樹」 |

- 切換只改呈現、不改資料，**不記一步復原**；但 `view` 存在檔案裡（開檔回到上次的檢視），所以切換會標記未存檔（使用者已確認）。
- 快捷鍵 **Shift+V** 在兩種檢視間切換（使用者已確認；不用 Tab，Tab 留給焦點移動）。
- 預設值由 `model/diagram` 的 `makeBlock` / `connect` 讀 `d.view` 決定（取代 3.12–3.26 的 `BlockFlavour` 參數與 `DesignModule.blockDiagram.flavour`）。
- 格線 / 吸附**繼續存在檔案裡**（`BlockDiagram.grid`；使用者已確認改決定）：格線會影響資料本身——方塊位置依格距對齊，且格線開啟用格線繞線、關閉用自由繞線，兩者算出的路徑不同，放在偏好會讓同一份檔案在不同電腦上長得不一樣。
- 預留欄位（方塊 `size`、`style.color`；線路 `routing`、`labelOffset`；`groups`）都是選填、未實作功能；schema 驗證其形狀，`groups[].members` 必須指向存在的方塊。

### 2.2.2 兩種檢視的差異化呈現（3.29b）

目標：讓功能檢視與電源檢視「強調不同的事」，而不只是顯示 / 隱藏標註。

限制：不改存檔格式、不改 schemaVersion、切換仍只改呈現（不記復原）；方塊座標兩種檢視共用。

範圍（3.29b，每項一個 commit）：

- a. **畫布警示**：電源檢視中，下游需求超過額定（>100%）的方塊加紅色標記、≥85% 加銅色標記；上游方塊旁顯示「下游需求 ≈ x / 額定 y」小徽章。用 `functionDesign.decorate` + `power.ts` 的 `load()`，匯出也要有。
- b. **電源線依電壓上色**：重用 `--rail-*` 電壓色帶（`parts.ts` 的 `normRail` / `railBand`），同電壓同色；線的電壓取自 `wire.electrical.voltage`，沒有時取上游方塊的電壓。
- c. **與電源無關的方塊變淡**：沒有 power 類型接腳、也沒接到 power 線的方塊，在電源檢視整塊變淡（共用 render 只加一個 class，透明度用 token）。
- d. **電壓圖例**：電源檢視在畫布角落與匯出中顯示「顏色 ↔ 電壓」圖例（`renderExtras` / `exportExtras`）。
- e. **工具列依檢視切換插入選單**：電源檢視顯示「電源來源 / 轉換器 / 分配 / 負載」預設方塊（design 命令群組），功能檢視維持零件 / 連接器 / 範本。

無障礙：顏色不可是唯一線索（警示要有圖示或文字）、對比通過 `check:tokens`、遵守 `prefers-reduced-motion`。

延後到「V3.0.0 之後的待辦」（`docs/v3-progress.md`）：依電源樹自動排列的衍生版面、電源預算總覽面板、每種檢視各自的座標（需改格式）。

### 2.3 時程

```ts
interface ScheduleData {
  tasks: Task[]; links: Link[]; texts: TextBox[];
  rules: { endpoint: 'start'|'end'; count: 'difference'|'inclusive' };   // 原 scheduleRules
  appearance: ScheduleAppearance;   // 合併 scheduleAppearance / engineeringStyle / savedEngineeringStyle / customStyleActive / scheduleDesign
  snap: { enabled: boolean; range: number };
}
interface Task {
  id: string; title: string; ref: string; note: string; side: 'top'|'bottom';
  time: { type: 'none' } | { type: 'range'; start: string; end: string } | { type: 'deadline'; date: string };
  status: 'todo'|'doing'|'done'; milestone: boolean;
  offset: { card: Point; axis: Point };   // 原 cardDx/cardDy/axisDx/axisDy
  branchColor?: string;
}
interface Link { id: string; from: string; to: string; days: { mode: 'auto' } | { mode: 'manual'; value: number } }
```

刪除：`schedule`、`scheduleGraph`、`graphVersion`、任務的 `ports`、所有版面快取（`x/y/w/h/baseX/baseY/axisX/axisY/axisBaseX/axisBaseY/graphLane/graphDepth`，由版面演算法重算）。

### 2.4 sequence / flowchart
`data` 直接是 vendor 編輯器的文件格式（audit §2.5、§6.1），schema 只驗證外層結構與大小上限，內部由編輯器負責。不再附帶空的 `nodes/edges/junctions`。

### 2.5 `DesignModule` 策略介面

```ts
interface DesignModule<D = unknown> {
  type: DesignType;
  label: I18nKey;                              // 設計類型名稱
  schema: Schema<D>;                           // 該類型 data 的驗證
  create(opts: { template?: string }): D;      // 空白或範本
  templates: { id: string; label: I18nKey }[];

  // 編輯器形式：'canvas' 使用共用的 render / interaction / inspector；'embedded' 交給 vendor iframe
  editor: 'canvas' | 'embedded';

  // 以下僅 editor === 'canvas'
  blockDiagram?: true;                         // 使用共用方塊圖畫布與 router；新方塊 / 線路的預設值依 data.view（3.26c）
  // 方塊圖的檢視相關擴充（decorate / renderExtras / inspectorFields / exportExtras）都收到含 view 的 data，
  // 依 data.view 決定要畫 / 列出什麼；不另設 power 模組
  layout?(data: D): void;                      // 例：時程軸排版（schedule 不使用 router）
  renderExtras?(ctx: RenderContext, data: D): void;          // 徽章、外框、時間軸…
  inspectorFields?(sel: Selection, data: D): FieldSpec[];    // 一次回傳完整欄位描述
  commands?: CommandSpec[];                    // 例：新增任務、插入零件、LCD 範本
  exportExtras?(svg: SvgBuilder, data: D): void;
  arrange?(data: D, opts: ArrangeOptions): ArrangePlan;      // 自動排列策略

  // 以下僅 editor === 'embedded'
  mount?(frame: HTMLIFrameElement, host: EmbeddedHost<D>): EmbeddedApi;  // 提供 afSeqHost / afFlowHost
}

interface ToolModule {
  id: 'bom' | 'edid' | 'hex' | 'pattern';
  label: I18nKey; description: I18nKey; icon: IconName;
  mount(frame: HTMLIFrameElement, host: { lang: Locale; close(): void; toast(text: string): void }): void;
}
```

規則：
- 共用模組只透過 `registry.design(type)` 取得策略；**禁止**在共用模組中判斷特定類型（`if (type === 'schedule')`）。
- `inspectorFields` 必須同步、一次回傳完整欄位（取代現行 microtask / setTimeout 延遲修補，audit §1.4）。
- 新增欄位 → 更新該類型的 `schema` 與 golden；變更既有欄位 → 提高 `schemaVersion` 並在 `io/migrate.ts` 寫 V3.x 遷移。

---

## §3 風險與階段 3 執行順序

### 3.1 風險

| # | 風險 | 影響 | 對策 |
|---|---|---|---|
| R1 | V2 golden 專案是 V2 格式，V3 不能載入 | 階段 2 的 golden 無法直接拿來驗 V3 | 階段 3 開頭寫**只在測試中使用**的 `tests/tools/v2-to-v3.ts`，把 golden 專案轉成 V3 格式；不打包進產品 |
| R2 | SVG 快照在 CSS token 整併後必然有細微差異 | golden 大量失敗、被迫改黃金檔 | 快照比對採「結構比對」：元素種類 / 數量、文字、座標容差 ±0.5 px、顏色依 token 名稱；純視覺差異另以 PNG 截圖人工審查 |
| R3 | 行為散在 167 層覆寫中，容易漏移植 | V3 少功能 | 以 audit §1.4 的逐層表當檢查清單，每個模組完成時逐列勾選「已移植 / 刻意刪除」，寫入 `docs/v3-port-checklist.md` |
| R4 | 時程有 2–5 代互相取代的實作 | 移植到錯誤的一代 | 只以 audit §4.4「實際生效」欄為準；E2E 以 V2.10.1 實際畫面對照 |
| R5 | vendor 編輯器依賴引擎全域（`model.sequence`、`designs`、`activeDesignId`…） | 轉接層漏接導致編輯器空白或存不了檔 | 轉接層只實作 audit §5.2 列出的 host 介面；E2E 2.11 / 2.12 / 2.16 必須先在 V2 上通過，再在 V3 上通過 |
| R6 | 殼層重寫範圍大（app bar、指令面板、屬性面板外框、啟動畫面、Tools 中心） | 時程延長、外觀走樣 | 以 V2.10.1 截圖為驗收基準；用 `ui-ux-pro-max` 檢查無障礙與一致性；殼層分 5 步提交 |
| R7 | 自動整理（RC4）演算法複雜且依賴 RC2 / RC3 計算函式 | 移植量大、易出錯 | `layout/` 最後才移植；先以 `v4Generate` 為入口做呼叫圖，只搬實際用到的函式；golden 鎖定整理結果 |
| R8 | 單檔產物體積（字型 + 4 份 React + 工具） | 開啟變慢 | CI 記錄 `dist/ArchFlow.html` 大小，超過 V2.10.1（12.6 MB）即警告 |
| R9 | 兩語系 252 行寫死字串分散 | i18n 漏翻 | i18n 檢查腳本：所有 key 兩語系皆存在；src 中不得出現中日韓字元（vendor 除外） |
| R10 | 現行 bug（例如 `applicationVersion`、載入錯誤訊息判斷不一致） | 被當成「行為」鎖進 golden | 階段 2 發現的 bug 只記錄不修；階段 3 修正時同步更新 golden 並寫進 `CHANGELOG.md` |

### 3.2 階段 3 執行順序

原則：由下往上（依賴方向的底層先做），每個模組完成即跑該模組測試；可運作的最小產品（能建立功能設計、拉線、存檔、匯出）越早出現越好。

1. **骨架**：Vite + TS + 單檔輸出 + 無外部請求檢查；i18n 框架；design token 骨架；vendor 抽取與 SHA-256 檢查。
2. **測試轉接**：`v2-to-v3` 測試轉換器、結構化 SVG 比對工具。
3. **底層**：`core`（store、history、commands、ids、geometry、camera、grid）→ `model` → `io`（schema、存開檔、migrate 框架）。
4. **繞線**：`router`（find-path、full-path、junctions）——以階段 2 的 router unit test 驗證。
5. **畫面**：`render` → `interaction` → `inspector` 框架 → `export`。
6. **最小殼層**：只有啟動畫面、設計清單、畫布、屬性面板外框，足以操作 function 設計。
7. **設計類型**：`designs/function`（含 3.26c 合併後的電源檢視）→ `designs/schedule` → `designs/sequence` → `designs/flowchart`。
8. **工具**：`tools/bom` → `edid` → `hex` → `pattern`。
9. **自動整理**：`layout/`（autoArrange + RC4 預覽）。
10. **完整殼層**：app bar、命令列、指令面板、快捷鍵、Tools 中心、狀態列、提示。
11. **收尾**：CSS 整併、死碼確認、移植清單全勾、全部測試對 `dist/ArchFlow.html`、版本 V3.0.0。
