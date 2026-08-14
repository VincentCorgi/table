# ConsoleDataTable

AWS Console 風格的資料表格元件。**受控設計**：表格只負責渲染與回報使用者操作，排序／篩選／分頁的資料運算在外層進行——中小資料用內附的 client adapter 在瀏覽器算，大資料把查詢狀態轉成 API 參數由後端算，表格本身不用改。

## 測試

兩套，分工不同：

- **`npm test`**（jsdom）——行為。快、不需要瀏覽器，複製這個資料夾到別的專案時只要 `vitest.config.mts` 一個檔案。
- **`npm run test:layout`**（真瀏覽器，`*.layout.test.tsx`）——版面。會不會溢出、命中區有多大、對齊在哪一邊。jsdom 沒有排版引擎，這些問題它答不出來，斷言只能退化成「class 在不在」——而那擋不住「class 都在但被別的宣告蓋掉」。

**想只拿行為測試的話，不必裝 Playwright。** 那是分成兩份設定的原因。

## 檔案

| 檔案 | 用途 |
| --- | --- |
| `console-data-table.tsx` | 表格元件本體與所有型別 |
| `cell-display.tsx` | 儲存格的預設顯示（含空值、未知值、標籤顏色） |
| `cell-editor.tsx` | 浮出的儲存格編輯器 |
| `cell-format.ts` | 數字與日期的格式化／解析（固定語系） |
| `tag-colors.ts` | 標籤調色盤與顏色判別 |
| `use-client-table-query.ts` | client adapter：全量在記憶體、一次切一頁（分頁模式） |
| `use-progressive-table-query.ts` | client adapter：全量在記憶體、分批揭露（捲動模式） |
| `use-chunked-table-query.ts` | server adapter：分塊向後端取、捲到底追加（含契約型別） |
| `console-data-table.test.tsx` | 元件測試（Vitest + Testing Library） |
| `console-table-demo.tsx` | 完整用法示範（本專案 `/tables` 頁） |

## 功能

排序（工具列選單、升／降冪、隱性預設排序、tie-break、**手動拖曳排序**）、全域搜尋、Notion 式欄位篩選＋chips、**單層列分組**（Notion 形狀）與**單層子項目**（皆限捲動模式，可一鍵全部展開／收合）、列選取（含跨頁全選）、**Excel 式的儲存格範圍選取與複製／刪除／剪下／貼上／復原**、**逐欄 opt-in 的儲存格 inline 編輯**（五種型別，`select` 選項可在表格內建立／改名／改色／刪除／排序）、宣告式工具列動作、分頁（« ‹ › »）、欄寬拖曳（AWS 行為）、sticky 表頭、偏好設定（每頁筆數／自動換行／顯示欄位**與順序**，草稿制）、欄寬與偏好的 localStorage 持久化、loading skeleton。

## 快速開始（client-side）

```tsx
"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  ConsoleDataTable,
  createDefaultTableQuery,
  type ConsoleTableColumn,
} from "@/components/table/console-data-table";
import { useClientTableQuery } from "@/components/table/use-client-table-query";

type Item = { id: string; name: string; status: string; qty: number };

const COLUMNS: ConsoleTableColumn<Item>[] = [
  {
    id: "name",
    header: "名稱",
    cell: (row) => row.name,
    sortValue: (row) => row.name,   // 給了才可排序
    filterValue: (row) => row.name, // 給了才可篩選＋被搜尋
    copyValue: (row) => row.name,   // 自訂 cell 的欄位要給才複製得出文字
  },
  {
    id: "qty",
    header: "數量",
    align: "right",
    cell: (row) => row.qty,
    sortValue: (row) => row.qty,
  },
];

const rowKey = (row: Item) => row.id;

export function ItemTable({ data }: { data: Item[] }) {
  const [query, setQuery] = useState(() => createDefaultTableQuery());
  // adapter 回傳 rows / totalCount / filterOptions / allFilteredKeys，
  // 分組生效時另含 groupValues / groupCounts——整包展開給表格即可
  const tableData = useClientTableQuery(data, query, COLUMNS, rowKey);

  return (
    <ConsoleDataTable
      title="項目"
      columns={COLUMNS}
      {...tableData}
      query={query}
      onQueryChange={setQuery}
      rowKey={rowKey}
      storageKey="items" // 選填：欄寬與偏好設定存 localStorage
    />
  );
}
```

## Server-side（大資料）

資料量大（單一清單約兩千筆以上）或需要即時性時，把 adapter 換成 API 查詢，表格一行不用改：

```tsx
const [query, setQuery] = useState(() => createDefaultTableQuery());
// TableQuery 可直接 JSON 序列化成 API 參數
const { data, isLoading } = useQuery(["items", query], () => fetchItems(query));

<ConsoleDataTable
  rows={data?.rows ?? []}
  totalCount={data?.totalCount ?? 0}
  loading={isLoading}
  query={query}
  onQueryChange={setQuery}
  filterOptions={data?.filterOptions}  // 由後端 distinct 或設定檔提供
  // allFilteredKeys 給不出來就省略——跨頁全選自動退為僅本頁全選
  ...
/>
```

後端對應：`search` → LIKE／全文檢索、`filters` → WHERE IN、`sort` → ORDER BY、`groupBy` → 放在 ORDER BY 最前面（見下節）、`pageIndex`/`pageSize` → LIMIT OFFSET，並回傳 `totalCount`。搜尋建議在外層加 debounce（~300ms）再發 API。

## 分組（`groupBy`）

工具列的分組鈕依欄位把列分段呈現，**只有一層**——`query.groupBy` 是 `string | null`，不是陣列。

**分組只在 `pagination="scroll"` 生效。** 分頁是純以列數切片，而分組要求同組的列相鄰，在頁界必然斷開。分頁模式下分組鈕不渲染、群組區塊不出現，但 `query.groupBy` 不會被清掉——切回捲動模式就恢復。

### 每一組是一個小表格

```
▸ A棟 3F-1（6 筆）
  戶別  區域  缺失  狀態          ← 該組自己的欄名列
  …列…
  ＋ 新增                          ← 該組自己的結尾動作
```

- **群組標題**：`▸ 值（N）`，N 是該組在**篩選後全資料**的列數。單位不寫——一列是什麼由這張表在講什麼決定。三角形與子項目共用同一顆實心三角，點擊收合／展開整組。空值歸入「（未設定）」並排在最後。
- **每組自帶欄名列**，因此**分組生效時不渲染頂端的共用 sticky 表頭**——兩者並存會有兩層意義相同的標題，捲動時還會疊在一起。未分組時共用表頭照舊。
- **把手的命中區跨在分隔線上**（線左 12px、線右 4px，上下各多 4px，`RESIZE_HANDLE_CLASS`）。看得見的只有 0.5px 的線，能按的範圍要大得多，而且不能只鋪在線左邊——瞄準線本身或線右邊一兩 px 就落到下一格。越界靠 `z-20`：欄名格是 `relative` 但沒有 z-index，不開新的堆疊環境，正 z-index 才蓋得過 DOM 順序在後的下一格。
- **每組的欄名列都能拖欄寬**：改的仍是全表共用的那一份偏好（拖任何一組，所有組一起變），但捲到哪一組就在哪一組調——只掛在第一組的話，捲到下面的組得先捲回去才調得到，而且沒拖準只會反白選字。欄名列本身 `select-none`。
- **可分組的欄位**＝有 `filterValue` 的欄位（分組值就是篩選值，群組標題與 filter chip 的字串一致）。
- **chip 一顆**，X 即清除分組；**「清除篩選」不會清掉分組**。
- **一次收合／展開全部**：工具列有一顆狀態切換按鈕（還有東西收著就是「全部展開」，全開了才變「全部收合」）。它作用在**當下有巢狀的一切**——分組生效就管群組，有子項目就管子項目，兩者都在就都管。沒有巢狀時不渲染。`Alt`／`Option` ＋ 點任何一個三角形也等同套用到全部。
- **收合狀態隨 `storageKey` 進 localStorage**，與子項目的揭露狀態**分開存**（群組的鍵是欄位值、子項目的鍵是 rowKey，共用一張表會撞名）。
- **排序互動**：分組鍵永遠排在最前面，所以排序其他欄只改變「組內」順序；排序分組欄本身則是切換群組的升／降冪。

### 每組各自載入

分組生效且使用漸進揭露 adapter 時，**每一組有自己的揭露窗**：載入更多出現在每組結尾，只延伸那一組，其他組不動。收合的組不渲染載入更多，也不會被捲動觸發。

```tsx
const { hasMore, loadMore, ...tableData } =
  useProgressiveTableQuery(data, query, COLUMNS, rowKey);

<ConsoleDataTable
  {...tableData}            // 已含 groupValues / groupCounts / groupHasMore
  pagination="scroll"
  hasMore={hasMore}
  onLoadMore={loadMore}     // 收到該組的值；未分組時無參數
  onAddRowToGroup={(groupValue) => openCreateDialog(groupValue)}
/>
```

`onAddRowToGroup(groupValue)` 有給才會在每組結尾顯示新增入口；「未設定」組回報 `null`。表格只回報，不自行新增任何列。

