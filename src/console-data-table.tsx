"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronsDownUp,
  ChevronsUpDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  MoreHorizontal,
  Filter,
  GripVertical,
  PanelRight,
  Plus,
  Rows3,
  RotateCw,
  Search,
  Settings,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "./cn";
import {
  DATE_BUCKETS,
  customRangeValue,
  dateFilterLabel,
} from "./date-buckets";
import { Button } from "./table-ui";
import { Checkbox } from "./table-ui";
import { Input } from "./table-ui";
import { Label } from "./table-ui";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./table-ui";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./table-ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table-ui";
import {
  CellDisplay,
  EDITABLE_HINT_CLASS,
  cellCopyText,
  cellTitleText,
} from "./cell-display";
import {
  aggregatesFor,
  anyAggregateChosen,
  outcomeFor,
  type Aggregate,
} from "./aggregate";
import { CellEditorPopover, cellId } from "./cell-editor";
export { cellId } from "./cell-editor";
import { emptyCellValue, formatNumber, parseCellValue } from "./cell-format";

/**
 * Column definition for `ConsoleDataTable`. Headers are plain strings (not
 * ReactNode) because the same label is reused in the preferences dialog and in
 * filter chips. `sortValue`／`filterValue` 由 client adapter
 * （useClientTableQuery）在瀏覽器端運算時使用；server 模式下運算在後端，
 * 這兩個函式可省略——欄位可不可排序看表格怎麼渲染（有 sortValue 才有排序
 * 鈕），可不可篩選看 filterOptions 有沒有該欄的選項。
 */
type ConsoleTableColumnBase<T> = {
  id: string;
  header: string;
  /** client adapter 的排序依據；同時決定表頭是否顯示排序鈕。 */
  sortValue?: (row: T) => string | number | null;
  /**
   * client adapter 的篩選值，同時決定這一欄**有沒有篩選選單**：宣告了就會出
   * 現在篩選面板裡，選項是這一欄所有出現過的值。所以只宣告在「值是一個小
   * 的、封閉的集合」的欄位上——每一列都不一樣的欄位（摘要、名稱、IP）宣告
   * 了會得到一份跟資料一樣長的選單。那種欄位要的是 `searchValue`。
   */
  filterValue?: (row: T) => string;
  /**
   * 搜尋比對用的文字。**只影響搜尋，不會產生篩選選單。**
   *
   * 沒給時退回 `filterValue` → `sortValue`。分開的理由是這兩件事本來就不同：
   * 稽核紀錄的「對象」要能被摘要文字搜到，但篩選要按對象**類型**分；一個欄
   * 位只有一個 `filterValue` 時，這兩個需求只能滿足一個。
   *
   * 一欄都沒宣告過這三者的表格，搜尋框比對不到任何東西。
   */
  searchValue?: (row: T) => string;
  /**
   * 宣告了就有**日期區間**篩選，而不是一顆一顆值的清單。回傳
   * `YYYY-MM-DD`，沒有日期回傳空字串。
   *
   * 日期是唯一一種「每一列都不一樣，但篩選仍然有意義」的欄位——用
   * `filterValue` 會得到一份每天一個選項的選單。篩的是區間，控制項就得是
   * 區間，所以這件事必須由欄位自己說，表格猜不到。
   *
   * 值存成 `bucket:<id>`（相對，每次讀取重新對時鐘解析）或 `from|to`
   * （絕對）；見 date-buckets.ts。同一欄不要同時宣告 `filterValue`——兩種
   * 控制項會搶同一個位置，日期這一個贏。
   */
  dateFilterValue?: (row: T) => string;
  /**
   * 一列**同時屬於多個**篩選值時用這個（參與者、標籤）。選項是所有列出現過
   * 的值的聯集，選了幾個就是「至少符合其中一個」。
   *
   * 與 `filterValue` 的差別只有基數，但那個差別是真的：一場會議有三個參與
   * 者，用 `filterValue` 只能挑一個代表，篩「王小明參加的會議」就會漏掉他
   * 不是第一順位的那些。
   *
   * **不能拿來分組**——一列屬於多個組的話，「這一組有幾筆」加起來會超過總
   * 筆數。分組仍然只看 `filterValue`。
   */
  filterValues?: (row: T) => string[];
  /**
   * 分組時這一欄的值，當它跟篩選的值**不一樣**的時候。沒給就用 `filterValue`。
   *
   * 與 `searchValue` 同一個道理：篩選、搜尋、分組是三件事，只是大部分時候用
   * 同一個值。一個「排程」欄可能要照排程名稱篩選，卻要連同它所屬的專案一起
   * 分組——那兩個值不一樣，硬用同一個就得二選一。
   *
   * 值仍然是一個字串，表格不解讀它。要塞幾個維度進去是使用端的事。
   *
   * 只宣告這個、不宣告 `filterValue` 也成立：那是一個「分得了組、但不出現在
   * 篩選選單裡」的欄位。分組選單只列有 `filterValue` 的欄位，所以那種欄位是
   * 給使用端自己設定 `query.groupBy` 用的。
   */
  groupValue?: (row: T) => string;
  /**
   * 這一欄是不是這一列的**身分**——看到它就知道這是哪一列的那一欄。
   *
   * 「開啟」浮在它的右緣。沒有任何欄位宣告時退回第一個看得見的欄位，那是一個
   * 猜測：多數表格的第一欄確實是名稱，但釘選的星號、勾選框、編號欄也常常排在
   * 前面，那時「開啟」就會浮在一個 36px 寬的格子裡。
   *
   * 表格自己判斷不出來——欄寬、標題、有沒有 `editable` 都不能說明「哪一欄是這
   * 一列的名字」。只有使用端知道。
   */
  identity?: boolean;
  /**
   * 這一欄在群組結尾自己畫什麼。**有給就用它，內建的 COUNT／SUM 讓位**——
   * 「這一組還剩幾天」「已用 / 預估」這些結論加不出來，它們是使用端算的。
   *
   * `complete` 是那個必須一起交出去的判斷：一組兩百筆只揭露二十筆時，那二十
   * 筆的和看起來就是一個總數、會被當成總數用，而畫面上沒有東西會跟它牴觸。
   * 內建統計在這種情況顯示破折號；自訂的沒有這個保護，所以判斷交給使用端，
   * 而不是把它藏起來。
   */
  footer?: (rows: T[], coverage: { complete: boolean }) => React.ReactNode;
  /**
   * 複製到剪貼簿時這一欄的純文字值。只有自訂 `cell` 的欄位需要給——
   * 有宣告 `editable` 的欄位表格自己算得出格式化後的文字。
   *
   * 取值順序：`copyValue` → `editable` → `filterValue` → `sortValue` →
   * 空字串。都取不到時複製空字串而不是跳過該欄，跳過會讓後面的欄整排
   * 左移、貼過去就錯位。
   */
  copyValue?: (row: T) => string;
  /**
   * 這一列在統計上貢獻多少。**給了就加得起來**——與這一欄有沒有 `editable`、
   * 是什麼型別都無關。
   *
   * 沿用這個元件一路的作法：`sortValue` 換來可排序、`filterValue` 換來可篩
   * 選、`copyValue` 換來複製得出文字。加不加得起來是關於「值」的問題，不是
   * 關於「型別」的問題——一欄存著 `{date, hours}[]` 的逐日紀錄算得出累積時
   * 數，而它的型別說不出這件事。
   *
   * `null` 代表這一列沒有貢獻，**不是 0**：對加法而言結果一樣，但下一個統計
   * （平均、最小）就不同了，現在分開比之後回頭拆容易。
   */
  aggregateValue?: (row: T) => number | null;
  /**
   * 總和怎麼寫。只在有 `aggregateValue` 時有意義。
   *
   * 內建 number 欄位的總和借得到該欄的千分位與小數位，`aggregateValue` 的欄
   * 位借不到——它可能連 `editable` 都沒有。而那正是最需要的地方：儲存格寫
   * 「12h」、底下總和是光禿禿的「25.5」，就是在讀者眼裡變成另一種量。
   *
   * **宣告了值就要負責讓總和讀起來跟這一欄是同一種量。** 沒給就走共用的數
   * 字格式。對齊不開放——那是版面問題，不是語意問題。
   */
  formatAggregate?: (total: number) => string;
  align?: "left" | "center" | "right";
  className?: string;
};

/**
 * 欄位要嘛給 `cell` 自訂顯示，要嘛宣告 `editable` 讓型別提供預設顯示，
 * 兩個都給時以 `cell` 為準（design D3：`cell` 仍是主要的顯示 API，型別化的
 * 重心在編輯）。兩個都不給的欄位沒有東西可畫，由型別擋下。
 */
export type ConsoleTableColumn<T> = ConsoleTableColumnBase<T> &
  (
    | {
        cell: (row: T) => React.ReactNode;
        /**
         * 有宣告才可編輯（比照「有 sortValue 才有排序鈕」的能力宣告制）。
         * 沒宣告的欄位行為與現在完全相同——既有使用端不改一行程式碼。
         */
        editable?: ConsoleTableEditable<T>;
      }
    | {
        cell?: (row: T) => React.ReactNode;
        editable: ConsoleTableEditable<T>;
      }
  );

/**
 * 群組選單裡的宣告式動作。詞彙沿用工具列的 `ConsoleTableAction`——使用端
 * 學一次就好。表格統一樣式與確認流程，**行為完全交給使用端**：表格不刪
 * 任何資料，這條原則從 onCellCommit 一路貫穿到 onRowReorder。
 */
export type ConsoleTableGroupAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** destructive：紅色，並與其餘項目之間加一條分隔線。 */
  intent?: "default" | "destructive";
  /**
   * 有給就先跳確認對話框，內容由使用端提供——表格不知道這個動作對它的
   * 資料是什麼意思，寫死文案會說謊。
   */
  confirm?: { title: string; description?: string; confirmLabel?: string };
  /**
   * `groupValue` 是該組的分組值（「未設定」組為 null），`loadedKeys` 是
   * **目前已載入、屬於該組**的列 key。
   *
   * 表格只握有已載入的列，說不出「這一組全部」是哪些——要對整組動作
   * 請用 `groupValue` 去後端處理，`loadedKeys` 只是給不需要後端的簡單
   * 情境用。同 `onRowReorder` 回報鄰居而不是全域順序。
   */
  onSelect: (groupValue: string | null, loadedKeys: string[]) => void;
};

/** `select` 的選項；同一份宣告同時供編輯器的選單與顯示的顏色使用。 */
export type ConsoleTableSelectOption = {
  value: string;
  /** 顯示文字，省略時用 value。 */
  label?: string;
  /**
   * badge 變體名稱（default／secondary／destructive／outline／ghost）或
   * `#` 開頭的自由色碼。不給就是純文字。
   */
  color?: string;
};

/** 五種型別共用的部分。 */
type EditableCommon<T> = {
  /**
   * 從列讀出未經格式化的原始值。`cell` 是單向投影，表格看不到值，所以編輯
   * 一定要有這個取值函式——渲染成 badge 的欄位照樣編輯得到底下的值。
   */
  getValue: (row: T) => unknown;
  /** 逐列的開關；true 時該列這一格不可編輯（唯讀帳號、已結案的紀錄）。 */
  disabled?: (row: T) => boolean;
  /**
   * 逃生口：型別裝不下的欄位自帶編輯器。表格仍管生命週期（開關、送出、
   * 取消、儲存中、失敗），使用端只負責畫控制項。
   *
   * **收發的是這一欄的值本身，不是字串**——`getValue` 回傳什麼形狀，
   * 編輯器就拿到什麼形狀，送出時原樣回報。有自帶編輯器的欄位，`type`
   * 只決定「沒有它的話會用哪個內建編輯器」，不再限制值的形狀。
   */
  // 表格看不到自訂編輯器的值型別；型別安全落在使用端的編輯器內部
  // （它自己標註 TValue）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderEditor?: (context: CellEditorContext<any>) => React.ReactNode;
  /**
   * 編輯器浮層的寬度。取自有限集合而不是任意像素——任意寬度會讓各欄的
   * 編輯器寬度各異，看起來像沒對齊的意外；具名尺寸則是刻意的選擇。
   */
  editorWidth?: "default" | "wide";
};

/**
 * 可編輯宣告，以 `type` 為判別的 discriminated union——`select` 才要求
 * `options`、`number` 才接受 `grouping`／`precision`、`date` 才接受
 * `min`／`max`。配錯的組合（`type: "text"` 卻給 `options`）由型別檢查擋下。
 */
export type ConsoleTableEditable<T> =
  | ({ type: "text"; getValue: (row: T) => string | null | undefined } & Omit<
      EditableCommon<T>,
      "getValue"
    >)
  | ({
      type: "number";
      getValue: (row: T) => number | null | undefined;
      /** 千分位，預設開啟；年份／樓層／編號等欄位要給 false。 */
      grouping?: boolean;
      /** 固定小數位。 */
      precision?: number;
    } & Omit<EditableCommon<T>, "getValue">)
  | ({
      type: "select";
      getValue: (row: T) => string | null | undefined;
      options: ConsoleTableSelectOption[];
      /** 依選項宣告順序自動配色；已逐選項指定 color 的選項優先用自己的。 */
      colored?: boolean;
    } & Omit<EditableCommon<T>, "getValue">)
  | ({
      type: "boolean";
      getValue: (row: T) => boolean | null | undefined;
    } & Omit<EditableCommon<T>, "getValue">)
  | ({
      type: "date";
      getValue: (row: T) => string | null | undefined;
      /** `YYYY-MM-DD`；編輯器會擋掉超出範圍的日期。 */
      min?: string;
      max?: string;
    } & Omit<EditableCommon<T>, "getValue">)
  | ({
      /**
       * 值的形狀內建型別裝不下時用這個分支——日期區間 `{start,end}`、
       * 逐日紀錄 `{date,hours}[]` 之類。**必須自帶編輯器**：沒有內建
       * 編輯器畫得出這種值。
       *
       * 原本想讓值型別與 `type` 脫鉤而不新增分支，但 TypeScript 表達
       * 不出「有 renderEditor 時 getValue 放寬」——其餘分支的 getValue
       * 一旦收緊，回傳物件就過不了。與其用條件型別繞，不如誠實多一個
       * 分支。
       */
      type: "custom";
      getValue: (row: T) => unknown;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      renderEditor: (context: CellEditorContext<any>) => React.ReactNode;
    } & Omit<EditableCommon<T>, "getValue" | "renderEditor">);

/**
 * 自訂編輯器拿到的東西：目前草稿值、改草稿、送出、取消。
 *
 * `TValue` 是**這一欄的值型別**，不強制字串。需要逃生口的欄位，值幾乎
 * 都是結構化的（日期區間 `{start,end}`、逐日紀錄 `{date,hours}[]`），
 * 逼它們走字串等於要求兩端各寫一次 JSON 序列化——那是為了滿足契約而
 * 存在的程式碼，不是使用端該負擔的事。
 *
 * 內建五種型別的編輯器仍然收發字串（它們的輸入本來就是「使用者打的
 * 字」），只是那個字串現在由 `TValue` 表達而不是寫死。
 */
export type CellEditorContext<TValue = string> = {
  value: TValue;
  onChange: (value: TValue) => void;
  /**
   * 送出。可帶入要送出的值——像 select 這種「選了就決定」的控制項，草稿
   * setState 在同一輪事件裡還讀不到，直接把值帶進來比較可靠。
   */
  onCommit: (value?: TValue) => void;
  /**
   * 回報這一格的新值，但**不關閉編輯器**。給沒有「送出」這個動作的編輯器
   * 用——一格多筆的東西（逐日紀錄、一組日期）常見的是邊改邊存，每改一次
   * 就關掉浮層會沒辦法用。
   *
   * 自動儲存與手動儲存的開關因此落在使用端自己的編輯器裡：
   *
   * ```tsx
   * const write = (next: T) => (autoSave ? onSave(next) : onChange(next));
   * ```
   *
   * 呼叫過之後這一次編輯就沒有東西可還原了，`onCancel`／Esc 會變成單純
   * 關閉——表格不會宣稱還原一個已經叫使用端存下去的值。
   */
  onSave: (value: TValue) => void;
  onCancel: () => void;
};

/**
 * 工具列動作的宣告式定義。按鈕的長相與規則（icon、primary 響應式文字、
 * destructive 啟用轉紅、needsSelection 的停用、hidden 開關）由表格統一
 * 處理；「按下去發生什麼」交給使用端——`href` 跳轉頁面，或 `onClick`
 * 拿到選取列後自行接手（開自家的 modal、發 API 都行），表格本身不擁有
 * 任何 modal，跨專案使用時不會綁到這裡的 UI。
 */
export type ConsoleTableAction = {
  id: string;
  /** 按鈕文字，同時作為 aria-label 與 tooltip。 */
  label: string;
  icon: LucideIcon;
  /**
   * primary：填色主按鈕，sm 以上顯示文字、以下縮成 icon。
   * destructive：outline，可按時轉紅（刪除類）。
   * default：outline icon 按鈕。
   */
  intent?: "primary" | "default" | "destructive";
  /** 開關：feature flag 或權限判斷直接餵這裡，true 時整顆不渲染。 */
  hidden?: boolean;
  /** true 時沒有選取列就停用（AWS 的「已選取才能刪除」模式）。 */
  needsSelection?: boolean;
  /** 與 onClick 二選一：按下後跳轉到此路徑。 */
  href?: string;
  /**
   * 與 href 二選一：按下後把目前選取列的 key 交給使用端處理。收 key 而非
   * 列資料，因為受控模式下表格只持有當前頁——key 也正是送 API 的形狀。
   */
  onClick?: (selectedKeys: string[]) => void;
};

export type SortState = { columnId: string; direction: "asc" | "desc" };

/**
 * 表格的查詢狀態——排序、篩選、搜尋、分頁收成單一可序列化物件。
 * 表格是受控元件：它只渲染 `rows` 並在使用者操作時吐出新的 query，
 * 資料運算發生在外面——小資料用 useClientTableQuery 在瀏覽器算，
 * 大資料把 query 轉成 API 參數由後端算，表格本身不變。
 */
export type TableQuery = {
  search: string;
  /** 欄位 id → 勾選的值；用陣列而非 Set，讓整包 query 可直接 JSON 序列化。 */
  filters: Record<string, string[]>;
  /**
   * 三種互斥的狀態：
   * - `null`＝使用者沒指定，client adapter 會套用隱性預設排序（第一個可排序
   *   欄升冪），但排序選單不把它呈現為使用者選的排序。
   * - `SortState`＝依欄位排序。
   * - `"manual"`＝手動順序，adapter 不得套用任何排序（含隱性預設），直接照
   *   使用端給的 `rows` 順序渲染。
   *
   * 用單一欄位表達三態而不是另加一個 mode 欄位——兩個欄位組得出「mode 是
   * manual 但 sort 又指著某欄」這種無意義的狀態，單一欄位天然互斥。
   */
  sort: SortState | "manual" | null;
  /**
   * 分組欄位 id，`null` 代表未分組。**只有一層**——一層就不該用陣列表達，
   * 陣列容得下「兩個值」這種無效狀態，每個讀取端都得自己防禦。
   *
   * 分組的排序方向不另外存：`sort.columnId` 恰為分組欄時，群組本身依 sort
   * 的方向排列，否則升冪。
   */
  groupBy: string | null;
  pageIndex: number;
  pageSize: number;
};

export function createDefaultTableQuery(pageSize = 10): TableQuery {
  return {
    search: "",
    filters: {},
    sort: null,
    groupBy: null,
    pageIndex: 0,
    pageSize,
  };
}

const PAGE_SIZE_OPTIONS = [10, 30, 50, 100];

/**
 * 解析存檔裡的排序值。回傳 `undefined` 代表「存檔沒有可用的排序」，呼叫端
 * 就維持現值——與「存檔明確記著沒有排序（null）」是兩回事。
 *
 * 壞掉的值一律忽略而不是拋錯：欄位被移除、存檔是舊版本、有人手動改壞
 * localStorage 都不該讓整張表打不開（比照既有的 columnOrder 韌性處理）。
 */
/**
 * 表格的偏好設定——「使用者怎麼看這張表」收成一包。
 *
 * 有給 `onPreferencesChange` 就由使用端存（可以自己拆成 DB／localStorage
 * 兩份）；沒給才退回 `storageKey` 的 localStorage。**表格不預設分層**：
 * 欄寬該留在本機、隱藏欄位該跟著人走，但那條線畫在哪是使用端的決定，
 * 不同產品可能不一樣。
 */
export type ConsoleTablePreferences = {
  /** 語意改變時跳版本；不認得的版本整包忽略（見 PREFERENCES_VERSION）。 */
  version: number;
  columnWidths?: Record<string, number>;
  columnOrder?: string[];
  hiddenColumns?: string[];
  wrapLines?: boolean;
  collapsedGroups?: string[];
  hiddenGroups?: string[];
  disclosure?: Record<string, boolean>;
  /**
   * 每欄選了什麼統計（見 aggregate.ts）。**刻意可以缺席，而且不跳版本**：
   * 一份寫在這個設定存在之前的偏好是完整有效的排列，因為多了一欄設定就整包
   * 丟掉，會連帶把使用者的欄寬與欄序一起丟掉——那比少一個設定重得多。缺席
   * 時每一欄視為「無」，語意跟舊的存檔完全一致，所以版本不動。
   */
  aggregates?: Record<string, Aggregate>;
  /**
   * 以下三項的真身在 `query` 裡（使用端擁有），偏好只存「上次的值」。
   * 不把它們搬出 query——query 要能整包序列化成 API 參數。
   */
  pageSize?: number;
  sort?: TableQuery["sort"];
  groupBy?: string | null;
};

/**
 * 偏好的版本。**語意**改變時要跳（形狀改變由逐欄驗證擋得住，語意不會）。
 *
 * 前例：`sort: "manual"` 曾經從「完全不排序」改成「不套欄位排序但保留
 * 結構」，舊存檔照樣讀得進來、只是意思已經不同，當時沒有任何機制察覺。
 */
const PREFERENCES_VERSION = 1;

function parseStoredSort<T>(
  value: unknown,
  columns: ConsoleTableColumn<T>[],
): TableQuery["sort"] | undefined {
  if (value === "manual") return "manual";
  if (value === null) return null;
  if (
    typeof value !== "object" ||
    value === null ||
    !("columnId" in value) ||
    !("direction" in value)
  ) {
    return undefined;
  }
  const { columnId, direction } = value as {
    columnId: unknown;
    direction: unknown;
  };
  if (typeof columnId !== "string") return undefined;
  if (direction !== "asc" && direction !== "desc") return undefined;
  // 欄位已不存在就忽略，不要把表格丟進一個排序不到的狀態
  if (!columns.some((c) => c.id === columnId && c.sortValue)) return undefined;
  return { columnId, direction };
}

/** 複製用的 HTML 逃脫。只處理會破壞 `<td>` 結構的三個字元。 */
function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const MIN_COLUMN_WIDTH = 80;

/**
 * 本來就比 `MIN_COLUMN_WIDTH` 還窄的欄位（auto layout 量出來的短欄，例如
 * 「樓層」只有 40 出頭）改用這個地板。地板的用途是不讓欄位被拖到消失，
 * 不是把欄位撐寬。
 */
const NARROW_COLUMN_MIN_WIDTH = 24;

/**
 * 欄寬把手的命中區。看得見的只有那條 0.5px 的分隔線，能按的範圍要比它
 * 大得多，而且要**跨在線上**：只鋪在線左邊的話，瞄準線本身或線右邊一
 * 兩 px 就落到下一格，按下去毫無反應——使用者的結論是「這欄拖不動」。
 *
 * 橫向 16px（線左 12、線右 4），縱向往上下各多 4px：分組的欄名列只有
 * 25px 高，夾在群組標題與第一列之間，差幾 px 就按到隔壁。
 *
 * `z-20` 是越界的前提：欄名格自己是 `relative` 但沒有 z-index，不會開新的
 * 堆疊環境，所以正 z-index 的把手會蓋在後面那一格之上；少了它，越出去的
 * 4px 會被下一格（DOM 順序在後）接走，等於沒加。
 *
 * 頂端共用表頭的 `th` 是 `sticky z-10` 且 `overflow-hidden`（欄名過長要
 * 截斷），越界的部分在那裡會被裁掉，剩 12px×表頭高度，仍比原本的 10px
 * 好按；分組的欄名列是普通 `td`，完整生效。
 */
