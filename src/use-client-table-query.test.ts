import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createDefaultTableQuery, type ConsoleTableColumn } from "./console-data-table";
import { useClientTableQuery } from "./use-client-table-query";
import { useProgressiveTableQuery } from "./use-progressive-table-query";

type Row = { id: string; name: string; group: string };

/** 刻意亂序：任何排序都會改變順序，手動模式則必須原封不動。 */
const ROWS: Row[] = [
  { id: "r1", name: "n03", group: "乙" },
  { id: "r2", name: "n01", group: "甲" },
  { id: "r3", name: "n02", group: "乙" },
  { id: "r4", name: "n04", group: "甲" },
];

const COLUMNS: ConsoleTableColumn<Row>[] = [
  {
    id: "name",
    header: "名稱",
    cell: (row) => row.name,
    sortValue: (row) => row.name,
    filterValue: (row) => row.name,
  },
  {
    id: "group",
    header: "類別",
    cell: (row) => row.group,
    sortValue: (row) => row.group,
    filterValue: (row) => row.group,
  },
];

const rowKey = (row: Row) => row.id;
const namesOf = (rows: Row[]) => rows.map((r) => r.name);

describe("client adapter 的排序三態", () => {
  it("sort 為 null 時套用隱性預設排序（第一個可排序欄升冪）", () => {
    const query = createDefaultTableQuery(10);
    const { result } = renderHook(() =>
      useClientTableQuery(ROWS, query, COLUMNS, rowKey),
    );
    expect(namesOf(result.current.rows)).toEqual(["n01", "n02", "n03", "n04"]);
  });

  it("sort 為欄位時依該欄排序", () => {
    const query = {
      ...createDefaultTableQuery(10),
      sort: { columnId: "name", direction: "desc" as const },
    };
    const { result } = renderHook(() =>
      useClientTableQuery(ROWS, query, COLUMNS, rowKey),
    );
    expect(namesOf(result.current.rows)).toEqual(["n04", "n03", "n02", "n01"]);
  });

  it("sort 為 manual 時完全不排序，順序與輸入完全相同", () => {
    const query = { ...createDefaultTableQuery(10), sort: "manual" as const };
    const { result } = renderHook(() =>
      useClientTableQuery(ROWS, query, COLUMNS, rowKey),
    );
    expect(namesOf(result.current.rows)).toEqual(namesOf(ROWS));
  });

  it("manual 仍然分組：群組連續，但組內照使用端給的順序", () => {
    const query = {
      ...createDefaultTableQuery(10),
      sort: "manual" as const,
      groupBy: "group",
    };
    const { result } = renderHook(() =>
      useClientTableQuery(ROWS, query, COLUMNS, rowKey),
    );
    // 群組聚合是結構不是排序，手動模式不該把它關掉——關掉的話群組標題
    // 會散落在列表各處。組間依 zh-Hant 筆畫序（乙 1 畫在 甲 5 畫之前），
    // 組內則完全照輸入順序（乙：n03→n02，不是 n02→n03）
    expect(namesOf(result.current.rows)).toEqual(["n03", "n02", "n01", "n04"]);
    expect(result.current.groupValues).toEqual(["乙", "乙", "甲", "甲"]);
  });

  it("manual 不套用 tie-break（tie-break 也是欄位推導的順序）", () => {
    const rows: Row[] = [
      { id: "r1", name: "n09", group: "甲" },
      { id: "r2", name: "n01", group: "甲" },
    ];
    const query = { ...createDefaultTableQuery(10), sort: "manual" as const };
    const { result } = renderHook(() =>
      useClientTableQuery(rows, query, COLUMNS, rowKey),
    );
    expect(namesOf(result.current.rows)).toEqual(["n09", "n01"]);
  });

  it("manual 不影響篩選與搜尋", () => {
    const query = {
      ...createDefaultTableQuery(10),
      sort: "manual" as const,
      filters: { group: ["乙"] },
    };
    const { result } = renderHook(() =>
      useClientTableQuery(ROWS, query, COLUMNS, rowKey),
    );
    expect(namesOf(result.current.rows)).toEqual(["n03", "n02"]);
    expect(result.current.totalCount).toBe(2);
  });
});