Server 模式要支援分組時，後端把 `groupBy` 放進 `ORDER BY` 最前面，並回傳與 rows 平行的 `groupValues`；`groupCounts` 給不出來就省略——標題會只顯示標籤而不顯示錯的數字。

### 群組選單（`⋯`）

每個群組標題 hover 時右邊出現 `⋯`。它是**表格自己的選單**，組成順序固定：

```
隱藏此群組          ← 表格內建
（你宣告的 groupActions）
（renderGroupActions 的自由內容）
──────────────────  ← destructive 之前加分隔線
刪除這一組          ← 你宣告的 destructive 項目
```

**隱藏此群組**是內建的，不必宣告。它把整組（含標題）從畫面移除——與收合不同，收合還看得到標題。

- **隱藏 ≠ 篩掉**：`totalCount` **不會**跟著變。隱藏是「我不想看」，不是「這些不算」；數字跟著畫面設定浮動就不能拿來對帳。
- **有回頭路**：隱藏的組列在分組選單裡，可逐一或全部恢復；有隱藏時分組鈕會顯示數量，否則沒人知道自己藏過東西。
- **恢復後回到原本的收合狀態**（兩份狀態分開存）。
- 隨 `storageKey` 持久化。

```tsx
<ConsoleDataTable
  groupActions={[
    {
      id: "delete-group",
      label: "刪除這一組",
      icon: Trash2,
      intent: "destructive",              // 轉紅，並排在分隔線之後
      confirm: {                          // 有給才跳確認；文案你寫
        title: "刪除這一組的缺失記錄？",
        description: "不可復原",
        confirmLabel: "刪除",
      },
      // groupValue 是該組的值；loadedKeys 只是「目前已載入」的那些
      onSelect: (groupValue, loadedKeys) => deleteByGroup(groupValue),
    },
  ]}
/>
```

- **表格不執行任何動作**，只回報——它不刪資料，這條原則從 `onCellCommit` 一路貫穿到 `onRowReorder`。
- **要對整組動作請用 `groupValue`**：表格只握有已載入的列，說不出「這一組全部」是哪些。`loadedKeys` 只給不需要後端的簡單情境用。同 `onRowReorder` 回報鄰居而不是全域順序。
- **確認文案由你提供**：表格不知道這個動作對你的資料是什麼意思，寫死「確定要刪除嗎」在動作其實是別的事時就是在說謊。
- `renderGroupActions` 仍在，接在宣告式項目之後，給宣告式裝不下的內容。**它的位置變了**：原本直接渲染在群組標題上，現在在 `⋯` 選單裡——傳入的內容請寫成選單項目的形狀（整行、有文字），原本為「標題上的小圖示」設計的樣式在選單裡會顯得突兀。

## 子項目（`subRowOf`）

一層父子關係。有宣告 `subRowOf` 才有這個能力，沒宣告的表格行為完全不變。

```tsx
type Defect = { id: string; issue: string; parent: string | null };

const subRowOf = (row: Defect) => row.parent; // 回傳父列 key，null＝自己是父列

const tableData = useClientTableQuery(rows, query, COLUMNS, rowKey, subRowOf);

<ConsoleDataTable {...tableData} pagination="scroll" subRowOf={subRowOf} ... />
```

- **資料維持平坦**：子列就是 `rows` 裡的一筆，只是用 `subRowOf` 指回父列。表格不增減任何列，`rowKey`、選取、`allFilteredKeys` 的語意都不變，server 與分塊模式的契約也不用改。
- **只有一層**：資料若疊了兩層，孫列會掛到最上層祖先，不會產生第二層。
- **只在 `pagination="scroll"` 生效**：分頁以列數切片，父列與子列在頁界必然拆散，而父列是真資料、不能像群組標題那樣在下一頁重畫。分頁模式下完全平坦（無縮排、無數量、不套父列優先排序）。

### 排序：子項目跟隨父項目

排序鍵是「父列的值 → 是不是子列 → 自己的值」，所以：

- 父列之間依排序值重排，各自帶著自己的子列
- 同一個父列底下，子列依排序值重排
- **子列的值再大，也不會排到別的父列前面**

這是分層唯一自洽的排序語意，但第一次看到很容易誤以為排序壞了。

### 收合與新增子項目

父列前方有一個揭露三角形，**同一個位置依有無子項目切換角色**：

| 列的狀態 | 三角形 | 預設 | 展開後 |
| --- | --- | --- | --- |
| 已有子項目 | **常駐顯示** | 展開 | 子項目 ＋「＋ 新增子項目」 |
| 沒有子項目 | **hover 才出現**（要有給 `onAddSubRow`） | 收合 | 只有「＋ 新增子項目」 |

「＋ 新增子項目」是展開後接在最後一個子項目之後的一列，不是三角形本身——三角形永遠只做展開／收合。

```tsx
<ConsoleDataTable
  subRowOf={subRowOf}
  onAddSubRow={(parentRow) => openCreateDialog(parentRow)} // 有給才有 hover 入口
/>
```

- **表格只回報**：`onAddSubRow(parentRow)` 只是「使用者想在這一列底下加一個」，實際怎麼建（開 modal、發 API、直接插一列）由使用端決定。沒給這個回呼時，沒有子項目的列連三角形都沒有，有子項目的父列仍可收合。
- **預設值由有無子項目決定**：有子項目＝展開（與加入這個功能之前的畫面一致），沒有＝收合（否則每一列底下都會掛一條「新增子項目」，非常吵）。只有使用者實際點過的列才會存進偏好。
- **展開／收合隨 `storageKey` 進 localStorage**，重新整理後記得；沒給 `storageKey` 就只存在記憶體。存檔裡已不存在的 key 直接忽略。
- **一次收合／展開全部**：見〈分組〉那節的說明，同一顆按鈕與 `Alt` 快捷鍵一併作用在子項目上。
- **篩選命中被收合的子列時會強制展開**該父列，否則搜到的東西會藏在收合底下。這是暫時覆寫，清掉篩選就回到你原本收合的樣子。
- **收合會關閉開啟中的儲存格編輯器**並丟棄草稿，理由同換頁：那一列可能不在畫面上了。
- **收合不改變任何列的選取狀態**。

### 其他規則

- **選取不連動**：勾父列不會連帶勾子列，反之亦然。連動要處理半選狀態與「父列被篩掉但子列還在」的計數，複雜度遠高於它省下的那一次點擊。
- **子列可編輯**，與父列一視同仁。
- **拖到別的項目底下會改變從屬關係**，拖父項目時子項目跟著走——那不只是換順序，使用端收到的 `parentKey` 就是這個意思。
- **子列不依自身值分組**，一律取父列的分組值，否則會被抽離父列。
- **篩選命中子列時保留父列**，並以降低對比標示它是「為了脈絡而保留」（`data-retained="true"`）；反向不成立——父列命中不會把它沒命中的子列帶回來。adapter 透過 `retainedParentKeys` 告訴表格哪些是這種父列。

## 列選取的範圍

選取有三個層級，各有自己的控制項：

| 範圍 | 控制項 | 位置 |
| --- | --- | --- |
| 一列 | checkbox | 該列前導欄 |
| 一組 | checkbox | 該組**欄名列**的前導格（那是這一組的表頭；常駐，不是 hover 才出現） |
| 全部 | checkbox | 共用表頭（未分組）或工具列（分組時） |

**任一時刻只有一個「全部」的入口**：分組時共用表頭不畫，那顆就補在工具列；未分組時表頭那顆已經在做同樣的事。兩顆都宣稱「全選」只會讓人分不清誰的範圍比較大。

全部三個都是**三態**：全選／部分（未定）／未選。點未定會補滿，點全選才取消。

兩個「全部」的範圍走**同一條規則**：adapter 說得出就是全部，說不出就退為已載入的，而且不假裝。

- **「全部」看 `allFilteredKeys`**（篩選後全部，含未載入）。給不出來時退為「已載入的全部」，跨頁全選的提示列也不顯示。
- **群組 checkbox 看 `allFilteredKeysByGroup`**（該組全部，含未載入）。記憶體型的兩個 adapter 直接給——算每組筆數時本來就把全量走過一遍了。給不出來時（server 分塊模式的常態）只涵蓋已載入的列，而且某組顯示「30 筆」卻只載入 10 筆時，那 10 筆全勾**仍顯示為未定**——寧可顯示未定，也不要假裝選到了全部。
- **隱藏的群組自動被排除** —— 全選作用在同一份 key 上，不必另寫規則。群組那顆不必處理：被隱藏的組畫不出來，也就沒有 checkbox 可勾。
- **選取跨頁保留**：選的是 rowKey，不是畫面上的位置。

## 呈現模式與資料載入

表格有兩種呈現模式，由 `pagination` prop 決定。**需要「看到全貌」的功能（分組、子項目、手動拖曳排序）只在捲動模式可用**，這是兩種模式之間唯一的功能差異——兩者都要求相關的列相鄰，而分頁純以列數切片；其餘（排序、篩選、選取、欄寬、偏好設定）完全共用，query 也相同。

