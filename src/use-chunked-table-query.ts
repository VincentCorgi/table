import { useCallback, useEffect, useRef, useState } from "react";
import type { ConsoleTableColumn, TableQuery } from "./console-data-table";

/**
 * 分塊載入的請求。`query` 是整包可序列化的表格查詢狀態，後端據此組
 * WHERE／ORDER BY；`cursor` 為 null 表示要第一塊。游標是不透明字串——
 * 後端要用 offset 或 keyset 都行，adapter 與表格都不解讀。
 */
export type TablePageRequest = {
  query: TableQuery;
  cursor: string | null;
  /** query 變動或元件卸載時會 abort，實作端請轉交給 fetch。 */
  signal: AbortSignal;
};

/**
 * 分塊載入的回應。只有 `rows` 是必填——其餘中繼資料後端給得出來就給，
 * 給不出來時表格各自有降級行為（見各欄位說明），不需要一次到位。
 */
export type TablePageResponse<T> = {
  /** 這一塊的列。 */
  rows: T[];
  /** 下一塊的游標；null／缺席＝沒有更多了。 */
  cursor?: string | null;
  /** 符合條件的總筆數。缺席時表格不顯示總數（不會顯示錯的數字）。 */
  totalCount?: number;
  /** 每組列數。缺席時群組標題省略「（N）」。 */
  groupCounts?: Record<string, number>;
  /**
   * 與 rows 平行的每列分組路徑。通常不需要——adapter 會用欄位的
   * `filterValue` 自行推導；後端的分組值與欄位值不同時才提供。
   */
  /** 與 rows 平行的每列分組值；未分組或後端不提供時省略（見下）。 */
  groupValues?: string[];
  /** 篩選選單的選項（通常來自 distinct 查詢）。缺席的欄位不出現在篩選選單。 */
  filterOptions?: Record<string, string[]>;
  /**
   * 符合條件的全部列 key。分塊模式下通常給不出來（也不該為此掃全表），
   * 缺席時表格的全選僅限已載入的列。
   */
  allFilteredKeys?: string[];
  /**
   * 每組的完整 key。給了群組的全選才涵蓋還沒載入的列；缺席時群組的全選僅限
   * 已載入的列，而且不會顯示成整組選中——與 `allFilteredKeys` 同一個安排。
   *
   * 分塊模式下通常也給不出來（理由同上），除非後端本來就分好組。
   */
  allFilteredKeysByGroup?: Record<string, string[]>;
};

/**
 * ConsoleDataTable 的分塊載入 adapter（Notion 式）：呼叫端提供 `fetchPage`，
 * adapter 負責累積列、維護游標與載入狀態，捲到底時追加下一塊。
 *
 * 排序／篩選／分組在這個模式下必然由後端執行——手上只有第一塊時，前端
 * 無從對全體排序。因此 query 一有變動就丟棄已累積的列、自第一塊重取。
 */
export function useChunkedTableQuery<T>(
  query: TableQuery,
  fetchPage: (request: TablePageRequest) => Promise<TablePageResponse<T>>,
  /**
   * 欄位定義。有給且分組生效時，adapter 會用欄位的 `filterValue` 從已收到
   * 的列推導 `groupValues`——後端只要照 `query.groupBy` 正確 ORDER BY 即可，
   * 不必額外回傳每列的分組路徑。
   */
  columns?: ConsoleTableColumn<T>[],
) {
  const [rows, setRows] = useState<T[]>([]);
  const [meta, setMeta] = useState<Omit<TablePageResponse<T>, "rows">>({});
  // 游標同時放 state（驅動 hasMore 重繪）與 ref（供非同步流程讀最新值）
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // query 的識別字串：內容相同就不重取（呼叫端每次 render 傳新物件也安全）
  const queryKey = JSON.stringify(query);
  // 最新值放 ref，讓 loadMore 保持穩定 identity、也避免請求競態
  const stateRef = useRef({ fetchPage, query, cursor: null as string | null });
  useEffect(() => {
    stateRef.current.fetchPage = fetchPage;
    stateRef.current.query = query;
  }, [fetchPage, query]);

  const requestIdRef = useRef(0);
  const inFlightRef = useRef(false);

  /** 取一塊。first＝丟棄既有列從頭取；否則追加。 */
  const load = useCallback(async (first: boolean, signal: AbortSignal) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const requestId = ++requestIdRef.current;
    if (first) setLoading(true);
    else setLoadingMore(true);
    try {
      const response = await stateRef.current.fetchPage({
        query: stateRef.current.query,
        cursor: first ? null : stateRef.current.cursor,
        signal,
      });
      // 期間 query 又變了就丟棄這份結果
      if (signal.aborted || requestId !== requestIdRef.current) return;
      stateRef.current.cursor = response.cursor ?? null;
      setHasMore(stateRef.current.cursor !== null);
      const { rows: newRows, ...rest } = response;
      setRows((prev) => (first ? newRows : [...prev, ...newRows]));
      setMeta(rest);
      setError(null);
    } catch (err) {
      if (!signal.aborted) setError(err);
    } finally {
      inFlightRef.current = false;
      if (first) setLoading(false);
      else setLoadingMore(false);
    }
  }, []);

  // query 變動：中止進行中的請求、丟棄累積列、自第一塊重取
  useEffect(() => {
    const controller = new AbortController();
    stateRef.current.cursor = null;
    inFlightRef.current = false;
    requestIdRef.current++;
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- 依外部
       查詢狀態取資料本來就是「向外部系統同步」，載入旗標必須在發動請求
       的同一刻切換；這正是 effect 該做的事，規則無法表達這個形狀。 */
    void load(true, controller.signal);
    return () => controller.abort();
  }, [queryKey, load]);

  const loadMoreControllerRef = useRef<AbortController | null>(null);
  const loadMore = useCallback(() => {
    if (inFlightRef.current || stateRef.current.cursor === null) return;
    loadMoreControllerRef.current?.abort();
    const controller = new AbortController();
    loadMoreControllerRef.current = controller;
    void load(false, controller.signal);
  }, [load]);

  // 分組值：後端有回就用它的，否則從列與欄位的 filterValue 推導。
  // 列已由後端依 groupBy 排好，所以逐列取值即為正確的分組值。
  const groupColumn =
    columns && query.groupBy
      ? (columns.find((c) => c.id === query.groupBy && c.filterValue) ?? null)
      : null;
  const groupValues =
    meta.groupValues ??
    // 值可能是 null（欄位被清空），一律收斂成空字串＝「（未設定）」，
    // 否則後續的字串比較會崩
    (groupColumn
      ? rows.map((row) => groupColumn.filterValue!(row) ?? "")
      : undefined);

  return {
    rows,
    groupValues,
    // 後端沒給總數時退用已載入筆數，表格才不會顯示錯的數字
    totalCount: meta.totalCount ?? rows.length,
    /** 後端未提供總數——呼叫端可據此決定要不要顯示總數。 */
    hasTotalCount: meta.totalCount !== undefined,
    filterOptions: meta.filterOptions,
    groupCounts: meta.groupCounts,
    allFilteredKeys: meta.allFilteredKeys,
    allFilteredKeysByGroup: meta.allFilteredKeysByGroup,
    hasMore,
    loadMore,
    loading,
    loadingMore,
    error,
  };
}
