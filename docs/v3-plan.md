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
    function/             功能方塊：零件庫、符號、外框、連接器、LCD 範本
    power/                電源架構：角色、量測、需求 vs 額定
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
- function 與 power 共用「方塊圖」能力（方塊、接腳、繞線），差異（角色、量測、電源接腳預設）由各自的策略提供；共用部分放在 `render` / `router` / `inspector`，不放在任一 design 中，以免互相 import。
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
| L349–351、L366、L3794 電源 | `designs/power` |
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
  | DesignOf<'function', BlockDiagram>
  | DesignOf<'power', BlockDiagram>
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

### 2.2 方塊圖（function / power）

```ts
interface BlockDiagram {
  blocks: Block[];  wires: Wire[];  junctions: Junction[];
  texts: TextBox[]; frames: Frame[];           // frames 只在 function 使用
  theme: Theme;                                // 字型、字級
  grid: { size: number; show: boolean; snap: boolean };
  portLabels: 'inside' | 'outside' | 'hidden'; // 原 afPinLabels
  wireDefaults?: LineFormat; wirePresets: LineFormat[];
  presentationClean: boolean;                  // 原 afPresentation==='clean'
}

interface Block {
  id: string; x: number; y: number; w: number; h: number;
  title: string; subtitle: string; partNumber: string; ref: string;
  ports: Port[];
  style: BlockStyle;              // 原 appearance；刪除舊 color
  titleAlign: TitleAlign;         // 原 afLayout（9 宮格）
  font?: { subtitle?: number; label?: number; metric?: number };  // 原 afFont
  sizing: 'auto' | 'free';        // 原 afFree
  showTitle: boolean;             // 原 afNoName 取反
  locked: boolean;                // 原 afLocked
  role?: string;                  // power：source / converter / distribution / load
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
  route?: Point[];                // 合併 manual + afRouteOnly
  locked: boolean;                // 合併 afGridLocked / afLocked / locked
  electrical?: { voltage?: string; current?: string; unit?: 'A'|'mA'|'uA'; show: boolean };
  label?: { size?: number; preset?: string; mark?: { x: number; y: number; angle: number } }; // afLabelSize/afLabelPreset/afLabelMark
}
```

刪除（audit §2.1–2.3、§4.5）：`heading`、`afNeedsPortAlignment`、`afUnifiedLabel`、`afCleanRoute`、`afGridOffset`（衍生）、`ioConfig`（待階段 2 確認可衍生）、`review`、`note` / `showNote`、舊 `color`。

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