| | `"paged"`（預設） | `"scroll"` |
| --- | --- | --- |
| 分頁器 | 有 | 無（改為列表末端「載入更多」） |
| 跨頁全選提示 | 有 | 無（表頭 checkbox 即全選） |
| **分組** | **無** | 有 |
| **子項目** | **無** | 有 |
| **手動拖曳排序** | **無** | 有 |
| 偏好設定筆數 | 每頁筆數 | 每批載入筆數 |
| 適合 | 查資料、對照 | 邊看邊做（任務分派、勾稽） |

> 兩種模式都可以編輯——上面的差異只關乎「看得到多少」。要讓某一版不能改，用 `readOnly`（demo 的分頁版就是這樣設的）。
>
> **格線**：橫線（把一筆一筆分開）兩種模式都有；直線（把欄位框成格子，Notion 表格檢視的樣子）只有捲動模式有。

搭配的 adapter 有三支，依「資料在哪裡」選：

| Adapter | 資料位置 | 解決什麼 | 用在 |
| --- | --- | --- | --- |
| `useClientTableQuery` | 記憶體 | — | 分頁模式 |
| `useProgressiveTableQuery` | 記憶體 | DOM 成本 | 捲動模式、幾千筆內 |
| `useChunkedTableQuery` | 後端 | 傳輸＋記憶體 | 捲動模式、大資料 |

```tsx
// 捲動模式（資料全在手，分批揭露）
const { hasMore, loadMore, ...tableData } =
  useProgressiveTableQuery(data, query, COLUMNS, rowKey);

<ConsoleDataTable
  {...tableData}
  query={query} onQueryChange={setQuery} rowKey={rowKey}
  pagination="scroll"
  hasMore={hasMore}
  onLoadMore={loadMore}
/>
```

### 分塊載入契約（server 模式）

`useChunkedTableQuery(query, fetchPage, columns?)` 由你提供 `fetchPage`：

```ts
fetchPage({ query, cursor, signal }) → {
  rows;                      // 必填
  cursor?;                   // 下一塊的游標；null／缺席＝沒有更多
  totalCount?;               // 缺席→標題不顯示總數
  groupCounts?;              // 缺席→群組標題省略「（N）」
  filterOptions?;            // 缺席的欄位不出現在篩選選單
  allFilteredKeys?;          // 幾乎必然缺席→全選僅限已載入列
  groupValues?;              // 通常免給，見下
}
```

- **游標是不透明字串**——後端要用 offset 或 keyset 都行，前端不解讀。
- **有子項目時，後端必須讓父子相鄰且父列在前**：表格不重排收到的列，分塊邊界也只會切在列與列之間（取的永遠是前綴，所以子列不會先於父列出現）。
- **只有 `rows` 是必填**。其餘中繼資料給得出來就給，缺席時表格各自降級(不顯示錯的數字)，後端不必一次到位。
- **分組值免回傳**：把 `columns` 傳給 hook，adapter 會用欄位的 `filterValue` 從列推導 `groupValues`——後端只要照 `query.groupBy` 正確 `ORDER BY` 即可。只有「後端的分組值與欄位值不同」時才需要自己回 `groupValues`。
- **排序／篩選／分組必然在後端**：手上只有第一塊時前端無從排起，所以 query 一變動 adapter 就丟棄累積列、自第一塊重取(並 abort 進行中的請求)。
- 後端對應：`search` → LIKE／全文檢索、`filters` → WHERE IN、`groupBy` ＋ `sort` → ORDER BY(分組欄在前)、`pageSize` → LIMIT、`cursor` → OFFSET／keyset。搜尋建議在外層 debounce(~300ms)。

### 尚未支援

- **虛擬渲染**：分塊載入已處理主要成本，而虛擬渲染需要固定列高，與「自動換行」偏好和多層群組標題衝突。真的量測到捲動卡頓再評估。
- **條件式選取**：分塊模式下「選取全部符合條件」需要送查詢條件而非 id 陣列，屬後端議題，目前維持「僅選已載入列」的降級。

## 欄位順序與顯示偏好

齒輪的偏好設定對話框裡，「顯示欄位與順序」清單同時管兩件事：每列的勾選框控制顯示與否、上移／下移控制欄位由左至右的順序。與其他偏好一樣採草稿制——按「確認」才套用，「取消」或關閉丟棄。

- **順序是顯示偏好、不是查詢狀態**：存在元件內部並隨 `storageKey` 進 localStorage，**不進 `TableQuery`**，所以 server adapter 完全不受影響，重排也不會觸發重新查詢。
- **隱藏的欄位仍留在清單中**（只是沒勾），這樣「隱藏後再顯示」會回到原本位置，而不是被擠到最後。
- **對 `columns` 變動有韌性**：使用端後來新增的欄位補在順序最後、存檔中已不存在的欄位 id 自動忽略、沒有存檔時就照 `columns` 原順序——不需要任何遷移。
- **欄寬跟著欄位走**（`columnWidths` 以欄位 id 為 key），前導欄固定最左，不參與排序。
- **前導欄的寬度看裡面有幾格**：只有勾選框 40px、加上拖曳握把或揭露三角形 64px、三格都有 80px（`LEADING_COLUMN_WIDTHS`，class 與數字綁在一起）。拖過欄寬之後表格是 `table-fixed`，寬度改由 `colgroup` 決定，兩邊各寫各的就會把這一欄壓成最窄的那個值。

目前只提供偏好設定內排序；拖曳表頭調整順序、欄位鎖定（pinning）尚未支援。

## 每組統計（分組時）

分組之後，偏好設定裡每一欄多一個下拉：**無／筆數／總和**。選了就在該組結尾多一列，把值放在對應的欄底下。沒分組時不問——選了看不到結果的設定比沒有這個設定更難理解。

**只有在算得出整組答案時才顯示數字。** 一組兩百筆只揭露二十筆時，那二十筆的和看起來就是一個總數、會被當成總數用，而畫面上沒有任何東西會跟它牴觸——使用者是從他拿這個數字去做的事情上才發現錯的。所以載不齊時顯示「不可用」，不顯示會被當真的數字。想要真正的答案就用 `groupAggregates` 由後端供應，優先於一切。

### 「總和」的資格：取不取得到數字

```tsx
{
  id: "spentLogs",
  header: "實際工時",
  cell: (row) => `${totalHours(row.spentLogs)}h`,
  // 給了就加得起來——與這一欄有沒有 editable、是什麼型別都無關
  aggregateValue: (row) => totalHours(row.spentLogs),
  // 儲存格寫「12h」，總和也要寫「25.5h」，不然讀起來像另一種量
  formatAggregate: (total) => `${total}h`,
}
```

沿用一路的能力宣告制：

| 宣告 | 換來的能力 |
| --- | --- |
| `sortValue` | 可排序 |
| `filterValue` | 可篩選、可分組 |
| `searchValue` | 搜尋 | 只影響搜尋，**不會產生篩選選單**。沒給時退回 `filterValue` → `sortValue`。每一列都不一樣的欄位（摘要、名稱、IP）要的是這個 |
| `dateFilterValue` | 日期區間篩選 | 給 `YYYY-MM-DD`。控制項是相對區間（逾期／今天／本週／本月／未來）＋自訂起訖，**不是**一份每天一個選項的清單。相對區間存成 `bucket:<id>`，每次讀取重新對時鐘解析——存下來的「今天」隔天仍然是那天的今天 |
| `filterValues` | 多值篩選 | 一列同時屬於多個值時用（參與者、標籤）。選了幾個就是「至少符合其中一個」。**不能拿來分組**——一列屬於多個組的話，各組筆數加起來會超過總筆數 |
| `footer` | 這一欄的群組結尾 | 有給就用它，內建的 COUNT／SUM 讓位。第二個參數 `{ complete }` 是必須一起交出去的判斷——自訂的沒有內建統計那層「揭露不完整就顯示破折號」的保護 |
| `groupValue` | 分組 | 分組時這一欄的值，當它跟篩選的值不一樣的時候。沒給就用 `filterValue`。與 `searchValue` 同一個道理：篩選、搜尋、分組是三件事，只是大部分時候用同一個值。值仍然是字串，表格不解讀它 |
| `identity` | 這一列的身分 | 「開啟」浮在它右緣。沒宣告時退回第一個看得見的欄位——那是猜的，而釘選的星號、勾選框、編號欄都常常排在名稱前面 |

`selectedKeys` / `onSelectedKeysChange`（表格層級）：選取交給使用端。選取常常不只是這張表的事——批次操作的按鈕可能在表格外面，或者換一個分頁之後選取要留著。

`isRowSelectable`（表格層級）：這一列能不能被選。給合成列用的——借來當脈絡的父列、「＋ 新增」列不是資料，勾起來對批次操作沒有意義。不能選的列**也不算在「本頁全部」裡**，否則表頭的勾選框永遠是半選。

