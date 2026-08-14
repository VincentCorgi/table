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

describe("searchValue：搜尋與篩選是兩件事", () => {
  type Log = { id: string; summary: string; kind: string };
  const data: Log[] = [
    { id: "1", summary: "刪除了工作項目 A", kind: "workitem" },
    { id: "2", summary: "登入", kind: "session" },
    { id: "3", summary: "刪除了會議 B", kind: "meeting" },
  ];
  const columns: ConsoleTableColumn<Log>[] = [
    {
      id: "target",
      header: "對象",
      // 搜尋要搜得到摘要，篩選要按類型分——一個欄位兩種值
      searchValue: (r) => r.summary,
      filterValue: (r) => r.kind,
      cell: (r) => r.summary,
    },
  ];
  const key = (r: Log) => r.id;
  const run = (cols: ConsoleTableColumn<Log>[], q: Partial<ReturnType<typeof createDefaultTableQuery>>) =>
    renderHook(() =>
      useClientTableQuery(data, { ...createDefaultTableQuery(10), ...q }, cols, key),
    ).result.current;

  it("搜尋比對 searchValue，不是 filterValue", () => {
    expect(run(columns, { search: "刪除" }).rows.map(key)).toEqual(["1", "3"]);
  });

  it("篩選選單的選項仍然來自 filterValue", () => {
    expect(run(columns, {}).filterOptions.target).toEqual([
      "meeting",
      "session",
      "workitem",
    ]);
  });

  it("篩選比對 filterValue，不受 searchValue 影響", () => {
    expect(
      run(columns, { filters: { target: ["meeting"] } }).rows.map(key),
    ).toEqual(["3"]);
  });

  it("沒宣告 searchValue 時退回 filterValue", () => {
    const plain: ConsoleTableColumn<Log>[] = [
      { id: "kind", header: "類型", filterValue: (r) => r.kind, cell: (r) => r.kind },
    ];
    expect(run(plain, { search: "meeting" }).rows.map(key)).toEqual(["3"]);
  });
});

describe("dateFilterValue：篩的是區間，不是一顆一顆的日期", () => {
  type Task = { id: string; due: string };
  const data: Task[] = [
    { id: "past", due: "2020-01-01" },
    { id: "none", due: "" },
    { id: "far", due: "2999-12-31" },
  ];
  const columns: ConsoleTableColumn<Task>[] = [
    { id: "due", header: "到期", dateFilterValue: (t) => t.due, cell: (t) => t.due },
  ];
  const key = (t: Task) => t.id;
  const run = (filters: Record<string, string[]>) =>
    renderHook(() =>
      useClientTableQuery(
        data,
        { ...createDefaultTableQuery(10), sort: "manual", filters },
        columns,
        key,
      ),
    ).result.current;

  it("逾期是相對現在算的，不是存下來的那一天", () => {
    expect(run({ due: ["bucket:overdue"] }).rows.map(key)).toEqual(["past"]);
  });

  it("未來同理", () => {
    expect(run({ due: ["bucket:future"] }).rows.map(key)).toEqual(["far"]);
  });

  it("絕對區間照字面比", () => {
    expect(run({ due: ["2019-01-01|2021-01-01"] }).rows.map(key)).toEqual([
      "past",
    ]);
  });

  it("沒有日期的列不會被任何區間撈到", () => {
    expect(run({ due: ["bucket:overdue"] }).rows.map(key)).not.toContain("none");
    expect(run({ due: ["bucket:future"] }).rows.map(key)).not.toContain("none");
  });

  it("空值等於沒篩", () => {
    expect(run({ due: [""] }).rows.map(key)).toEqual(["past", "none", "far"]);
  });

  it("日期欄不產生一份每天一個選項的選單", () => {
    // 那正是它需要自己的控制項、而不是共用 filterValue 的原因
    expect(run({}).filterOptions.due).toBeUndefined();
  });
});

describe("filterValues：一列同時屬於多個值", () => {
  type Mtg = { id: string; people: string[] };
  const data: Mtg[] = [
    { id: "a", people: ["甲", "乙"] },
    { id: "b", people: ["乙", "丙"] },
    { id: "c", people: [] },
  ];
  const columns: ConsoleTableColumn<Mtg>[] = [
    {
      id: "people",
      header: "參與者",
      filterValues: (m) => m.people,
      cell: (m) => m.people.join("、"),
    },
  ];
  const key = (m: Mtg) => m.id;
  const run = (filters: Record<string, string[]>) =>
    renderHook(() =>
      useClientTableQuery(
        data,
        { ...createDefaultTableQuery(10), sort: "manual", filters },
        columns,
        key,
      ),
    ).result.current;

  it("選項是所有列出現過的值的聯集", () => {
    expect(run({}).filterOptions.people).toEqual(["乙", "丙", "甲"]);
  });

  it("選一個值就撈出所有含有它的列", () => {
    // 用 filterValue 只能挑一個代表，乙 在 b 不是第一順位就會漏掉
    expect(run({ people: ["乙"] }).rows.map(key)).toEqual(["a", "b"]);
  });

  it("選多個是「至少符合其中一個」，不是全中", () => {
    expect(run({ people: ["甲", "丙"] }).rows.map(key)).toEqual(["a", "b"]);
  });

  it("一個值都沒有的列不會被撈到", () => {
    expect(run({ people: ["甲"] }).rows.map(key)).not.toContain("c");
  });
});

describe("groupValue：分組的值可以跟篩選的值不一樣", () => {
  type Task = { id: string; project: string; schedule: string };
  const data: Task[] = [
    { id: "a", project: "P1", schedule: "S1" },
    { id: "b", project: "P2", schedule: "S1" },
    { id: "c", project: "P1", schedule: "S2" },
  ];
  const columns: ConsoleTableColumn<Task>[] = [
    {
      id: "schedule",
      header: "排程",
      // 照排程名稱篩選，卻連同專案一起分組——那兩個值不一樣
      filterValue: (t) => t.schedule,
      groupValue: (t) => `${t.project}/${t.schedule}`,
      cell: (t) => t.schedule,
    },
  ];
  const key = (t: Task) => t.id;
  const run = (q: Partial<ReturnType<typeof createDefaultTableQuery>>) =>
    renderHook(() =>
      useClientTableQuery(
        data,
        { ...createDefaultTableQuery(10), sort: "manual", ...q },
        columns,
        key,
      ),
    ).result.current;

  it("分組用 groupValue", () => {
    expect(run({ groupBy: "schedule" }).groupValues).toEqual([
      "P1/S1",
      "P1/S2",
      "P2/S1",
    ]);
  });

  it("篩選選單仍然是 filterValue，沒有被合成值汙染", () => {
    expect(run({}).filterOptions.schedule).toEqual(["S1", "S2"]);
  });

  it("篩選比對的也還是 filterValue", () => {
    expect(run({ filters: { schedule: ["S1"] } }).rows.map(key)).toEqual([
      "a",
      "b",
    ]);
  });

  it("沒宣告 groupValue 時分組就是 filterValue", () => {
    const plain: ConsoleTableColumn<Task>[] = [
      { id: "p", header: "專案", filterValue: (t) => t.project, cell: (t) => t.project },
    ];
    const result = renderHook(() =>
      useClientTableQuery(
        data,
        { ...createDefaultTableQuery(10), sort: "manual", groupBy: "p" },
        plain,
        key,
      ),
    ).result.current;
    expect(result.groupValues).toEqual(["P1", "P1", "P2"]);
  });
});