const RESIZE_HANDLE_CLASS =
  "group/resize absolute -inset-y-1 -right-1 z-20 flex w-4 cursor-col-resize touch-none items-center justify-end pr-1";

/**
 * 前導欄的寬度：class 與數字綁在一起。`table-fixed` 之下 colgroup 只吃
 * 數字，兩邊各寫各的就會讓這一欄被壓回最窄的那個值。
 */
const LEADING_COLUMN_WIDTHS = {
  /** 只有勾選框 */
  checkbox: ["w-10", 40],
  /** 勾選框＋拖曳握把或揭露三角形 */
  medium: ["w-16", 64],
  /** 勾選框＋拖曳握把＋揭露三角形 */
  wide: ["w-20", 80],
} as const;

const ALIGN_CLASS = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
} as const;

/**
 * 儲存格對齊：`align` 沒給時，`number` 型別預設靠右（數字對齊小數位才好讀），
 * 其餘靠左。只作用在儲存格——表頭一律靠左，欄名是標籤不是資料。
 */
/**
 * 一個統計值長什麼樣。
 *
 * 加總沿用該欄自己的數字格式（千分位、小數位）——一個顯示整數的欄位底下掛著
 * 兩位小數的總和，看起來會像是另一種量。筆數永遠是整數，不跟著欄位跑：它數
 * 的是列，不是那一欄的值。
 */
function AggregateValue<T>({
  column,
  aggregate,
  value,
}: {
  column: ConsoleTableColumn<T>;
  aggregate: Aggregate;
  value: number;
}) {
  const editable = column.editable;
  const text =
    aggregate !== "sum"
      ? String(value)
      : column.formatAggregate
        ? column.formatAggregate(value)
        : editable?.type === "number"
          ? formatNumber(value, {
              grouping: editable.grouping,
              precision: editable.precision,
            })
          : // `aggregateValue` 的欄位沒給寫法：走共用的數字格式。加總的浮點
            // 痕跡已經在 `tidySum` 收掉了。
            formatNumber(value)
  return (
    <span>
      <span className="mr-1 tracking-wide opacity-60">
        {AGGREGATE_RESULT_LABEL[aggregate]}
      </span>
      <span className="tabular-nums">{text}</span>
    </span>
  );
}

/**
 * 這一欄取不取得到數字。宣告了怎麼取，或者是內建的 number 欄位。
 *
 * 資格與取值必須走同一個判斷，否則會出現「選單給了總和，算出來是 0」。
 */
function isSummable<T>(column: ConsoleTableColumn<T>): boolean {
  return !!column.aggregateValue || column.editable?.type === "number";
}

/*
 * 統計有兩套說法，**刻意的**，不要合成一份。
 *
 * 設定裡是在選「我要什麼」，那是一段中文介面裡的一個選項，`筆數`／`總和`
 * 讀起來就是話。統計列是密集的資料列，短的原文讀起來是函式名——而讀這張表
 * 的人多半在試算表或資料庫裡看過同一個字。
 *
 * 分岔的風險來自「同一個東西寫了兩次」；這裡是同一個東西的兩種說法，各自有
 * 各自的場合。
 */

/** 偏好設定的下拉。 */
const AGGREGATE_CHOICE_LABEL: Record<Aggregate, string> = {
  none: "無",
  count: "筆數",
  sum: "總和",
};

/** 統計列上的前綴。`none` 不會被顯示——選了無就整欄不畫。 */
const AGGREGATE_RESULT_LABEL: Record<Aggregate, string> = {
  none: "",
  count: "COUNT",
  sum: "SUM",
};

/**
 * 一欄選哪個統計。
 *
 * 原生 `<select>` 而不是專案的 Select 元件：這是一列裡的第三個控制項，旁邊
 * 已經有兩顆移動鈕和一個勾選框，再放一個有彈出層的控制項會讓那一列變成一個
 * 迷你工具列。選項只有兩三個、而且是純設定，原生的就夠。
 */
function AggregateChoice<T>({
  column,
  value,
  onChange,
}: {
  column: ConsoleTableColumn<T>;
  value: Aggregate;
  onChange: (next: Aggregate) => void;
}) {
  const options = aggregatesFor(isSummable(column));
  return (
    <select
      aria-label={`${column.header}的每組統計`}
      value={value}
      onChange={(event) => onChange(event.target.value as Aggregate)}
      className="border-input bg-background h-6 shrink-0 rounded-md border px-1 text-xs"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {AGGREGATE_CHOICE_LABEL[option]}
        </option>
      ))}
    </select>
  );
}

function columnAlign<T>(
  column: ConsoleTableColumn<T>,
): "left" | "center" | "right" {
  if (column.align) return column.align;
  return column.editable?.type === "number" ? "right" : "left";
}

/**
 * 把宣告換成「值＝這段文字」的版本，顯示規則原封不動。用在存檔失敗的回顯：
 * 該顯示的是使用者剛才送出的值，但 `select` 仍要上色、數字仍要千分位。
 *
 * 文字換回值的規則與 `commitEdit` 同一套——`select` 與 `boolean` 的編輯器
 * 產出的就是值本身，不必解析。解析不過的輸入根本送不出去（`commitEdit`
 * 會擋在編輯器裡），所以這裡不會拿到，真的拿到就當作沒有值。
 */
function editableShowingText<T>(
  editable: ConsoleTableEditable<T>,
  text: string,
): ConsoleTableEditable<T> {
  switch (editable.type) {
    case "text":
    case "select":
      return { ...editable, getValue: () => text };
    case "number": {
      const parsed = parseCellValue(editable, text);
      return {
        ...editable,
        getValue: () => (parsed.ok ? (parsed.value as number | null) : null),
      };
    }
    case "date": {
      const parsed = parseCellValue(editable, text);
      return {
        ...editable,
        getValue: () => (parsed.ok ? (parsed.value as string | null) : null),
      };
    }
    // boolean 沒有編輯態，不會有失敗回顯
    case "boolean":
    // custom 的值不是文字，回顯不了「剛才送出的那段文字」——原樣顯示，
    // 錯誤訊息由 cellErrors 的紅框表達
    case "custom":
      return editable;
  }
}

/**
 * 依使用者的欄位順序偏好排列欄位，並容忍三種不一致：偏好裡已不存在的
 * 欄位 id 忽略、`columns` 中未列入偏好的欄位（使用端新增欄位、或舊存檔）
 * 依原順序接在後面、沒有偏好時就是 `columns` 原順序。每次渲染重算即可
 * ——欄位數量級很小，也避免「使用端改 columns」與「使用者調順序」互相
 * 寫入同一份狀態。
 */
function resolveColumnOrder<T>(
  columns: ConsoleTableColumn<T>[],
  order: string[],
): ConsoleTableColumn<T>[] {
  if (order.length === 0) return columns;
  const ordered = order
    .map((id) => columns.find((c) => c.id === id))
    .filter((c): c is ConsoleTableColumn<T> => c != null);
  const seen = new Set(ordered.map((c) => c.id));
  return [...ordered, ...columns.filter((c) => !seen.has(c.id))];
}

/**
 * AWS-console-style data table，受控元件：只渲染 `rows` 並在使用者操作時
 * 透過 `onQueryChange` 吐出新的查詢狀態，資料運算在外面——中小資料用
 * useClientTableQuery 在瀏覽器算，大資料把 query 轉成 API 參數由後端算，
 * 表格本身不變。功能：選取（含跨頁全選）、宣告式工具列／每列動作、
 * 搜尋、篩選 chips、sticky 表頭、欄寬拖曳、偏好設定與 localStorage 持久化。
 */