`collapsedGroups` / `onCollapsedGroupsChange`（表格層級）：收合狀態交給使用端。理由是「收合什麼」有時候不是一組一組的事——使用端可能想讓一次點擊收掉好幾組。表格自己不做那種判斷，但也不擋著。與 `query`、`preferences` 同一個安排：狀態的主人要說得清楚。

`renderGroupLabel`（表格層級）：群組標題上顯示什麼。表格知道這一組是哪一組，不知道那個值對使用端**讀起來**是什麼。無障礙名稱仍然用原始字串——它要穩定可預期，不能跟著一段任意的 JSX 走。

`canDrop`（表格層級）：這個落點放不放得下。結構上不可能的（父列卡進別人的子列中間、子列掉到頂層）表格自己就擋掉了，這裡問的是使用端才知道的規則。**擋掉的落點連插入線都不畫**——看得到線卻放不下去比線畫不出來難懂得多。

`rowClassName`（表格層級，不是欄位）：整列的狀態性強調——已取消畫刪除線、已過去淡出。**只給樣式，不給行為**，排序、篩選、選取都不看它。逐格抄同一個判斷才是會走樣的做法。
| `copyValue` | 複製得出文字 |
| `editable` | 可編輯 |
| **`aggregateValue`** | **可加總** |

- **加不加得起來是關於值的問題，不是關於型別的問題。** 一欄存著 `{date, hours}[]` 的逐日紀錄算得出累積時數，而它的型別說不出這件事；一欄純顯示、連 `editable` 都沒有，也可能有總和。
- 內建 `type: "number"` 的欄位不必宣告，行為完全不變（總和沿用該欄的千分位與小數位）。
- **設定用中文、顯示用原文**：下拉是「筆數／總和」，統計列上寫的是 `COUNT` / `SUM`。設定是在選「我要什麼」，那是一段中文介面裡的一個選項；統計列是密集的資料列，短的原文讀起來是函式名。兩套說法是刻意的，不要合成一份。
- **回傳 `null` 代表這一列沒有貢獻，不是 0。** 對加法而言結果一樣，但下一個統計（平均、最小）就不同了。
- **`formatAggregate` 只在有 `aggregateValue` 時有意義**，因為那種欄位沒有內建呈現可借。宣告了值就要負責讓總和讀起來跟這一欄是同一種量。對齊不開放——那是版面問題不是語意問題。
- 小數相加的浮點痕跡會被收掉（`0.1 + 0.2` 顯示成 `0.3`）。
- 目前只有分組時提供，沒有整張表的總計——那要問的是「整張表載完了沒」，是另一個問題。

## 工具列動作（`actions`）

宣告式設定，樣式與規則由表格統一處理；**表格不擁有任何 modal**，行為交給使用端：

```tsx
actions={[
  {
    id: "delete",
    label: "刪除",
    icon: Trash2,
    intent: "destructive",      // 可按時轉紅
    needsSelection: true,       // 沒選取就停用
    onClick: (selectedKeys) => openDeleteConfirm(selectedKeys), // 收 key
  },
  { id: "import", label: "匯入", icon: Upload, onClick: openImportModal },
  { id: "create", label: "新增", icon: Plus, intent: "primary", href: "/items/new" },
]}
```

- `intent`：`primary` 填色＋sm 以上顯示文字（以下縮成 icon）；`destructive` outline 可按時轉紅；預設 outline icon。
- `hidden: boolean`——feature flag／權限開關，true 時整顆不渲染。
- `href` 跳轉（純 `<a>`，不綁路由框架）或 `onClick(selectedKeys)` 由使用端接手（開自家 modal、發 API）。
- `extraActions?: ReactNode`——逃生口，宣告式裝不下的客製內容（下拉選單等）原樣渲染在動作列尾端。

## 進詳細頁

表格**沒有**列點擊或每列操作欄的 API。進詳細頁的做法是讓主欄位的 `cell` 自己渲染連結——`cell` 回傳 `ReactNode`，要用 `next/link` 或原生 `<a>` 由使用端決定：

```tsx
{
  id: "unit",
  header: "戶別",
  cell: (row) => <Link href={`/defects/${row.id}`} className="text-primary hover:underline">{row.unit}</Link>,
  sortValue: (row) => row.unit,
}
```

這是 AWS console 的慣例（第一欄即詳細頁連結），刻意不做成 `onRowClick`／`rowHref`：列上已經有勾選框與欄寬拖曳把手，整列可點會與這些手勢打架；導覽責任放在使用端也讓表格維持不綁路由框架。針對整批資料的操作走工具列 `actions`（勾選後啟用）。

### `onOpenRow`：hover 才出現的「開啟」（捲動模式）

捲動模式下另有一個入口，形狀比照 Notion 的 side peek：

```tsx
<ConsoleDataTable pagination="scroll" onOpenRow={(row) => openSidePanel(row.id)} />
```

有給才長出來——**第一個可見欄位**的儲存格右緣，hover 該列（或鍵盤 focus）才顯示，浮在內容上方。第一欄是「這一列是什麼」的那一欄，Notion 的標題屬性也在那裡；調整欄位順序時它跟著跑到新的第一欄。

一顆按鈕而不是整列可點的理由同上，而且**單擊可編輯的儲存格現在會開編輯器**，靠右的把手正好把「看這一列」與「改這一格」分成兩個不重疊的命中區。按鈕會擋掉自己的 `mousedown` 與 `click`，不會順手選取儲存格或開編輯器。

表格只回報，開什麼、怎麼開由使用端決定；與第一欄自己放 `<Link>` 可以並存。分頁模式不提供，維持既有慣例。**觸控裝置沒有 hover**，那類情境請另外提供入口。

## 儲存格編輯（`editable`）

欄位宣告 `editable` 才可編輯，沒宣告的欄位行為完全不變——比照「有 `sortValue` 才有排序鈕」的能力宣告制。宣告了型別但沒給 `cell` 時，型別提供預設顯示；兩個都給時**顯示走 `cell`，型別只管編輯**。

```tsx
{
  id: "status",
  header: "狀態",
  sortValue: (row) => row.status,
  editable: {
    type: "select",
    getValue: (row) => row.status,          // 必填：cell 是單向投影，取值要另外給
    disabled: (row) => row.closed,          // 選填：逐列開關
    options: [
      { value: "待修繕", color: "destructive" },
      { value: "已修繕", color: "secondary" },
      { value: "複驗通過", color: "#16a34a" },
    ],
  },
}
```

### 五種型別

| `type` | 預設顯示 | 編輯器 | 型別專屬選項 |
| --- | --- | --- | --- |
| `text` | 原樣 | 單行輸入框 | — |
| `number` | 右對齊、千分位 | 輸入框（送出前清掉分隔符） | `grouping`、`precision` |
| `select` | 純文字或彩色標籤 | 下拉選單 | `options`、`colored` |
| `boolean` | `✓`／`—` | 無（單擊即回報） | — |
| `date` | `YYYY/MM/DD` | 原生 `<input type="date">` | `min`、`max` |

五種皆不新增任何 npm 套件或 shadcn 元件。

### 顏色三種寫法（`select`）

- **不給顏色**＝純文字。只要下拉選單、不要滿畫面彩色標籤的欄位用這個。
- **`colored: true`**＝依**選項宣告順序**自動配色（同一選項在任何重繪、任何篩選下都是同一個顏色）。適合區域、負責人這種只需區分、無好壞含義的分類欄。
- **逐選項 `color`**＝badge 變體名稱（`default`／`secondary`／`destructive`／`outline`／`ghost`）或 `#` 開頭的自由色碼。適合狀態這種有語意的欄位。自由色碼一律以**半透明淡底＋同色文字**渲染，不做實心填色——實心填色時填亮黃文字就消失了；半透明底與 `--foreground` 混色，深淺模式自動跟著走。

### 存檔責任在使用端

表格只透過 `onCellCommit(row, columnId, value)` 回報，**不 mutate `rows`、不發 API、不做樂觀更新**。畫面上的值永遠來自 `rows`，只有你餵新資料才會變。「儲存中」與「失敗」的視覺由表格統一處理，你只要餵狀態：

```tsx
<ConsoleDataTable
  onCellCommit={(row, columnId, value) => save(row.id, columnId, value)}
  savingCells={saving}          // cellId(rowKey, columnId) 的字串陣列
  cellErrors={errors}           // cellId → 錯誤訊息
/>
```

`cellId` 由本模組匯出。儲存中的格子降透明度且點不開編輯器；失敗的格子顯示紅框（`title` 是你給的錯誤訊息），並**保留使用者剛才輸入的值而不是回滾**，輸入才不會不見。

回顯的值仍走該型別的顯示規則——`select` 照樣是上色的標籤、數字照樣有千分位。「還沒存進去」由紅框表達，不靠掉色表達；掉成純文字看起來像值變成了另一種東西。自訂 `cell` 的欄位例外，回顯的是純文字：`cell(row)` 讀的是 `rows` 上還沒更新的舊值，畫出來會是「紅框配舊值」，比純文字更誤導。

### 編輯行為

