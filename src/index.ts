/**
 * 套件的公開介面。
 *
 * 只開元件、三個 adapter、契約與型別。其餘檔案（`cell-display`、`cell-editor`、
 * `cell-format`、`tag-colors`、`aggregate`、`cn`）是內部實作——它們的形狀會隨
 * 需要改變，對外承諾了就改不動。
 */

export {
  ConsoleDataTable,
  createDefaultTableQuery,
  cellId,
} from "./console-data-table";

export type {
  ConsoleTableColumn,
  ConsoleTableEditable,
  ConsoleTableSelectOption,
  ConsoleTableAction,
  ConsoleTableGroupAction,
  ConsoleTablePreferences,
  CellEditorContext,
  TableQuery,
} from "./console-data-table";

/** 三個 adapter：記憶體分頁、捲動漸進揭露、server 分塊。 */
export { useClientTableQuery } from "./use-client-table-query";
export { useProgressiveTableQuery } from "./use-progressive-table-query";
export { useChunkedTableQuery } from "./use-chunked-table-query";

/** 日期區間篩選的值模型：使用端要顯示或組出同樣的值時用得到。 */
export {
  DATE_BUCKETS,
  resolveBucket,
  resolveDateFilter,
  dateInRange,
  dateFilterLabel,
  customRangeValue,
} from "./date-buckets";
export type { DateBucket, DateRange } from "./date-buckets";

/** UI 契約——每個 app 用自己手上的 primitive 實作一次。 */
export { configureTableUI } from "./table-ui";
export type { TableUIComponents } from "./table-ui";
