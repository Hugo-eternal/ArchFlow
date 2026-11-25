# ArchFlow

離線架構設計工作台（單一 HTML 檔）。

| 檔案 | 用途 |
|---|---|
| `index.html` | 發佈檔，直接用瀏覽器開啟。內含兩份 App（base64） |
| `legacy/app.zh-Hant.html`, `legacy/app.en.html` | 解碼後的可讀原始碼（繁中 / English 各一份） |
| `tools/unpack.mjs`, `tools/pack.mjs` | `index.html` ↔ `legacy/` 互轉 |
| `docs/code-map.html` | 程式架構地圖：各功能在哪一行、要改 X 去哪裡 |
| `docs/code-map.data.json` | 地圖資料（更新後重新產生 HTML） |

## 修改流程

1. 打開 `docs/code-map.html`，在「快速查找表」找到要改的位置。
2. 修改 `legacy/app.zh-Hant.html` **與** `legacy/app.en.html`（兩個語系都要改）。
3. 重新打包：

```bash
node tools/pack.mjs
```

若只拿到新的 `index.html`，先執行 `node tools/unpack.mjs` 更新 `legacy/`。