- **單擊可編輯的儲存格就進入編輯**（Notion 的手感：一下就同時選到這一格與它的值）。同一下也讓該格成為作用中儲存格。**雙擊**與**在作用中儲存格上按 Enter** 一樣可以。不可編輯或 `disabled` 的格子單擊仍然只是選取。編輯器**浮在儲存格上方**（不受欄寬限制，120px 的窄欄也能編輯長文字）。
- Enter 或點到別處送出，Esc 取消。同時間至多一個編輯器。
- 編輯器一律吃**未格式化**的原始值（`1234` 而不是 `1,234`）；貼上 `1,234` 會自動清掉分隔符。
- 解析不出來（非數字、無效日期、超出 `min`/`max`）就**留在編輯態**，不悄悄丟掉或代換成合法值。
- **換頁、排序、篩選、搜尋、分組、重新整理一律關閉編輯器並丟棄草稿**，草稿不會落到別的列上。
- 編輯排序中的欄位時，餵回新資料後該列依排序移位（可能跳到別頁）——表格不凍結列序。

### 空值與看不懂的值

空值顯示 muted `—`（不是留白：表格有框線，空白格看起來像渲染失敗，而且要有東西可以點才能填值）。

`select` 值不在選項清單、日期無法解析、數字不是數字——一律**原樣顯示並以虛線底標示**，不空白、不代換為預設選項。選項改名後資料庫既有的列仍寫著舊值，顯示成空白會讓使用者以為資料掉了，然後手動「補」一個值——本來只是選單改名，結果真的改掉原始資料。

### 可編輯的 select 選項（`onOptionsChange`）

選項預設是**使用端寫死的靜態宣告**。給了 `onOptionsChange` 之後，使用者就能在編輯器裡建立、改名、改色、刪除、拖曳排序——像 Notion 的 select 屬性那樣。

```tsx
<ConsoleDataTable
  onOptionsChange={(columnId, options) => {
    // 收到的是**整份新清單**，不是「做了什麼操作」
    saveOptions(columnId, options);
  }}
/>
```

| 操作 | 行為 |
| --- | --- |
| 建立 | 輸入不存在的文字 → `value` 與 `label` 都是那段文字，顏色取一個**還沒用過**的調色盤色 |
| 改名 | 只改 `label`。**`value` 建立後不可變** |
| 改色 | 調色盤十二色 ／ badge 變體 ／ 自訂色（原生 `<input type="color">`） |
| 刪除 | 不阻擋，刪除前告知目前載入的列有幾列在用 |
| 排序 | 拖曳；排序前會把每項當下的顏色寫死，順序變了顏色不變 |

**為什麼 `value` 不可變**：列裡存 `value`、畫面顯示 `label`。改 label 不動任何一列資料；改 value 會讓所有填了舊值的列瞬間變成未識別值——那是資料遷移，不該藏在一個看起來像改名的輸入框後面。Notion 也是這個模型（存 option id、顯示 name）。

**刪掉選項之後**那些列走既有的未識別值呈現（原樣顯示＋虛線底＋滑鼠停留說明），不需要使用端多寫任何東西。

選項設定面板**畫在編輯器同一個浮層裡**，不另開一層。浮層掛在 portal 上、不在編輯器的 DOM 子樹裡，會被關閉判定當成 outside-press 而把整個編輯器關掉。`Esc` 只關最內層：面板 → 編輯器。

### 逃生口

- `cell` 仍可覆寫任何型別的顯示。
- `editable.renderEditor(context)` 自帶編輯器，表格仍管生命週期（開關、送出、取消、儲存中、失敗）；`context` 提供 `value`／`onChange`／`onCommit`／`onSave`／`onCancel`。

**編輯器收發的是這一欄的值本身，不是字串。** 值的形狀五種內建型別都裝不下時（日期區間、逐日紀錄那類），宣告 `type: "custom"`：

```tsx
{
  id: "span",
  header: "期間",
  cell: (row) => <DateRangeChip value={row.span} />,     // 顯示自由
  editable: {
    type: "custom",              // 值不是內建的任一種形狀
    getValue: (row) => row.span, // { start, end }
    editorWidth: "wide",         // "default"（預設）或 "wide"
    renderEditor: ({ value, onChange, onCommit }: CellEditorContext<Span>) => (
      <DateRangeEditor value={value} onChange={onChange} onApply={onCommit} />
    ),
  },
}
```

- **`type: "custom"` 必須自帶編輯器** —— 沒有內建編輯器畫得出這種值。
- **值的型別標註在你的編輯器上**（`CellEditorContext<Span>`）。表格看不到它，型別安全落在你這一端。
- **自帶編輯器跳過逐型別解析**：解析的職責是把「使用者打的字」變成值，而你交出來的已經是值。但**貼上仍然解析** —— 那時的輸入確實是文字。
- **`custom` 欄位沒有失敗回顯**（回顯是「顯示剛才送出的那段文字」，而值不是文字）；失敗只由 `cellErrors` 的紅框表達。
- `editorWidth` 只收具名尺寸不收像素 —— 任意寬度會讓各欄的編輯器寬度各異，看起來像沒對齊的意外。

#### 自動儲存的欄位

`onCommit` 一定會關掉編輯器。**邊改邊存**的編輯器（逐日工時那類，沒有「送出」這個動作）改用 `onSave`——回報，但浮層留著讓人繼續記下一筆：

```tsx
// 開關就是這一行：同一個編輯器，自動與手動兩種系統都服務得了
const write = (next: Log[]) => (autoSave ? onSave(next) : onChange(next));
```

- **表格不做 debounce**。多久寫一次是你的存檔策略，不是表格的顯示問題。
- **debounce 還沒到期就被關掉不會掉**：表格關閉時會補送草稿，而且**只在草稿比最後一次 `onSave` 新的時候**才送——同一個值不會寫兩次。所以你的編輯器不必自己在 unmount 時 flush。
- **`Esc` 的語意跟著這一次編輯走**：這次呼叫過 `onSave` 就沒有東西可還原，`Esc` 是單純關閉；同一格重開而這次沒存過的話，`Esc` 依然是取消。表格從實際發生的事判斷，你不必多宣告什麼。
- **`savingCells` 的灰底與 `cellErrors` 的紅框會被浮層蓋住**——那兩個狀態原本是畫給「編輯結束後」看的。自動儲存時要不要在編輯器裡自己呈現存檔中／失敗，由你決定。

**「一格多筆」不是子列。** 一份逐日紀錄（`{date, hours}[]`）看起來像一張子表，但如果每筆**沒有獨立身分**、整包一起存回，那它就是**一格的值**，用 `type: "custom"`。反過來，每筆有自己的 id、可以單獨查詢或修改的，才是子列（`subRowOf`）。判斷方式：改其中一筆時，你是打一個更新那一筆的 API，還是把整包寫回去？

## 儲存格選取與範圍編輯

像 Excel／Notion 那樣框一塊格子。**選取與複製不用宣告任何東西就有**；刪除、剪下、貼上、復原要給 `onCellsCommit`。

| 手勢 | 行為 | 需要 `onCellsCommit` |
| --- | --- | --- |
| 單擊 | 該格成為**作用中儲存格**，範圍收合成一格；該欄可編輯時同時開啟編輯器 | |
| 按住拖曳 | 框出範圍，放開結束（拖過就不是「點」，不會跳出編輯器） | |
| 方向鍵 | 移動作用中儲存格；到頭到尾就停住，不繞回另一端 | |
| `Shift`＋方向鍵 / `Shift`＋點擊 | 從 anchor 擴選成矩形（anchor 不動） | |
| `Cmd/Ctrl+A` | 全選目前**看得到**的格子 | |
| `Esc` | 清掉選取 | |
| `Cmd/Ctrl+C` | 複製範圍 | |
| 雙擊 / `Enter` | 開啟編輯器（與單擊同一件事，鍵盤與慣性手勢的兩條路） | |
| `Delete` / `Backspace` | 清空範圍 | ✓ |
| `Cmd/Ctrl+X` | 剪下（複製後清空） | ✓ |
| `Cmd/Ctrl+V` | 貼上 | ✓ |

**可編輯欄的單擊已經是「編輯」**，所以要用鍵盤操作範圍（方向鍵、`Cmd/Ctrl+C`、`Delete`）時，起點請用**按住拖曳**或 **`Shift`＋點擊**；或先單擊、再按 `Esc` 關掉編輯器——`Esc` 會把鍵盤焦點交還表格，方向鍵立刻接得上。不可編輯的欄位不受影響，單擊就是選取。
| `Cmd/Ctrl+Z` | 復原上一次範圍寫入 | ✓ |

複製會同時寫兩種格式：`text/plain` 是 TSV（欄以 tab、列以換行分隔），`text/html` 是一個 `<table>`。Excel 與 Google Sheets 優先讀後者，所以欄列結構貼過去是穩的；單格複製只寫該格的值，不加任何分隔符。

### 每一格複製什麼文字

複製的是**人看得懂的文字**（套過千分位、日期格式、`select` 的標籤），不是原始值。取值順序：

```
copyValue → editable → filterValue → sortValue → 空字串
```

有宣告 `editable` 的欄位不必做任何事。**自訂 `cell` 的欄位表格看不到文字**，要複製得出東西就得給 `copyValue`：