describe("漸進揭露 adapter 與手動模式", () => {
  it("進入手動順序不把已揭露的列收回第一批", () => {
    const initial = { ...createDefaultTableQuery(2) };
    const { result, rerender } = renderHook(
      ({ query }) => useProgressiveTableQuery(ROWS, query, COLUMNS, rowKey),
      { initialProps: { query: initial } },
    );
    expect(result.current.rows).toHaveLength(2);

    result.current.loadMore();
    rerender({ query: initial });
    expect(result.current.rows).toHaveLength(4);

    // 拖曳會把 sort 設成 manual——這不改變任何列的順序，不該收合
    rerender({ query: { ...initial, sort: "manual" as const } });
    expect(result.current.rows).toHaveLength(4);
  });

  it("改回欄位排序時照常重置回第一批（順序真的變了）", () => {
    const initial = { ...createDefaultTableQuery(2), sort: "manual" as const };
    const { result, rerender } = renderHook(
      ({ query }) => useProgressiveTableQuery(ROWS, query, COLUMNS, rowKey),
      { initialProps: { query: initial as ReturnType<typeof createDefaultTableQuery> } },
    );
    result.current.loadMore();
    rerender({ query: initial as ReturnType<typeof createDefaultTableQuery> });
    expect(result.current.rows).toHaveLength(4);

    rerender({
      query: {
        ...initial,
        sort: { columnId: "name", direction: "asc" as const },
      },
    });
    expect(result.current.rows).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/* 子項目                                                              */
/* ------------------------------------------------------------------ */

type Node = { id: string; name: string; parent: string | null; grp: string };

/** p1 兩個子項、p2 一個子項；刻意讓子項的排序值大於別的父列。 */
const TREE: Node[] = [
  { id: "p2", name: "n50", parent: null, grp: "乙" },
  { id: "c1", name: "n99", parent: "p1", grp: "丙" },
  { id: "p1", name: "n10", parent: null, grp: "甲" },
  { id: "c2", name: "n20", parent: "p1", grp: "丁" },
  { id: "c3", name: "n60", parent: "p2", grp: "甲" },
];

const TREE_COLUMNS: ConsoleTableColumn<Node>[] = [
  {
    id: "name",
    header: "名稱",
    cell: (r) => r.name,
    sortValue: (r) => r.name,
    filterValue: (r) => r.name,
  },
  {
    id: "grp",
    header: "類別",
    cell: (r) => r.grp,
    filterValue: (r) => r.grp,
  },
];

const nodeKey = (r: Node) => r.id;
const subRowOf = (r: Node) => r.parent;
const idsOf = (rows: Node[]) => rows.map((r) => r.id);

describe("子項目的排序", () => {
  function renderTree(query = createDefaultTableQuery(30)) {
    return renderHook(() =>
      useClientTableQuery(TREE, query, TREE_COLUMNS, nodeKey, subRowOf),
    );
  }

  it("子列緊跟在自己的父列之後，父列在前", () => {
    const { result } = renderTree();
    // 父列以 name 升冪：p1(n10) → p2(n50)，各自帶著子列
    expect(idsOf(result.current.rows)).toEqual(["p1", "c2", "c1", "p2", "c3"]);
  });

  it("子列的值再大也追不過別的父列", () => {
    const { result } = renderTree();
    const rows = idsOf(result.current.rows);
    // c1 的 name 是 n99（全場最大），仍留在 p1 底下、排在 p2 之前
    expect(rows.indexOf("c1")).toBeLessThan(rows.indexOf("p2"));
  });

  it("降冪時父列順序翻轉，但父列仍在自己的子列之前", () => {
    const { result } = renderTree({
      ...createDefaultTableQuery(30),
      sort: { columnId: "name", direction: "desc" as const },
    });
    const rows = idsOf(result.current.rows);
    expect(rows).toEqual(["p2", "c3", "p1", "c1", "c2"]);
    expect(rows.indexOf("p1")).toBeLessThan(rows.indexOf("c1"));
  });

  it("手動模式仍然維持父子相鄰，順序依使用端給的位置", () => {
    const { result } = renderTree({
      ...createDefaultTableQuery(30),
      sort: "manual" as const,
    });
    // 輸入是 p2, c1, p1, c2, c3（父子交錯）。父子相鄰是結構不是排序，
    // 手動模式照樣成立：父列維持給定的相對順序（p2 在 p1 前），各自帶著
    // 自己的子列，子列之間也照給定順序（c1 在 c2 前）。
    expect(idsOf(result.current.rows)).toEqual(["p2", "c3", "p1", "c1", "c2"]);
  });

  it("手動模式＋分組：群組連續、父子相鄰、組內照給定順序", () => {
    const { result } = renderTree({
      ...createDefaultTableQuery(30),
      sort: "manual" as const,
      groupBy: "grp",
    });
    const rows = idsOf(result.current.rows);
    // 子列取父列的分組值，所以 p1(甲) 帶 c1、c2；p2(乙) 帶 c3。
    // 組間依 zh-Hant 筆畫序，乙 在 甲 之前
    expect(rows).toEqual(["p2", "c3", "p1", "c1", "c2"]);
    expect(result.current.groupValues).toEqual(["乙", "乙", "甲", "甲", "甲"]);
  });

  it("分組時子列取父列的分組值，不被抽離父列", () => {
    const { result } = renderTree({
      ...createDefaultTableQuery(30),
      groupBy: "grp",
    });
    const rows = idsOf(result.current.rows);
    // c1 自己的類別是丙、c2 是丁，但都應該跟著 p1（甲）；
    // 兄弟之間仍照 name 升冪，所以 c2(n20) 在 c1(n99) 之前
    expect(rows.indexOf("c2")).toBe(rows.indexOf("p1") + 1);
    expect(rows.indexOf("c1")).toBe(rows.indexOf("p1") + 2);
    // 分組路徑也取父列的值
    const values = result.current.groupValues!;
    expect(values[rows.indexOf("c1")]).toBe("甲");
  });

  it("只支援一層：孫列掛到最上層祖先", () => {
    const deep: Node[] = [
      ...TREE,
      { id: "g1", name: "n30", parent: "c2", grp: "戊" },
    ];
    const { result } = renderHook(() =>
      useClientTableQuery(
        deep,
        createDefaultTableQuery(30),
        TREE_COLUMNS,
        nodeKey,
        subRowOf,
      ),
    );
    const rows = idsOf(result.current.rows as Node[]);
    // g1 的父是 c2，c2 的父是 p1 → g1 掛在 p1 底下，與 c1/c2 平輩
    expect(rows.slice(0, 4)).toEqual(["p1", "c2", "g1", "c1"]);
  });

  it("分批揭露切在父子之間時，子列不會先於父列出現", () => {
    const { result } = renderHook(() =>
      useProgressiveTableQuery(
        TREE,
        createDefaultTableQuery(2),
        TREE_COLUMNS,
        nodeKey,
        subRowOf,
      ),
    );
    // 第一批只有 2 列：p1 與它的第一個子列，子列絕不會單獨出現
    const rows = idsOf(result.current.rows as Node[]);
    expect(rows).toEqual(["p1", "c2"]);
    expect(rows[0]).toBe("p1");
  });

  it("沒給 subRowOf 時行為與過去完全相同", () => {
    const { result } = renderHook(() =>
      useClientTableQuery(TREE, createDefaultTableQuery(30), TREE_COLUMNS, nodeKey),
    );
    // 純以 name 升冪，父子關係不存在
    expect(idsOf(result.current.rows)).toEqual(["p1", "c2", "p2", "c3", "c1"]);
  });
});

describe("欄位值被清空（範圍刪除）之後", () => {
  type Row = { id: string; unit: string | null };
  const rows: Row[] = [
    { id: "a", unit: "A棟" },
    { id: "b", unit: null },
    { id: "c", unit: "B棟" },
  ];
  const columns = [
    {
      id: "unit",
      header: "戶別",
      cell: (r: Row) => r.unit,
      filterValue: (r: Row) => r.unit as string,
      sortValue: (r: Row) => r.unit,
    },
  ];

  it("filterValue 回傳 null 時不會崩，選項收斂成空字串", () => {
    const { result } = renderHook(() =>
      useClientTableQuery(rows, createDefaultTableQuery(10), columns, (r) => r.id),
    );
    expect(result.current.filterOptions.unit).toContain("");
    expect(result.current.rows).toHaveLength(3);
  });

  it("分組時被清空的列歸入空字串那一組並排在最後", () => {
    const { result } = renderHook(() =>
      useClientTableQuery(
        rows,
        { ...createDefaultTableQuery(10), groupBy: "unit" },
        columns,
        (r) => r.id,
      ),
    );
    expect(result.current.groupValues).toEqual(["A棟", "B棟", ""]);
    expect(result.current.groupCounts?.[""]).toBe(1);
  });
});

describe("每組的完整 key", () => {
  it("與每組筆數對得起來——兩份都是從篩選後全資料算的", () => {
    const { result } = renderHook(() =>
      useClientTableQuery(
        ROWS,
        { ...createDefaultTableQuery(2), groupBy: "group" },
        COLUMNS,
        (r) => r.id,
      ),
    );
    const byGroup = result.current.allFilteredKeysByGroup!;
    const counts = result.current.groupCounts!;

    expect(Object.keys(byGroup).sort()).toEqual(Object.keys(counts).sort());
    for (const key of Object.keys(counts)) {
      expect(byGroup[key]!.length).toBe(counts[key]);
    }
    // 每組的 key 比畫出來的多——一頁只有 2 筆
    expect(result.current.rows.length).toBeLessThan(
      Object.values(byGroup).flat().length,
    );
  });

  it("未分組時不產出——沒有組就沒有每組的 key", () => {
    const { result } = renderHook(() =>
      useClientTableQuery(
        ROWS,
        createDefaultTableQuery(10),
        COLUMNS,
        (r) => r.id,
      ),
    );
    expect(result.current.allFilteredKeysByGroup).toBeUndefined();
  });
});

describe("漸進揭露把每組的 key 帶出來", () => {
  it("轉傳而不是重算——揭露窗只影響畫出來的列", () => {
    const { result } = renderHook(() =>
      useProgressiveTableQuery(
        ROWS,
        { ...createDefaultTableQuery(1), groupBy: "group" },
        COLUMNS,
        (r) => r.id,
      ),
    );
    const byGroup = result.current.allFilteredKeysByGroup!;
    expect(byGroup).toBeDefined();
    // 每組只揭露 1 筆，但 key 是整組的
    for (const keys of Object.values(byGroup)) {
      expect(keys.length).toBeGreaterThanOrEqual(1);
    }
    expect(Object.values(byGroup).flat().length).toBe(ROWS.length);
  });
});
