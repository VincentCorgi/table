import { useMemo } from "react";
import type {
  ConsoleTableColumn,
  TableQuery,
} from "./console-data-table";

/**
 * 欄位的篩選值。型別上是 `string`，但實際資料是可空的——範圍清空會把
 * 欄位設成 null，使用端的 `filterValue` 就跟著回傳 null，再拿去
 * `localeCompare` 會整張表崩掉。一律收斂成空字串：空字串在這個模組裡
 * 本來就有意義（分組時是「（未設定）」且一律沉到最後）。
 */
function filterTextOf<T>(
  column: { filterValue?: (row: T) => string },
  row: T,
): string {
  return column.filterValue?.(row) ?? "";
}

function compareValues(
  a: string | number | null,
  b: string | number | null,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "zh-Hant");
}

/**
 * ConsoleDataTable 的 client-side adapter：把整份資料 + query 算成表格要
 * 吃的形狀（當前頁的列、總數、篩選選項、全部 key）。適用全部資料能一次
 * 載進瀏覽器的中小清單（幾千筆內）；資料量大或需要即時性時，改成把
 * query 轉成 API 參數由後端算，回傳同樣形狀的物件即可，表格不用動。
 */
export function useClientTableQuery<T>(
  data: T[],
  query: TableQuery,
  columns: ConsoleTableColumn<T>[],
  rowKey: (row: T) => string,
  /**
   * 子項目：回傳父列的 key，`null` 代表這列自己就是父列。有給才會套用
   * 父列優先排序（子列永遠緊跟在自己的父列之後）。
   */
  subRowOf?: (row: T) => string | null,
) {
  // 篩選選項從全資料（而非篩選後）計算，選單選項才不會越勾越少
  const filterOptions = useMemo(() => {
    const options: Record<string, string[]> = {};
    for (const column of columns) {
      if (!column.filterValue) continue;
      const values = new Set<string>();
      for (const row of data) values.add(filterTextOf(column, row));
      options[column.id] = [...values].sort((a, b) =>
        a.localeCompare(b, "zh-Hant"),
      );
    }
    return options;
  }, [columns, data]);

  return useMemo(() => {
    const search = query.search.trim().toLowerCase();
    const matches = (row: T) => {
      for (const [columnId, values] of Object.entries(query.filters)) {
        if (values.length === 0) continue;
        const column = columns.find((c) => c.id === columnId);
        if (!column?.filterValue) continue;
        if (!values.includes(filterTextOf(column, row))) return false;
      }
      if (!search) return true;
      return columns.some((column) => {
        // `searchValue` 先於 `filterValue`：一欄可以「搜得到摘要、但依類型
        // 篩選」，那兩個值不一樣。
        const text =
          column.searchValue?.(row) ??
          column.filterValue?.(row) ??
          column.sortValue?.(row) ??
          null;
        return text !== null && String(text).toLowerCase().includes(search);
      });
    };

    const matched = data.filter(matches);
    // 子列命中但父列沒命中時，把父列一併留下——否則畫面上會出現一堆
    // 沒有父親的孤兒列，使用者看到的是失去脈絡的紀錄。反向不成立：
    // 父列命中不會把它沒命中的子列帶回來，否則等於沒篩。
    const retainedParents = new Set<string>();
    if (subRowOf) {
      const matchedKeys = new Set(matched.map(rowKey));
      for (const row of matched) {
        const parentKey = subRowOf(row);
        if (parentKey === null || parentKey === undefined) continue;
        if (matchedKeys.has(parentKey)) continue;
        retainedParents.add(parentKey);
      }
    }
    const filtered =
      retainedParents.size === 0
        ? matched
        : data.filter((row) => matches(row) || retainedParents.has(rowKey(row)));

    // 手動順序：使用者親手拖出來的順序。它蓋掉所有「欄位推導出來的順序」
    // ——指定的排序欄、隱性預設排序、tie-break 全部不套用。
    //
    // 但**不蓋掉結構**：分組的群組聚合與父子相鄰照常生效。那兩件事決定的是
    // 「這列畫在哪一塊」而不是「誰在誰前面」，一起關掉的結果是群組標題散落
    // 在列表各處、父列與子列被拆開——那不是任何人拖得出來的順序。
    const manual = query.sort === "manual";
    const columnSort = query.sort === "manual" ? null : query.sort;

    // 分組欄位：以 filterValue 為分組值（與篩選 chip 的字串一致）。
    // 只有一層；沒有 filterValue 的 id 視同未分組。手動模式照樣生效。
    const groupColumn = !query.groupBy
      ? null
      : (columns.find((c) => c.id === query.groupBy && c.filterValue) ?? null);

    // 照 AWS：資料永遠有排序。使用者沒指定時（query.sort 為 null）用第一個
    // 可排序欄升冪；排序選單只跟 query.sort 走，所以預設排序不會顯示出來。
    const effectiveSort =
      columnSort ??
      (manual
        ? null
        : (() => {
            const firstSortable = columns.find((c) => c.sortValue);
            return firstSortable
              ? { columnId: firstSortable.id, direction: "asc" as const }
              : null;
          })());

    /**
     * 子項目的最上層祖先。只支援一層——資料若不小心疊了兩層，一律掛到最
     * 上層祖先而不是產生第二層。迴圈有次數上限，資料成環時不會卡死。
     */
    const byKey = new Map(data.map((row) => [rowKey(row), row]));
    function topAncestorOf(row: T): T {
      if (!subRowOf) return row;
      let current = row;
      for (let depth = 0; depth < 10; depth++) {
        const parentKey = subRowOf(current);
        if (parentKey === null || parentKey === undefined) return current;
        const parent = byKey.get(parentKey);
        // 父列不存在（被篩掉或資料不完整）就當自己是父列
        if (!parent || parent === current) return current;
        current = parent;
      }
      return current;
    }
    const isSubRow = (row: T) => subRowOf != null && topAncestorOf(row) !== row;

    let sorted = filtered;
    const sortValue = effectiveSort
      ? columns.find((c) => c.id === effectiveSort.columnId)?.sortValue
      : undefined;

    /**
     * 使用端給的順序中，每一列的位置。手動模式用它取代「欄位的值」當作
     * 比較依據——結構（群組、父子）照樣要排，但排的依據是使用端給的順序
     * 而不是任何欄位。
     */
    const suppliedPosition = new Map(
      filtered.map((row, index) => [rowKey(row), index]),
    );
    const positionOf = (row: T) => suppliedPosition.get(rowKey(row)) ?? 0;

    // 手動模式下只有「結構」需要重排；沒有分組也沒有子項目時完全不動，
    // 畫面就是使用端給的那份順序。
    const needsArrange =
      !!groupColumn || (!!effectiveSort && !!sortValue) || (manual && !!subRowOf);

    if (needsArrange) {
      // 主排序欄同值時，依序用其餘可排序欄位 tie-break——否則同組內只是
      // 原始資料順序，畫面看起來像亂跳。次要排序固定升冪，方向翻轉只
      // 作用在主排序欄。手動模式不做 tie-break：那也是欄位推導的順序。
      const flip = effectiveSort?.direction === "desc" ? -1 : 1;
      const tieBreakers = manual
        ? []
        : columns.filter((c) => c.sortValue && c.id !== effectiveSort?.columnId);
      sorted = [...filtered].sort((a, b) => {
        // 子列的分組值與排序值一律取自它的父列，才不會被抽離父列——
        // 父列本身的祖先就是自己，所以未宣告子項目時這兩行是恆等式。
        const aTop = topAncestorOf(a);
        const bTop = topAncestorOf(b);

        // 分組鍵最優先。排序分組欄＝切換群組本身的方向；空字串分組值
        // 一律沉到最後（不隨方向翻轉）。
        if (groupColumn) {
          const direction =
            columnSort?.columnId === groupColumn.id
              ? columnSort.direction
              : "asc";
          const aValue = filterTextOf(groupColumn, aTop);
          const bValue = filterTextOf(groupColumn, bTop);
          const aEmpty = aValue === "";
          const bEmpty = bValue === "";
          if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
          if (!aEmpty) {
            const diff =
              (direction === "desc" ? -1 : 1) *
              aValue.localeCompare(bValue, "zh-Hant");
            if (diff !== 0) return diff;
          }
        }
        // 父列優先：先比兩者「所屬父列」的值，父子因此永遠相鄰。子列的
        // 值再大也追不過別的父列——這是分層唯一自洽的排序語意。
        // 手動模式比的是父列在使用端給的順序裡的位置，語意相同。
        if (manual) {
          const byParent = positionOf(aTop) - positionOf(bTop);
          if (byParent !== 0) return byParent;
        } else if (sortValue) {
          const byParent =
            flip * compareValues(sortValue(aTop), sortValue(bTop));
          if (byParent !== 0) return byParent;
        }
        for (const column of tieBreakers) {
          const byParent = compareValues(
            column.sortValue!(aTop),
            column.sortValue!(bTop),
          );
          if (byParent !== 0) return byParent;
        }

        // 同一個父列底下：父列排在自己的子列之前，且不隨排序方向翻轉
        const aChild = isSubRow(a) ? 1 : 0;
        const bChild = isSubRow(b) ? 1 : 0;
        if (aChild !== bChild) return aChild - bChild;

        // 兄弟之間再比自己的值（手動模式比使用端給的位置）
        if (manual) return positionOf(a) - positionOf(b);
        if (sortValue) {
          const own = flip * compareValues(sortValue(a), sortValue(b));
          if (own !== 0) return own;
        }
        for (const column of tieBreakers) {
          const own = compareValues(column.sortValue!(a), column.sortValue!(b));
          if (own !== 0) return own;
        }
        return 0;
      });
    }

    const pageCount = Math.max(1, Math.ceil(sorted.length / query.pageSize));
    const page = Math.min(query.pageIndex, pageCount - 1);
    const rows = sorted.slice(
      page * query.pageSize,
      (page + 1) * query.pageSize,
    );

    // 分組值取自父列，子列因此永遠與父列同組
    const valueOf = (row: T) =>
      groupColumn ? filterTextOf(groupColumn, topAncestorOf(row)) : null;

    // 每組筆數（篩選後全資料，非當前批次）；key 就是分組值本身
    let groupCounts: Record<string, number> | undefined;
    /**
     * 每組的完整 key，讓群組的全選涵蓋還沒載入的列。
     *
     * 與筆數同一個迴圈算出來——全量本來就在手上，這裡只是把已經走過的那一
     * 遍留下更多東西。兩者並存而不是用長度取代筆數：後端說得出總數卻給不出
     * key 是分塊模式的常態，那時只有 `groupCounts` 拿得到。
     */
    let allFilteredKeysByGroup: Record<string, string[]> | undefined;
    if (groupColumn) {
      groupCounts = {};
      allFilteredKeysByGroup = {};
      for (const row of sorted) {
        const value = valueOf(row)!;
        groupCounts[value] = (groupCounts[value] ?? 0) + 1;
        (allFilteredKeysByGroup[value] ??= []).push(rowKey(row));
      }
    }

    return {
      rows,
      totalCount: sorted.length,
      filterOptions,
      allFilteredKeys: sorted.map(rowKey),
      /** 因子項目而保留、自身沒命中篩選的父列 key。 */
      retainedParentKeys:
        retainedParents.size > 0 ? [...retainedParents] : undefined,
      /** 與 rows 平行的每列分組值；未分組時缺席。 */
      groupValues: groupColumn ? rows.map(valueOf) : undefined,
      groupCounts,
      allFilteredKeysByGroup,
    };
  }, [data, query, columns, rowKey, filterOptions, subRowOf]);
}