```tsx
{
  id: "issue",
  header: "缺失",
  cell: (row) => <Link href={`/defects/${row.id}`}>{row.issue}</Link>,
  copyValue: (row) => row.issue,   // 沒給就會複製出空字串
}
```

取不到值時複製**空字串而不是跳過該欄**——跳過會讓後面的欄整排左移，貼過去就錯位了。`boolean` 欄複製「是」／「否」（它的顯示是 `✓`／`—`，不是資料本身的文字）。

### 與其他功能的關係

- 儲存格選取與**列選取（checkbox）完全獨立**：選一塊格子不會勾選任何列，勾選列也不會動到格子的選取。
- 範圍可以涵蓋**沒宣告 `editable`** 的欄位——選取跟能不能編輯無關。
- 群組標題、每組的欄名列、「新增子項目」與「新增」列都不參與範圍；跨群組選取時直接跳過它們，複製出來是連續的資料列。
- 排序、篩選、載入更多之後選取**不會跑掉**（座標存的是 rowKey 與欄位 id 不是索引）；選取的列整批消失時選取直接清掉，不重新定位。
- 有作用中儲存格時格子內的**原生文字選取會關掉**，否則拖曳選範圍會同時選到文字。要選格子裡的部分文字請先進編輯模式。

### 範圍寫入（`onCellsCommit`）

```tsx
<ConsoleDataTable
  onCellsCommit={(edits) => {
    // 一次操作只會呼叫一次——清空 40 格就是一個 bulk update
    bulkUpdate(edits.map((e) => ({ id: e.row.id, [e.columnId]: e.value })));
  }}
/>
```

**做不到批次寫入的使用端請不要給這個 prop**，讓功能整組不出現，比給了之後在 handler 裡拆成 40 個請求誠實。單格編輯仍走 `onCellCommit`，兩者各走各的，同一個操作不會被回報兩次。

**每個型別清空成什麼、貼上怎麼解析：**

| 型別 | 清空 | 貼上接受 |
| --- | --- | --- |
| `text` | `null` | 原字串 |
| `number` | `null` | 含千分位的數字（`1,234` → `1234`） |
| `date` | `null` | 有效的 `YYYY-MM-DD`，且在 `min`／`max` 內 |
| `select` | `null` | 先比 `value`，再比 `label` |
| `boolean` | **`false`** | `是`／`否`／`true`／`false`／`1`／`0`（不分大小寫） |

`boolean` 清成 `false` 而不是 `null`：它的顯示是 `✓`／`—`，沒有第三態。

`select` 要能以 **label** 貼回來，是因為複製寫出去的就是 label——不反解的話「複製一欄貼回同一欄」會全滅。

解析不過的格子**只拒絕那一格**：該格保留原值、其餘照常寫入，不代換成預設值或最接近的選項。被拒絕的格子沿用既有的 `cellErrors` 紅框呈現。

**貼上的鋪排**：一律從作用中儲存格往右下鋪，**忽略當前選取的大小**。撞到最後一列或最後一欄就截斷，不新增列。

**回報**：每次範圍寫入後表格會說「已更新 24 格，略過 6 格，3 格的值無法辨識」。全部成功時只說更新了幾格。

**復原**：`Cmd/Ctrl+Z` 只涵蓋範圍寫入（清空、剪下、貼上），單格編輯與拖曳排序不在內。上限 20 批、只在記憶體。

## 唯讀（`readOnly`）

一個開關關掉**所有**寫入路徑，不管欄位怎麼宣告、給了哪些回呼：

```tsx
<ConsoleDataTable readOnly={!canEdit} columns={COLUMNS} ... />
```

| 關掉 | 保留 |
| --- | --- |
| 單格編輯（單擊／雙擊／`Enter`） | 列選取與批次動作 |
| `boolean` 的 `✓`／`—` | 排序、篩選、搜尋 |
| 範圍寫入（刪除／剪下／貼上／復原） | 分組、收合 |
| `select` 的選項管理 | 欄寬、偏好設定 |
| 拖曳排序 | **儲存格裡使用端放的連結與按鈕** |
| 群組與子項目的新增入口 | |
| **儲存格選取（連帶複製也沒了）** | |

- **方向只有一個**：`readOnly` 只關不開。設成 `false` 不會讓沒宣告的能力長出來——**宣告決定「這個能力存不存在」，`readOnly` 決定「現在能不能用」**，兩者是 AND。
- **儲存格不可點**：點下去只會亮一個什麼都做不了的框，那個框讀起來像「這裡可以編輯」，比沒有回饋更糟。連帶**複製也沒了**——複製要先有選取範圍。仍然可以用瀏覽器原生的文字選取複製看得到的文字。
- **表格不再是 tab stop**：沒有鍵盤操作可做的地方不該佔一個焦點順位。
- **儲存格裡的連結照常可點**：唯讀關的是表格自己的寫入路徑，不是你放進格子的內容——主要欄位那個進詳細頁的連結正是這張表存在的意義。
- **可編輯提示、拖曳握把、新增入口在唯讀時不渲染**：留著等於邀請使用者去點一個不會有反應的東西，比沒有提示更糟。
- **有子項目的列仍然可以收合展開**——那是讀取；沒有子項目的列則不再出現 hover 三角形（它只通往「新增子項目」）。

> **這是介面層的開關，不是安全機制。** 表格只是不畫、不回報；用它表達權限時，實際的擋阻仍然要做在寫入資料的那一端。

demo 的分頁版就是唯讀的示範：同一份 `COLUMNS`，捲動版可編輯、分頁版只能點「缺失」欄的連結進詳細頁。

## 排序（`sort`）

**排序不在表頭操作**——表頭是純標籤，所有排序集中在工具列的排序 icon。收合狀態就顯示目前照什麼排（`數量↓`、`手動排序`，或未設定時只有 icon），不必打開選單。

選單就是一份清單：可排序的欄位，加上最後一個「手動」（有給 `onRowReorder` 才有）。**手動是排序的第三種狀態，不是另一個功能**，所以跟欄位並排，選它即切換、選欄位即切回。選單不寫說明文字——排序語意（子項目跟隨父項目、拖到別組會改分組值）寫在這份文件裡，不寫在每次打開都要再讀一遍的選單上。

`query.sort` 有三種互斥的狀態：

| 值 | 意思 | adapter 行為 |
| --- | --- | --- |
| `null` | 使用者沒指定 | 套用隱性預設排序（第一個可排序欄升冪），選單不把它呈現為使用者選的排序 |
| `{ columnId, direction }` | 依欄位排序 | 依該欄排序，其餘可排序欄 tie-break |
| `"manual"` | 手動順序 | **不套用任何欄位推導的順序**（指定的排序欄、隱性預設、tie-break 全部不生效），照使用端給的 `rows` 順序渲染。**但分組的群組聚合與父子相鄰仍然生效**——那是結構不是排序 |

用單一欄位表達三態而不是另加 mode 欄位：兩個欄位組得出「mode 是 manual 但 sort 又指著某欄」這種無意義狀態。

有給 `storageKey` 時排序（含手動模式）會存進 localStorage 並在掛載後還原，比照 `pageSize`。存檔壞掉、或指向已不存在的欄位，一律忽略而不是拋錯。

## 手動排序（`onRowReorder`）

有給 `onRowReorder` 且**在捲動模式**時，每列最左側出現拖曳握把。**分組生效、有子項目時照樣可以拖**。分頁模式一次只握有一頁，拖曳跨不了頁，手動排序在那裡做不到它該做的事。拖完即進入手動模式（`sort` 變成 `"manual"`）；也可以直接從排序選單選「手動」切過去，選一個欄位就切回欄位排序。

```tsx
<ConsoleDataTable
  onRowReorder={(row, { before, after, groupValue, parentKey }) => {
    // 取兩個鄰居 order 的中間值（fractional index），不必重編整份號碼
    const nextOrder =
      ((before?.order ?? 0) + (after?.order ?? maxOrder + 2)) / 2;
    save(row.id, {
      order: nextOrder,
      unit: groupValue ?? row.unit,  // 拖到別組＝改掉分組欄位值
      parent: parentKey,             // 拖到別的父列＝改從屬關係
    });
  }}
/>
```

- **回報鄰居而不是整份順序**：受控表格只持有當前頁（或已載入的列），給不出全域順序；鄰居永遠在手上，也正是算新 order 值需要的東西。落在頭或尾時對應鄰居為 `null`。
- **一併回報落點的歸屬**：`groupValue` 是落點所在組的分組值、`parentKey` 是落點所在的父列 key，未分組／未宣告子項目時為 `null`。同組內拖曳時它們與原本相同——表格不替你判斷「這是搬家還是排序」，因為那取決於值怎麼儲存。
- **表格不持有順序**：不 mutate `rows`、不發請求、不做樂觀更新。畫面順序永遠來自 `rows`。
- **拖曳會關掉開啟中的儲存格編輯器**並丟棄草稿，理由同換頁：草稿會落到不同的列上。
- **範圍限於手上的列**：捲動／分塊模式在已載入的列之間拖。