export function ConsoleDataTable<T>({
  title,
  density = "regular",
  fillHeight = false,
  columns,
  rows,
  totalCount,
  query,
  onQueryChange,
  rowKey,
  filterOptions = {},
  allFilteredKeys,
  allFilteredKeysByGroup,
  groupValues,
  groupHasMore,
  groupAggregates,
  onAddRowToGroup,
  renderGroupActions,
  groupActions,
  groupCounts,
  enableGrouping = true,
  actions,
  extraActions,
  onCellCommit,
  onCellsCommit,
  readOnly = false,
  onOptionsChange,
  savingCells,
  cellErrors,
  onRowReorder,
  canDrop,
  subRowOf,
  onAddSubRow,
  onOpenRow,
  retainedParentKeys,
  rowClassName,
  loading = false,
  onRefresh,
  pagination = "paged",
  hasMore = false,
  onLoadMore,
  loadingMore = false,
  searchPlaceholder = "以屬性或值篩選",
  emptyMessage = "沒有資料",
  preferences,
  onPreferencesChange,
  collapsedGroups: collapsedGroupsProp,
  onCollapsedGroupsChange,
  selectedKeys: selectedKeysProp,
  onSelectedKeysChange,
  isRowSelectable,
  renderGroupLabel,
  storageKey,
}: {
  /**
   * 標題。收 ReactNode 而不只是字串——使用端常要在標題旁放一個圖示，那不值得
   * 為它多開一個 slot；標題本來就是「工具列最前面那塊」。
   */
  title: React.ReactNode;
  /**
   * 列的疏密。`compact` 只縮直向內距，不動字級與命中區——縮字會讓一張本來就
   * 密的表更難讀，而縮命中區會讓它更難點。
   */
  density?: "regular" | "compact";
  /**
   * 讓表格撐滿 flex 父層，捲動發生在表格內部而不是整頁。
   *
   * 高度落在捲動容器那一層（見 `TableUIComponents.Table` 的
   * `containerClassName`）——設在外面一層，sticky 表頭會錨在一個從不垂直捲動
   * 的元素上，跟著內容一起捲走。
   *
   * 同一個畫面上下疊兩張表時不要開：兩張都想撐滿，結果是兩張都很矮。
   */
  fillHeight?: boolean;
  columns: ConsoleTableColumn<T>[];
  /** 當前頁的列（已排序、篩選、切頁完畢）。 */
  rows: T[];
  /** 篩選後的總筆數，分頁器據此計算頁數；無篩選時即全部筆數。 */
  totalCount: number;
  /** 受控的查詢狀態；使用者操作時透過 onQueryChange 吐出新值。 */
  query: TableQuery;
  onQueryChange: (query: TableQuery) => void;
  rowKey: (row: T) => string;
  /**
   * 欄位篩選選單的選項（欄位 id → 不重複值）。有提供的欄位才會出現在
   * 篩選選單。client adapter 會從全資料算好；server 模式由 distinct API
   * 或設定檔提供。
   */
  filterOptions?: Record<string, string[]>;
  /**
   * 篩選後全部列的 key，「選取全部 N 筆」據此運作；大資料模式給不出
   * 完整清單時省略，跨頁全選按鈕就不顯示（僅保留本頁全選）。
   */
  allFilteredKeys?: string[];
  /**
   * 每組的完整 key（含還沒載入的列）。給了群組的全選才涵蓋整組；缺席時只
   * 涵蓋已載入的列，而且不會顯示成整組選中。
   *
   * 與 `allFilteredKeys` 同一個安排：說得出就是全部，說不出就退為手上有的，
   * 而且不假裝。鍵與 `groupCounts` 同一套（未設定組是空字串）。
   */
  allFilteredKeysByGroup?: Record<string, string[]>;
  /**
   * 與 rows 平行的每列分組路徑（[第一層值, 第二層值?]）。分組生效時由
   * adapter 提供，表格比對相鄰列的路徑在邊界插入群組標題列。
   */
  groupValues?: (string | null)[];
  /**
   * 每組還有沒有未揭露的列（key＝分組值）。分組生效且 adapter 支援每組
   * 揭露時提供；載入更多的觸發點因此落在每組結尾而不是列表末端。
   */
  groupHasMore?: Record<string, boolean>;
  /**
   * 使用者想在某一組底下新增時的回報，帶上該組的值（「未設定」組為 null）。
   * 有給才會在每組結尾顯示新增入口；表格只回報，不自行新增任何列。
   */
  onAddRowToGroup?: (groupValue: string | null) => void;
  /**
   * 逃生口：群組標題右側的客製動作（`⋯` 選單、統計數字…），原樣渲染。
   * 表格不知道一個群組該有什麼選單，所以只提供位置與 hover 顯示的規則。
   * 與工具列的 `extraActions` 同一套哲學。
   */
  renderGroupActions?: (groupValue: string | null) => React.ReactNode;
  /**
   * 群組選單裡的宣告式動作（例如「刪除這一組」）。表格統一外觀與確認，
   * 不執行任何一個——見 ConsoleTableGroupAction。
   */
  groupActions?: ConsoleTableGroupAction[];
  /**
   * 每組筆數（篩選後全資料），key＝JSON.stringify(路徑前綴)。缺席時
   * 群組標題省略「（N）」而不是顯示錯的數字。
   */
  groupCounts?: Record<string, number>;
  /**
   * 每組每欄的統計值，由呼叫端算好（key＝分組值 → 欄位 id → 值）。
   *
   * 逃生口：資料量大到不會一次載完的表格，客戶端永遠算不出正確的總和，所以
   * 這個功能對它們來說只有「不可用」一種狀態。有提供時一律以它為準，揭露到
   * 哪裡就不重要了——形狀比照 `groupCounts`，理由也一樣：真實的數字由知道的
   * 人給，不知道的人不要猜。
   */
  groupAggregates?: Record<string, Record<string, number>>;
  /**
   * 分組功能開關（預設開）。關閉時不渲染分組鈕、分組 chips 與群組
   * 標題列——feature flag 或不需要分組的專案直接餵 false。
   * 注意分組本身只在 `pagination="scroll"` 生效，分頁模式一律不分組。
   */
  enableGrouping?: boolean;
  /** 宣告式工具列動作，樣式與規則由表格統一處理；見 ConsoleTableAction。 */
  actions?: ConsoleTableAction[];
  /** 逃生口：宣告式涵蓋不了的客製內容（下拉選單等），原樣渲染在動作列尾端。 */
  extraActions?: React.ReactNode;
  /**
   * 儲存格送出時的回報。表格只回報，不 mutate `rows`、不發請求、不做樂觀
   * 更新——畫面上的值永遠來自 `rows`，只有使用端餵新資料才會變（design D5）。
   */
  onCellCommit?: (row: T, columnId: string, value: unknown) => void;
  /**
   * 唯讀：關掉**所有**寫入路徑（單格編輯、boolean 開關、範圍寫入、選項
   * 管理、拖曳排序、各種新增入口），不管欄位怎麼宣告、給了哪些回呼。
   *
   * 方向只有一個——**只關不開**。`readOnly` 為 false 不會讓沒宣告的能力
   * 長出來：宣告決定「這個能力存不存在」，這個開關決定「現在能不能用」。
   *
   * 讀取一律保留：儲存格選取、複製、列選取、排序、篩選、分組、收合、
   * 欄寬、偏好設定都照常。「不能改」不該被實作成「不能碰」。
   *
   * **這是介面層的開關，不是安全機制。** 表格只是不畫、不回報；用它表達
   * 權限時，實際的擋阻仍然要做在寫入資料的那一端。
   */
  readOnly?: boolean;
  /**
   * 範圍寫入（刪除、剪下、貼上、復原）的批次回報。**有給才會有這些操作**
   * ——照既有的能力宣告制，沒給的使用端一行都不用改。
   *
   * 一次操作只呼叫一次，不是一格一次：清空 40 格若打 40 個請求，這功能不
   * 能用。做不到批次寫入的使用端請不要給這個 prop，讓功能整組不出現，比
   * 給了之後在使用端拆成 40 個請求誠實。
   *
   * 與 `onCellCommit` 各走各的：單格編輯只走 `onCellCommit`，範圍操作只走
   * 這裡，同一個操作不會被回報兩次。
   */
  onCellsCommit?: (
    edits: { row: T; columnId: string; value: unknown }[],
  ) => void;
  /**
   * `select` 欄位的選項清單被使用者改動時的回報。**有給才會出現選項編輯**
   * （建立／改名／改色／刪除／排序），沒給的欄位清單維持唯讀。
   *
   * 回報的是**整份新清單**而不是「做了什麼操作」：使用端多半把清單存成一個
   * 值，收到「刪了第三個」還得自己重算。要知道改了什麼，比對前後兩份即可。
   *
   * 表格只回報，不改 `columns`、不發請求——畫面上的選項永遠來自欄位宣告。
   * 因此這是 last-write-wins：兩個人同時改同一欄的選項會後蓋前。
   */
  onOptionsChange?: (
    columnId: string,
    options: ConsoleTableSelectOption[],
  ) => void;
  /**
   * 儲存中的格子（以 `cellId(rowKey, columnId)` 產生的字串）。這些格子降
   * 透明度且不可再開啟編輯器。樂觀更新由使用端做，表格只統一視覺。
   */
  savingCells?: string[];
  /**
   * 儲存失敗的格子 → 錯誤訊息。失敗時表格顯示使用者剛才輸入的值而不是
   * 回滾成舊值，輸入才不會不見。
   */
  cellErrors?: Record<string, string>;
  /**
   * 有給才可拖曳排序。表格只回報「被移動的列」與「它的新鄰居」，不 mutate
   * `rows`、不發請求、不做樂觀更新——受控表格只持有當前頁（或已載入的列），
   * 給不出全域順序，但鄰居永遠在手上，也正是使用端算新 order 值需要的東西
   * （取兩個鄰居 order 的中間值，或重編這一段的號碼）。
   *
   * 落在頭或尾時，對應的鄰居為 `null`。
   *
   * 另外回報**落點的歸屬**：`groupValue` 是落點所在組的分組值，`parentKey`
   * 是落點所在的父列 key。同組／同父列內拖曳時它們與該列原本的值相同，
   * 表格不替使用端判斷「這是搬家還是排序」——那取決於值怎麼儲存。
   *
   * **跨組拖曳＝改掉該列的分組欄位值**（跟看板拖卡片改狀態是同一件事）。
   * 使用端沒把新的值寫回去的話，那列在下一次拿到資料時會彈回原本的組——
   * 這是「表格不 mutate rows」的必然結果，不是 bug。
   */
  onRowReorder?: (
    row: T,
    target: {
      before: T | null;
      after: T | null;
      /** 落點所在組的分組值；未分組時為 null。 */
      groupValue: string | null;
      /** 落點所在的父列 key；落在頂層或未宣告子項目時為 null。 */
      parentKey: string | null;
    },
  ) => void;
  /**
   * 這個落點放不放得下。**只在有 `onRowReorder` 時才會被問到。**
   *
   * 結構上不可能的落點（父列卡進別人的子列中間、子列掉到頂層）表格自己就擋
   * 掉了；這裡問的是使用端才知道的規則——不同專案之間不能互搬、已完成的項目
   * 不接受子項目。
   *
   * 拖曳中與放開時問的是同一個問題，所以擋掉的落點連插入線都不會畫。「看得
   * 到線卻放不下去」比「線畫不出來」難懂得多。
   */
  canDrop?: (
    row: T,
    target: {
      before: T | null;
      after: T | null;
      groupValue: string | null;
      parentKey: string | null;
    },
  ) => boolean;
  /**
   * 子項目：回傳父列的 key，`null` 代表這列自己就是父列。有給才有子項目
   * 能力（比照「有 sortValue 才可排序」的宣告制），沒給的表格行為不變。
   *
   * 只支援一層，且**只在 `pagination="scroll"` 生效**——分頁是純以列數
   * 切片，父列與子列在頁界必然被拆散，而父列是真資料、不能像群組標題
   * 那樣在下一頁重畫一次。
   *
   * 資料維持平坦：`rows` 仍然就是實際渲染的列，表格不增減任何列。相鄰性
   * 由 adapter 的父列優先排序保證（手動順序或 server 模式時由使用端保證）。
   */
  subRowOf?: (row: T) => string | null;
  /**
   * 使用者想在某一列底下新增子項目時的回報。有給才會在「沒有子項目的列」
   * 上出現 hover 顯示的新增入口；表格只回報，不自行新增任何列。
   *
   * 注意觸控裝置沒有 hover——那類情境請由使用端另外提供入口（工具列動作
   * 或詳細頁），表格不假裝自己是唯一入口。
   */
  onAddSubRow?: (row: T) => void;
  /**
   * 使用者想打開某一列時的回報（Notion 的 side peek）。有給才會在**第一個
   * 可見欄位**的儲存格右緣長出 hover 才顯示的「開啟」，浮在內容上方。
   * 表格只回報，開什麼、怎麼開（側邊欄、對話框、換頁）由使用端決定——
   * 與第一欄自己放 `<Link>` 的做法可以並存。
   *
   * **只在捲動模式**：分頁版維持既有的「第一欄即詳細頁連結」慣例。
   *
   * 為什麼要一顆按鈕而不是整列可點：列上已經有勾選框、拖曳把手、可編輯的
   * 儲存格，整列可點會跟這些手勢打架；靠右的把手把「看這一列」與「改這一
   * 格」分成兩個不重疊的命中區。
   *
   * 注意觸控裝置沒有 hover——那類情境請由使用端另外提供入口。
   */
  onOpenRow?: (row: T) => void;
  /**
   * 因子項目而保留、自身沒命中篩選的父列 key。由 adapter 提供；表格把
   * 這些父列標示成「為了脈絡而保留」，使用者才不會誤以為它也符合條件。
   */
  retainedParentKeys?: string[];
  /** true 時表格內容顯示 skeleton；與空資料是兩回事。 */
  /**
   * 整列的狀態性強調（已取消畫刪除線、已過去淡出）。**只給樣式，不給行
   * 為**——排序、篩選、選取都不看它。
   *
   * 這件事表格做不到：它不知道一列「已經過去了」是什麼意思。逐格處理則是
   * 把同一個判斷抄進每一欄，那才是真正會走樣的做法。
   */
  rowClassName?: (row: T) => string | undefined;
  loading?: boolean;
  /** 提供時顯示重新整理鈕，載入中會停用並旋轉 icon。 */
  onRefresh?: () => void;
  /**
   * 呈現模式（預設 "paged"）。"scroll" 為連續捲動：不渲染分頁器、把收到
   * 的 rows 全數畫出，適合「邊看邊做」的清單（任務分派、缺失勾稽）。
   * 兩種模式的排序／篩選／分組／選取／欄寬／偏好完全共用，query 也相同。
   */
  pagination?: "paged" | "scroll";
  /** 捲動模式：adapter 回報還有更多列可載入時，列表末端顯示載入更多。 */
  hasMore?: boolean;
  /** 捲動模式：請求下一批列。 */
  onLoadMore?: (groupValue?: string | null) => void;
  /** 捲動模式：下一批載入中（觸發區顯示載入中且不重複觸發）。 */
  loadingMore?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  /**
   * 使用端持有的偏好。有給 `onPreferencesChange` 時以這裡為準。
   */
  preferences?: ConsoleTablePreferences;
  /**
   * 偏好變動時的回報。**有給就由使用端存，表格完全不碰 localStorage。**
   *
   * 回報整包而不是「改了哪一項」：分層（哪幾項進 DB、哪幾項留本機）是
   * 使用端的決定，收到整包才拆得開。
   *
   * 與 `storageKey` 同時給時以這個為準且不重複寫入——同一份狀態不能有
   * 兩個主人，那正是 sort／pageSize 過去的毛病。
   */
  onPreferencesChange?: (next: ConsoleTablePreferences) => void;
  /**
   * 收合的群組值。給了 `onCollapsedGroupsChange` 就是受控——表格只回報，
   * 收合什麼由使用端決定。
   *
   * 存在的理由是「收合什麼」有時候不是一組一組的事：使用端可能想讓一次點擊
   * 收掉好幾組。表格自己不做那種判斷，但也不該擋著。
   */
  collapsedGroups?: string[];
  onCollapsedGroupsChange?: (next: string[]) => void;
  /**
   * 選取的列 key。給了 `onSelectedKeysChange` 就是受控。
   *
   * 選取常常不只是這張表的事：批次操作的按鈕可能在表格外面，或者換一個分頁
   * 之後選取要留著。表格自己不知道那些，但也不該擋著。
   */
  selectedKeys?: string[];
  onSelectedKeysChange?: (next: string[]) => void;
  /**
   * 這一列能不能被選。沒給就是每一列都能。
   *
   * 給合成列用的——使用端插進來當脈絡或當入口的那些列（借來顯示的父列、
   * 「＋ 新增」列）不是資料，勾起來對任何批次操作都沒有意義。
   */
  isRowSelectable?: (row: T) => boolean;
  /**
   * 群組標題上顯示什麼。預設是分組值本身（空值顯示「（未設定）」）。
   *
   * 逃生口，形狀比照 `renderGroupActions`：表格知道這一組是哪一組，不知道那
   * 個值對使用端**讀起來**是什麼。無障礙的名稱仍然用原始字串——它要穩定、
   * 要可預期，不能跟著一段任意的 JSX 走。
   */
  renderGroupLabel?: (groupValue: string | null) => React.ReactNode;
  /**
   * 提供時，欄寬與偏好設定會以此 key 存進 localStorage，重整後保留。
   * **只在沒給 `onPreferencesChange` 時作為後備。**
   */
  storageKey?: string;
}) {
  /**
   * 選取的列。使用端給了 `onSelectedKeysChange` 就走受控——與 `query`、
   * `preferences`、`collapsedGroups` 同一個安排。
   *
   * 需要受控是因為選取常常不只是這張表的事：批次操作的按鈕可能在表格外面，
   * 或者換一個分頁之後選取要留著。表格自己不知道那些，但也不該擋著。
   */
  const [uncontrolledSelected, setUncontrolledSelected] = useState<Set<string>>(
    new Set(),
  );
  const controlledSelection = !!onSelectedKeysChange;
  const selectedKeys = controlledSelection
    ? new Set(selectedKeysProp ?? [])
    : uncontrolledSelected;
  function setSelectedKeys(
    update: Set<string> | ((prev: Set<string>) => Set<string>),
  ) {
    const next = typeof update === "function" ? update(selectedKeys) : update;
    if (controlledSelection) onSelectedKeysChange!([...next]);
    else setUncontrolledSelected(next);
  }
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [wrapLines, setWrapLines] = useState(false);
  /** 每欄選的統計。空物件＝都沒選，整條統計列不渲染。 */
  const [aggregates, setAggregates] = useState<Record<string, Aggregate>>({});
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  /** 欄寬拖曳中。拖曳期間不回報偏好，放開才提交一次。 */
  const [resizing, setResizing] = useState(false);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);

  // 生效中的欄位順序；解析成本極小，每次渲染重算（見 resolveColumnOrder）
  const orderedColumns = resolveColumnOrder(columns, columnOrder);

  /** 內容會變的操作（搜尋、篩選、排序、每頁筆數）一律回到第一頁。 */
  function patchQuery(patch: Partial<TableQuery>) {
    // 換頁、排序、篩選、搜尋、分組都會換掉可見列——開著的編輯器必須關掉並
    // 丟棄草稿，否則草稿會落到不同的列上（design D11）
    cancelEdit();
    onQueryChange({ ...query, pageIndex: 0, ...patch });
  }

  /* ---------------- 儲存格編輯 ---------------- */

  /** 同時間至多一格在編輯；草稿與編輯位置一起存，換格自然丟棄。 */
  const [editing, setEditing] = useState<{
    rowKey: string;
    columnId: string;
  } | null>(null);
  /**
   * 編輯中的草稿。內建型別放的是「使用者打的字」；自帶編輯器放的是
   * **值本身**（不經文字化——那正是逃生口要避免的往返）。
   */
  const [draft, setDraft] = useState<unknown>("");
  /** 編輯器浮出時的錨點——正在編輯那一格的按鈕。 */
  const [editAnchor, setEditAnchor] = useState<HTMLElement | null>(null);
  /**
   * 每格最後一次送出的輸入字串。儲存失敗時要顯示「使用者剛才打的」而不是
   * 回滾——表格不持有資料，唯一還記得那個值的地方就是這裡。
   */
  const [committedInputs, setCommittedInputs] = useState<
    Record<string, string>
  >({});
  /** 編輯器一律吃未格式化的原始值（`1234` 而不是 `1,234`）。 */
  function editorValueOf(
    editable: ConsoleTableEditable<T>,
    row: T,
  ): string {
    const value = editable.getValue(row);
    return value === null || value === undefined ? "" : String(value);
  }

  /**
   * 鍵盤事件的收件人（見下方掛 `tabIndex` 的那層）。編輯器是 popover，關掉
   * 之後焦點會落回 body——不交還給表格的話，Esc 之後方向鍵與複製全部失聯，
   * 使用者得再點一下才接得回來。
   */
  const keyboardHostRef = useRef<HTMLDivElement>(null);

  /**
   * 只在焦點無主時收回來：編輯器還握著焦點（Esc／送出），或 popover 關掉後
   * 焦點掉回 body。使用者已經跑去搜尋框、篩選選單打字時不能搶——`cancelEdit`
   * 也會被「換頁、收合、拖曳就關掉編輯器」那些 effect 呼叫到。
   */
  function returnFocusToTable() {
    const active = document.activeElement;
    const inEditor = !!active?.closest?.('[data-slot="popover-content"]');
    const unowned = !active || active === document.body;
    if (inEditor || unowned) keyboardHostRef.current?.focus();
  }

  /**
   * `editing` 的同步鏡像。編輯器關掉之後 popover 還會再吐一次 focus-out，而
   * 那時處理函式看到的 `editing` 仍是關閉前那一次 render 的值（state 尚未
   * 重繪），會把已經取消的編輯照樣送出。ref 是同步的，用它判斷「還開著嗎」。
   */
  const editingRef = useRef<{ rowKey: string; columnId: string } | null>(null);

  /**
   * 這一次編輯有沒有走過 `onSave`（回報但不關閉）。取消與關閉的分流都靠它：
   * 回報過就沒有東西可還原了。
   *
   * 記「事實」而不是欄位上的旗標——宣告了自動儲存也不代表這一刻真的存過
   * （使用端的 debounce 可能還沒到期），而 `onSave` 被呼叫過就是真的送出過
   * 一次。同步的 ref，因為 commit／cancel 在同一輪事件裡就要讀。
   */
  const savedWhileOpenRef = useRef(false);
  /**
   * 最後一次 `onSave` 之後草稿有沒有再動過。關閉時只在動過才補送——那正是
   * debounce 還沒到期就被關掉時的 flush；沒動過還送就是同一個值寫兩次。
   *
   * 沒用過 `onSave` 的編輯器永遠算「動過」，關閉照舊送出。
   */
  const draftDirtyRef = useRef(true);

  /**
   * 取消／關閉。表格從不 mutate `rows`，所以「取消」本來就只是丟掉草稿——
   * 這一格已經走過 `onSave` 時，使用端早把新值寫進 `rows` 了，同一個動作
   * 自然變成單純關閉，畫面留在已存的值上。**兩種語意共用一段程式碼不是
   * 巧合，是「表格不擁有資料」這條線帶來的**：沒有回滾可做，也就不可能
   * 宣稱一個給不出的還原。
   */
  function cancelEdit() {
    editingRef.current = null;
    savedWhileOpenRef.current = false;
    draftDirtyRef.current = true;
    setEditing(null);
    setDraft("");
    setEditAnchor(null);
    returnFocusToTable();
  }

  function startEdit(
    row: T,
    column: ConsoleTableColumn<T>,
    anchor: HTMLElement,
  ) {
    if (readOnly) return;
    const editable = column.editable;
    if (!editable || editable.type === "boolean") return;
    if (editable.disabled?.(row)) return;
    const id = cellId(rowKey(row), column.id);
    if (savingCells?.includes(id)) return;
    // 開下一格前先結束目前這格，畫面上不會同時有兩個編輯器
    if (editing) commitEdit();
    editingRef.current = { rowKey: rowKey(row), columnId: column.id };
    // 新的一次編輯：兩個狀態都回到起點。同一格重開而這次沒存過的話，Esc
    // 依然是取消——語意跟著這一次編輯走，不跟著欄位走。
    savedWhileOpenRef.current = false;
    draftDirtyRef.current = true;
    setEditing({ rowKey: rowKey(row), columnId: column.id });
    // 自帶編輯器直接拿值，不文字化
    setDraft(
      editable.renderEditor ? editable.getValue(row) : editorValueOf(editable, row),
    );
    setEditAnchor(anchor);
  }

  /** 草稿改動。經過這裡才知道「最後一次 `onSave` 之後有沒有再動過」。 */
  function changeDraft(next: unknown) {
    draftDirtyRef.current = true;
    setDraft(next);
  }

  /**
   * 把一格的新值交給使用端。`onCommit` 與 `onSave` 只差在關不關編輯器，值的
   * 處理是同一條路，所以抽在這裡。
   *
   * - `"reported"`：已回報
   * - `"refused"`：解析不出來（只可能發生在內建型別）——呼叫端應該讓編輯器
   *   留在開啟狀態，把使用者的輸入悄悄丟掉或代換成合法值比擋下來更糟
   * - `"gone"`：列或欄已經不在了（換頁、篩選）——沒有東西可回報
   */
  function reportEdit(nextValue?: unknown): "reported" | "refused" | "gone" {
    if (!editing) return "gone";
    const column = visibleColumns.find((c) => c.id === editing.columnId);
    const row = rows.find((r) => rowKey(r) === editing.rowKey);
    const editable = column?.editable;
    if (!column || !row || !editable) return "gone";

    const draftValue = nextValue ?? draft;

    /**
     * 解析的職責是把「使用者打的字」變成值——清千分位、驗日曆日期、把
     * select 的標籤反查成 value。三種來源不經解析：
     *
     * - `select`／`boolean`：控制項產出的就是值（選單選的是選項本身）
     * - **自帶編輯器**：它交出來的已經是值，再解析只會把物件變字串或
     *   直接拒絕
     *
     * 貼上是另一回事——那時的輸入確實是文字，照樣解析（見 handleTablePaste）。
     */
    const producesValue =
      !!editable.renderEditor ||
      editable.type === "select" ||
      editable.type === "boolean";

    let value: unknown = draftValue;
    if (!producesValue) {
      const parsed = parseCellValue(editable, String(draftValue));
      if (!parsed.ok) return "refused";
      value = parsed.value;
    }

    // 失敗回顯只對「使用者打的字」有意義；自帶編輯器的值回顯不了一段文字
    if (!editable.renderEditor) {
      setCommittedInputs((prev) => ({
        ...prev,
        [cellId(editing.rowKey, editing.columnId)]: String(draftValue),
      }));
    }
    onCellCommit?.(row, column.id, value);
    return "reported";
  }

  /**
   * 送出並關閉。解析不出來時留在開啟狀態——把使用者的輸入悄悄丟掉或代換成
   * 合法值，比擋下來更糟。
   */
  function commitEdit(nextValue?: unknown) {
    if (!editing) return;
    // 已經回報過而草稿沒再動：使用端早就知道這個值了，關閉不必再寫一次。
    // 草稿在最後一次 `onSave` 之後又動過才補送——那正是 debounce 還沒到期
    // 就被關掉時的 flush。
    if (savedWhileOpenRef.current && !draftDirtyRef.current && nextValue === undefined) {
      cancelEdit();
      return;
    }
    if (reportEdit(nextValue) === "refused") return;
    cancelEdit();
  }

  /**
   * 回報但不關閉。給沒有「送出」這個動作的編輯器用（邊改邊存）。
   *
   * 表格不做 debounce——多久寫一次是使用端的存檔策略，不是表格的顯示問題。
   */
  function saveEdit(nextValue: unknown) {
    if (!editing) return;
    const result = reportEdit(nextValue);
    if (result === "gone") {
      cancelEdit();
      return;
    }
    if (result === "refused") return;
    savedWhileOpenRef.current = true;
    draftDirtyRef.current = false;
    // 草稿跟著走，否則編輯器顯示的還是上一個值
    setDraft(nextValue);
  }

  /**
   * Popover 關閉的三條路：Esc 取消、按在「會換掉可見列」的控制項上取消、
   * 其餘（點在別處、按 Enter）送出。
   *
   * 第二條走關閉事件帶的原始 target 判斷，而不是賭事件順序：outside-press
   * 在 pointerdown 就關閉編輯器，分頁按鈕的 onClick 要等 click 才發生，若在
   * 關閉時無條件送出，點「下一頁」會先把草稿存進去再換頁——與「換掉可見列
   * 的操作一律丟棄草稿」相反（design D11）。
   */
  function handleEditorOpenChange(
    open: boolean,
    details: { reason: string; event: Event },
  ) {
    if (open) return;
    // 已經關掉了（見 editingRef）：這一次 focus-out 是關閉的餘波，不是使用者
    // 點到別處
    if (!editingRef.current) return;
    if (details.reason === "escape-key") {
      // Esc 只關最內層。編輯器裡開著設定面板時這一次 Esc 是給面板的——
      // 面板自己會關掉，這裡不能跟著把整個編輯器收掉。
      //
      // 用 DOM 判斷而不是把面板狀態拉上來：Popover 的 Esc 監聽掛在 document
      // 且早於任何內層處理，賭事件順序或 stopPropagation 都擋不住它，只能
      // 在「要不要關」這個決定點上讓開。
      if (document.querySelector("[data-option-settings]")) return;
      cancelEdit();
      return;
    }
    // 開啟編輯器的那一次點擊，其 mouseup／click 會被判定成 outside-press
    // （錨點在浮層外面）。按在自己的錨點上不算離開編輯器，維持開啟。
    const pressed = details.event?.target as Node | null;
    if (pressed && editAnchor?.contains(pressed)) return;
    // 同一格的下一次按壓（雙擊的第二下）也不算離開。上面的錨點比對只擋得住
    // outside-press；focus-out 那一次的 target 是浮層裡的輸入框，比不到錨點，
    // 會一路掉到 commitEdit——雙擊就變成「開了又立刻送出」。
    if (
      editing &&
      pressedCellRef.current === cellId(editing.rowKey, editing.columnId)
    ) {
      return;
    }
    // 一次互動會關兩次：先 focus-out（target 是失焦的輸入框，要看焦點要去
    // 哪裡），再 outside-press（target 就是被按的元素）。兩邊都比對才擋得住
    // 較早的那一次。
    const event = details.event as FocusEvent | undefined;
    const goingTo = [event?.target, event?.relatedTarget] as (Element | null)[];
    if (goingTo.some((node) => node?.closest?.("[data-discards-edit]"))) {
      cancelEdit();
      return;
    }
    commitEdit();
  }

  /* ---------------- 子項目 ---------------- */

  // 只依 query，宣告在子項目區塊之前——收合的暫時覆寫需要它
  const hasActiveFilters =
    query.search.trim() !== "" ||
    Object.values(query.filters).some((values) => values.length > 0);

  /**
   * 子項目只在捲動模式生效——分頁以列數切片，父子在頁界必然被拆散，而
   * 父列是真資料、不能像群組標題那樣在下一頁重畫。分頁模式因此完全平坦。
   */
  const subRowsEnabled = !!subRowOf && pagination === "scroll";

  /** 這一頁的 key → 列，用來從子列找回父列。 */
  const rowsByKey = new Map(rows.map((row) => [rowKey(row), row]));

  /** 是不是子列（父列在不在手上都算——父列被篩掉時仍縮排比較不突兀）。 */
  function isSubRow(row: T): boolean {
    if (!subRowsEnabled) return false;
    const parentKey = subRowOf!(row);
    return parentKey !== null && parentKey !== undefined;
  }

  /** 每個父列有幾個子項目（以目前收到的列計算）。 */
  const subRowCounts = new Map<string, number>();
  if (subRowsEnabled) {
    for (const row of rows) {
      const parentKey = subRowOf!(row);
      if (parentKey === null || parentKey === undefined) continue;
      // 只認得手上有父列的，避免把孤兒子列算到不存在的父列頭上
      if (!rowsByKey.has(parentKey)) continue;
      subRowCounts.set(parentKey, (subRowCounts.get(parentKey) ?? 0) + 1);
    }
  }

  /**
   * 揭露狀態的明確覆寫（key → 展開與否）。預設值由「有沒有子項目」決定：
   * 有子項目＝展開（維持既有畫面），沒有＝收合（否則每一列底下都會掛一條
   * 「新增子項目」，非常吵）。只存使用者實際點過的那些，預設狀態不佔存檔。
   *
   * 揭露是呈現狀態，不進 TableQuery：它影響的是「怎麼看」而不是「看什麼」，
   * 放進 query 會讓 server adapter 每收合一次就重新查詢一遍。
   */
  const [disclosureOverrides, setDisclosureOverrides] = useState<
    Record<string, boolean>
  >({});

  /**
   * 篩選生效時，凡是有子列留在結果中的父列一律視為展開——否則使用者搜到的
   * 東西會藏在收合的父列底下，等於白搜。這是暫時覆寫，不寫回 overrides，
   * 清掉篩選就回到使用者原本的樣子。
   */
  const forcedOpenKeys = new Set<string>();
  if (subRowsEnabled && hasActiveFilters) {
    for (const row of rows) {
      const parentKey = subRowOf!(row);
      if (parentKey !== null && parentKey !== undefined) {
        forcedOpenKeys.add(parentKey);
      }
    }
  }

  function isExpanded(key: string): boolean {
    if (forcedOpenKeys.has(key)) return true;
    const hasChildren = (subRowCounts.get(key) ?? 0) > 0;
    return disclosureOverrides[key] ?? hasChildren;
  }

  function toggleExpanded(key: string) {
    // 收合會讓列從畫面上消失，開著的編輯器草稿會失去落點——與換頁、排序
    // 同一類，一律關閉並丟棄
    cancelEdit();
    const next = !isExpanded(key);
    setDisclosureOverrides((prev) => ({ ...prev, [key]: next }));
  }

  /** 這一列該不該畫：父列永遠畫，子列看它的父列展開了沒。 */
  function isRowVisible(row: T): boolean {
    if (!subRowsEnabled) return true;
    const parentKey = subRowOf!(row);
    if (parentKey === null || parentKey === undefined) return true;
    return isExpanded(parentKey);
  }

  /**
   * 這一列的後面要不要接一條「新增子項目」。父列展開時才出現，接在它的
   * 子列之後；沒有子項目的列展開後就只有這一條——這正是 hover 出現的
   * 三角形要帶使用者去的地方。
   */
  function showsAddRowAfter(row: T, nextRow: T | undefined): boolean {
    if (readOnly || !subRowsEnabled || !onAddSubRow) return false;
    const key = rowKey(row);
    // 子列後面只有在「它是該父列的最後一個子列」時才接
    const parentKey = subRowOf!(row);
    if (parentKey !== null && parentKey !== undefined) {
      if (!isExpanded(parentKey)) return false;
      const nextParent = nextRow ? subRowOf!(nextRow) : null;
      return nextParent !== parentKey;
    }
    // 父列後面：展開且沒有子項目時，緊接著就是新增列
    return isExpanded(key) && (subRowCounts.get(key) ?? 0) === 0;
  }

  /** 「新增子項目」那一列要掛在哪個父列底下。 */
  function addRowParentOf(row: T): T {
    const parentKey = subRowOf?.(row);
    if (parentKey === null || parentKey === undefined) return row;
    return rowsByKey.get(parentKey) ?? row;
  }

  /**
   * 被收合的群組值。與子項目的 disclosureOverrides **分開存**：群組的鍵是
   * 欄位值、子項目的鍵是 rowKey，兩者可能撞名，共用一張表時一個收合會誤動
   * 另一個。加前綴只是隱形約定，仍可能撞。
   */
  /**
   * 收合的群組。使用端給了 `collapsedGroups` 就走受控——與 `query` 和
   * `preferences` 同一個安排：狀態的主人是誰要說得清楚，兩個主人的下場就是
   * 誰後到誰贏。
   */
  const [uncontrolledCollapsed, setUncontrolledCollapsed] = useState<
    Set<string>
  >(new Set());
  const controlledCollapse = !!onCollapsedGroupsChange;
  const collapsedGroups = controlledCollapse
    ? new Set(collapsedGroupsProp ?? [])
    : uncontrolledCollapsed;
  function setCollapsedGroups(
    update: Set<string> | ((prev: Set<string>) => Set<string>),
  ) {
    const next =
      typeof update === "function" ? update(collapsedGroups) : update;
    if (controlledCollapse) onCollapsedGroupsChange!([...next]);
    else setUncontrolledCollapsed(next);
  }

  function isGroupCollapsed(groupKey: string): boolean {
    return collapsedGroups.has(groupKey);
  }

  /**
   * 被隱藏的群組值。與 `collapsedGroups` **分開存**——語意不同：收合看得到
   * 標題，隱藏是整組（含標題）都不畫。合成一個三態欄位會讓「收合後隱藏、
   * 再取消隱藏」不知道該回到哪個狀態；分開存則自然回到原本的收合狀態。
   */
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set());

  function isGroupHidden(groupKey: string): boolean {
    return hiddenGroups.has(groupKey);
  }

  function hideGroup(groupKey: string) {
    // 整組消失，開著的編輯器草稿會失去落點（同收合、換頁）
    cancelEdit();
    setHiddenGroups((prev) => new Set(prev).add(groupKey));
  }

  function unhideGroup(groupKey: string) {
    setHiddenGroups((prev) => {
      const next = new Set(prev);
      next.delete(groupKey);
      return next;
    });
  }

  function unhideAllGroups() {
    setHiddenGroups(new Set());
  }

  /** 等待確認的群組動作；null 代表沒有對話框開著。 */
  const [pendingGroupAction, setPendingGroupAction] = useState<{
    action: ConsoleTableGroupAction;
    groupValue: string | null;
    loadedKeys: string[];
  } | null>(null);

  /** 目前已載入、屬於某一組的列 key。 */
  function loadedKeysOfGroup(groupKey: string): string[] {
    if (!groupValues) return [];
    return rows
      .filter((_, index) => (groupValues[index] ?? "") === groupKey)
      .map(rowKey);
  }

  /**
   * 群組的選取控制項要動哪些 key——**三態判斷與勾選共用這一個取得點**，
   * 不在兩個函式裡各判斷一次，否則遲早會出現「顯示全選但只勾到一半」。
   *
   * adapter 說得出整組就是整組（含還沒載入的列），說不出就是手上這些。這與
   * 全域全選是同一條規則；差別一直只是資料到不到得了，不是原則不同。
   */
  function selectableKeysOfGroup(groupKey: string): string[] {
    return allFilteredKeysByGroup?.[groupKey] ?? loadedKeysOfGroup(groupKey);
  }

  /**
   * 一組的選取三態。依據是**已載入的列**——`allFilteredKeys` 有全部的 key
   * 但沒有分組值，表格認不出未載入的 key 屬於哪一組。
   *
   * 所以某組顯示「30 筆」而只揭露了 10 筆時，那 10 筆全勾也**不會**顯示
   * 成全選：`groupCounts` 說得出總數，就用它拆穿這個差距。寧可顯示未定，
   * 也不要假裝選到了全部。
   */
  function groupSelectionState(
    groupKey: string,
  ): "all" | "some" | "none" {
    const keys = selectableKeysOfGroup(groupKey);
    if (keys.length === 0) return "none";
    const picked = keys.filter((key) => selectedKeys.has(key)).length;
    if (picked === 0) return "none";
    if (picked < keys.length) return "some";
    // adapter 說得出整組時，keys 就是整組，勾滿了就是真的全選。
    // 說不出時 keys 只有已載入的，這一組若還有沒揭露的就不能宣稱整組選中——
    // `groupCounts` 說得出總數，就用它拆穿這個差距。
    if (!allFilteredKeysByGroup) {
      const total = groupCounts?.[groupKey];
      if (total !== undefined && total > keys.length) return "some";
    }
    return "all";
  }

  function toggleGroupSelection(groupKey: string) {
    const keys = selectableKeysOfGroup(groupKey);
    const state = groupSelectionState(groupKey);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      // 未全選就補滿，已全選才取消——三態控制項的慣例
      if (state === "all") keys.forEach((key) => next.delete(key));
      else keys.forEach((key) => next.add(key));
      return next;
    });
  }

  function runGroupAction(
    action: ConsoleTableGroupAction,
    groupValue: string | null,
    groupKey: string,
  ) {
    const loadedKeys = loadedKeysOfGroup(groupKey);
    // 有宣告 confirm 就先問；沒有就直接回報
    if (action.confirm) {
      setPendingGroupAction({ action, groupValue, loadedKeys });
      return;
    }
    action.onSelect(groupValue, loadedKeys);
  }

  function toggleGroupCollapsed(groupKey: string) {
    // 收合會讓列從畫面上消失，草稿一律丟棄（同換頁、排序）
    cancelEdit();
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }

  /* ---------------- 全部展開／收合 ---------------- */

  /** 目前存在的群組值。以 groupCounts 為準——它涵蓋篩選後的全部資料，
   * 而 groupValues 只涵蓋已經揭露的那些列。 */
  function allGroupKeys(): string[] {
    if (groupCounts) return Object.keys(groupCounts);
    return [...new Set((groupValues ?? []).map((v) => v ?? ""))];
  }

  /** 有子項目的父列 key（沒有子項目的列沒有東西可展開）。 */
  function allParentKeys(): string[] {
    return [...subRowCounts.keys()];
  }

  /**
   * 全部收合。**每一個都要明確寫成收合**，不能只把 overrides 清空——
   * overrides 是覆寫，清空等於回到預設，而「有子項目」的預設是展開，
   * 結果會變成全部展開。兩個方向的做法因此不對稱。
   */
  function collapseAll() {
    cancelEdit();
    if (grouping) setCollapsedGroups(new Set(allGroupKeys()));
    if (subRowsEnabled) {
      setDisclosureOverrides((prev) => {
        const next = { ...prev };
        for (const key of allParentKeys()) next[key] = false;
        return next;
      });
    }
  }

  /** 全部展開。 */
  function expandAll() {
    cancelEdit();
    if (grouping) setCollapsedGroups(new Set());
    if (subRowsEnabled) {
      setDisclosureOverrides((prev) => {
        const next = { ...prev };
        for (const key of allParentKeys()) next[key] = true;
        return next;
      });
    }
  }

  /** `Alt` ＋ 點三角形＝把那一次點擊的方向套用到全部。 */
  function applyToAll(expand: boolean) {
    if (expand) expandAll();
    else collapseAll();
  }

  /* ---------------- 手動拖曳排序 ---------------- */

  // 分組只在捲動模式可用：分頁是純以列數切片，分組要求同組相鄰，在頁界
  // 必然斷開。功能關閉或分頁模式時整條分組路徑（按鈕、chips、標題列）都
  // 視同未分組——query.groupBy 保留不動，切回捲動模式即恢復。
  const activeGroupBy =
    enableGrouping && pagination === "scroll" ? query.groupBy : null;

  /** 分組生效中的欄位（找不到該欄位就視同未分組）。 */
  const groupColumn = activeGroupBy
    ? (columns.find((c) => c.id === activeGroupBy && c.filterValue) ?? null)
    : null;
  const grouping = groupColumn !== null;

  /**
   * 是不是所有東西都展開了——按鈕靠它決定下一次點下去要做什麼。
   *
   * **忽略 forcedOpenKeys**：那是篩選造成的暫時覆寫，把它算成「已展開」
   * 會讓篩選一生效按鈕就卡在同一個方向。
   */
  const everythingExpanded =
    (!grouping || allGroupKeys().every((key) => !collapsedGroups.has(key))) &&
    (!subRowsEnabled ||
      allParentKeys().every((key) => disclosureOverrides[key] ?? true));

  /** 有東西可收才提供這個能力；沒有巢狀就不留痕跡。 */
  const hasNesting = grouping || (subRowsEnabled && subRowCounts.size > 0);


  /**
   * 可否拖曳排序。兩個條件：
   * - 使用端要給 onRowReorder
   * - **只在捲動模式**——分頁模式一次只握有一頁，拖曳跨不了頁，手動排一份
   *   長清單得一頁一頁來，做不到它該做的事。
   *
   * 分組與子項目**不再是阻擋條件**。跨組拖曳確實是改掉該列的分組欄位值、
   * 跨父列是改從屬關係，但那正是使用者想做的事（看板拖卡片改狀態是同一
   * 件事）；表格把落點的歸屬一併回報出去，改不改由使用端決定。
   */
  const reorderable = !readOnly && !!onRowReorder && pagination === "scroll";

  /**
   * 前導欄的寬度。裡面最多放三格：拖曳握把、勾選框、揭露三角形，
   * 有幾格就給多寬，後面的欄位起點才會齊。
   */
  const [leadingCellWidth, leadingColumnWidth] =
    reorderable && subRowsEnabled
      ? LEADING_COLUMN_WIDTHS.wide
      : reorderable || subRowsEnabled
        ? LEADING_COLUMN_WIDTHS.medium
        : LEADING_COLUMN_WIDTHS.checkbox;

  /** 拖曳中的列 key 與目前落點（插入在第幾列之前，等於長度即插在最後）。 */
  const [dragging, setDragging] = useState<{
    key: string;
    /** 被拖曳的整串（父列＋它的子列）；視覺上要一起淡出。 */
    movingKeys: string[];
    insertAt: number;
    /** 目前的落點放不下——插入線不畫。 */
    blocked?: boolean;
  } | null>(null);

  const bodyRef = useRef<HTMLTableSectionElement>(null);

  /**
   * 指標位置換算成插入索引：越過某列的中線就算插在它後面。索引是對
   * **畫出來的資料列**（`selectableRows`）而言——收合的群組與收合的子列
   * 沒有畫出來，用 `rows` 的索引會對不上。
   */
  function insertIndexAt(clientY: number): number {
    const body = bodyRef.current;
    if (!body) return 0;
    const rowElements = [...body.querySelectorAll("tr[data-row-key]")];
    let index = 0;
    for (const element of rowElements) {
      const box = element.getBoundingClientRect();
      if (clientY > box.top + box.height / 2) index += 1;
    }
    return index;
  }

  /**
   * 指標是不是停在某個**收合的**群組標題上。收合的組沒有任何可見的列可以
   * 當落點，但使用者就是想把東西丟進那一組——接受它，當成該組的第一個位置。
   */
  function collapsedGroupAt(clientY: number): string | null {
    const body = bodyRef.current;
    if (!body || !grouping) return null;
    for (const element of body.querySelectorAll<HTMLElement>(
      "tr[data-slot=group-header][data-group-value]",
    )) {
      const value = element.dataset.groupValue!;
      if (!isGroupCollapsed(value)) continue;
      const box = element.getBoundingClientRect();
      if (clientY >= box.top && clientY <= box.bottom) return value;
    }
    return null;
  }

  /**
   * 列拖曳。與欄寬拖曳同一個形狀：pointer capture + 在把手上掛 move/up，
   * 不需要 document 層級的監聽，也不用 HTML5 drag-and-drop（拖曳殘影不可控、
   * 觸控支援差）。
   */
  function startRowDrag(event: React.PointerEvent<HTMLElement>, key: string) {
    if (!reorderable) return;
    event.preventDefault();
    event.stopPropagation();
    // 拖曳會換掉列的位置，開著的編輯器必須關閉並丟棄草稿
    cancelEdit();

    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const row = selectableRows.find((r) => rowKey(r) === key);
    const movingKeys = [key];
    if (row && subRowsEnabled && !isSubRow(row)) {
      for (const other of selectableRows) {
        if (subRowOf!(other) === key) movingKeys.push(rowKey(other));
      }
    }
    setDragging({
      key,
      movingKeys,
      insertAt: selectableRowKeys.indexOf(key),
    });

    const onMove = (moveEvent: PointerEvent) => {
      const insertAt = insertIndexAt(moveEvent.clientY);
      // 放開時會問同一個問題。擋掉的落點連線都不畫——看得到線卻放不下去比
      // 線畫不出來難懂得多。
      const blocked = !resolveDropTarget(key, insertAt, moveEvent.clientY);
      setDragging((prev) => (prev ? { ...prev, insertAt, blocked } : prev));
    };
    const onUp = (upEvent: PointerEvent) => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      finishRowDrag(key, insertIndexAt(upEvent.clientY), upEvent.clientY);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  }

  /**
   * `visible` 上第 `index` 個間隙（夾在 index-1 與 index 之間）落在誰的
   * 子列區段裡；不在任何區段內時為 null。
   *
   * 兩種情況算「在區段內」：前一列是子列（＝在它父列的區段中間或尾端），
   * 或前一列是父列而後一列正是它的子列（＝在區段的最前面）。
   */
  function blockParentAt(visible: T[], index: number): string | null {
    if (!subRowsEnabled) return null;
    const before = visible[index - 1];
    const after = visible[index];
    if (before) {
      const beforeParent = subRowOf!(before);
      if (beforeParent !== null && beforeParent !== undefined) {
        return beforeParent;
      }
      if (after && subRowOf!(after) === rowKey(before)) return rowKey(before);
    }
    return null;
  }

  /**
   * 落點算出來的東西：被拖的列、它的新鄰居與歸屬。回傳 `null` 代表這個落點
   * 不成立（沒動、或結構上不允許）。
   *
   * 抽出來是因為拖曳中與放開時要問**同一個問題**：拖曳中要知道「這裡放得下
   * 嗎」才畫得出插入線，放開時要知道「放到哪」。兩邊各算一次的話，畫得出線
   * 卻放不下去是遲早的事。
   */
  function resolveDropTarget(key: string, insertAt: number, clientY: number) {
    const visible = selectableRows;
    const from = visible.findIndex((r) => rowKey(r) === key);
    const row = visible[from];
    if (!row) return null;

    const movingKeys = new Set([key]);
    if (subRowsEnabled && !isSubRow(row)) {
      for (const other of visible) {
        if (subRowOf!(other) === key) movingKeys.add(rowKey(other));
      }
    }
    const span = movingKeys.size;
    const collapsedGroup = collapsedGroupAt(clientY);

    let landing = insertAt;
    if (!collapsedGroup) {
      if (landing >= from && landing <= from + span) return null;
      if (isSubRow(row)) {
        if (blockParentAt(visible, landing) === null) return null;
      } else {
        while (blockParentAt(visible, landing) !== null) landing += 1;
        if (landing >= from && landing <= from + span) return null;
      }
    }

    const others = visible.filter((r) => !movingKeys.has(rowKey(r)));
    const adjusted = landing > from ? landing - span : landing;
    const before = others[adjusted - 1] ?? null;
    const after = others[adjusted] ?? null;
    const anchor = before ?? after;
    const target = {
      before,
      after,
      groupValue: collapsedGroup ?? (anchor ? groupValueOf(anchor) : null),
      parentKey: collapsedGroup
        ? null
        : isSubRow(row)
          ? blockParentAt(visible, landing)
          : null,
    };
    if (canDrop && !canDrop(row, target)) return null;
    return { row, target };
  }

  function finishRowDrag(key: string, insertAt: number, clientY: number) {
    setDragging(null);
    const resolved = resolveDropTarget(key, insertAt, clientY);
    if (!resolved) return;
    onRowReorder?.(resolved.row, resolved.target);
    // 使用者親手排的順序，任何欄位排序都不該再蓋掉它
    if (query.sort !== "manual") patchQuery({ sort: "manual" });
  }

  /** boolean 沒有編輯態，單擊即回報（design D12）。 */
  function commitBoolean(row: T, column: ConsoleTableColumn<T>, next: boolean) {
    onCellCommit?.(row, column.id, next);
  }

  // 欄寬與偏好設定的 localStorage 持久化。SSR 拿不到 localStorage，所以
  // 掛載後才載入（不用 lazy initializer，避免 hydration mismatch）。載入
  // effect 排在儲存 effect 前：首次掛載時先讀完存檔，儲存 effect 即使先以
  // 預設值覆寫，載入的 setState 重繪後也會把存檔值寫回。
  /* ---------------- 偏好的持久化 ---------------- */

  /**
   * 有 `onPreferencesChange` 就走受控——表格只回報，完全不碰 localStorage。
   * 沒有才用 `storageKey` 走後備。兩者都給時以受控為準且**不重複寫入**：
   * 同一份狀態不能有兩個主人（使用端從 DB 載一份、表格從 localStorage 又
   * 推一份，誰後到誰贏，那正是 sort／pageSize 過去的毛病）。
   */
  const controlledPreferences = !!onPreferencesChange;
  const storageName =
    !controlledPreferences && storageKey
      ? `console-table:${storageKey}`
      : null;

  /** 當下的偏好收成一包。 */
  function currentPreferences(): ConsoleTablePreferences {
    return {
      version: PREFERENCES_VERSION,
      columnWidths,
      // 存實際生效的順序（含補位後的欄位），下次載入即可直接套用
      columnOrder: orderedColumns.map((c) => c.id),
      hiddenColumns: [...hiddenColumns],
      wrapLines,
      // 群組收合與子項目揭露分開存：鍵一個是欄位值、一個是 rowKey，
      // 可能撞名，共用一張表時一個收合會誤動另一個
      collapsedGroups: [...collapsedGroups],
      // 隱藏又另存一份：與收合語意不同，取消隱藏要回到原本的收合狀態
      hiddenGroups: [...hiddenGroups],
      // 只存使用者實際點過的揭露狀態；預設值由有無子項目決定，不必存
      disclosure: disclosureOverrides,
      aggregates,
      pageSize: query.pageSize,
      // 排序與分組一起存：兩者都是「我怎麼看這張表」，沒有理由一個記得
      // 一個忘記（groupBy 過去漏了，這裡補上）
      sort: query.sort,
      groupBy: query.groupBy,
    };
  }

  /**
   * 套用一包偏好。**版本不認得就整包忽略**——逐欄驗型別抓得到形狀改變，
   * 抓不到語意改變（`sort: "manual"` 的意思改過一次，舊存檔照樣讀得進來
   * 只是意思不同）。偏好重置使用者看得見也能重設；「看起來還在但意思
   * 不同」則查不出來。
   */
  function applyPreferences(saved: unknown): Partial<TableQuery> | null {
    if (
      !saved ||
      typeof saved !== "object" ||
      (saved as ConsoleTablePreferences).version !== PREFERENCES_VERSION
    ) {
      return null;
    }
    const prefs = saved as ConsoleTablePreferences;
    if (prefs.columnWidths && typeof prefs.columnWidths === "object") {
      setColumnWidths(prefs.columnWidths);
    }
    if (typeof prefs.wrapLines === "boolean") setWrapLines(prefs.wrapLines);
    if (prefs.aggregates && typeof prefs.aggregates === "object") {
      setAggregates(prefs.aggregates);
    }
    if (Array.isArray(prefs.hiddenColumns)) {
      setHiddenColumns(new Set(prefs.hiddenColumns));
    }
    if (
      Array.isArray(prefs.columnOrder) &&
      prefs.columnOrder.every((id) => typeof id === "string")
    ) {
      setColumnOrder(prefs.columnOrder);
    }
    if (
      prefs.disclosure &&
      typeof prefs.disclosure === "object" &&
      !Array.isArray(prefs.disclosure)
    ) {
      // 存檔裡已不存在的 key 留著也無妨——只在該列出現時才查
      setDisclosureOverrides(
        Object.fromEntries(
          Object.entries(prefs.disclosure).filter(
            ([, value]) => typeof value === "boolean",
          ),
        ),
      );
    }
    if (
      Array.isArray(prefs.collapsedGroups) &&
      prefs.collapsedGroups.every((k) => typeof k === "string")
    ) {
      setCollapsedGroups(new Set(prefs.collapsedGroups));
    }
    if (
      Array.isArray(prefs.hiddenGroups) &&
      prefs.hiddenGroups.every((k) => typeof k === "string")
    ) {
      setHiddenGroups(new Set(prefs.hiddenGroups));
    }

    // query 的三項往外吐而不是自己 setState——它們的真身是受控的
    const patch: Partial<TableQuery> = {};
    if (
      PAGE_SIZE_OPTIONS.includes(prefs.pageSize as number) &&
      prefs.pageSize !== query.pageSize
    ) {
      patch.pageSize = prefs.pageSize;
    }
    const savedSort = parseStoredSort(prefs.sort, columns);
    if (savedSort !== undefined) patch.sort = savedSort;
    if (prefs.groupBy === null || typeof prefs.groupBy === "string") {
      // 指向已不存在的欄位就忽略，比照排序的處置
      if (
        prefs.groupBy === null ||
        columns.some(
          (c) => c.id === prefs.groupBy && (c.filterValue || c.groupValue),
        )
      ) {
        patch.groupBy = prefs.groupBy;
      }
    }
    return patch;
  }

  /* eslint-disable react-hooks/set-state-in-effect -- 一次性的掛載後載入：
     SSR 期間拿不到 localStorage，若改用 lazy initializer 會造成 server／
     client 首繪不一致（hydration mismatch），只能在 effect 裡補水。 */
  const storageLoadedRef = useRef(false);
  useEffect(() => {
    if (storageLoadedRef.current) return;
    // 受控模式：偏好由使用端給，表格不讀 localStorage；套不套用 query 的
    // 那三項也由使用端決定（表格主動推會與它從 DB 載入的那份打架）
    if (controlledPreferences) {
      storageLoadedRef.current = true;
      if (preferences) applyPreferences(preferences);
      return;
    }
    if (!storageName) return;
    storageLoadedRef.current = true;
    try {
      const raw = localStorage.getItem(storageName);
      if (!raw) return;
      const patch = applyPreferences(JSON.parse(raw));
      if (patch && Object.keys(patch).length > 0) {
        onQueryChange({ ...query, ...patch, pageIndex: 0 });
      }
    } catch {
      // 存檔壞掉就當沒有，維持預設值
    }
    // columns 只用來驗證存檔裡的欄位是否還在；effect 本體有
    // storageLoadedRef 守著，只會跑一次，列進相依不會造成重複載入。
    // applyPreferences 每次 render 都是新的函式，列進去會讓相依永遠變動，
    // 而它只在這個只跑一次的 effect 裡被呼叫，所以刻意排除。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    storageName,
    controlledPreferences,
    preferences,
    query,
    onQueryChange,
    columns,
  ]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // 偏好變動時回報或寫入。欄寬在拖曳期間不進這裡（見 commitColumnWidths）。
  const preferencesSignature = JSON.stringify(currentPreferences());
  const lastReportedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!storageLoadedRef.current) return;
    // 欄寬拖曳中不回報，放開時 resizing 轉 false 會讓這個 effect 重跑一次
    if (resizing) return;
    if (lastReportedRef.current === preferencesSignature) return;
    lastReportedRef.current = preferencesSignature;
    if (controlledPreferences) {
      onPreferencesChange!(JSON.parse(preferencesSignature));
      return;
    }
    if (storageName) localStorage.setItem(storageName, preferencesSignature);
  }, [
    preferencesSignature,
    resizing,
    controlledPreferences,
    onPreferencesChange,
    storageName,
  ]);

  const visibleColumns = orderedColumns.filter((c) => !hiddenColumns.has(c.id));

  /* ---------------- 儲存格選取 ---------------- */

  /**
   * 一格的座標。存 key 與 id 而不是索引——排序、篩選、載入更多、拖曳之後
   * 索引全部失效，會讓選取悄悄跳到別格；複製是會被信任的功能，錯格比沒選
   * 到嚴重得多。
   */
  type CellRef = { rowKey: string; columnId: string };

  /**
   * anchor 是擴選的固定端（`Shift` 擴選時不動的那頭），focus 是作用中的
   * 那一格。兩者相同即單格選取。
   */
  const [selection, setSelection] = useState<{
    anchor: CellRef;
    focus: CellRef;
  } | null>(null);

  /**
   * 可以被選到的列：畫得出來的資料列。群組標題、欄名列、「新增子項目」與
   * 「新增」列本來就不在 `rows` 裡，所以不必特別排除；要排除的是收合起來
   * 的那些——看不到卻複製得到會很怪。
   */
  const selectableRows = rows.filter((row, rowIndex) => {
    if (!isRowVisible(row)) return false;
    // 使用端插進來的合成列不是資料，勾起來對任何批次操作都沒有意義
    if (isRowSelectable && !isRowSelectable(row)) return false;
    if (grouping && groupValues) {
      const groupKey = groupValues[rowIndex] ?? "";
      return !isGroupCollapsed(groupKey) && !isGroupHidden(groupKey);
    }
    return true;
  });

  const selectableRowKeys = selectableRows.map(rowKey);

  /**
   * 每一組手上有哪些列，統計用。
   *
   * 只是「目前拿到的」而不是「這一組的全部」——這個差別就是 `outcomeFor` 存在
   * 的理由，所以名字要說實話。
   */
  const loadedRowsByGroup = new Map<string, T[]>();
  if (grouping && groupValues) {
    rows.forEach((row, rowIndex) => {
      const groupKey = groupValues[rowIndex] ?? "";
      const bucket = loadedRowsByGroup.get(groupKey);
      if (bucket) bucket.push(row);
      else loadedRowsByGroup.set(groupKey, [row]);
    });
  }

  // 自訂 footer 不受「有沒有選統計」影響——它是欄位宣告的，不是使用者選的。
  const anyFooter = columns.some((c) => c.footer);
  const showAggregates =
    grouping && (anyAggregateChosen(aggregates) || anyFooter);

  /**
   * 列是不是整批分塊來的——也就是「這一組到齊了沒」這個問題答不出來。
   *
   * 沒有現成的旗標，但推得出來：adapter 給了 `groupHasMore` 就代表它答得出
   * 每一組；沒給、而全域還有更多列，那些列可能屬於任何一組，於是每一組都不
   * 能算。兩者都沒有就是全部都載完了。
   */
  const chunkedLoading = !groupHasMore && !!hasMore;

  /** 一欄在一組裡該顯示什麼。三態的判斷全在 `aggregate.ts`，這裡只餵資料。 */
  function aggregateOutcome(groupKey: string, column: ConsoleTableColumn<T>) {
    const aggregate = aggregates[column.id] ?? "none";
    const editable = column.editable;
    // 宣告了怎麼取就走它，否則維持內建 number 欄位那條路。兩者都取不到時
    // 選單本來就沒有「總和」可選（見 isSummable），這裡只是不去算。
    const rowsOfGroup = loadedRowsByGroup.get(groupKey) ?? [];
    const values =
      aggregate !== "sum"
        ? []
        : column.aggregateValue
          ? rowsOfGroup
              .map((row) => column.aggregateValue!(row))
              .filter((value): value is number => typeof value === "number")
          : editable?.type === "number"
            ? rowsOfGroup
                .map((row) => editable.getValue(row))
                .filter((value): value is number => typeof value === "number")
            : [];
    return outcomeFor({
      aggregate,
      supplied: groupAggregates?.[groupKey]?.[column.id],
      count: groupCounts?.[groupKey],
      coverage: {
        hasMore: groupHasMore?.[groupKey] ?? false,
        // 分塊模式下批次是全域的，所以「這組沒有 hasMore」不代表它的列到齊了。
        chunked: chunkedLoading,
      },
      values,
    });
  }

  /** key → 這一列的分組值；拖曳要靠它算出落點屬於哪一組。 */
  const groupValueByKey = new Map<string, string | null>(
    groupValues
      ? rows.map((row, index) => [rowKey(row), groupValues[index] ?? null])
      : [],
  );

  function groupValueOf(row: T): string | null {
    return groupValueByKey.get(rowKey(row)) ?? null;
  }

  /** 拖曳的落點指示線畫在「畫出來的第幾列」上，與 insertAt 同一套索引。 */
  const visibleIndexByKey = new Map(
    selectableRowKeys.map((key, index) => [key, index]),
  );

  function cellExists(cell: CellRef): boolean {
    return (
      selectableRowKeys.includes(cell.rowKey) &&
      visibleColumns.some((c) => c.id === cell.columnId)
    );
  }

  // 選取的兩端只要有一端不在了就整個清掉，不重新定位——資料換過之後
  // 「最接近的那一格」並不是使用者原本選的東西。在 render 期間比對調整
  // （React 官方的 derived-state 做法），繞 effect 會多繪製一次。
  if (selection && !(cellExists(selection.anchor) && cellExists(selection.focus))) {
    setSelection(null);
  }

  /** 作用中儲存格；沒有選取時為 null。 */
  const activeCell = selection?.focus ?? null;

  /**
   * 選取範圍換算成矩形的邊界（列與欄的索引區間）。兩端的索引在這裡才算，
   * 存的是 key，所以資料重排之後矩形會跟著走。
   */
  function selectionBounds() {
    if (!selection) return null;
    const rowA = selectableRowKeys.indexOf(selection.anchor.rowKey);
    const rowB = selectableRowKeys.indexOf(selection.focus.rowKey);
    const colA = visibleColumns.findIndex(
      (c) => c.id === selection.anchor.columnId,
    );
    const colB = visibleColumns.findIndex(
      (c) => c.id === selection.focus.columnId,
    );
    if (rowA === -1 || rowB === -1 || colA === -1 || colB === -1) return null;
    return {
      rowStart: Math.min(rowA, rowB),
      rowEnd: Math.max(rowA, rowB),
      colStart: Math.min(colA, colB),
      colEnd: Math.max(colA, colB),
    };
  }

  const bounds = selectionBounds();

  /** 這一格在不在範圍內。 */
  function isCellSelected(key: string, columnId: string): boolean {
    if (!bounds) return false;
    const rowIndex = selectableRowKeys.indexOf(key);
    const colIndex = visibleColumns.findIndex((c) => c.id === columnId);
    if (rowIndex === -1 || colIndex === -1) return false;
    return (
      rowIndex >= bounds.rowStart &&
      rowIndex <= bounds.rowEnd &&
      colIndex >= bounds.colStart &&
      colIndex <= bounds.colEnd
    );
  }

  function isActiveCell(key: string, columnId: string): boolean {
    return activeCell?.rowKey === key && activeCell.columnId === columnId;
  }

  /** 範圍剛好只有一格（＝沒有在框選）。 */
  function isSingleCellSelection(): boolean {
    if (!selection) return false;
    return (
      selection.anchor.rowKey === selection.focus.rowKey &&
      selection.anchor.columnId === selection.focus.columnId
    );
  }

  /**
   * 這一下的 `mousedown` 落在哪一格。單擊就開編輯器，但「按住從別格拖過來
   * 放開」不算點——記下起點，`click` 時對不上同一格就不開。
   */
  const pressedCellRef = useRef<string | null>(null);

  /**
   * 可否選取儲存格。唯讀時整組關掉——格子點下去只會亮一個框、什麼都做
   * 不了，那個框讀起來像「這裡可以編輯」，反而比沒有回饋更糟。
   *
   * 連帶的代價：沒有選取就沒有範圍，**複製也跟著不能用**。
   */
  const cellSelectable = !readOnly;

  /** 點一格：收合成單格選取。 */
  function selectCell(cell: CellRef) {
    if (!cellSelectable) return;
    setSelection({ anchor: cell, focus: cell });
  }

  /** `Shift` 擴選：anchor 留在原地，只移動 focus。 */
  function extendSelectionTo(cell: CellRef) {
    if (!cellSelectable) return;
    setSelection((prev) =>
      prev ? { anchor: prev.anchor, focus: cell } : { anchor: cell, focus: cell },
    );
  }

  /**
   * 按住往格子上拖＝框出範圍（Notion／Excel 最直覺的做法）。監聽掛在
   * `document` 上而不是格子上，指標拖出表格外再回來才不會斷。
   */
  function startRangeDrag(anchor: CellRef) {
    if (!cellSelectable) return;
    const onMove = (event: PointerEvent) => {
      const cell = (event.target as HTMLElement | null)?.closest?.<HTMLElement>(
        "td[data-column-id]",
      );
      const key = cell?.closest<HTMLElement>("tr[data-row-key]")?.dataset.rowKey;
      const columnId = cell?.dataset.columnId;
      if (!key || !columnId) return;
      if (key === anchor.rowKey && columnId === anchor.columnId) return;
      setSelection({ anchor, focus: { rowKey: key, columnId } });
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  /** 一格對應的 `<td>`；編輯器要靠它定位，捲動也要靠它。 */
  function cellElement(key: string, columnId: string): HTMLElement | null {
    return (
      bodyRef.current?.querySelector<HTMLElement>(
        `tr[data-row-key="${CSS.escape(key)}"] td[data-column-id="${CSS.escape(columnId)}"]`,
      ) ?? null
    );
  }

  /** 把作用中儲存格捲進可視範圍；捲動版才有意義，分頁版是 no-op。 */
  function scrollActiveCellIntoView(cell: CellRef) {
    // 樣式要等這次 render 畫完才套得上，所以延到下一個 frame 再找元素
    requestAnimationFrame(() => {
      cellElement(cell.rowKey, cell.columnId)?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
    });
  }

  /**
   * 方向鍵移動：到頭到尾就停住不繞回——繞回會讓「一直按右鍵」變成掃過
   * 整張表，而使用者以為自己還在同一列。
   */
  function moveActiveCell(
    rowDelta: number,
    columnDelta: number,
    extend: boolean,
  ) {
    if (!activeCell) return;
    const rowIndex = selectableRowKeys.indexOf(activeCell.rowKey);
    const colIndex = visibleColumns.findIndex(
      (c) => c.id === activeCell.columnId,
    );
    if (rowIndex === -1 || colIndex === -1) return;
    const nextRow = Math.min(
      Math.max(rowIndex + rowDelta, 0),
      selectableRowKeys.length - 1,
    );
    const nextCol = Math.min(
      Math.max(colIndex + columnDelta, 0),
      visibleColumns.length - 1,
    );
    const next: CellRef = {
      rowKey: selectableRowKeys[nextRow],
      columnId: visibleColumns[nextCol].id,
    };
    if (extend) extendSelectionTo(next);
    else selectCell(next);
    scrollActiveCellIntoView(next);
  }

  const ARROW_DELTAS: Record<string, [number, number]> = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
  };

  function handleTableKeyDown(event: React.KeyboardEvent) {
    if (!cellSelectable) return;
    // 編輯器開著時鍵盤歸編輯器所有。編輯器是 popover、焦點在它裡面，事件
    // 照理不會冒泡到這裡，但 boolean 的開關是畫在格子裡的，仍要擋一次。
    if (editing) return;
    // 表格以外的輸入元素（搜尋框、篩選選單）不在這棵樹底下，但格子裡可能
    // 有使用端自己放的輸入元素，這裡一律讓它們保有原本的按鍵意義
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable=true]")) {
      return;
    }

    const delta = ARROW_DELTAS[event.key];
    if (delta && activeCell) {
      event.preventDefault();
      moveActiveCell(delta[0], delta[1], event.shiftKey);
      return;
    }

    // 全選可見的格子。要 preventDefault，否則瀏覽器會順手選取整頁文字
    if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === "a" &&
      selectableRowKeys.length > 0 &&
      visibleColumns.length > 0
    ) {
      event.preventDefault();
      setSelection({
        anchor: {
          rowKey: selectableRowKeys[0],
          columnId: visibleColumns[0].id,
        },
        focus: {
          rowKey: selectableRowKeys[selectableRowKeys.length - 1],
          columnId: visibleColumns[visibleColumns.length - 1].id,
        },
      });
      return;
    }

    // 清空範圍。Backspace 一律 preventDefault——舊瀏覽器會拿它返回上一頁
    if (
      (event.key === "Delete" || event.key === "Backspace") &&
      bounds &&
      onCellsCommit
    ) {
      event.preventDefault();
      reportOutcome(clearRangeValues());
      return;
    }

    // 復原。只涵蓋範圍寫入，單格編輯與拖曳排序不進堆疊
    if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === "z" &&
      onCellsCommit
    ) {
      const outcome = undoLastRangeWrite();
      if (!outcome) return;
      event.preventDefault();
      reportOutcome(outcome);
      return;
    }

    // Enter 開編輯器：與雙擊同一件事，鍵盤使用者不必碰滑鼠
    if (event.key === "Enter" && activeCell) {
      const row = rowsByKey.get(activeCell.rowKey);
      const column = visibleColumns.find((c) => c.id === activeCell.columnId);
      if (!row || !column?.editable) return;
      if (column.editable.type === "boolean") return;
      if (column.editable.disabled?.(row)) return;
      if (savingCells?.includes(cellId(activeCell.rowKey, column.id))) return;
      event.preventDefault();
      const element = cellElement(activeCell.rowKey, column.id);
      if (element) startEdit(row, column, element);
      return;
    }

    if (event.key === "Escape" && selection) {
      setSelection(null);
    }
  }

  /* ---------------- 範圍寫入 ---------------- */

  /** 一批範圍寫入的結果，用來告訴使用者實際發生了什麼。 */
  type RangeWriteOutcome = {
    written: number;
    /** 不可寫入或超出邊界而略過。 */
    skipped: number;
    /** 值解析不過而拒絕。 */
    rejected: number;
  };

  /**
   * 復原堆疊。只存範圍寫入的舊值，上限 20 批、只在記憶體。
   *
   * 用 ref 而不是 state：它不影響任何渲染，放進 state 只會讓每次寫入都多
   * 一次重繪。
   */
  const undoStackRef = useRef<
    { rowKey: string; columnId: string; value: unknown }[][]
  >([]);
  const UNDO_LIMIT = 20;

  /**
   * 最近一次範圍寫入的結果訊息。安靜地只改一部分是最糟的結果——使用者
   * 選了 30 格、改到 24 格，必須看得出來。
   */
  const [writeMessage, setWriteMessage] = useState<string | null>(null);

  function reportOutcome(outcome: RangeWriteOutcome) {
    const { written, skipped, rejected } = outcome;
    if (written === 0 && skipped === 0 && rejected === 0) return;
    const parts = [`已更新 ${written} 格`];
    // 全部成功時不提另外兩個數字，不製造雜訊
    if (skipped > 0) parts.push(`略過 ${skipped} 格`);
    if (rejected > 0) parts.push(`${rejected} 格的值無法辨識`);
    setWriteMessage(parts.join("，"));
  }

  /** 這一格能不能被範圍寫入。三條規則集中在這裡，三條寫入路徑共用。 */
  function isCellWritable(row: T, column: ConsoleTableColumn<T>): boolean {
    if (readOnly) return false;
    const editable = column.editable;
    if (!editable) return false;
    if (editable.disabled?.(row)) return false;
    if (savingCells?.includes(cellId(rowKey(row), column.id))) return false;
    return true;
  }

  /**
   * 三條寫入路徑（刪除、剪下、貼上）與復原都收斂到這裡：過濾不可寫入的
   * 格子 → 推復原堆疊 → **呼叫一次** `onCellsCommit` → 回報結果。
   *
   * 各自實作的話「跳過規則」與「復原」會有三份，改一處漏兩處。
   *
   * `valueFor` 回傳 `undefined` 代表這一格的值解析不過（計入 rejected）。
   */
  function applyRangeEdits(
    cells: { row: T; column: ConsoleTableColumn<T> }[],
    valueFor: (
      row: T,
      column: ConsoleTableColumn<T>,
    ) => { ok: true; value: unknown } | { ok: false } | null,
    { recordUndo = true, extraSkipped = 0 } = {},
  ): RangeWriteOutcome {
    if (readOnly || !onCellsCommit) {
      return { written: 0, skipped: 0, rejected: 0 };
    }

    const edits: { row: T; columnId: string; value: unknown }[] = [];
    const previous: { rowKey: string; columnId: string; value: unknown }[] = [];
    let skipped = extraSkipped;
    let rejected = 0;

    for (const { row, column } of cells) {
      if (!isCellWritable(row, column)) {
        skipped += 1;
        continue;
      }
      const resolved = valueFor(row, column);
      // null＝這一格沒有對應的來源值（貼上的內容比範圍窄），不算跳過也不算拒絕
      if (resolved === null) continue;
      if (!resolved.ok) {
        rejected += 1;
        continue;
      }
      edits.push({ row, columnId: column.id, value: resolved.value });
      previous.push({
        rowKey: rowKey(row),
        columnId: column.id,
        value: column.editable!.getValue(row),
      });
    }

    if (edits.length > 0) {
      if (recordUndo) {
        undoStackRef.current = [
          ...undoStackRef.current.slice(-(UNDO_LIMIT - 1)),
          previous,
        ];
      }
      onCellsCommit(edits);
    }
    return { written: edits.length, skipped, rejected };
  }

  /** 目前範圍涵蓋的格子，依列、再依欄展開。 */
  function selectedCells(): { row: T; column: ConsoleTableColumn<T> }[] {
    if (!bounds) return [];
    const out: { row: T; column: ConsoleTableColumn<T> }[] = [];
    for (const row of selectableRows.slice(bounds.rowStart, bounds.rowEnd + 1)) {
      for (const column of visibleColumns.slice(
        bounds.colStart,
        bounds.colEnd + 1,
      )) {
        out.push({ row, column });
      }
    }
    return out;
  }

  /**
   * 清空範圍內的格子。`boolean` 清成 false，其餘 null（design D2）。
   * 與清除「列選取」的 clearSelection 是兩回事，名字刻意分開。
   */
  function clearRangeValues(): RangeWriteOutcome {
    return applyRangeEdits(selectedCells(), (_row, column) => ({
      ok: true,
      value: emptyCellValue(column.editable!),
    }));
  }

  /**
   * 復原：把最近一批的舊值再送一次。這是「重新提交」而不是回溯——使用端
   * 期間若改過那些格子，復原會蓋掉那些改動（design D6，文件有寫）。
   */
  function undoLastRangeWrite(): RangeWriteOutcome | null {
    const batch = undoStackRef.current[undoStackRef.current.length - 1];
    if (!batch) return null;
    undoStackRef.current = undoStackRef.current.slice(0, -1);

    const cells: { row: T; column: ConsoleTableColumn<T> }[] = [];
    const valueByCell = new Map<string, unknown>();
    let skipped = 0;
    for (const entry of batch) {
      const row = rowsByKey.get(entry.rowKey);
      const column = visibleColumns.find((c) => c.id === entry.columnId);
      // 列被篩掉、欄位被隱藏——那一格復原不了，跳過而不是整批放棄
      if (!row || !column) {
        skipped += 1;
        continue;
      }
      cells.push({ row, column });
      valueByCell.set(cellId(entry.rowKey, entry.columnId), entry.value);
    }
    // 復原本身不再進堆疊：否則 Cmd+Z 會在兩個狀態之間來回跳
    return applyRangeEdits(
      cells,
      (row, column) => ({
        ok: true,
        value: valueByCell.get(cellId(rowKey(row), column.id)),
      }),
      { recordUndo: false, extraSkipped: skipped },
    );
  }

  /**
   * 複製：把範圍寫成 TSV 與一份 HTML 表格。用 `copy` 事件而不是
   * `navigator.clipboard.write`——事件同步拿得到 `DataTransfer`，不需要
   * 權限提示，也不用處理非同步失敗。
   */
  /** 範圍的剪貼簿內容；複製與剪下共用一份。 */
  function rangeClipboardPayload(): { plain: string; html: string } | null {
    if (!bounds) return null;
    const rangeRows = selectableRows.slice(bounds.rowStart, bounds.rowEnd + 1);
    const rangeColumns = visibleColumns.slice(
      bounds.colStart,
      bounds.colEnd + 1,
    );
    const matrix = rangeRows.map((row) =>
      // TSV 沒有跳脫語法，值裡的 tab／換行硬塞進去會讓對方解析錯位。
      // 寧可失真也不要錯格。
      rangeColumns.map((column) =>
        cellCopyText(column, row).replace(/[\t\r\n]+/g, " "),
      ),
    );

    return {
      plain:
        matrix.length === 1 && matrix[0].length === 1
          ? matrix[0][0]
          : matrix.map((cells) => cells.join("\t")).join("\n"),
      html: `<table>${matrix
        .map(
          (cells) =>
            `<tr>${cells.map((text) => `<td>${escapeHtml(text)}</td>`).join("")}</tr>`,
        )
        .join("")}</table>`,
    };
  }

  function handleTableCopy(event: React.ClipboardEvent) {
    if (!cellSelectable || !event.clipboardData) return;
    const target = event.target as HTMLElement;
    // 格子裡有選到文字時讓瀏覽器複製那段文字，不要蓋掉使用者的意圖
    if (target.closest("input, textarea, [contenteditable=true]")) return;
    const payload = rangeClipboardPayload();
    if (!payload) return;

    event.clipboardData.setData("text/plain", payload.plain);
    event.clipboardData.setData("text/html", payload.html);
    event.preventDefault();
  }

  /** 剪下＝複製後清空，只回報一次。 */
  function handleTableCut(event: React.ClipboardEvent) {
    if (readOnly || !event.clipboardData || !onCellsCommit) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, [contenteditable=true]")) return;
    const payload = rangeClipboardPayload();
    if (!payload) return;

    event.clipboardData.setData("text/plain", payload.plain);
    event.clipboardData.setData("text/html", payload.html);
    event.preventDefault();
    reportOutcome(clearRangeValues());
  }

  /**
   * 貼上：剪貼簿的 TSV 從作用中儲存格往右下鋪開，**忽略當前選取的大小**。
   * Excel 在選取比剪貼簿大時會平舖填滿、Notion 不會——選一條規則就好，
   * 使用者不必先搞懂自己選了多大（design D4）。
   *
   * 撞到最後一列或最後一欄就截斷；不新增列，表格不憑空造資料。
   */
  function handleTablePaste(event: React.ClipboardEvent) {
    if (readOnly || !activeCell || !onCellsCommit || !event.clipboardData) {
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, [contenteditable=true]")) return;

    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    event.preventDefault();

    // 尾端的換行是試算表常見的產物，會多出一列空白
    const matrix = text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n")
      .map((line) => line.split("\t"));

    const rowStart = selectableRowKeys.indexOf(activeCell.rowKey);
    const colStart = visibleColumns.findIndex(
      (c) => c.id === activeCell.columnId,
    );
    if (rowStart === -1 || colStart === -1) return;

    const rowCount = Math.min(
      matrix.length,
      selectableRows.length - rowStart,
    );
    const colCount = Math.min(
      Math.max(...matrix.map((line) => line.length)),
      visibleColumns.length - colStart,
    );
    // 超出邊界被丟掉的格子要計入「略過」，不能靜靜消失
    const truncated =
      matrix.reduce((sum, line) => sum + line.length, 0) - rowCount * colCount;

    const cells: { row: T; column: ConsoleTableColumn<T> }[] = [];
    const textByCell = new Map<string, string>();
    for (let r = 0; r < rowCount; r++) {
      for (let c = 0; c < colCount; c++) {
        const field = matrix[r][c];
        if (field === undefined) continue;
        const row = selectableRows[rowStart + r];
        const column = visibleColumns[colStart + c];
        cells.push({ row, column });
        textByCell.set(cellId(rowKey(row), column.id), field);
      }
    }

    const outcome = applyRangeEdits(
      cells,
      (row, column) => {
        const field = textByCell.get(cellId(rowKey(row), column.id));
        if (field === undefined) return null;
        const parsed = parseCellValue(column.editable!, field);
        return parsed.ok ? { ok: true, value: parsed.value } : { ok: false };
      },
      { extraSkipped: Math.max(0, truncated) },
    );
    reportOutcome(outcome);

    // 貼完把選取擴到實際寫入的範圍，使用者看得到剛剛動了哪裡
    const lastRow = selectableRowKeys[rowStart + rowCount - 1];
    const lastColumn = visibleColumns[colStart + colCount - 1];
    if (lastRow && lastColumn) {
      setSelection({
        anchor: activeCell,
        focus: { rowKey: lastRow, columnId: lastColumn.id },
      });
    }
  }


  const pageCount = Math.max(1, Math.ceil(totalCount / query.pageSize));
  // 外部狀態可能落在資料縮減後的失效頁，顯示上先 clamp
  const page = Math.min(query.pageIndex, pageCount - 1);

  // 不能被選的列（使用端插進來的合成列）不算在「本頁全部」裡——否則永遠
  // 湊不齊，表頭的勾選框就永遠是半選。
  const rowKeys = rows
    .filter((row) => !isRowSelectable || isRowSelectable(row))
    .map(rowKey);
  const selectedOnPage = rowKeys.filter((key) => selectedKeys.has(key));
  const allOnPageSelected =
    rowKeys.length > 0 && selectedOnPage.length === rowKeys.length;

  /** 目前的欄位排序；手動模式與未設定皆為 null。 */
  const columnSort = query.sort === "manual" ? null : query.sort;

  /** 選單選欄位：同一欄再選一次就翻轉方向，換欄位一律從升冪開始。 */
  function setSort(columnId: string) {
    patchQuery({
      sort:
        columnSort?.columnId !== columnId
          ? { columnId, direction: "asc" }
          : {
              columnId,
              direction: columnSort.direction === "asc" ? "desc" : "asc",
            },
    });
  }

  function setSortDirection(direction: "asc" | "desc") {
    if (!columnSort) return;
    patchQuery({ sort: { columnId: columnSort.columnId, direction } });
  }

  /** 選單切到手動順序；拖曳一列也會走到這裡（見 startRowDrag）。 */
  function setManualSort() {
    patchQuery({ sort: "manual" });
  }

  function toggleColumnFilter(columnId: string, value: string) {
    const values = query.filters[columnId] ?? [];
    patchQuery({
      filters: {
        ...query.filters,
        [columnId]: values.includes(value)
          ? values.filter((v) => v !== value)
          : [...values, value],
      },
    });
  }

  /**
   * 整個取代一欄的篩選值（日期區間用）。空字串＝清掉這一欄，而不是留下一
   * 個空陣列——空陣列會讓 chip 還在但什麼都沒篩。
   */
  function setColumnFilter(columnId: string, value: string) {
    const next = { ...query.filters };
    if (value) next[columnId] = [value];
    else delete next[columnId];
    patchQuery({ filters: next });
  }

  function clearFilters() {
    patchQuery({ search: "", filters: {} });
  }

  function clearColumnFilter(columnId: string) {
    const next = { ...query.filters };
    delete next[columnId];
    patchQuery({ filters: next });
  }

  /** 分組變更（含清除）一律回到第一頁。只有一層，選了就取代。 */
  function setGroupBy(next: string | null) {
    patchQuery({ groupBy: next });
  }

  const scrollMode = pagination === "scroll";

  function toggleAllOnPage() {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) rowKeys.forEach((key) => next.delete(key));
      else rowKeys.forEach((key) => next.add(key));
      return next;
    });
  }

  function toggleRow(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /**
   * 隱藏組裡「目前已載入」的列 key。跨頁全選要扣掉它們——最壞情況決定
   * 這條：隱藏一組、全選、刪除，結果刪到看不見的東西。看得見才選得到。
   *
   * **只認得已載入的列**：表格說不出未載入列的分組值，那些仍可能被全選
   * 選到。這是受控表格的固有限制，不假裝解決（README 有寫）。
   */
  function hiddenLoadedKeys(): Set<string> {
    const keys = new Set<string>();
    if (!grouping || !groupValues || hiddenGroups.size === 0) return keys;
    rows.forEach((row, index) => {
      if (isGroupHidden(groupValues[index] ?? "")) keys.add(rowKey(row));
    });
    return keys;
  }

  /**
   * 跨頁全選：以 adapter 給的篩選後全部 key 為範圍（不是整份資料），
   * 再扣掉隱藏組裡已載入的列。
   *
   * 注意 `totalCount` **不扣** —— 隱藏是「我不想看」不是「這些不算」，
   * 數字跟著畫面設定浮動就不能拿來對帳了。兩者方向相反是刻意的：計數是
   * 陳述事實，全選是準備動作。
   */
  function selectAllFiltered() {
    if (!allFilteredKeys) return;
    const hidden = hiddenLoadedKeys();
    setSelectedKeys(
      new Set(allFilteredKeys.filter((key) => !hidden.has(key))),
    );
  }

  function clearSelection() {
    setSelectedKeys(new Set());
  }

  /**
   * 全域全選的範圍。有 `allFilteredKeys` 就是「篩選後全部」（含未載入），
   * 沒有就退為「已載入的全部」——server adapter 給不出來時的降級，與
   * 跨頁提示既有的行為一致。
   *
   * 隱藏群組的排除自動生效：它作用在同一份 key 上。
   */
  function selectableAllKeys(): string[] {
    const hidden = hiddenLoadedKeys();
    const base = allFilteredKeys ?? rowKeys;
    return base.filter((key) => !hidden.has(key));
  }

  function everythingSelectionState(): "all" | "some" | "none" {
    const keys = selectableAllKeys();
    if (keys.length === 0) return "none";
    const picked = keys.filter((key) => selectedKeys.has(key)).length;
    if (picked === 0) return "none";
    return picked === keys.length ? "all" : "some";
  }

  function toggleEverything() {
    const keys = selectableAllKeys();
    const state = everythingSelectionState();
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (state === "all") keys.forEach((key) => next.delete(key));
      else keys.forEach((key) => next.add(key));
      return next;
    });
  }

  const allFilteredSelected = (() => {
    if (!allFilteredKeys || allFilteredKeys.length === 0) return false;
    const hidden = hiddenLoadedKeys();
    const selectable = allFilteredKeys.filter((key) => !hidden.has(key));
    return (
      selectable.length > 0 && selectable.every((key) => selectedKeys.has(key))
    );
  })();

  /**
   * AWS 式欄寬拖曳。首次拖曳前先把該列所有表頭的實際寬度快照進 state，
   * 表格才能無跳動地從 auto layout 切到 table-fixed；之後拖曳只改目標欄。
   * 拖曳事件掛在把手上並用 pointer capture，不需要 document 層級的監聽。
   */
  function startResize(
    event: React.PointerEvent<HTMLDivElement>,
    columnId: string,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    // 欄名列有兩種身分：未分組時是 thead 的 th，分組生效時是每組自帶的
    // 欄名列（在 tbody，儲存格是 td）。兩邊都要能拖，所以不鎖 th。
    const cell = handle.closest<HTMLTableCellElement>("th, td");
    const headerRow = cell?.parentElement;
    if (!cell || !headerRow) return;

    setColumnWidths((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      const snapshot: Record<string, number> = {};
      headerRow
        .querySelectorAll("th[data-column-id], td[data-column-id]")
        .forEach((headerCell) => {
          snapshot[headerCell.getAttribute("data-column-id")!] = (
            headerCell as HTMLElement
          ).offsetWidth;
        });
      return snapshot;
    });

    const startX = event.clientX;
    const startWidth = cell.offsetWidth;
    // 地板不能把欄位撐寬。短欄（樓層、已複驗 auto layout 只有 40 出頭）
    // 若硬套 80：按下去第一下就往外跳到 80，接著在原地附近怎麼拖都黏在
    // 80 不動，往左想調窄還會變寬——使用者看到的就是「這欄拖不動」。
    const minWidth =
      startWidth < MIN_COLUMN_WIDTH
        ? NARROW_COLUMN_MIN_WIDTH
        : MIN_COLUMN_WIDTH;
    handle.setPointerCapture(event.pointerId);
    // 拖曳期間不回報偏好：寬度每一幀都在變，而回報端可能是同步的
    // localStorage 寫入或一次網路請求。畫面照樣即時更新，只是不落地。
    setResizing(true);
    const onMove = (moveEvent: PointerEvent) => {
      const width = Math.max(minWidth, startWidth + moveEvent.clientX - startX);
      setColumnWidths((prev) => ({ ...prev, [columnId]: width }));
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      // 放開才提交一次；中途重整會失去這一次拖曳，可以接受
      setResizing(false);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  }

  const hasCustomWidths = Object.keys(columnWidths).length > 0;

  // 自訂欄寬模式下，表格寬度＝各欄總和（覆蓋掉 primitive 的 w-full）。
  // 若表格仍是 w-full，總寬被容器鎖死，拉寬一欄就會從其他欄擠空間，
  // 變成「拖一邊、兩邊動」；改成總和後只有被拖的欄變，超過容器就捲動。
  // 120 是欄位在快照之後才從偏好設定重新顯示時的後備寬度。
  const totalWidth = hasCustomWidths
    ? leadingColumnWidth +
      visibleColumns.reduce(
        (sum, column) => sum + (columnWidths[column.id] ?? 120),
        0,
      )
    : undefined;

  // 勾選欄佔一欄，其餘為可見資料欄；群組標題列與空資料列的 colSpan 用它。
  const columnCount = visibleColumns.length + 1;

  /** 正在編輯那一欄的可編輯宣告；沒有在編輯時為 undefined。 */
  const editingEditable = editing
    ? visibleColumns.find((c) => c.id === editing.columnId)?.editable
    : undefined;

  /** 疏密只縮直向內距——縮字級會讓密的表更難讀，縮命中區會更難點。 */
  const densityCellClass = density === "compact" ? "py-1" : undefined;
  const densityHeadClass = density === "compact" ? "h-8 py-0" : undefined;

  const cellWrapClass = wrapLines
    ? "whitespace-normal break-words"
    : // table-fixed 下不換行的內容要能截斷，照 AWS 顯示省略號
      "overflow-hidden text-ellipsis";

  const compact = density === "compact";

  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        // 撐滿父層時 min-h-0 是必要的：flex 子元素的預設最小高度是內容高度，
        // 少了它捲動容器永遠不會比內容矮，於是整頁捲而不是表格內捲。
        fillHeight && "min-h-0 flex-1",
      )}
    >
      {/* Toolbar row 1: title + count, refresh, selection-aware actions */}
      <div
        className="flex flex-wrap items-center justify-between gap-2"
        data-discards-edit="true"
      >
        <h2 className="text-base font-semibold">
          {title}{" "}
          {/* 選取數照 AWS 的「(已選/總數)」格式呈現在標題括號內 */}
          <span className="text-muted-foreground font-normal">
            (
            {selectedKeys.size > 0
              ? `${selectedKeys.size}/${totalCount}`
              : totalCount}
            )
          </span>
        </h2>
        <div className="flex items-center gap-2">
          {onRefresh && (
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="重新整理"
              disabled={loading}
              // 重新整理會換掉整批列，草稿跟著丟棄（同 patchQuery）
              onClick={() => {
                cancelEdit();
                onRefresh();
              }}
            >
              <RotateCw className={cn(loading && "animate-spin")} />
            </Button>
          )}
          {actions
            ?.filter((action) => !action.hidden)
            .map((action) => (
              <ActionButton
                key={action.id}
                action={action}
                selectedKeys={selectedKeys}
              />
            ))}
          {extraActions}
        </div>
      </div>

      {/* Toolbar row 2: search + match count + pagination + preferences */}
      <div className="flex flex-wrap items-center gap-2" data-discards-edit="true">
        <div className="relative min-w-48 flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={query.search}
            onChange={(event) => patchQuery({ search: event.target.value })}
            placeholder={searchPlaceholder}
            className="pl-8"
          />
        </div>
        {hasActiveFilters && (
          <span className="text-muted-foreground text-sm whitespace-nowrap">
            {totalCount} 筆符合
          </span>
        )}
        <div className="flex items-center gap-1">
          {/* 分頁器只在分頁模式出現；捲動模式改由列表末端的載入更多推進 */}
          {!scrollMode && (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="第一頁"
                disabled={page === 0}
                onClick={() => onQueryChange({ ...query, pageIndex: 0 })}
              >
                <ChevronsLeft />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="上一頁"
                disabled={page === 0}
                onClick={() => onQueryChange({ ...query, pageIndex: page - 1 })}
              >
                <ChevronLeft />
              </Button>
              <span className="text-sm tabular-nums">
                {page + 1} / {pageCount}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="下一頁"
                disabled={page >= pageCount - 1}
                onClick={() => onQueryChange({ ...query, pageIndex: page + 1 })}
              >
                <ChevronRight />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="最後一頁"
                disabled={page >= pageCount - 1}
                onClick={() =>
                  onQueryChange({ ...query, pageIndex: pageCount - 1 })
                }
              >
                <ChevronsRight />
              </Button>
            </>
          )}
          <SortMenu
            columns={columns}
            sort={query.sort}
            onSortColumn={setSort}
            onSortDirection={setSortDirection}
            onSortManual={setManualSort}
            reorderable={!!onRowReorder}
          />
          {/* 分組只在捲動模式可用（分頁以列數切片，同組相鄰在頁界必然斷開） */}
          {enableGrouping && scrollMode && (
            <GroupMenu
              columns={columns}
              groupBy={activeGroupBy}
              onChange={setGroupBy}
              hiddenGroups={[...hiddenGroups]}
              onUnhide={unhideGroup}
              onUnhideAll={unhideAllGroups}
            />
          )}
          {/* 分組時共用表頭不畫，全選的 checkbox 也就跟著消失了——
              補在工具列。未分組時不渲染：表頭那顆已經在做同樣的事，
              兩顆都宣稱「全選」只會讓人分不清誰的範圍比較大。 */}
          {grouping && rows.length > 0 && (
            <label
              data-select-everything="true"
              className="text-muted-foreground hover:text-foreground flex h-8 items-center gap-1.5 rounded-md px-2 text-sm"
              title={
                everythingSelectionState() === "all" ? "取消全選" : "全選"
              }
            >
              <Checkbox
                aria-label={
                  everythingSelectionState() === "all" ? "取消全選" : "全選"
                }
                checked={everythingSelectionState() === "all"}
                indeterminate={everythingSelectionState() === "some"}
                onCheckedChange={toggleEverything}
              />
              <span className="hidden sm:inline">全選</span>
            </label>
          )}
          {/* 全部展開／收合：把 N 次點擊變成 1 次。沒有巢狀就不渲染，
              不是畫一顆停用的按鈕（照既有的能力宣告制）。 */}
          {hasNesting && (
            <Button
              variant="ghost"
              size="sm"
              aria-label={everythingExpanded ? "全部收合" : "全部展開"}
              title={everythingExpanded ? "全部收合" : "全部展開"}
              onClick={() => (everythingExpanded ? collapseAll() : expandAll())}
            >
              {everythingExpanded ? (
                <ChevronsDownUp className="size-4" />
              ) : (
                <ChevronsUpDown className="size-4" />
              )}
            </Button>
          )}
          <FilterMenu
            columns={columns}
            filterOptions={filterOptions}
            filters={query.filters}
            onToggle={toggleColumnFilter}
            onSetDate={setColumnFilter}
          />
          <PreferencesDialog
            columns={orderedColumns}
            hiddenColumns={hiddenColumns}
            onHiddenColumnsChange={setHiddenColumns}
            onColumnOrderChange={setColumnOrder}
            pageSize={query.pageSize}
            onPageSizeChange={(size) => patchQuery({ pageSize: size })}
            pageSizeLabel={scrollMode ? "每批載入筆數" : "每頁筆數"}
            wrapLines={wrapLines}
            onWrapLinesChange={setWrapLines}
            aggregates={aggregates}
            onAggregatesChange={setAggregates}
            grouping={grouping}
          />
        </div>
      </div>

      {/* Toolbar row 3: 生效中的分組與篩選 chips。分組只有一層，一顆 chip，
          X 即清除分組；「清除篩選」只清篩選、不動分組。 */}
      {(hasActiveFilters || grouping) && (
        <div className="flex flex-wrap items-center gap-2">
          {groupColumn && (
            <span className="border-primary/40 text-primary inline-flex items-center overflow-hidden rounded-md border border-dashed text-xs font-medium">
              <span className="px-2 py-1">分組：{groupColumn.header}</span>
              <button
                type="button"
                aria-label="清除分組"
                onClick={() => setGroupBy(null)}
                className="hover:bg-primary/10 self-stretch px-1.5"
              >
                <X className="size-3" />
              </button>
            </span>
          )}
          {columns
            .filter((column) => (query.filters[column.id]?.length ?? 0) > 0)
            .map((column) => (
              <FilterChip
                key={column.id}
                column={column}
                options={filterOptions[column.id] ?? []}
                selected={query.filters[column.id]!}
                onToggle={(value) => toggleColumnFilter(column.id, value)}
                onSetDate={(value) => setColumnFilter(column.id, value)}
                onClear={() => clearColumnFilter(column.id)}
              />
            ))}
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters}>
              清除篩選
            </Button>
          )}
        </div>
      )}

      {/* 跨頁全選提示：本頁全勾且還有其他頁時，提供把「篩選後全部」
          一次選起來的捷徑（範圍是篩選結果，不是整份資料）。 */}
      {/* 捲動模式沒有頁的概念（本頁＝全部），表頭 checkbox 就是全選 */}
      {!loading && !scrollMode && allOnPageSelected && pageCount > 1 && (
        <div className="bg-muted/50 text-muted-foreground flex flex-wrap items-center gap-1 rounded-md px-3 py-2 text-sm">
          {allFilteredSelected ? (
            <>
              已選取全部 {totalCount} 筆。
              <button
                type="button"
                onClick={clearSelection}
                className="text-primary font-medium hover:underline"
              >
                清除選取
              </button>
            </>
          ) : allFilteredKeys ? (
            <>
              已選取本頁 {selectedOnPage.length} 筆。
              <button
                type="button"
                onClick={selectAllFiltered}
                className="text-primary font-medium hover:underline"
              >
                選取全部 {totalCount} 筆
              </button>
            </>
          ) : null}
        </div>
      )}

      {/* 範圍寫入的結果。安靜地只改一部分是最糟的結果——選了 30 格改到
          24 格，使用者必須看得出來。 */}
      {writeMessage && (
        <div
          data-slot="range-write-message"
          role="status"
          className="bg-muted/50 text-muted-foreground flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm"
        >
          {writeMessage}
          <button
            type="button"
            aria-label="關閉訊息"
            onClick={() => setWriteMessage(null)}
            className="hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* sticky 表頭是對「最近的捲動祖先」定位，而 Table 的 primitive 自帶
          一層 overflow-x-auto 的 wrapper（overflow-y 會一併算成 auto）。捲動
          容器若設在那層外面，sticky 就錨在那個從不垂直捲動的 wrapper 上，
          表頭會跟著內容一起捲走。因此把高度上限、捲動與外框全部下放到它，
          這一層維持 overflow: visible——這層只要一有 overflow（含 hidden）
          就會再次搶走 sticky 的錨點。 */}
      {/* tabIndex 讓表格自己收得到鍵盤事件。掛在這裡而不是 document 上——
          掛 document 會在使用者打字於搜尋框、篩選選單、編輯器裡時搶走
          方向鍵。 */}
      <div
        ref={keyboardHostRef}
        className={cn(
          "focus:outline-none",
          fillHeight
            ? // 撐滿時高度交給 flex，容器自己捲（見 containerClassName）
              "flex min-h-0 flex-1 flex-col"
            : "[&>[data-slot=table-container]]:max-h-[32rem] [&>[data-slot=table-container]]:overflow-auto",
        )}
        aria-busy={loading}
        tabIndex={cellSelectable ? 0 : undefined}
        onKeyDown={handleTableKeyDown}
        onCopy={handleTableCopy}
        onCut={handleTableCut}
        onPaste={handleTablePaste}
      >
        <Table
          containerClassName={
            fillHeight ? "min-h-0 flex-1 overflow-auto" : undefined
          }
          className={cn(hasCustomWidths && "table-fixed")}
          // minWidth 100% 是照 AWS 的地板：欄寬總和小於容器時表格仍撐滿、
          // 多的空間攤回欄位，不會在右側露出空白。
          style={
            totalWidth !== undefined
              ? { width: totalWidth, minWidth: "100%" }
              : undefined
          }
        >
          {hasCustomWidths && (
            <colgroup>
              <col style={{ width: leadingColumnWidth }} />
              {/* 最後一欄不給固定寬，讓它獨自吸收 min-width 地板多出的
                  空間——否則瀏覽器會把剩餘空間按比例攤給所有欄，拖一欄
                  其他欄就跟著微動。表格總寬仍含最後一欄的存檔寬度，所以
                  總寬超過容器時它就是自己的存檔寬。 */}
              {visibleColumns.map((column, index) => (
                <col
                  key={column.id}
                  style={
                    index === visibleColumns.length - 1
                      ? undefined
                      : { width: columnWidths[column.id] ?? 120 }
                  }
                />
              ))}
            </colgroup>
          )}
          {/* 分組生效時每組自帶欄名列，不渲染頂端的共用表頭——兩者並存
              會有兩層意義相同的標題，捲動時還會疊在一起（design D2）。 */}
          {!grouping && (
          <TableHeader data-discards-edit="true">
            <TableRow className="hover:bg-transparent">
              <TableHead
                className={cn(
                  "bg-background sticky top-0 z-10",
                  leadingCellWidth,
                  densityHeadClass,
                )}
              >
                <Checkbox
                  aria-label="選取本頁全部"
                  checked={allOnPageSelected}
                  indeterminate={!allOnPageSelected && selectedOnPage.length > 0}
                  onCheckedChange={toggleAllOnPage}
                />
              </TableHead>
              {visibleColumns.map((column) => {
                const active =
                  columnSort?.columnId === column.id ? columnSort : null;
                return (
                  <TableHead
                    key={column.id}
                    data-column-id={column.id}
                    className={cn(
                      densityHeadClass,
                      // 表頭一律靠左，不跟著儲存格的對齊走：欄名是標籤不是
                      // 資料，整排表頭起點對齊比較容易掃讀；數值欄的儲存格
                      // 仍靠右（見 columnAlign）。
                      "bg-background sticky top-0 z-10 overflow-hidden text-left",
                      column.className,
                    )}
                    aria-sort={
                      active
                        ? active.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                  >
                    {/* 表頭是純標籤，不是排序入口——排序統一在工具列的排序
                        選單操作。aria-sort 仍留著：它描述的是這一欄目前的
                        排序狀態，與用什麼手勢觸發無關。 */}
                    <span
                      className={cn(
                        "inline-flex items-center gap-1",
                        active && "text-foreground font-medium",
                      )}
                    >
                      {column.header}
                    </span>
                    {/* 欄寬拖曳把手：sticky th 本身就是 positioned element，
                        absolute 直接對它定位。視覺上只有一條細分隔線
                        （hover／拖曳時變主色加粗），照 AWS 的樣子。
                        命中區見 RESIZE_HANDLE_CLASS。 */}
                    <div
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`調整${column.header}欄寬`}
                      onPointerDown={(event) =>
                        startResize(event, column.id)
                      }
                      className={RESIZE_HANDLE_CLASS}
                    >
                      <span className="bg-border group-hover/resize:bg-primary group-active/resize:bg-primary h-3/5 w-0.5 rounded-full transition-[width,background-color] group-hover/resize:w-1 group-active/resize:w-1" />
                    </div>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          )}
          <TableBody ref={bodyRef}>
            {loading ? (
              // skeleton：載入中與「沒資料」是兩回事，避免資料到達前
              // 閃過 emptyMessage
              Array.from({ length: 5 }, (_, index) => (
                <TableRow key={index} data-slot="skeleton-row">
                  <TableCell className={leadingCellWidth}>
                    <div className="bg-muted size-4 animate-pulse rounded" />
                  </TableCell>
                  {visibleColumns.map((column) => (
                    <TableCell key={column.id}>
                      <div className="bg-muted h-4 animate-pulse rounded" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columnCount}
                  className="text-muted-foreground h-24 text-center"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, rowIndex) => {
                const key = rowKey(row);
                const selected = selectedKeys.has(key);
                const subRowCount = subRowCounts.get(key) ?? 0;
                // 父列收合時它的子列整批不畫（父列與其他列不受影響）
                if (!isRowVisible(row)) return null;
                // 自身沒命中篩選、只因子項目而留下的父列：降低對比，
                // 讓「這列是脈絡不是結果」看得出來
                const retainedForContext =
                  retainedParentKeys?.includes(key) ?? false;
                const rowNode = (
                  <TableRow
                    data-row-key={key}
                    data-sub-row={isSubRow(row) ? "true" : undefined}
                    data-retained={retainedForContext ? "true" : undefined}
                    data-state={selected ? "selected" : undefined}
                    data-dragging={
                      dragging?.key === key ? "true" : undefined
                    }
                    className={cn(
                      // has-aria-expanded 要關掉——揭露三角形帶了
                      // aria-expanded，不關的話「有子項目的列」會整列變灰。
                      "group/row border-0 has-aria-expanded:bg-transparent",
                      // 橫線兩種模式都畫——一筆一筆之間要分得開。
                      // 直線只有捲動版有（那是 Notion 表格檢視的網格），
                      // 分頁版只要橫向分隔，不要整片格子的框框感。
                      "border-border/60 border-b",
                      retainedForContext && "text-muted-foreground",
                      // 拖父列時整串（含子列）一起淡出，視覺上是一塊在移動
                      dragging?.movingKeys.includes(key) && "opacity-40",
                      // 落點插入線畫在「會被推到下面」的那一列上緣；插在最後
                      // 時畫在最後一列的下緣。索引對的是畫出來的列。
                      dragging &&
                        !dragging.blocked &&
                        dragging.insertAt === visibleIndexByKey.get(key) &&
                        "border-t-primary border-t-2",
                      dragging &&
                        !dragging.blocked &&
                        dragging.insertAt === selectableRows.length &&
                        visibleIndexByKey.get(key) ===
                          selectableRows.length - 1 &&
                        "border-b-primary border-b-2",
                      // 使用端最後套用：狀態性的整列強調（已取消、已過期）
                      // 是這一列的意思，表格不知道那是什麼
                      rowClassName?.(row),
                    )}
                  >
                    <TableCell
                      className={cn(
                        leadingCellWidth,
                        scrollMode && "border-border/60 border-r",
                      )}
                    >
                      <span className="flex items-center gap-1">
                        {/* 拖曳握把在最左邊——它是「抓住整列」的把手，
                            照 Notion 擺在列的最外側，勾選框在它右邊 */}
                        {reorderable && (
                          <span
                            role="button"
                            tabIndex={-1}
                            aria-label={`拖曳排序${key}`}
                            data-drag-handle="true"
                            // 命中區放大到 24px（icon 只有 16px），比照欄寬
                            // 把手：視覺細、好抓
                            className="text-muted-foreground hover:text-foreground flex size-6 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
                            onPointerDown={(event) =>
                              startRowDrag(event, key)
                            }
                          >
                            <GripVertical className="size-4" />
                          </span>
                        )}
                        {(!isRowSelectable || isRowSelectable(row)) && (
                          <Checkbox
                            aria-label="選取此列"
                            checked={selected}
                            onCheckedChange={() => toggleRow(key)}
                          />
                        )}
                        {/* 三角形與拖曳握把現在會同時出現（分組／子項目下
                            也能拖），各佔一格互不擠掉。
                            有子項目＝三角形常駐；沒有子項目＝hover 才出現，
                            展開後只有一條「新增子項目」。 */}
                        {/* 揭露欄位：每一列都佔一格（子列與沒有三角形的列
                            留等寬空白），後面的欄位起點才會齊 */}
                        {subRowsEnabled &&
                          (!isSubRow(row) &&
                          (subRowCount > 0 || (!readOnly && onAddSubRow)) ? (
                            <button
                              type="button"
                              data-disclosure="true"
                              // 收合會讓列消失，草稿一律丟棄而不是送出
                              // （同分頁、排序等會換掉可見列的控制項）
                              data-discards-edit="true"
                              aria-expanded={isExpanded(key)}
                              aria-label={
                                isExpanded(key)
                                  ? `收合${key}的子項目`
                                  : `展開${key}的子項目`
                              }
                              className={cn(
                                "text-muted-foreground hover:text-foreground flex size-6 shrink-0 items-center justify-center",
                                // 沒有子項目時 hover 才出現：想加子項目是
                                // 低頻操作，每列常駐一顆的視覺噪音不划算
                                subRowCount === 0 &&
                                  "opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100",
                              )}
                              onClick={(event) =>
                                event.altKey
                                  ? applyToAll(!isExpanded(key))
                                  : toggleExpanded(key)
                              }
                            >
                              {/* 實心三角（Notion 的樣子）：lucide 全是描邊
                                  icon，沒有現成的實心三角，內嵌一個路徑即可，
                                  不必為此加依賴。旋轉切換方向，比抽換兩顆
                                  icon 順眼。 */}
                              <svg
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                aria-hidden="true"
                                className={cn(
                                  "size-3 transition-transform",
                                  isExpanded(key) && "rotate-90",
                                )}
                              >
                                <path d="M9 5.5 17 12l-8 6.5z" />
                              </svg>
                            </button>
                          ) : (
                            <span className="size-6 shrink-0" />
                          ))}
                      </span>
                    </TableCell>
                    {visibleColumns.map((column, columnIndex) => {
                      const editable = column.editable;
                      const id = cellId(key, column.id);
                      const saving = savingCells?.includes(id) ?? false;
                      const errorMessage = cellErrors?.[id];
                      const isEditing =
                        editing?.rowKey === key &&
                        editing.columnId === column.id;
                      // 失敗時顯示使用者剛才輸入的值，不回滾成舊值
                      const failedInput =
                        errorMessage !== undefined
                          ? committedInputs[id]
                          : undefined;

                      // 存檔失敗時顯示的是「使用者剛才送出的值」，但仍要走
                      // 該型別的顯示規則——select 的標籤顏色、數字的千分位
                      // 都該留著。掉成純文字看起來像值變成了另一種東西，而
                      // 「還沒存進去」本來就是由紅框與 title 表達的。
                      // 自訂 cell 的欄位沒辦法這樣做（它讀的是 row 上還沒更
                      // 新的舊值），維持回顯純文字。
                      const displayEditable =
                        editable && failedInput !== undefined
                          ? editableShowingText(editable, failedInput)
                          : editable;

                      const display =
                        column.cell || !editable ? (
                          (failedInput ?? column.cell?.(row))
                        ) : (
                          <CellDisplay
                            editable={displayEditable!}
                            row={row}
                            // boolean 沒有編輯態，畫出來的開關本身就是
                            // 寫入入口——擋掉編輯器擋不到它，要另外停用
                            disabled={
                              readOnly || saving || editable!.disabled?.(row)
                            }
                            onBooleanToggle={(next) =>
                              commitBoolean(row, column, next)
                            }
                          />
                        );

                      const interactive =
                        !readOnly &&
                        editable &&
                        editable.type !== "boolean" &&
                        !editable.disabled?.(row);

                      const inRange = isCellSelected(key, column.id);
                      const isActive = isActiveCell(key, column.id);
                      // 只掛第一個可見欄位：那是 Notion 的標題屬性所在，也是
                      // 這張表「這一列是什麼」的那一欄。捲動版限定。
                      // 有欄位自己說是身分欄就用它；沒有才退回第一欄。
                      const identityIndex = Math.max(
                        0,
                        visibleColumns.findIndex((c) => c.identity),
                      );
                      const showsOpenRow =
                        !!onOpenRow &&
                        scrollMode &&
                        columnIndex === identityIndex;

                      return (
                        <TableCell
                          key={column.id}
                          data-column-id={column.id}
                          data-cell-selected={inRange ? "true" : undefined}
                          data-cell-active={isActive ? "true" : undefined}
                          onMouseDown={(event) => {
                            // 拖曳把手、checkbox、揭露三角形都在前導欄，
                            // 不會落到這裡；格子裡使用端自己放的連結與按鈕
                            // 要保有原本的行為，只是順手讓該格成為作用中。
                            if (event.shiftKey) {
                              // 擴選時擋掉瀏覽器的文字選取
                              event.preventDefault();
                              extendSelectionTo({
                                rowKey: key,
                                columnId: column.id,
                              });
                              return;
                            }
                            pressedCellRef.current = id;
                            selectCell({ rowKey: key, columnId: column.id });
                            // 按著往旁邊拖就持續擴選，放開結束
                            startRangeDrag({ rowKey: key, columnId: column.id });
                          }}
                          onClick={() => {
                            // 單擊即開編輯器：一下就同時選到這一格與它的值，
                            // 不必先選再點第二下（Notion 的手感）。
                            if (pressedCellRef.current !== id) return;
                            pressedCellRef.current = null;
                            if (!interactive || saving) return;
                            if (isEditing) return;
                            // 按著拖成一片再放開不是「點」，別跳出編輯器
                            if (!isSingleCellSelection()) return;
                            const element = cellElement(key, column.id);
                            if (element) startEdit(row, column, element);
                          }}
                          onDoubleClick={() => {
                            if (!interactive || saving) return;
                            // 第二下已經開了，這裡再開一次會先 commit 一輪
                            if (isEditing) return;
                            const element = cellElement(key, column.id);
                            if (element) startEdit(row, column, element);
                          }}
                          className={cn(
                            ALIGN_CLASS[columnAlign(column)],
                            cellWrapClass,
                            densityCellClass,
                            // 捲動版畫欄與欄之間的直線，讓每一欄讀起來是
                            // 一格（Notion 表格檢視的樣子）。橫線與外框
                            // 仍然不畫——那是「框框感」的來源。
                            scrollMode &&
                              columnIndex < visibleColumns.length - 1 &&
                              "border-border/60 border-r",
                            // 範圍底色；作用中那一格再加一圈框，才分得出
                            // 「選了一塊」與「現在在哪一格」
                            inRange && "bg-primary/10",
                            isActive &&
                              "outline-primary z-10 outline-2 -outline-offset-2",
                            // 有作用中儲存格時關掉原生文字選取，否則拖曳
                            // 選範圍會同時選到文字，畫面上疊兩層藍
                            activeCell && "select-none",
                            saving && "opacity-50",
                            errorMessage &&
                              "outline-destructive/60 -outline-offset-1 outline",
                            // 「開啟」浮在內容上方，要有定位基準
                            showsOpenRow && "relative",
                            column.className,
                          )}
                          // 宣告了型別的欄位表格拿得到純文字值，順手讓截斷的
                          // 內容可用滑鼠停留看到全文；自訂 cell 的欄位取不到
                          title={
                            errorMessage ??
                            (editable
                              ? cellTitleText(editable, row)
                              : undefined)
                          }
                          data-cell-error={errorMessage ? "true" : undefined}
                          data-cell-saving={saving ? "true" : undefined}
                          // 縮排只加在第一個欄位，且固定不隨欄寬拖曳改變
                          style={
                            columnIndex === 0 && isSubRow(row)
                              ? { paddingLeft: "2rem" }
                              : undefined
                          }
                        >
                          {/* 可編輯的提示保留，但不再是 <button>——按鈕會
                              搶焦點也會攔掉點擊，而點擊現在的意思是選取。
                              開編輯器改由雙擊或作用中儲存格上的 Enter。 */}
                          {interactive && !saving ? (
                            <span
                              data-editable-cell="true"
                              className={cn(
                                EDITABLE_HINT_CLASS,
                                isEditing && "ring-ring bg-muted/60 ring-1",
                              )}
                            >
                              {display}
                            </span>
                          ) : (
                            display
                          )}
                          {/* 「開啟」：hover 才出現，浮在內容右緣（Notion 的
                              side peek 入口）。stopPropagation 兩件事都要擋
                              ——mousedown 會選取儲存格並開始框選，click 會開
                              編輯器；這顆按鈕的意思是「看這一列」，不是「改
                              這一格」。 */}
                          {showsOpenRow && (
                            <button
                              type="button"
                              data-open-row="true"
                              aria-label={`開啟${key}`}
                              className="bg-background text-muted-foreground hover:text-foreground ring-border absolute top-1/2 right-2 z-10 flex -translate-y-1/2 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs opacity-0 shadow-sm ring-1 group-hover/row:opacity-100 focus-visible:opacity-100"
                              onMouseDown={(event) => event.stopPropagation()}
                              onClick={(event) => {
                                event.stopPropagation();
                                onOpenRow!(row);
                              }}
                            >
                              <PanelRight className="size-3.5" />
                              開啟
                            </button>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );

                /**
                 * 展開的父列底下、所有子列之後的「新增子項目」列。沒有子項目
                 * 的父列展開後就只有這一條——hover 出現的三角形要帶使用者
                 * 去的正是這裡。
                 */
                const addRowNode = showsAddRowAfter(row, rows[rowIndex + 1]) ? (
                  <TableRow
                    key={`add-${key}`}
                    data-slot="add-sub-row"
                    className={cn(
                      "border-0 hover:bg-transparent",
                      scrollMode && "border-border/60 border-b",
                    )}
                  >
                    {/* 一整條，不切格子——它是一個動作而不是一筆資料，
                        Notion 的「新增子項目」那條也沒有縱線。橫線仍然畫，
                        一筆一筆之間才分得開。 */}
                    <TableCell colSpan={columnCount} className="py-1">
                      <button
                        type="button"
                        data-add-sub-row="true"
                        // 縮排對齊子列的內容
                        className="text-muted-foreground hover:text-foreground ml-8 inline-flex items-center gap-1 text-sm"
                        onClick={() => onAddSubRow!(addRowParentOf(row))}
                      >
                        <Plus className="size-3.5" />
                        新增子項目
                      </button>
                    </TableCell>
                  </TableRow>
                ) : null;

                // 分組生效時，每一組自成一個區塊：標題（可收合）→ 該組的
                // 欄名列 → 該組的列 → 該組的載入更多與新增入口。
                if (!groupValues || !grouping) {
                  return (
                    <Fragment key={key}>
                      {rowNode}
                      {addRowNode}
                    </Fragment>
                  );
                }

                const value = groupValues[rowIndex] ?? null;
                const prevValue =
                  rowIndex === 0 ? undefined : (groupValues[rowIndex - 1] ?? null);
                const nextValue =
                  rowIndex === rows.length - 1
                    ? undefined
                    : (groupValues[rowIndex + 1] ?? null);
                const startsGroup = rowIndex === 0 || value !== prevValue;
                const endsGroup =
                  rowIndex === rows.length - 1 || value !== nextValue;
                const groupKey = value ?? "";
                // 隱藏的組整個不畫——連標題都不留（收合才留標題）
                if (isGroupHidden(groupKey)) return null;
                const collapsed = isGroupCollapsed(groupKey);

                const heading = startsGroup ? (
                  <GroupSectionHeading
                    key={`group-${groupKey}`}
                    label={value === "" || value === null ? "（未設定）" : value}
                    labelNode={renderGroupLabel?.(value)}
                    count={groupCounts?.[groupKey]}
                    collapsed={collapsed}
                    columnCount={columnCount}
                    first={rowIndex === 0}
                    groupValue={groupKey}
                    onToggle={(event) =>
                      event.altKey
                        ? applyToAll(collapsed)
                        : toggleGroupCollapsed(groupKey)
                    }
                    onAdd={
                      !readOnly && onAddRowToGroup
                        ? () => onAddRowToGroup(value)
                        : undefined
                    }
                    menu={
                      <GroupMenuButton
                        label={
                          value === "" || value === null ? "（未設定）" : value
                        }
                        onHide={() => hideGroup(groupKey)}
                        actions={groupActions}
                        onAction={(action: ConsoleTableGroupAction) =>
                          runGroupAction(action, value, groupKey)
                        }
                        extra={renderGroupActions?.(value)}
                      />
                    }
                  />
                ) : null;

                // 收合的組：只留標題，列、欄名列、載入與新增全部不畫——
                // 也因此收合的組不可能觸發載入
                if (collapsed) {
                  return <Fragment key={key}>{heading}</Fragment>;
                }

                // 每組自帶一次欄名列（分組生效時沒有頂端的共用表頭）
                const columnNames = startsGroup ? (
                  <TableRow
                    key={`cols-${groupKey}`}
                    data-slot="group-columns"
                    className="border-border/60 hover:bg-transparent"
                  >
                    {/* 每組的欄名列就是這一組的表頭，全選 checkbox 放在
                        它的前導格——與資料列的 checkbox 同屬一個表格欄位，
                        對齊是天生的；未分組時那顆也正是在共用表頭的同一格。 */}
                    <TableCell
                      className={cn(
                        leadingCellWidth,
                        "border-border/60 border-r",
                      )}
                    >
                      <Checkbox
                        data-group-select="true"
                        aria-label={`選取${
                          value === "" || value === null ? "（未設定）" : value
                        }`}
                        checked={groupSelectionState(groupKey) === "all"}
                        indeterminate={groupSelectionState(groupKey) === "some"}
                        onCheckedChange={() => toggleGroupSelection(groupKey)}
                      />
                    </TableCell>
                    {visibleColumns.map((column, columnIndex) => (
                      <TableCell
                        key={column.id}
                        data-column-id={column.id}
                        className={cn(
                          // select-none：欄名是標籤不是內容，少了它在邊界附近
                          // 沒拖準就會變成選字並拖出一團反白（Notion 也不給選）
                          "text-muted-foreground relative py-1 text-xs font-medium select-none",
                          ALIGN_CLASS[columnAlign(column)],
                          columnIndex < visibleColumns.length - 1 &&
                            "border-border/60 border-r",
                        )}
                      >
                        {column.header}
                        {/* 每組的欄名列都掛把手：欄寬雖然是全表共用一份偏好，
                            但捲到哪一組就在哪一組調是 Notion 的手感——只掛在
                            第一組的話，捲到下面的組就得先捲回去才調得到。 */}
                        <div
                          role="separator"
                          aria-orientation="vertical"
                          aria-label={`調整${column.header}欄寬`}
                          onPointerDown={(event) =>
                            startResize(event, column.id)
                          }
                          className={RESIZE_HANDLE_CLASS}
                        >
                          <span className="bg-border group-hover/resize:bg-primary group-active/resize:bg-primary h-3/5 w-0.5 rounded-full transition-[width,background-color] group-hover/resize:w-1 group-active/resize:w-1" />
                        </div>
                      </TableCell>
                    ))}
                  </TableRow>
                ) : null;

                const groupFooter = endsGroup ? (
                  <Fragment key={`footer-${groupKey}`}>
                    {groupHasMore?.[groupKey] && (
                      <TableRow
                        data-slot="group-load-more"
                        className="border-0 hover:bg-transparent"
                      >
                        <TableCell colSpan={columnCount} className="py-1">
                          <LoadMoreTrigger
                            onLoadMore={() => onLoadMore?.(value)}
                            loading={loadingMore}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                    {!readOnly && onAddRowToGroup && (
                      <TableRow
                        data-slot="group-add-row"
                        className={cn(
                          "border-0 hover:bg-transparent",
                          scrollMode && "border-border/60 border-b",
                        )}
                      >
                        {/* 同「新增子項目」：一整條、不切格子 */}
                        <TableCell colSpan={columnCount} className="py-1">
                          <button
                            type="button"
                            data-add-to-group="true"
                            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
                            onClick={() => onAddRowToGroup(value)}
                          >
                            <Plus className="size-3.5" />
                            新增
                          </button>
                        </TableCell>
                      </TableRow>
                    )}
                    {/* 統計擺在「載入更多」與「新增」之後：先給還能多看幾筆
                        的入口，再給這一組目前的結論。放前面的話，一個標著
                        「還有更多」的區塊上方掛著一個總數，兩者會互相打架。 */}
                    {showAggregates && (
                      <TableRow
                        data-slot="group-aggregates"
                        className="border-border/60 border-t hover:bg-transparent"
                      >
                        <TableCell className={leadingCellWidth} />
                        {visibleColumns.map((column) => {
                          const outcome = aggregateOutcome(groupKey, column);
                          const custom = column.footer?.(
                            loadedRowsByGroup.get(groupKey) ?? [],
                            {
                              complete:
                                !chunkedLoading &&
                                !(groupHasMore?.[groupKey] ?? false),
                            },
                          );
                          return (
                            <TableCell
                              key={column.id}
                              className={cn(
                                "text-muted-foreground py-1 text-xs",
                                ALIGN_CLASS[columnAlign(column)],
                              )}
                            >
                              {column.footer ? (
                                custom
                              ) : outcome.kind === "value" ? (
                                <AggregateValue
                                  column={column}
                                  aggregate={aggregates[column.id] ?? "none"}
                                  value={outcome.value}
                                />
                              ) : outcome.kind === "unavailable" ? (
                                // 沉默的破折號讀起來像壞掉，所以它要能被問。
                                <span title="這一組還有未載入的資料，算不出整組的值">
                                  —
                                </span>
                              ) : null}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    )}
                  </Fragment>
                ) : null;

                return (
                  <Fragment key={key}>
                    {heading}
                    {columnNames}
                    {rowNode}
                    {addRowNode}
                    {groupFooter}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>

        {/* 載入更多：捲到底自動觸發，同時保留可點按控制項（鍵盤使用者、
            以及 IntersectionObserver 不可用的環境如 jsdom）。放在捲動
            容器內，哨兵才會隨表格捲動進入視窗。 */}
        {scrollMode && hasMore && (
          <LoadMoreTrigger onLoadMore={onLoadMore} loading={loadingMore} />
        )}
      </div>

      {/* 群組動作的確認：與編輯器無關，獨立掛在最外層 */}
      <GroupActionConfirm
        pending={pendingGroupAction}
        onCancel={() => setPendingGroupAction(null)}
        onConfirm={() => {
          if (!pendingGroupAction) return;
          const { action, groupValue, loadedKeys } = pendingGroupAction;
          setPendingGroupAction(null);
          action.onSelect(groupValue, loadedKeys);
        }}
      />

      {/* 整張表共用一個編輯器，錨在正在編輯的那一格上 */}
      {editingEditable && (
        <CellEditorPopover
          anchor={editAnchor}
          editable={editingEditable}
          error={
            editing ? cellErrors?.[cellId(editing.rowKey, editing.columnId)] : undefined
          }
          onOpenChange={handleEditorOpenChange}
          onOptionsChange={
            // 有給 onOptionsChange 且正在編輯 select 欄位時才長出選項編輯
            !readOnly && onOptionsChange && editing
              ? (next) => onOptionsChange(editing.columnId, next)
              : undefined
          }
          // 只數得出「已載入的列」——受控表格說不出全域數字，文案也照實說
          optionUsage={
            editing && editingEditable?.type === "select"
              ? (optionValue) =>
                  rows.filter(
                    (row) => editingEditable.getValue(row) === optionValue,
                  ).length
              : undefined
          }
          context={{
            value: draft,
            onChange: changeDraft,
            onCommit: commitEdit,
            onSave: saveEdit,
            onCancel: cancelEdit,
          }}
        />
      )}
    </div>
  );
}

/**
 * 群組標題列：`▸ 群組值（N）`。單位不寫——一列是什麼由這張表在講什麼決定，
 * 寫死「筆」在缺失清單上讀得通，在別的資料上就未必。三角形沿用子項目那顆實心三角，點擊
 * 收合／展開整組。標題列不含 checkbox、不可選取。
 */
/**
 * 群組標題的 `⋯` 選單。組成順序固定——內建（隱藏） → 使用端宣告的
 * `groupActions` → `renderGroupActions` 的自由內容。固定順序讓不同表格
 * 的群組選單長得一致。
 */
/**
 * 群組動作的確認對話框。文案由使用端提供——表格不知道這個動作對它的
 * 資料是什麼意思，寫死「確定要刪除嗎」在動作其實是別的事時就是在說謊。
 */
function GroupActionConfirm({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: {
    action: ConsoleTableGroupAction;
    groupValue: string | null;
    loadedKeys: string[];
  } | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const confirm = pending?.action.confirm;
  return (
    <Dialog
      open={!!confirm}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{confirm?.title}</DialogTitle>
        </DialogHeader>
        {confirm?.description && (
          <p className="text-muted-foreground text-sm">{confirm.description}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button
            variant={
              pending?.action.intent === "destructive"
                ? "destructive"
                : "default"
            }
            onClick={onConfirm}
          >
            {confirm?.confirmLabel ?? "確認"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GroupMenuButton({
  label,
  onHide,
  actions,
  onAction,
  extra,
}: {
  label: string;
  onHide: () => void;
  actions?: ConsoleTableGroupAction[];
  onAction: (action: ConsoleTableGroupAction) => void;
  extra?: React.ReactNode;
}) {
  const destructive = (actions ?? []).filter((a) => a.intent === "destructive");
  const plain = (actions ?? []).filter((a) => a.intent !== "destructive");

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            data-group-menu="true"
            aria-label={`${label}的更多動作`}
            title="更多動作"
            className="hover:text-foreground flex size-5 items-center justify-center rounded-sm"
          />
        }
      >
        <MoreHorizontal className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-1">
        <button
          type="button"
          data-group-hide="true"
          className="hover:bg-muted/60 flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm"
          onClick={onHide}
        >
          <EyeOff className="size-3.5" />
          隱藏此群組
        </button>
        {plain.map((action) => (
          <button
            key={action.id}
            type="button"
            className="hover:bg-muted/60 flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm"
            onClick={() => onAction(action)}
          >
            <action.icon className="size-3.5" />
            {action.label}
          </button>
        ))}
        {extra}
        {/* 破壞性的項目與其餘之間隔一條線，避免手滑 */}
        {destructive.length > 0 && <div className="bg-border my-1 h-px" />}
        {destructive.map((action) => (
          <button
            key={action.id}
            type="button"
            className="text-destructive hover:bg-destructive/10 flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm"
            onClick={() => onAction(action)}
          >
            <action.icon className="size-3.5" />
            {action.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function GroupSectionHeading({
  label,
  labelNode,
  count,
  collapsed,
  columnCount,
  first,
  groupValue,
  onToggle,
  onAdd,
  menu,
}: {
  label: string;
  /** 使用端自訂的標題內容。無障礙名稱仍然用 `label`。 */
  labelNode?: React.ReactNode;
  count: number | undefined;
  collapsed: boolean;
  columnCount: number;
  /** 第一組不留上方留白，否則表格頂端會空一塊。 */
  first: boolean;
  /** 這一組的分組值；拖曳要靠它認出「丟到收合的組上」。 */
  groupValue: string;
  /** 帶事件是為了讓呼叫端判斷 Alt（＝套用到全部）。 */
  onToggle: (event: React.MouseEvent) => void;
  /** 有給才畫「＋」；點下去等同該組結尾那條新增列。 */
  onAdd?: () => void;
  /** 表格自己的 `⋯` 選單（內建項目 ＋ 宣告式 ＋ 逃生口）。 */
  menu?: React.ReactNode;
}) {
  return (
    <TableRow
      data-slot="group-header"
      data-group-value={groupValue}
      className="group/group border-0 hover:bg-transparent has-aria-expanded:bg-transparent"
    >
      {/* 沒有底色、沒有框線——靠上方留白與字重把一組和上一組分開，
          第一組不留（否則表格頂端會空一塊） */}
      <TableCell
        colSpan={columnCount}
        className={cn("pb-1", first ? "pt-1" : "pt-6")}
      >
        <span className="flex items-center gap-1">
        <button
          type="button"
          data-group-disclosure="true"
          // 收合會讓列消失，草稿一律丟棄而不是送出
          data-discards-edit="true"
          aria-expanded={!collapsed}
          aria-label={collapsed ? `展開${label}` : `收合${label}`}
          className="inline-flex items-center gap-1.5 font-medium"
          onClick={onToggle}
        >
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            className={cn(
              "text-muted-foreground size-3 transition-transform",
              !collapsed && "rotate-90",
            )}
          >
            <path d="M9 5.5 17 12l-8 6.5z" />
          </svg>
          {labelNode ?? label}
          {count !== undefined && (
            <span className="text-muted-foreground font-normal tabular-nums">
              （{count}）
            </span>
          )}
        </button>
        {/* 群組動作：hover 才出現（Notion 的行為），不然每組標題後面都掛
            兩顆常亮的按鈕很吵。`⋯` 是表格自己的選單——內建項目在前，
            使用端宣告的接在後面，逃生口的自由內容最後。 */}
        {(menu || onAdd) && (
          <span
            data-group-actions="true"
            className="text-muted-foreground flex items-center gap-0.5 opacity-0 transition-opacity group-hover/group:opacity-100 focus-within:opacity-100"
          >
            {menu}
            {onAdd && (
              <button
                type="button"
                data-add-to-group="true"
                aria-label={`在${label}新增`}
                title={`在${label}新增`}
                className="hover:text-foreground flex size-5 items-center justify-center rounded-sm"
                onClick={onAdd}
              >
                <Plus className="size-3.5" />
              </button>
            )}
          </span>
        )}
        </span>
      </TableCell>
    </TableRow>
  );
}

/** 捲動模式列表末端的載入更多區塊。載入中不重複觸發。 */
function LoadMoreTrigger({
  onLoadMore,
  loading,
}: {
  onLoadMore?: () => void;
  loading: boolean;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  // 以 ref 保存最新的 callback 與載入狀態，observer 才不用隨每次
  // loading 變動重建（重建會在載入完成的瞬間重新觸發一次）
  const stateRef = useRef({ onLoadMore, loading });
  useEffect(() => {
    stateRef.current = { onLoadMore, loading };
  }, [onLoadMore, loading]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) return;
      const { onLoadMore: load, loading: busy } = stateRef.current;
      if (!busy) load?.();
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={sentinelRef}
      data-slot="load-more"
      className="flex justify-center p-3"
    >
      <Button
        variant="outline"
        size="sm"
        disabled={loading}
        onClick={() => onLoadMore?.()}
      >
        {loading ? (
          <>
            <RotateCw className="animate-spin" />
            載入中
          </>
        ) : (
          "載入更多"
        )}
      </Button>
    </div>
  );
}

/**
 * AWS 的齒輪偏好設定：每頁筆數、換行、顯示欄位。照 AWS 的行為採草稿制——
 * 對話框內的變更先存在本地草稿，按「確認」才套用；「取消」或直接關閉
 * （X、backdrop、Esc）都會丟棄草稿。
 */
function PreferencesDialog<T>({
  columns,
  hiddenColumns,
  onHiddenColumnsChange,
  onColumnOrderChange,
  pageSize,
  onPageSizeChange,
  pageSizeLabel = "每頁筆數",
  wrapLines,
  onWrapLinesChange,
  aggregates,
  onAggregatesChange,
  grouping,
}: {
  /** 已依目前順序偏好排好的欄位。 */
  columns: ConsoleTableColumn<T>[];
  hiddenColumns: Set<string>;
  onHiddenColumnsChange: (next: Set<string>) => void;
  onColumnOrderChange: (next: string[]) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  /** 捲動模式下 pageSize 的意思是「每批載入筆數」，文案由外面決定。 */
  pageSizeLabel?: string;
  wrapLines: boolean;
  onWrapLinesChange: (wrap: boolean) => void;
  aggregates: Record<string, Aggregate>;
  onAggregatesChange: (next: Record<string, Aggregate>) => void;
  /** 統計只在分組時有東西可顯示，所以沒分組時整段不出現。 */
  grouping: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draftPageSize, setDraftPageSize] = useState(pageSize);
  const [draftWrapLines, setDraftWrapLines] = useState(wrapLines);
  const [draftHiddenColumns, setDraftHiddenColumns] = useState(hiddenColumns);
  // 草稿順序存 id 陣列；清單含隱藏欄位，隱藏後再顯示才會回到原位
  const [draftOrder, setDraftOrder] = useState(() => columns.map((c) => c.id));
  const [draftAggregates, setDraftAggregates] = useState(aggregates);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      // 每次開啟都從目前生效值重建草稿，前次被丟棄的變更不會殘留
      setDraftPageSize(pageSize);
      setDraftWrapLines(wrapLines);
      setDraftHiddenColumns(hiddenColumns);
      setDraftOrder(columns.map((c) => c.id));
      setDraftAggregates(aggregates);
    }
    setOpen(nextOpen);
  }

  /** 與相鄰項目交換位置。 */
  function move(index: number, delta: number) {
    setDraftOrder((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function confirm() {
    if (draftPageSize !== pageSize) onPageSizeChange(draftPageSize);
    onWrapLinesChange(draftWrapLines);
    onHiddenColumnsChange(draftHiddenColumns);
    onColumnOrderChange(draftOrder);
    onAggregatesChange(draftAggregates);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label="偏好設定" />
        }
      >
        <Settings />
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>偏好設定</DialogTitle>
        </DialogHeader>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-2 text-sm font-medium">{pageSizeLabel}</p>
              {/* 四個互斥選項用一排按鈕就夠，不為此依賴 radio-group。
                  語意仍然是單選（radiogroup／radio ＋ aria-checked），
                  只是外觀是分段按鈕。 */}
              <div
                role="radiogroup"
                aria-label={pageSizeLabel}
                // 固定四欄而不是 flex-wrap：對話框左欄很窄，讓它自己換行
                // 會折成 3+1 那種歪掉的兩排
                className="grid grid-cols-4 gap-1"
              >
                {PAGE_SIZE_OPTIONS.map((size) => {
                  const active = draftPageSize === size;
                  return (
                    <button
                      key={size}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setDraftPageSize(size)}
                      className={cn(
                        "rounded-md border px-1 py-1 text-center text-sm transition-colors",
                        active
                          ? "border-primary bg-primary/10 text-primary font-medium"
                          : "border-border text-muted-foreground hover:bg-muted/60",
                      )}
                    >
                      {size} 筆
                    </button>
                  );
                })}
              </div>
            </div>
            <Label className="flex items-center gap-2 text-sm font-normal">
              <Checkbox
                checked={draftWrapLines}
                onCheckedChange={(checked) =>
                  setDraftWrapLines(checked === true)
                }
              />
              自動換行
            </Label>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">
              顯示欄位與順序{grouping && "、每組統計"}
            </p>
            <div className="flex flex-col gap-1">
              {/* 清單順序＝表格欄位由左至右的順序；隱藏的欄位仍留在清單
                  中保住位置，重新顯示時才會回到原處而不是跳到最後。 */}
              {draftOrder.map((columnId, index) => {
                const column = columns.find((c) => c.id === columnId);
                if (!column) return null;
                return (
                  <div key={columnId} className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${column.header}上移`}
                      className="size-6 shrink-0"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ChevronUp className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${column.header}下移`}
                      className="size-6 shrink-0"
                      disabled={index === draftOrder.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ChevronDown className="size-3.5" />
                    </Button>
                    <Label className="flex min-w-0 flex-1 items-center justify-between gap-2 text-sm font-normal">
                      <span className="truncate">{column.header}</span>
                      {/* 勾選框而不是開關：這是一張「哪些欄位要顯示」的清單，
                          清單項目的選取本來就是勾選框，表格也已經在用它
                          （選取列），不必為此多相依一個控制項。 */}
                      <Checkbox
                        checked={!draftHiddenColumns.has(column.id)}
                        onCheckedChange={(checked) => {
                          setDraftHiddenColumns((prev) => {
                            const next = new Set(prev);
                            if (checked) next.delete(column.id);
                            else next.add(column.id);
                            return next;
                          });
                        }}
                      />
                    </Label>
                    {/* 只有分組時才問。沒分組的話沒有地方顯示答案，一個選了
                        看不到結果的設定比沒有這個設定更難理解。
                        非數字欄不列出「總和」——不是列出來再擋掉。 */}
                    {grouping && (
                      <AggregateChoice
                        column={column}
                        value={draftAggregates[column.id] ?? "none"}
                        onChange={(next) =>
                          setDraftAggregates((prev) => ({
                            ...prev,
                            [column.id]: next,
                          }))
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button onClick={confirm}>確認</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 宣告式工具列動作的統一渲染：primary 填色＋sm 以上顯示文字（以下縮成
 * icon），destructive 可按時轉紅，其餘 outline icon。`href` 以 <a> 跳轉
 * （不綁路由框架，跨專案可用），`onClick` 把選取列交給使用端。
 */
function ActionButton({
  action,
  selectedKeys,
}: {
  action: ConsoleTableAction;
  selectedKeys: Set<string>;
}) {
  const { label, icon: Icon, intent = "default" } = action;
  const disabled = (action.needsSelection ?? false) && selectedKeys.size === 0;
  const isPrimary = intent === "primary";

  const sharedProps = {
    variant: isPrimary ? ("default" as const) : ("outline" as const),
    size: isPrimary ? ("sm" as const) : ("icon-sm" as const),
    "aria-label": label,
    title: label,
    disabled,
    className:
      intent === "destructive"
        ? "enabled:border-destructive/40 enabled:text-destructive enabled:hover:bg-destructive/10 enabled:hover:text-destructive"
        : undefined,
  };
  const content = (
    <>
      <Icon />
      {isPrimary && <span className="hidden sm:inline">{label}</span>}
    </>
  );

  if (action.href && !disabled) {
    return (
      <Button {...sharedProps} render={<a href={action.href} />}>
        {content}
      </Button>
    );
  }
  return (
    <Button
      {...sharedProps}
      onClick={() => action.onClick?.([...selectedKeys])}
    >
      {content}
    </Button>
  );
}

/** 單一欄位的值勾選清單，篩選選單與 chip 編輯器共用。 */
function FilterValuePanel({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: string[] | undefined;
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
      {options.map((value) => (
        <Label
          key={value}
          className="hover:bg-accent flex items-center gap-2 rounded-md px-1.5 py-1 text-sm font-normal"
        >
          <Checkbox
            checked={selected?.includes(value) ?? false}
            onCheckedChange={() => onToggle(value)}
          />
          <span className="truncate">{value}</span>
        </Label>
      ))}
      {options.length === 0 && (
        <p className="text-muted-foreground px-1.5 py-1 text-sm">沒有可選值</p>
      )}
    </div>
  );
}

/**
 * 日期區間的篩選面板：相對區間清單 ＋ 一組自訂起訖。
 *
 * 相對區間是單選而不是複選——「今天」和「本週」同時成立沒有意義，兩個區間
 * 的聯集也不是任何人會想要的東西。所以這裡是 radio 的語意，選了就取代。
 */
function DateRangeFilterPanel({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (next: string) => void;
}) {
  const custom = value && !value.startsWith("bucket:") ? value : "";
  const [from = "", to = ""] = custom.split("|");

  return (
    <div className="flex flex-col gap-1">
      {DATE_BUCKETS.map((bucket) => {
        const id = `bucket:${bucket.id}`;
        return (
          <button
            key={bucket.id}
            type="button"
            data-date-bucket={bucket.id}
            onClick={() => onChange(value === id ? "" : id)}
            className={cn(
              "hover:bg-accent flex items-center justify-between rounded-md px-1.5 py-1 text-sm",
              value === id && "bg-accent font-medium",
            )}
          >
            <span>{bucket.label}</span>
            {value === id && <Check className="size-3.5" />}
          </button>
        );
      })}
      <div className="border-border mt-1 flex flex-col gap-1 border-t pt-2">
        <p className="text-muted-foreground px-1.5 text-xs font-medium">自訂</p>
        <div className="flex items-center gap-1">
          <Input
            type="date"
            aria-label="起"
            value={from}
            className="h-7 px-1.5 text-xs"
            onChange={(e) =>
              onChange(customRangeValue(e.currentTarget.value, to))
            }
          />
          <span className="text-muted-foreground text-xs">～</span>
          <Input
            type="date"
            aria-label="訖"
            value={to}
            className="h-7 px-1.5 text-xs"
            onChange={(e) =>
              onChange(customRangeValue(from, e.currentTarget.value))
            }
          />
        </div>
      </div>
    </div>
  );
}

/**
 * 分組設定 popover：動態層級清單。已選層級依序列出、每層可移除（連同
 * 較深層一併移除，語意單純）；未達 maxLevels 且還有剩餘欄位時提供
 * 「新增層級」清單。候選欄位＝有 filterValue 的欄位（與可篩選同一集合，
 * 分組值即篩選值）。
 */
/**
 * 排序選單。表頭不再是排序入口，所有排序操作集中在這裡：選欄位、選方向、
 * 看目前是照什麼排。手動順序也在這裡呈現——它是排序的第三種狀態，不是
 * 另一個功能。
 */
function SortMenu<T>({
  columns,
  sort,
  onSortColumn,
  onSortDirection,
  onSortManual,
  reorderable,
}: {
  columns: ConsoleTableColumn<T>[];
  sort: SortState | "manual" | null;
  onSortColumn: (columnId: string) => void;
  onSortDirection: (direction: "asc" | "desc") => void;
  /** 切到手動順序。 */
  onSortManual: () => void;
  /** 使用端有沒有提供 onRowReorder；沒有就完全不提手動排序。 */
  reorderable: boolean;
}) {
  const sortableColumns = columns.filter((c) => c.sortValue);
  const manual = sort === "manual";
  const columnSort = manual ? null : sort;
  const activeColumn = columnSort
    ? columns.find((c) => c.id === columnSort.columnId)
    : undefined;

  // 收合狀態就看得出目前照什麼排，不必打開選單
  const summary = manual
    ? "手動排序"
    : activeColumn
      ? `${activeColumn.header}${columnSort!.direction === "asc" ? "↑" : "↓"}`
      : null;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label={summary ? `排序：${summary}` : "排序"}
            title={summary ? `排序：${summary}` : "排序"}
            className={cn("gap-1", summary && "text-primary")}
          />
        }
      >
        <ArrowUpDown className="size-4" />
        {summary && (
          <span className="hidden max-w-24 truncate text-xs sm:inline">
            {summary}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-2">
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground px-1.5 pb-1 text-xs font-medium">
            依欄位排序
          </p>
          {sortableColumns.length === 0 ? (
            <p className="text-muted-foreground px-1.5 py-1 text-sm">
              沒有可排序的欄位
            </p>
          ) : (
            sortableColumns.map((column) => {
              const active = columnSort?.columnId === column.id;
              return (
                <Button
                  key={column.id}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "justify-between gap-2",
                    active && "text-primary",
                  )}
                  onClick={() => onSortColumn(column.id)}
                >
                  <span className="truncate">{column.header}</span>
                  {active &&
                    (columnSort!.direction === "asc" ? (
                      <ArrowUp className="size-3.5 shrink-0" />
                    ) : (
                      <ArrowDown className="size-3.5 shrink-0" />
                    ))}
                </Button>
              );
            })
          )}

          {/* 手動順序是排序的第三種狀態，不是另一個功能——就排在欄位後面，
              選它即切換，選欄位即切回。拖曳握把也會切到這個狀態。 */}
          {reorderable && (
            <Button
              variant="ghost"
              size="sm"
              className={cn("justify-between gap-2", manual && "text-primary")}
              onClick={onSortManual}
            >
              <span className="truncate">手動</span>
              {manual && <GripVertical className="size-3.5 shrink-0" />}
            </Button>
          )}

          {columnSort && (
            <>
              <div className="bg-border my-1 h-px" />
              <div className="flex gap-1 px-0.5">
                <Button
                  variant={
                    columnSort.direction === "asc" ? "secondary" : "ghost"
                  }
                  size="sm"
                  className="flex-1 gap-1"
                  onClick={() => onSortDirection("asc")}
                >
                  <ArrowUp className="size-3.5" />
                  升冪
                </Button>
                <Button
                  variant={
                    columnSort.direction === "desc" ? "secondary" : "ghost"
                  }
                  size="sm"
                  className="flex-1 gap-1"
                  onClick={() => onSortDirection("desc")}
                >
                  <ArrowDown className="size-3.5" />
                  降冪
                </Button>
              </div>
            </>
          )}

        </div>
      </PopoverContent>
    </Popover>
  );
}

function GroupMenu<T>({
  columns,
  groupBy,
  onChange,
  hiddenGroups,
  onUnhide,
  onUnhideAll,
}: {
  columns: ConsoleTableColumn<T>[];
  groupBy: string | null;
  onChange: (next: string | null) => void;
  /** 目前被隱藏的群組值；隱藏必須有回頭路，否則等於資料消失。 */
  hiddenGroups: string[];
  onUnhide: (groupKey: string) => void;
  onUnhideAll: () => void;
}) {
  // 可分組的欄位＝有 filterValue 的欄位（分組值就是篩選值，群組標題與
  // filter chip 的字串一致）
  const groupableColumns = columns.filter((c) => c.filterValue);
  const active = groupBy
    ? (groupableColumns.find((c) => c.id === groupBy) ?? null)
    : null;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={
              hiddenGroups.length > 0
                ? `分組（已隱藏 ${hiddenGroups.length} 組）`
                : "分組"
            }
            title={active ? `分組：${active.header}` : "分組"}
            className={cn(active && "text-primary", "relative")}
          />
        }
      >
        <Rows3 />
        {/* 有東西被藏起來就要看得出來，否則使用者不會知道自己藏過 */}
        {hiddenGroups.length > 0 && (
          <span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full text-[9px] tabular-nums">
            {hiddenGroups.length}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-2">
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground px-1.5 pb-1 text-xs font-medium">
            依欄位分組
          </p>
          {groupableColumns.length === 0 ? (
            <p className="text-muted-foreground px-1.5 py-1 text-sm">
              沒有可分組的欄位
            </p>
          ) : (
            groupableColumns.map((column) => {
              const isActive = column.id === groupBy;
              return (
                <button
                  key={column.id}
                  type="button"
                  // 只有一層：選了就取代，再選一次同一欄即取消
                  onClick={() => onChange(isActive ? null : column.id)}
                  className={cn(
                    "hover:bg-accent flex items-center justify-between rounded-md px-1.5 py-1 text-sm",
                    isActive && "text-primary",
                  )}
                >
                  <span className="truncate">{column.header}</span>
                  {isActive && <X className="size-3.5 shrink-0" />}
                </button>
              );
            })
          )}
        </div>

        {hiddenGroups.length > 0 && (
          <>
            <div className="bg-border my-2 h-px" />
            <div className="flex items-center justify-between px-1.5 pb-1">
              <p className="text-muted-foreground text-xs font-medium">
                已隱藏的群組
              </p>
              <button
                type="button"
                data-unhide-all="true"
                className="text-primary text-xs hover:underline"
                onClick={onUnhideAll}
              >
                全部恢復
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {hiddenGroups.map((groupKey) => (
                <button
                  key={groupKey}
                  type="button"
                  data-unhide-group={groupKey}
                  className="hover:bg-accent flex items-center justify-between rounded-md px-1.5 py-1 text-sm"
                  onClick={() => onUnhide(groupKey)}
                >
                  <span className="truncate">
                    {groupKey === "" ? "（未設定）" : groupKey}
                  </span>
                  <Eye className="text-muted-foreground size-3.5 shrink-0" />
                </button>
              ))}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Notion 式的單一篩選入口：工具列一顆「篩選」鈕，popover 內兩步走——
 * 先選欄位、再勾值，可返回換欄位。取代原本每個表頭各掛一顆漏斗。
 */
function FilterMenu<T>({
  columns,
  filterOptions,
  filters,
  onToggle,
  onSetDate,
}: {
  columns: ConsoleTableColumn<T>[];
  filterOptions: Record<string, string[]>;
  filters: Record<string, string[]>;
  onToggle: (columnId: string, value: string) => void;
  /** 日期欄是單選：整個值被取代，不是加進一個集合。 */
  onSetDate: (columnId: string, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null);

  // 有提供選項的欄位才可篩選——選項由 adapter（client 端運算或後端
  // distinct）提供，表格不再自己從資料推導。
  // 日期欄不靠 filterOptions——它的選項是區間，不是資料裡出現過的值。
  const filterableColumns = columns.filter(
    (c) => filterOptions[c.id] || c.dateFilterValue,
  );
  const activeCount = Object.values(filters).reduce(
    (sum, values) => sum + values.length,
    0,
  );
  const selectedColumn =
    filterableColumns.find((c) => c.id === selectedColumnId) ?? null;

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    // 關閉時重置到欄位清單，下次打開不會停在上次的欄位
    if (!nextOpen) setSelectedColumnId(null);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="篩選"
            title="篩選"
            className={cn("relative", activeCount > 0 && "text-primary")}
          />
        }
      >
        <Filter />
        {activeCount > 0 && (
          <span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full text-[9px] tabular-nums">
            {activeCount}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2">
        {selectedColumn ? (
          <>
            <div className="flex items-center gap-1 pb-1.5">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="返回欄位清單"
                className="size-6"
                onClick={() => setSelectedColumnId(null)}
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <span className="text-muted-foreground text-xs font-medium">
                {selectedColumn.header}
              </span>
            </div>
            {selectedColumn.dateFilterValue ? (
              <DateRangeFilterPanel
                value={filters[selectedColumn.id]?.[0]}
                onChange={(next) => onSetDate(selectedColumn.id, next)}
              />
            ) : (
              <FilterValuePanel
                options={filterOptions[selectedColumn.id] ?? []}
                selected={filters[selectedColumn.id]}
                onToggle={(value) => onToggle(selectedColumn.id, value)}
              />
            )}
          </>
        ) : (
          <div className="flex flex-col gap-1">
            <p className="text-muted-foreground px-1.5 pb-1 text-xs font-medium">
              依欄位篩選
            </p>
            {filterableColumns.map((column) => {
              const count = filters[column.id]?.length ?? 0;
              return (
                <button
                  key={column.id}
                  type="button"
                  onClick={() => setSelectedColumnId(column.id)}
                  className="hover:bg-accent flex items-center justify-between rounded-md px-1.5 py-1 text-sm"
                >
                  <span>{column.header}</span>
                  <span className="text-muted-foreground flex items-center gap-1 text-xs">
                    {count > 0 && <span>{count}</span>}
                    <ChevronRight className="size-3.5" />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * 生效中的篩選 chip（一欄一顆）：本體是 PopoverTrigger，點開直接編輯該欄
 * 的值；右側 X 一次清掉整欄，照 Notion 的互動。
 */
function FilterChip<T>({
  column,
  options,
  selected,
  onToggle,
  onSetDate,
  onClear,
}: {
  column: ConsoleTableColumn<T>;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  onSetDate: (value: string) => void;
  onClear: () => void;
}) {
  const isDate = !!column.dateFilterValue;
  return (
    <span className="border-primary/40 text-primary inline-flex items-center overflow-hidden rounded-md border border-dashed text-xs font-medium">
      <Popover>
        <PopoverTrigger
          render={
            <button type="button" className="hover:bg-primary/5 px-2 py-1" />
          }
        >
          {column.header}：
          {isDate ? dateFilterLabel(selected[0]) : selected.join("、")}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-2">
          <p className="text-muted-foreground px-1.5 pb-1.5 text-xs font-medium">
            {column.header}
          </p>
          {isDate ? (
            <DateRangeFilterPanel
              value={selected[0]}
              onChange={onSetDate}
            />
          ) : (
            <FilterValuePanel
              options={options}
              selected={selected}
              onToggle={onToggle}
            />
          )}
        </PopoverContent>
      </Popover>
      <button
        type="button"
        aria-label={`清除${column.header}篩選`}
        onClick={onClear}
        className="hover:bg-primary/10 self-stretch px-1.5"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}
