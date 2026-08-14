# 把 ConsoleDataTable 搬到別的專案

這份清單是從**實際的 import 掃出來的**，不是憑記憶列的。功能怎麼用看 [README.md](./README.md)，這裡只回答「要帶走什麼」。

---

## 1. 要複製的檔案

### 核心（一定要）

```
src/components/table/
  console-data-table.tsx     主元件
  cell-display.tsx           儲存格顯示、複製文字、title
  cell-editor.tsx            編輯器浮層、select 選項管理
  cell-format.ts             數字／日期的格式化與解析
  tag-colors.ts              標籤調色盤
  aggregate.ts               每組統計：算什麼、什麼時候不准算
  use-client-table-query.ts  client adapter（記憶體、分頁）
  use-progressive-table-query.ts  捲動模式的漸進揭露
  use-chunked-table-query.ts server 分塊載入
```

三個 adapter 挑要用的帶，彼此不相依。

### 可以不帶

| 檔案 | 說明 |
| --- | --- |
| `console-table-demo.tsx` | 展示用。**它是唯一用到 `ui/switch` 的檔案** |
| `*.test.ts(x)` | 行為測試 |
| `*.layout.test.tsx` | 版面測試（需要瀏覽器，見 §5） |
| `README.md` / `PORTING.md` | 文件 |

不帶 demo 就少一個 shadcn 元件要裝。

---

## 2. npm 套件

### 執行時期

| 套件 | 版本 | 為什麼 |
| --- | --- | --- |
| `react` | 19 | — |
| `lucide-react` | — | 圖示 |
| `@base-ui/react` | ≥ 1.7.0 | shadcn（base-nova 風格）的底層；**編輯器也直接用它的 Popover**（見下方註記） |
| `clsx` ＋ `tailwind-merge` | — | `cn()` 用的。若你的專案已有等價的 `cn` 就不必裝 |
| `class-variance-authority` | — | shadcn 元件（`badge`、`button`）用 |
| Tailwind CSS | v4 | 樣式全靠它，**沒有替代方案** |

**沒有用到**：任何表格函式庫、日期函式庫、虛擬捲動、拖曳函式庫。拖曳、範圍選取、捏合手勢全是自己寫的原生指標事件。

**編輯器直接 import `@base-ui/react/popover`**，而不是走 `ui/popover.tsx`。原因是它需要傳 `anchor`（整張表共用一個編輯器、錨在正在編輯的格子上），而 shadcn 的 wrapper 沒有轉發那個 prop。所以 `@base-ui/react` 是硬相依，不能只靠 shadcn 元件。

---

## 3. shadcn/ui 元件

base-nova 風格。缺的用 `npx shadcn add <name>` 補：

```
badge  button  checkbox  dialog  input  label  popover  table
```

| 元件 | 用在哪 |
| --- | --- |
| `table` | 表格骨架（**sticky 表頭的捲動容器有陷阱，見 README 已知注意事項**） |
| `button` | 工具列、分頁、各種控制項 |
| `popover` | 排序／篩選／分組／群組選單 |
| `dialog` | 偏好設定、確認對話框 |
| `checkbox` | 列選取、欄位顯示 |
| `input` `label` | 搜尋、篩選、編輯器 |
| `badge` | `select` 的彩色標籤 |

**額外的兩點，README 舊版寫錯過：**

- **`switch` 只有 demo 需要。** 核心的 boolean 儲存格是一顆自製的 `<button role="switch">`（畫 `✓`／`—`），刻意不用 Switch——它本身就是寫入入口，不需要編輯態。
- **不需要 `select`。** 編輯器的選項清單是自製的，因為要支援在清單內建立／改名／改色／刪除／排序，而 shadcn 的 Select 塞不進那些。

---

## 4. 專案本身要有的東西

### `cn()`

`@/lib/utils` 匯出：

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**`twMerge` 不能省。** 表格靠它蓋掉 shadcn 元件的基底 class——例如標籤在窄欄裡要縮，就是用 `shrink` 蓋掉 Badge 基底的 `shrink-0`。換成純 `clsx` 會兩個都留著，後果是安靜的：class 都在，效果沒有。

### Tailwind 主題變數

表格用的是 shadcn 的標準 token，你的 `globals.css` 要有：

```
--background --foreground --primary --secondary --destructive
--muted --muted-foreground --accent --popover --popover-foreground
--border --input --ring
```

標籤的自訂色另外用 `--tag-color` 與 `color-mix()` 就地混 `--foreground` 產生文字色，不需要你定義任何東西。

### 路徑別名

原始碼用 `@/components/ui/*` 與 `@/lib/utils`。沒有 `@` 別名的話改成相對路徑，或在 `tsconfig.json` 補：

```json
{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }
```

---

## 5. 測試（可選，兩層）

### 行為測試（jsdom，不需要瀏覽器）

複製根目錄的 `vitest.config.mts` 與 `vitest.setup.ts`，然後：

```bash
npm i -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
npx vitest run
```

**`vitest.config.mts` 刻意不用 `@vitejs/plugin-react`**——它會拉進 babel 8，與 shadcn 相依的 babel 7 衝突。Vitest 內建的 esbuild 直接編 TSX 就夠。這也是那份設定沒有抽出共用 base 的原因：複製一個檔案就能跑。

### 版面測試（真瀏覽器，可以不帶）

只在你也要驗「會不會溢出、命中區有多大、對齊在哪一邊」時才需要。jsdom 沒有排版引擎，那些問題它結構上答不出來。

```bash
npm i -D @vitest/browser @vitest/browser-playwright playwright vite
npx playwright install chromium
```

再複製 `vitest.browser.config.mts` 與 `vitest.browser.setup.ts`（後者會 `import "@/app/globals.css"`——**路徑要改成你的**，沒有真的 CSS 這些測試就只是換個地方確認 class 字串存在）。

---

## 6. 搬完的檢查清單

- [ ] `npx tsc --noEmit` 沒有紅字（缺 shadcn 元件會在這裡爆）
- [ ] 畫得出一張最小的表：三欄、`rowKey`、`useClientTableQuery`
- [ ] 排序選單只列出有 `sortValue` 的欄位
- [ ] 有 `editable` 的欄位點得開編輯器，浮層錨在正確的格子上（錨點錯＝`@base-ui/react` 版本不合）
- [ ] `select` 欄位的標籤有顏色（沒有＝主題 token 缺）
- [ ] 拖曳欄寬有反應，表頭捲動時黏得住（黏不住＝捲動容器設錯層，見 README）
- [ ] 讀一遍 README 的**已知注意事項**——那裡列的每一條都是踩過的

---

## 7. 不會跟著過去的東西

- **持久化只到 localStorage。** 要存到後端請用 `onPreferencesChange` 自己接。
- **表格不擁有任何 modal、不發任何請求、不 mutate `rows`。** 所有寫入都是回報給使用端，畫面只跟著你餵回來的資料走。這是刻意的，也是它能被複製的原因。
- **沒有虛擬捲動。** 資料量大請走 server adapter，不要把幾萬筆餵給 client adapter。