### 跨組與跨父列拖曳＝改資料

這是 Notion 看板拖卡片改狀態的同一件事：**把一列拖到別組，意思就是「給它那一組的值」**。表格只回報，改不改由你決定。

- 拖到**別的組** → `groupValue` 是目的組的值，把它寫回該列的分組欄位。
- 拖到**別的父列底下** → `parentKey` 是新的父列，把它寫回 parent。
- 拖**父列**時它的子列跟著走，表格只回報父列一筆。

**兩種落點會被拒絕**（不回報、畫面不動）：父列丟進自己的子列裡（等於要它變成自己的子孫）、子列丟到任何父列的子列區段之外（那是改變「它是什麼」，要把子項目升成頂層請走編輯把 parent 清成 `null`）。

丟到**收合的群組標題**上是允許的，等同該組的第一個位置。

### 進入手動模式時畫面會重排一次

`"manual"` 的語意是「不套用任何欄位推導的順序」——指定的排序欄、隱性預設排序、tie-break 全部不生效，畫面就是你給的 `rows` 順序。所以從欄位排序切到手動的那一刻，畫面會跳成**你的資料陣列目前的順序**。要避免這個跳動，使用端必須讓 `rows` 本來就照 order 欄位排好——這也是手動排序能持久化的前提。demo 的 `useDemoEditing` 就是這樣做的（改完 order 後自己 `sort` 一次再交給 adapter）。

**但 `"manual"` 不關掉結構**：分組的群組聚合與父子相鄰照常生效。那兩件事決定的是「這列畫在哪一塊」而不是「誰在誰前面」，一起關掉的結果是群組標題散落在列表各處、父列與子列被拆開——那不是任何人拖得出來的順序。

## Props 一覽

| Prop | 必填 | 說明 |
| --- | --- | --- |
| `title` | ✓ | 標題；選取時自動顯示 `(已選/總數)` |
| `columns` | ✓ | 欄位定義，見 `ConsoleTableColumn` |
| `rows` | ✓ | 當前頁的列（已運算完畢） |
| `totalCount` | ✓ | 篩選後總筆數（分頁器據此算頁數） |
| `query` / `onQueryChange` | ✓ | 受控的查詢狀態（`TableQuery`） |
| `rowKey` | ✓ | 列的唯一鍵 |
| `filterOptions` | | 欄位 id → 篩選選項；有給的欄位才會出現在篩選選單 |
| `allFilteredKeys` | | 篩選後全部 key；省略時跨頁全選退為僅本頁全選 |
| `groupValues` | | 與 rows 平行的每列分組值；分組生效時由 adapter 提供 |
| `groupHasMore` | | 每組還有沒有未揭露的列；漸進揭露 adapter 提供 |
| `groupCounts` | | 每組筆數（key＝`JSON.stringify(路徑前綴)`）；省略時標題不顯示筆數 |
| `enableGrouping` | | 分組功能開關，預設 `true`；false 時分組 UI 與標題列全不渲染 |
| `actions` / `extraActions` | | 工具列動作 |
| `readOnly` | | 關掉所有寫入路徑；讀取（選取、複製、排序、篩選…）不受影響 |
| `density` | | `"compact"` 只縮直向內距——縮字級會讓密的表更難讀，縮命中區會更難點 |
| `fillHeight` | | 撐滿 flex 父層，捲動落在表格內部。**同一畫面上下疊兩張表時不要開**：兩張都想撐滿，結果是兩張都很矮 |
| `onCellCommit` | | 單格編輯送出的回報；有給才會真的存得下去 |
| `onCellsCommit` | | 範圍寫入的批次回報；有給才有刪除／剪下／貼上／復原 |
| `onOptionsChange` | | `select` 選項清單的回報；有給才可在表格內編輯選項 |
| `onRowReorder` | | 手動拖曳排序的回報；有給才會出現拖曳握把 |
| `subRowOf` | | 子項目：回傳父列 key；有給才有子項目（限捲動模式） |
| `onAddSubRow` | | 新增子項目的回報；有給才會出現 hover 的新增入口 |
| `onOpenRow` | | 「打開這一列」的回報；有給才會在第一個可見欄位長出 hover 的「開啟」（僅捲動模式） |
| `onAddRowToGroup` | | 在某一組底下新增的回報；有給才會出現每組的新增入口 |
| `groupActions` | | 群組 `⋯` 選單裡的宣告式動作（例如刪除整組）；表格統一外觀與確認，不執行 |
| `retainedParentKeys` | | 因子項目而保留的父列 key；由 adapter 提供 |
| `savingCells` / `cellErrors` | | 儲存中／失敗的格子（key 用 `cellId`） |
| `loading` | | true 顯示 skeleton（與空資料是兩回事） |
| `onRefresh` | | 有給才顯示重新整理鈕；載入中停用並旋轉 |
| `pagination` | | `"paged"`（預設）或 `"scroll"`；見「呈現模式與資料載入」 |
| `hasMore` / `onLoadMore` / `loadingMore` | | 捲動模式的載入更多；由 adapter 提供 |
| `searchPlaceholder` / `emptyMessage` | | 文案覆寫 |
| `preferences` / `onPreferencesChange` | | 受控的偏好；有給 handler 就由你存，表格不碰 localStorage |
| `storageKey` | | **後備**：沒給 `onPreferencesChange` 時才用，存 localStorage（key：`console-table:<storageKey>`） |

## 偏好的持久化

「使用者怎麼看這張表」收成一包偏好。有兩條路：

```tsx
// 後備：表格自己寫 localStorage（沒有後端偏好表時夠用）
<ConsoleDataTable storageKey="defects" ... />

// 受控：表格只回報，你決定存哪裡
<ConsoleDataTable
  preferences={prefs}
  onPreferencesChange={(next) => {
    const { columnWidths, wrapLines, ...rest } = next;
    saveLocal({ columnWidths, wrapLines });   // 螢幕相關的留本機
    saveToDb(rest);                            // 其餘跟著人走
  }}
/>
```

**兩者都給時以受控為準，且表格不再寫 localStorage** —— 同一份狀態不能有兩個主人。

### 偏好裡有什麼

| 項目 | 說明 |
| --- | --- |
| `columnWidths` / `columnOrder` / `hiddenColumns` / `wrapLines` | 欄位的呈現 |
| `collapsedGroups` / `hiddenGroups` / `disclosure` | 當下的視野 |
| `pageSize` / `sort` / `groupBy` | **真身在 `query` 裡**，偏好只存「上次的值」 |
| `version` | 語意改變時會跳版本 |

`filters` 與 `search` **不在偏好裡** —— 它們已經在 `query` 裡、已經受控，你本來就存得了。偏好只收表格自己擁有的狀態，加上 query 裡那三項「怎麼看」的。

### 分層是你的決定，不是表格的

表格交出**整包**，不預設哪一項該去哪。建議的切法：

| 層級 | 項目 | 為什麼 |
| --- | --- | --- |
| 個人 · 本機 | `columnWidths`、`wrapLines` | 27 吋調好的寬度不該跟到筆電 |
| 個人 · 本機 | `collapsedGroups`、`hiddenGroups`、`disclosure` | 當下視野；鍵綁著資料值，換裝置沒意義 |
| 個人 · DB | `hiddenColumns`、`columnOrder`、`pageSize`、`sort`、`groupBy` | 「我不看哪幾欄」「我習慣照戶別看」換台電腦該還在 |

不做 `localOnly: [...]` 那種設定：切法一旦要依角色或依表格變化就表達不了，拆解交給程式碼最直接。

### 受控模式下 `sort` / `groupBy` 要你自己套回 query

那三項的真身在 `query`，表格在受控模式下**不會主動推** —— 它主動推會跟你從 DB 載入的那份打架。完整的形狀：

```tsx
const [query, setQuery] = useState(() => createDefaultTableQuery());
const prefs = usePreferencesFromDb();

// 偏好載入後，自己把「怎麼看」的那三項套進 query
useEffect(() => {
  if (!prefs) return;
  setQuery((q) => ({
    ...q,
    sort: prefs.sort ?? q.sort,
    groupBy: prefs.groupBy ?? q.groupBy,
    pageSize: prefs.pageSize ?? q.pageSize,
  }));
}, [prefs]);
```

### 版本

偏好帶 `version`。**讀到不認得的版本會整包丟棄**回到預設，而不是逐欄硬讀。

逐欄驗型別抓得到形狀改變，抓不到語意改變 —— `sort: "manual"` 的意思曾經從「完全不排序」改成「不套欄位排序但保留結構」，舊存檔照樣讀得進來、只是意思已經不同。偏好重置使用者看得見也能重設；「看起來還在但意思不同」則查不出來。

> 加上版本欄位之後，**既有的存檔會被重置一次**（它們沒有 `version`）。這是刻意的。

## 複製到其他專案

完整清單在 **[PORTING.md](./PORTING.md)** ——要複製哪些檔案、哪些 npm 套件、哪些 shadcn 元件、主題變數、兩層測試環境，以及搬完的檢查清單。那份是從實際的 import 掃出來的。

