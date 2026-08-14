import { useState } from "react";
import type { ConsoleTableColumn, TableQuery } from "./console-data-table";
import { useClientTableQuery } from "./use-client-table-query";

/** 未分組時所有列都算在這一組（同一套逐組邏輯就能涵蓋兩種情況）。 */
const UNGROUPED = "";

/**
 * ConsoleDataTable 的漸進揭露 adapter：資料已經全部在記憶體裡，但一次把
 * 幾千列塞進 DOM 太重，所以分批揭露——捲到底再多給一批。
 *
 * 它只解決 DOM 成本，不解決傳輸與記憶體：符合 query 的列一個都沒少，只是
 * 交給表格的數量分批成長。資料在後端、要解決傳輸量的情境請改用
 * useChunkedTableQuery。
 *
 * **分組生效時每一組各有自己的揭露窗**：延伸某一組不會動到其他組，
 * 「載入更多」因此落在每組結尾。未分組時退化成單一個窗，行為與過去相同。
 *
 * 因為全量在手，totalCount／filterOptions／allFilteredKeys／分組筆數都給
 * 得出來，表格功能完整（含跨頁全選的「選取全部 N 筆」）。
 */
export function useProgressiveTableQuery<T>(
  data: T[],
  query: TableQuery,
  columns: ConsoleTableColumn<T>[],
  rowKey: (row: T) => string,
  /** 子項目：回傳父列的 key；轉交給 client adapter 套用父列優先排序。 */
  subRowOf?: (row: T) => string | null,
) {
  // 每批筆數沿用 query.pageSize——捲動模式下偏好設定的文案即為「每批
  // 載入筆數」，語意一致且不用為呈現方式擴充 TableQuery。
  const batchSize = query.pageSize;

  /** 每組已揭露的筆數；沒有記錄的組用 batchSize。 */
  const [revealed, setRevealed] = useState<Record<string, number>>({});

  // 全量運算（篩選／排序／分組）沿用 client adapter：pageIndex 固定 0、
  // pageSize 放到最大，拿到的就是完整的結果，再由這裡逐組切。
  const fullQuery = {
    ...query,
    pageIndex: 0,
    pageSize: Number.MAX_SAFE_INTEGER,
  };
  const full = useClientTableQuery(data, fullQuery, columns, rowKey, subRowOf);

  const resetKey = JSON.stringify({
    search: query.search,
    filters: query.filters,
    sort: query.sort,
    groupBy: query.groupBy,
    pageSize: query.pageSize,
  });
  const [lastResetKey, setLastResetKey] = useState(resetKey);

  // query 內容變動（搜尋／篩選／排序／分組／批次大小）就回到第一批。在
  // render 期間比對並調整 state（React 官方的 derived-state 做法），不繞
  // effect——繞 effect 會多繪製一次，且會被 set-state-in-effect 規則擋下。
  //
  // 手動順序是例外：進入手動模式不重排任何列（順序就是使用端當下給的那
  // 個），把已揭露的列收回第一批會讓人以為拖一下資料就掉了。離開手動模式
  // 時順序真的變了，照常重置。
  if (lastResetKey !== resetKey) {
    setLastResetKey(resetKey);
    if (query.sort !== "manual") setRevealed({});
  }

  const limitOf = (groupKey: string) => revealed[groupKey] ?? batchSize;

  // 逐組取前 N 筆。未分組時所有列都在 UNGROUPED 這一組，等同過去的行為。
  const rows: T[] = [];
  const groupValues: (string | null)[] = [];
  const takenByGroup = new Map<string, number>();
  for (let index = 0; index < full.rows.length; index++) {
    const value = full.groupValues?.[index] ?? null;
    const groupKey = value ?? UNGROUPED;
    const taken = takenByGroup.get(groupKey) ?? 0;
    if (taken >= limitOf(groupKey)) continue;
    rows.push(full.rows[index]);
    groupValues.push(value);
    takenByGroup.set(groupKey, taken + 1);
  }

  const grouping = !!query.groupBy && !!full.groupValues;

  /** 每組還有沒有未揭露的列；未分組時不提供（由 hasMore 表達）。 */
  let groupHasMore: Record<string, boolean> | undefined;
  if (grouping && full.groupCounts) {
    groupHasMore = {};
    for (const [groupKey, total] of Object.entries(full.groupCounts)) {
      groupHasMore[groupKey] = limitOf(groupKey) < total;
    }
  }

  return {
    ...full,
    rows,
    groupValues: grouping ? groupValues : undefined,
    groupHasMore,
    /**
     * 分組時列表末端不放全域的載入更多——每組結尾各有一個，全域那顆會
     * 讓「載入更多」有兩種意思。
     */
    hasMore: grouping ? false : limitOf(UNGROUPED) < full.totalCount,
    /** 延伸某一組；未分組時省略參數即可。 */
    loadMore: (groupValue?: string | null) => {
      const groupKey = groupValue ?? UNGROUPED;
      setRevealed((prev) => ({
        ...prev,
        [groupKey]: (prev[groupKey] ?? batchSize) + batchSize,
      }));
    },
    revealedCount: rows.length,
  };
}