摘要：

- shadcn（base-nova）：`badge` `button` `checkbox` `dialog` `input` `label` `popover` `table`。**`switch` 只有 demo 需要，`select` 完全不需要**（選項清單是自製的）。
- 套件：`lucide-react`、`@base-ui/react`（≥1.7.0，編輯器直接用它的 Popover）、`clsx` ＋ `tailwind-merge`、Tailwind v4。
- 沒有任何表格／拖曳／日期函式庫。

要拿它取代既有的另一張表時，[REPLACING-POP-TABLE.md](./REPLACING-POP-TABLE.md) 是一份做過的評估——缺口怎麼盤、怎麼分批、以及哪些「缺口」其實不是。

## 已知注意事項

- **sticky 表頭的捲動容器**：高度上限與 `overflow` 必須設在 `Table` primitive 自帶的那層 `[data-slot=table-container]` 上，不能包在它外面。`position: sticky` 對「最近的捲動祖先」定位，而那層 wrapper 的 `overflow-x: auto` 會讓 `overflow-y` 一併算成 `auto`——捲動容器設在外面時，表頭會錨在那個從不垂直捲動的 wrapper 上，跟著內容一起捲走。同理，外面那層不能有任何 `overflow`（含 `hidden`），否則又會搶走錨點。
- **分塊載入（server）模式下，「載入更多」仍是全域批次**：每組獨立需要每組一個游標、後端契約要大改，因此只有記憶體內的漸進揭露 adapter 支援每組載入。分塊模式下分組仍可用，觸發點在列表末端。
- **分組生效時沒有頂端的 sticky 表頭**：欄名改由每組自帶，所以捲到某一組中段時看不到欄名。未分組時不受影響。
- **新增子項目的入口只在 hover 時出現，觸控裝置摸不到**：那類情境請由使用端另外提供入口（工具列動作或詳細頁），表格不假裝自己是唯一入口。
- **捲動模式下，收合的子列仍佔用批次額度**：收合是呈現狀態，adapter 不知道哪些列被收合，所以一批 30 筆可能只畫出 10 列。要消除就得把收合狀態餵給 adapter，那會把呈現狀態洩進資料層，且 server 模式的後端也得認得它——不划算。
- **拖曳沒有邊緣自動捲動**：列表很長時，要把某列拖到可視範圍外做不到——請先用篩選縮小範圍再拖。分組之後列表更長，這點更明顯；要把一列拖到很遠的組，先收合中間那些組會比較快。
- **跨組拖完沒把新的分組值寫回去，那列會彈回原本的組**：表格不 mutate `rows`，畫面只跟著資料走。這不是 bug，是受控表格的必然結果。跨父列拖曳同理。
- **父列移動後子列的 order 要一併重算**：fractional index 只算了父列自己，子列若留在舊的號碼區間會與新鄰居交錯。demo 的 `onRowReorder` 有示範怎麼補。
- **自訂 adapter 要跟上 `"manual"` 的新語意**：它不再代表「原樣渲染 `rows`」——群組仍要聚在一起、子列仍要跟著父列。`use-client-table-query.ts` 是參考實作。
- **篩選生效時，拖曳的鄰居是「篩選後的鄰居」**：算出的 order 值可能與被篩掉的列交錯。需要嚴格的全域順序時，請在未篩選的狀態下調整。
- **base-ui 的 Menu 元件**：`DropdownMenuLabel`（GroupLabel）必須包在 `DropdownMenuGroup` 內，否則拋出的 MenuGroupContext 錯誤會在 dev 連鎖成整頁崩潰。本元件因此以 Popover 實作所有下拉，未使用 Menu。
- **localStorage 補水**：SSR 拿不到 localStorage，掛載後才在 effect 還原，首繪會短暫顯示預設值（頁數／欄寬），屬預期行為。
- **`number` 的千分位預設開啟**——年份、樓層、編號這類「是編號不是數量」的欄位要自己加 `grouping: false`，否則 2026 會顯示成 `2,026`。這是會安靜地錯的一種：不會壞、不報錯，要等有人發現。demo 的「樓層」欄留了一個示範。
- **複製只涵蓋畫出來的格子**：漸進揭露還沒揭露的列、收合的群組與收合的父列底下的子列都複製不到。要「複製全部」得先拿到全量資料，那超出表格的職責——請由使用端提供匯出。
- **TSV 對含 tab 或換行的值會失真**：那兩個字元會被換成空白。TSV 沒有跳脫語法，原樣塞進去會讓對方解析錯位，寧可失真也不要錯格。要無損就得走 CSV 的引號跳脫，但那樣貼進 Notion 會看到一堆引號。
- **「全部展開」在資料多時會一次畫出很多列**：每組仍有自己的揭露窗，不會無限展開，但七組乘上每組數十列還是一口氣進 DOM。
- **「全部收合」會讓存檔變大**：每個群組值與每個父列 key 都會被寫進 localStorage。幾十筆的規模是幾 KB，上千個父列時值得留意。
- **`selectedKeys` 是 key 的集合，不保證每個 key 在 `rows` 裡找得到對應的列**：全選與群組全選都會選到還沒載入的列。要用列的內容做事（顯示摘要、組請求 body）的使用端得自己去拿——表格交出去的一直是 key。
- **隱藏群組只擋得住已載入的列**：表格認不出未載入列的分組值，所以全選仍可能觸及隱藏組裡還沒載入的列。需要嚴謹排除時請用篩選而不是隱藏。
- **`onCellCommit` 的 `value` 是 `unknown`**：型別安全止於表格邊界，使用端仍要自己收斂。`type: "custom"` 的欄位尤其明顯——表格不知道你的值長什麼樣。
- **偏好裡腐爛的鍵不會被清理**：`collapsedGroups`／`hiddenGroups` 的鍵是分組值、`disclosure` 的鍵是 rowKey，資料改名或刪除後會留下孤兒且**永不清理**，偏好包只會單向成長。上千列的表格值得留意。
- **選項編輯是 last-write-wins**：`onOptionsChange` 回報的是整份清單，兩個人同時改同一欄的選項會後蓋前。表格解決不了（它不知道你怎麼存），需要更強保證請自行加版本欄位。
- **刪除選項時的影響數字只涵蓋已載入的列**：受控表格說不出全域數字，所以文案寫的是「目前載入的列中有 N 列使用」。
- **自訂色可能對比不足**：`color-mix()` 已經混 `--foreground` 產生文字色，但極端的淡色仍可能偏淡。不做強制對比檢查——那會擋掉使用者刻意選的淡色。
- **觸控裝置沒有範圍選取**：沒有 hover 也沒有 `Shift`，拖曳又與捲動衝突，只保證點一下選單格並開編輯器。
- **復原是「重新提交舊值」而不是回溯**：使用端若在期間改過那些格子，`Cmd/Ctrl+Z` 會蓋掉那些改動。堆疊只有 20 批也是為了降低跨越太久的機會。列被篩掉或欄位被隱藏時，那幾格復原不了，會計入「略過」。
- **貼上超出範圍就截斷，不新增列**：表格不憑空造資料。被丟掉的格數會計入回報的「略過」，不會靜靜消失。
- **`select` 的 `value` 與 `label` 撞名時以 `value` 優先**：某選項的 value 剛好是另一選項的 label 時，貼上會解成前者。這種選項宣告本身就有歧義，表格不做自動偵測（那要在每次渲染掃全部選項）。
- **貼上需要焦點在表格內**：`paste` 事件只送到焦點所在的元素，先點一下格子。
- **`fillHeight` 的高度落在捲動容器那一層**（`Table` 的 `containerClassName`），不是外面那層。sticky 表頭是對「最近的捲動祖先」定位的——設在外面，表頭會錨在一個從不垂直捲動的元素上，跟著內容捲走。實作契約的人要把 `containerClassName` 真的套到容器上，不能只是併進 `<table>` 的 className。
- **`title`（滑鼠停留看全文）只有宣告了 `editable` 的欄位才有**：表格要取得到純文字值才做得到，自訂 `cell` 而沒宣告型別的欄位取不到，維持現況（截斷後看不到全文）。
- **日期用原生 `<input type="date">`**：零依賴、可鍵盤輸入、行動裝置叫系統選擇器，代價是各瀏覽器外觀不一致。需要精緻日曆的欄位走 `renderEditor` 逃生口。
- **編輯器直接用 `@base-ui/react` 的 Popover primitives**，而不是 `ui/popover.tsx`：需要傳 `anchor`（整張表共用一個編輯器、錨在正在編輯的格子上），而那個 wrapper 沒有轉發它。改 wrapper 會讓這個資料夾複製到別的專案時對方缺這個能力。
- **欄寬快照**：欄位在首次拖曳（欄寬快照）之後才從偏好設定重新顯示時，使用 120px 後備寬度。
- **分組未支援的功能**（有意為之）：勾群組標題列選整組、群組層級的彙總（只做筆數）、多層分組。
- 表格為分頁 UX，DOM 只有一頁的量，**不需要**虛擬滾動；資料量大請走 server-side，不要把幾萬筆餵給 client adapter。
