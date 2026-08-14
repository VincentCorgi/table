import {
  render,
  screen,
  within,
  cleanup,
  act,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Plus, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import {
  ConsoleDataTable,
  createDefaultTableQuery,
  type ConsoleTableAction,
  type ConsoleTableColumn,
  type CellEditorContext,
} from "./console-data-table";
import { TAG_PALETTE, TAG_PALETTE_BY_HUE } from "./tag-colors";
import { useClientTableQuery } from "./use-client-table-query";
import { useProgressiveTableQuery } from "./use-progressive-table-query";

/**
 * 12 筆固定資料：分組刻意亂序、名稱可排序，涵蓋分頁（>10）、排序
 * tie-break、篩選、搜尋。
 */
type Row = { id: string; name: string; group: string; qty: number };

const ROWS: Row[] = [
  { id: "r1", name: "n07", group: "乙", qty: 3 },
  { id: "r2", name: "n01", group: "甲", qty: 2 },
  { id: "r3", name: "n05", group: "乙", qty: 1 },
  { id: "r4", name: "n03", group: "甲", qty: 4 },
  { id: "r5", name: "n09", group: "丙", qty: 5 },
  { id: "r6", name: "n02", group: "甲", qty: 6 },
  { id: "r7", name: "n11", group: "丙", qty: 7 },
  { id: "r8", name: "n04", group: "乙", qty: 8 },
  { id: "r9", name: "n06", group: "丙", qty: 9 },
  { id: "r10", name: "n08", group: "甲", qty: 10 },
  { id: "r11", name: "n12", group: "乙", qty: 11 },
  { id: "r12", name: "n10", group: "丙", qty: 12 },
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
  {
    id: "qty",
    header: "數量",
    align: "right",
    cell: (row) => row.qty,
    sortValue: (row) => row.qty,
  },
];

const rowKeyOf = (row: Row) => row.id;

type TestTableProps = Partial<
  React.ComponentProps<typeof ConsoleDataTable<Row>>
> & {
  data?: Row[];
  initialPageSize?: number;
};

/** 受控模式的測試 wrapper：query 狀態 + client adapter，等同真實用法。 */
function TestTable({
  data = ROWS,
  initialPageSize = 10,
  columns = COLUMNS,
  ...props
}: TestTableProps) {
  const [query, setQuery] = useState(() =>
    createDefaultTableQuery(initialPageSize),
  );
  const result = useClientTableQuery(data, query, columns, rowKeyOf);
  return (
    <ConsoleDataTable
      title="測試表格"
      columns={columns}
      rowKey={rowKeyOf}
      query={query}
      onQueryChange={setQuery}
      {...result}
      {...props}
    />
  );
}

function renderTable(props: TestTableProps = {}) {
  return render(<TestTable {...props} />);
}

/** 目前頁面上第一個資料列的「名稱」欄文字。 */
function firstRowName(): string {
  const body = document.querySelector("tbody")!;
  return within(body).getAllByRole("row")[0].querySelectorAll("td")[1]
    .textContent!;
}

function columnHeader(label: string): HTMLElement {
  return screen
    .getAllByRole("columnheader")
    .find((th) => th.textContent?.includes(label))!;
}

/**
 * 從排序選單選一個欄位。排序不再由表頭觸發，所有測試都走這個入口。
 * 同一欄再選一次即翻轉方向。
 */
async function sortByMenu(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
) {
  await user.click(screen.getByRole("button", { name: /^排序/ }));
  const menu = screen.getByText("依欄位排序").parentElement!;
  await user.click(within(menu).getByRole("button", { name: label }));
  await user.keyboard("{Escape}");
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("排序", () => {
  it("預設以第一個可排序欄升冪排資料，但表頭不顯示排序狀態", () => {
    renderTable();
    expect(firstRowName()).toBe("n01");
    expect(columnHeader("名稱")).not.toHaveAttribute("aria-sort");
  });

  it("選單內同一欄再選一次翻轉方向，沒有第三態", async () => {
    const user = userEvent.setup();
    renderTable();

    await sortByMenu(user, "名稱");
    expect(columnHeader("名稱")).toHaveAttribute("aria-sort", "ascending");
    expect(firstRowName()).toBe("n01");

    await sortByMenu(user, "名稱");
    expect(columnHeader("名稱")).toHaveAttribute("aria-sort", "descending");
    expect(firstRowName()).toBe("n12");

    // 第三次回到升冪，而不是取消排序
    await sortByMenu(user, "名稱");
    expect(columnHeader("名稱")).toHaveAttribute("aria-sort", "ascending");
    expect(firstRowName()).toBe("n01");
  });

  it("表頭不再是排序入口：點下去不改變排序", async () => {
    const user = userEvent.setup();
    renderTable();
    await sortByMenu(user, "名稱");
    expect(firstRowName()).toBe("n01");

    // 表頭內已無排序按鈕，點整個表頭也不該改變任何東西
    expect(
      within(columnHeader("名稱")).queryByRole("button"),
    ).not.toBeInTheDocument();
    await user.click(columnHeader("名稱"));
    expect(columnHeader("名稱")).toHaveAttribute("aria-sort", "ascending");
    expect(firstRowName()).toBe("n01");
  });

  it("主排序欄同值時以其餘可排序欄 tie-break，升降冪間組內順序一致", async () => {
    const user = userEvent.setup();
    // 12 筆要全部在同一頁，斷言才不會被分頁截斷
    renderTable({ initialPageSize: 30 });

    await sortByMenu(user, "類別"); // 類別升冪
    const readNames = () =>
      [...document.querySelectorAll("tbody tr")].map(
        (tr) => tr.querySelectorAll("td")[1].textContent,
      );
    const asc = readNames();

    await sortByMenu(user, "類別"); // 類別降冪
    const desc = readNames();

    // 同分組內的順序（以名稱 tie-break）不因方向翻轉而改變：
    // 取升冪時第一組的成員，應以相同順序出現在降冪結果的尾端。
    const firstGroupSize = ROWS.filter(
      (r) => r.group === ROWS.find((x) => x.name === asc[0])!.group,
    ).length;
    expect(desc.slice(-firstGroupSize)).toEqual(asc.slice(0, firstGroupSize));
  });
});

describe("排序選單", () => {
  it("只列出有 sortValue 的欄位", async () => {
    const user = userEvent.setup();
    const columns: ConsoleTableColumn<Row>[] = [
      ...COLUMNS,
      { id: "note", header: "備註", cell: () => "—" },
    ];
    renderTable({ columns });

    await user.click(screen.getByRole("button", { name: /^排序/ }));
    const menu = screen.getByText("依欄位排序").parentElement!;
    expect(within(menu).getByRole("button", { name: "名稱" })).toBeInTheDocument();
    expect(
      within(menu).queryByRole("button", { name: "備註" }),
    ).not.toBeInTheDocument();
  });

  it("可直接指定升冪／降冪", async () => {
    const user = userEvent.setup();
    renderTable();
    await sortByMenu(user, "名稱");

    await user.click(screen.getByRole("button", { name: /^排序/ }));
    await user.click(screen.getByRole("button", { name: "降冪" }));
    await user.keyboard("{Escape}");
    expect(firstRowName()).toBe("n12");

    await user.click(screen.getByRole("button", { name: /^排序/ }));
    await user.click(screen.getByRole("button", { name: "升冪" }));
    await user.keyboard("{Escape}");
    expect(firstRowName()).toBe("n01");
  });

  it("按鈕在收合狀態就顯示目前排序，未設定時不顯示欄位名", async () => {
    const user = userEvent.setup();
    renderTable();
    // 未設定：只有「排序」，沒有欄位名
    expect(screen.getByRole("button", { name: "排序" })).toBeInTheDocument();

    await sortByMenu(user, "名稱");
    expect(
      screen.getByRole("button", { name: "排序：名稱↑" }),
    ).toBeInTheDocument();

    await sortByMenu(user, "名稱");
    expect(
      screen.getByRole("button", { name: "排序：名稱↓" }),
    ).toBeInTheDocument();
  });

  it("分組生效時仍可切到手動排序", async () => {
    const user = userEvent.setup();
    // 分組只在捲動模式可用，這個案例要驗分組生效時的選單，所以走捲動模式
    renderTable({ onRowReorder: vi.fn(), pagination: "scroll" });

    await user.click(screen.getByRole("button", { name: /^排序/ }));
    expect(screen.getByRole("button", { name: "手動" })).toBeInTheDocument();
    await user.keyboard("{Escape}");

    // 加一層分組（分組 popover 內選欄位）
    await user.click(screen.getByRole("button", { name: "分組" }));
    const groupMenu = document.querySelector(
      '[data-slot="popover-content"]',
    ) as HTMLElement;
    await user.click(within(groupMenu).getByRole("button", { name: "類別" }));
    await user.keyboard("{Escape}");

    // 分組不擋掉手動排序：選項還在，選了就切過去
    await user.click(screen.getByRole("button", { name: /^排序/ }));
    await user.click(screen.getByRole("button", { name: "手動" }));
    expect(screen.getByRole("button", { name: /^排序：手動/ })).toBeInTheDocument();
  });

  it("選單可以切到手動，再選欄位就切回欄位排序", async () => {
    const user = userEvent.setup();
    renderTable({ onRowReorder: vi.fn(), pagination: "scroll" });

    await user.click(screen.getByRole("button", { name: /^排序/ }));
    await user.click(screen.getByRole("button", { name: "手動" }));
    expect(
      screen.getByRole("button", { name: /^排序：手動/ }),
    ).toBeInTheDocument();

    // 選單不會因為選了就關掉，直接選欄位即可切回
    await user.click(screen.getByRole("button", { name: "名稱" }));
    expect(
      screen.getByRole("button", { name: "排序：名稱↑" }),
    ).toBeInTheDocument();
  });

  it("沒給 onRowReorder 時選單沒有手動這個選項", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole("button", { name: /^排序/ }));
    expect(
      screen.queryByRole("button", { name: "手動" }),
    ).not.toBeInTheDocument();
  });
});

describe("排序持久化", () => {
  it("排序寫進 localStorage，重新掛載後還原", async () => {
    const user = userEvent.setup();
    renderTable({ storageKey: "t" });
    await sortByMenu(user, "名稱");
    await sortByMenu(user, "名稱"); // 降冪
    expect(firstRowName()).toBe("n12");
    expect(JSON.parse(localStorage.getItem("console-table:t")!).sort).toEqual({
      columnId: "name",
      direction: "desc",
    });

    cleanup();
    renderTable({ storageKey: "t" });
    expect(await screen.findByRole("button", { name: "排序：名稱↓" })).toBeInTheDocument();
    expect(firstRowName()).toBe("n12");
  });

  it("手動順序一併持久化，還原後不退回隱性預設排序", async () => {
    localStorage.setItem(
      "console-table:t",
      JSON.stringify({
        version: 1, sort: "manual" }),
    );
    renderTable({ storageKey: "t", onRowReorder: vi.fn() });

    expect(
      await screen.findByRole("button", { name: "排序：手動排序" }),
    ).toBeInTheDocument();
    // 隱性預設排序（名稱升冪）若生效，第一列會是 n01
    expect(firstRowName()).toBe("n07");
  });

  it("壞掉或指向已不存在欄位的排序值一律忽略，其餘偏好照常載入", async () => {
    localStorage.setItem(
      "console-table:t",
      JSON.stringify({
        version: 1, sort: { columnId: "gone", direction: "asc" }, wrapLines: true }),
    );
    renderTable({ storageKey: "t" });
    expect(await screen.findByRole("button", { name: "排序" })).toBeInTheDocument();

    cleanup();
    localStorage.setItem(
      "console-table:t",
      JSON.stringify({
        version: 1, sort: "亂寫的", pageSize: 30 }),
    );
    renderTable({ storageKey: "t" });
    // pageSize 仍載入（12 筆 / 30 一頁）
    expect(await screen.findByText("1 / 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "排序" })).toBeInTheDocument();
  });

  it("沒有 storageKey 就不持久化", async () => {
    const user = userEvent.setup();
    renderTable();
    await sortByMenu(user, "名稱");
    expect(localStorage.length).toBe(0);
  });
});

describe("子項目", () => {
  type TreeRow = { id: string; name: string; parent: string | null };
  const TREE: TreeRow[] = [
    { id: "p1", name: "父一", parent: null },
    { id: "c1", name: "子一", parent: "p1" },
    { id: "c2", name: "子二", parent: "p1" },
    { id: "p2", name: "父二", parent: null },
  ];
  const TREE_COLUMNS: ConsoleTableColumn<TreeRow>[] = [
    { id: "name", header: "名稱", cell: (r) => r.name, sortValue: (r) => r.name },
  ];
  const subRowOf = (r: TreeRow) => r.parent;

  function TreeTable({
    data = TREE,
    ...props
  }: Partial<React.ComponentProps<typeof ConsoleDataTable<TreeRow>>> & {
    data?: TreeRow[];
  } = {}) {
    const [query, setQuery] = useState(() => createDefaultTableQuery(30));
    const result = useClientTableQuery(
      data,
      query,
      TREE_COLUMNS,
      (r) => r.id,
      subRowOf,
    );
    return (
      <ConsoleDataTable
        title="子項目測試"
        columns={TREE_COLUMNS}
        rowKey={(r) => r.id}
        query={query}
        onQueryChange={setQuery}
        pagination="scroll"
        subRowOf={subRowOf}
        {...result}
        {...props}
      />
    );
  }

  const rowFlags = () =>
    [...document.querySelectorAll("tr[data-row-key]")].map((r) => ({
      key: r.getAttribute("data-row-key"),
      sub: r.getAttribute("data-sub-row") === "true",
    }));

  it("子列標記為子列並縮排，父列沒有", () => {
    render(<TreeTable />);
    expect(rowFlags()).toEqual([
      { key: "p1", sub: false },
      { key: "c1", sub: true },
      { key: "c2", sub: true },
      { key: "p2", sub: false },
    ]);
    const subCell = document.querySelector(
      "tr[data-sub-row='true'] td:nth-child(2)",
    ) as HTMLElement;
    expect(subCell.style.paddingLeft).toBe("2rem");
  });

  it("不顯示子項目數量，父列由三角形本身表達有無子項目", () => {
    render(<TreeTable />);
    // 數量標籤是視覺噪音；有沒有子項目看三角形是不是常駐就知道
    expect(document.querySelector("[data-sub-row-count]")).not.toBeInTheDocument();
    // p1 有子項目＝三角形常駐；p2 沒有＝要有 onAddSubRow 才畫（這裡沒給）
    expect(disclosureOf("p1")).toBeInTheDocument();
    expect(disclosureOf("p2")).not.toBeInTheDocument();
  });

  it("分頁模式完全平坦：無縮排、無數量", () => {
    render(<TreeTable pagination="paged" />);
    expect(rowFlags().every((r) => !r.sub)).toBe(true);
    expect(
      document.querySelector("[data-sub-row-count]"),
    ).not.toBeInTheDocument();
  });

  const visibleKeys = () =>
    [...document.querySelectorAll("tr[data-row-key]")].map((r) =>
      r.getAttribute("data-row-key"),
    );
  const disclosureOf = (key: string) =>
    document.querySelector(
      `tr[data-row-key='${key}'] [data-disclosure='true']`,
    ) as HTMLElement | null;

  it("有子項目的父列有常駐三角形，沒有子項目的父列沒有", () => {
    render(<TreeTable />);
    expect(disclosureOf("p1")).toBeInTheDocument();
    expect(disclosureOf("p1")).toHaveAttribute("aria-expanded", "true");
    expect(disclosureOf("p2")).toBeNull();
    expect(disclosureOf("c1")).toBeNull();
  });

  it("收合只藏該父列的子列，展開後回到原位", async () => {
    const user = userEvent.setup();
    render(<TreeTable />);
    expect(visibleKeys()).toEqual(["p1", "c1", "c2", "p2"]);

    await user.click(disclosureOf("p1")!);
    expect(visibleKeys()).toEqual(["p1", "p2"]);
    expect(disclosureOf("p1")).toHaveAttribute("aria-expanded", "false");

    await user.click(disclosureOf("p1")!);
    expect(visibleKeys()).toEqual(["p1", "c1", "c2", "p2"]);
  });

  it("收合後三角形仍在，與沒有子項目的父列仍分得出來", async () => {
    const user = userEvent.setup();
    render(<TreeTable />);
    await user.click(disclosureOf("p1")!);
    // 收合了，但三角形常駐——沒有子項目的 p2 連三角形都沒有
    expect(disclosureOf("p1")).toBeInTheDocument();
    expect(disclosureOf("p1")).toHaveAttribute("aria-expanded", "false");
    expect(disclosureOf("p2")).not.toBeInTheDocument();
  });

  it("沒有子項目的列：三角形 hover 才出現、預設收合，展開後才有新增子項目", async () => {
    const user = userEvent.setup();
    const onAddSubRow = vi.fn();
    render(<TreeTable onAddSubRow={onAddSubRow} />);

    // p2 沒有子項目：三角形存在但常駐隱藏，且預設收合
    const chevron = disclosureOf("p2")!;
    expect(chevron.className).toContain("opacity-0");
    expect(chevron.className).toContain("group-hover/row:opacity-100");
    expect(chevron).toHaveAttribute("aria-expanded", "false");
    // 此時只有 p1（已展開、有子項目）那條新增列
    expect(
      document.querySelectorAll("[data-slot='add-sub-row']"),
    ).toHaveLength(1);

    // 展開 p2 後多一條，且緊接在 p2 之後
    await user.click(chevron);
    expect(chevron).toHaveAttribute("aria-expanded", "true");
    const addRows = [...document.querySelectorAll("[data-slot='add-sub-row']")];
    expect(addRows).toHaveLength(2);
    const bodyRows = [...document.querySelectorAll("tbody tr")];
    const p2At = bodyRows.findIndex(
      (r) => r.getAttribute("data-row-key") === "p2",
    );
    expect(bodyRows[p2At + 1].getAttribute("data-slot")).toBe("add-sub-row");

    await user.click(
      within(bodyRows[p2At + 1] as HTMLElement).getByRole("button"),
    );
    expect(onAddSubRow).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p2" }),
    );
    // 表格不自行新增任何列
    expect(visibleKeys()).toEqual(["p1", "c1", "c2", "p2"]);
  });

  it("有子項目的父列展開時，新增子項目接在最後一個子列之後", () => {
    render(<TreeTable onAddSubRow={vi.fn()} />);
    const rows = [...document.querySelectorAll("tbody tr")];
    const lastChild = rows.findIndex(
      (r) => r.getAttribute("data-row-key") === "c2",
    );
    expect(rows[lastChild + 1].getAttribute("data-slot")).toBe("add-sub-row");
  });

  it("沒給 onAddSubRow 時，沒有子項目的列連三角形都沒有", () => {
    render(<TreeTable />);
    expect(disclosureOf("p2")).toBeNull();
    expect(disclosureOf("p1")).toBeInTheDocument();
  });

  it("沒給 onAddSubRow 時該位置什麼都沒有，但父列仍有三角形", () => {
    render(<TreeTable />);
    expect(
      document.querySelector("[data-add-sub-row='true']"),
    ).not.toBeInTheDocument();
    expect(disclosureOf("p1")).toBeInTheDocument();
  });

  it("有子項目時三角形與拖曳握把並存，互不擠掉", () => {
    render(<TreeTable onRowReorder={vi.fn()} />);
    expect(disclosureOf("p1")).toBeInTheDocument();
    expect(
      document.querySelector("[data-drag-handle='true']"),
    ).toBeInTheDocument();
  });

  it("收合不改變選取狀態", async () => {
    const user = userEvent.setup();
    render(<TreeTable />);
    const boxes = screen.getAllByRole("checkbox", { name: "選取此列" });
    await user.click(boxes[1]); // c1
    expect(screen.getByText("(1/4)")).toBeInTheDocument();

    await user.click(disclosureOf("p1")!);
    await user.click(disclosureOf("p1")!);
    expect(screen.getByText("(1/4)")).toBeInTheDocument();
  });

  it("收合會關掉開啟中的編輯器並丟棄草稿", async () => {
    const user = userEvent.setup();
    const onCellCommit = vi.fn();
    const columns = [
      {
        id: "name",
        header: "名稱",
        sortValue: (r: TreeRow) => r.name,
        editable: { type: "text", getValue: (r: TreeRow) => r.name },
      },
    ] as ConsoleTableColumn<TreeRow>[];
    render(<TreeTable columns={columns} onCellCommit={onCellCommit} />);

    const cell = document.querySelector(
      "tr[data-row-key='c1'] td:nth-child(2)",
    ) as HTMLElement;
    await user.dblClick(cell);
    const input = screen.getByRole("textbox", { name: "編輯值" });
    await user.clear(input);
    await user.type(input, "草稿");

    await user.click(disclosureOf("p1")!);
    expect(onCellCommit).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("textbox", { name: "編輯值" }),
    ).not.toBeInTheDocument();
  });

  it("篩選命中被收合的子列時強制展開，清掉篩選後回到收合", async () => {
    const user = userEvent.setup();
    render(<TreeTable />);
    await user.click(disclosureOf("p1")!);
    expect(visibleKeys()).toEqual(["p1", "p2"]);

    const search = screen.getByPlaceholderText("以屬性或值篩選");
    await user.type(search, "子一");
    expect(visibleKeys()).toEqual(["p1", "c1"]);

    await user.clear(search);
    expect(visibleKeys()).toEqual(["p1", "p2"]);
  });

  it("收合狀態隨 storageKey 存進 localStorage 並還原", async () => {
    const user = userEvent.setup();
    render(<TreeTable storageKey="tree" />);
    await user.click(disclosureOf("p1")!);
    expect(
      JSON.parse(localStorage.getItem("console-table:tree")!).disclosure,
    ).toEqual({ p1: false });

    cleanup();
    render(<TreeTable storageKey="tree" />);
    expect(await screen.findByLabelText("展開p1的子項目")).toBeInTheDocument();
    expect(visibleKeys()).toEqual(["p1", "p2"]);
  });

  it("存檔中已不存在的父列 key 忽略，其餘收合狀態照常套用", async () => {
    localStorage.setItem(
      "console-table:tree",
      JSON.stringify({
        version: 1, disclosure: { p1: false, 已刪除的列: false } }),
    );
    render(<TreeTable storageKey="tree" />);
    expect(await screen.findByLabelText("展開p1的子項目")).toBeInTheDocument();
    expect(visibleKeys()).toEqual(["p1", "p2"]);
  });

  it("沒有 storageKey 就不持久化，重新掛載為全展開", async () => {
    const user = userEvent.setup();
    render(<TreeTable />);
    await user.click(disclosureOf("p1")!);
    expect(localStorage.length).toBe(0);

    cleanup();
    render(<TreeTable />);
    expect(visibleKeys()).toEqual(["p1", "c1", "c2", "p2"]);
  });

  it("篩選命中子列時保留父列並標示；父列命中不帶回子列", async () => {
    const user = userEvent.setup();
    render(<TreeTable />);

    // 搜尋「子一」：c1 命中，父列 p1 因脈絡被保留並標示
    await user.type(screen.getByPlaceholderText("以屬性或值篩選"), "子一");
    expect(rowFlags().map((r) => r.key)).toEqual(["p1", "c1"]);
    expect(
      document.querySelector("tr[data-row-key='p1']")?.getAttribute("data-retained"),
    ).toBe("true");
    expect(
      document.querySelector("tr[data-row-key='c1']")?.getAttribute("data-retained"),
    ).toBeNull();

    // 搜尋「父二」：p2 自己命中，沒有子列可帶
    await user.clear(screen.getByPlaceholderText("以屬性或值篩選"));
    await user.type(screen.getByPlaceholderText("以屬性或值篩選"), "父一");
    // p1 命中，但它的子列不會被帶回來
    expect(rowFlags().map((r) => r.key)).toEqual(["p1"]);
  });

  it("選取不連動：勾父列不影響子列，反之亦然", async () => {
    const user = userEvent.setup();
    render(<TreeTable />);
    const boxes = screen.getAllByRole("checkbox", { name: "選取此列" });

    await user.click(boxes[0]); // p1
    expect(screen.getByText("(1/4)")).toBeInTheDocument();

    await user.click(boxes[1]); // c1
    expect(screen.getByText("(2/4)")).toBeInTheDocument();
  });

  it("有子項目時仍可拖曳排序", () => {
    render(<TreeTable onRowReorder={vi.fn()} />);
    expect(
      document.querySelector("[data-drag-handle='true']"),
    ).toBeInTheDocument();
  });

  /** 子項目情境下的拖曳輔助（把手順序＝畫出來的列順序）。 */
  function dragTreeRow(from: number, toClientY: number) {
    const handles = [
      ...document.querySelectorAll("[data-drag-handle='true']"),
    ] as HTMLElement[];
    const handle = handles[from];
    handle.setPointerCapture = () => {};
    handle.releasePointerCapture = () => {};
    act(() => {
      handle.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, pointerId: 1 }),
      );
      handle.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 1,
          clientY: toClientY,
        }),
      );
      handle.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId: 1,
          clientY: toClientY,
        }),
      );
    });
  }

  function stubTreeGeometry() {
    [...document.querySelectorAll("tr[data-row-key]")].forEach((row, i) => {
      row.getBoundingClientRect = () =>
        ({ top: i * 20, height: 20, bottom: i * 20 + 20 }) as DOMRect;
    });
  }

  it("拖父列時只回報父列，parentKey 為 null", () => {
    const onRowReorder = vi.fn();
    render(<TreeTable onRowReorder={onRowReorder} />);
    stubTreeGeometry();

    // 畫出來的順序：p1, c1, c2, p2。把 p1（連同 c1、c2）拖到最後
    dragTreeRow(0, 999);

    expect(onRowReorder).toHaveBeenCalledTimes(1);
    const [row, target] = onRowReorder.mock.calls[0];
    expect(row.id).toBe("p1");
    expect(target.parentKey).toBeNull();
    expect(target.before.id).toBe("p2");
  });

  it("父列丟進自己的子列裡不回報", () => {
    const onRowReorder = vi.fn();
    render(<TreeTable onRowReorder={onRowReorder} />);
    stubTreeGeometry();

    // p1 在索引 0，它的子列佔 1、2。丟到 c1 與 c2 之間
    dragTreeRow(0, 45);
    expect(onRowReorder).not.toHaveBeenCalled();
  });

  it("子列拖到別的父列底下，回報新的 parentKey", () => {
    const onRowReorder = vi.fn();
    const data = [
      { id: "p1", name: "父一", parent: null },
      { id: "c1", name: "子一", parent: "p1" },
      { id: "p2", name: "父二", parent: null },
      { id: "c2", name: "子二", parent: "p2" },
    ];
    render(<TreeTable data={data} onRowReorder={onRowReorder} />);
    stubTreeGeometry();

    // 畫出來：p1, c1, p2, c2。把 c1（索引 1）拖到 c2 之後
    dragTreeRow(1, 999);

    expect(onRowReorder).toHaveBeenCalledTimes(1);
    const [row, target] = onRowReorder.mock.calls[0];
    expect(row.id).toBe("c1");
    expect(target.parentKey).toBe("p2");
  });

  it("子列拖到頂層（任何父列的子列區段之外）不回報", () => {
    const onRowReorder = vi.fn();
    const data = [
      { id: "p1", name: "父一", parent: null },
      { id: "c1", name: "子一", parent: "p1" },
      { id: "p2", name: "父二", parent: null },
    ];
    render(<TreeTable data={data} onRowReorder={onRowReorder} />);
    stubTreeGeometry();

    // 畫出來：p1, c1, p2。把 c1 拖到 p2 之後＝頂層，沒有任何父列的區段
    dragTreeRow(1, 999);
    expect(onRowReorder).not.toHaveBeenCalled();
  });

  it("子列的儲存格可編輯，與父列一致", async () => {
    const user = userEvent.setup();
    const onCellCommit = vi.fn();
    const columns = [
      {
        id: "name",
        header: "名稱",
        sortValue: (r: TreeRow) => r.name,
        editable: { type: "text", getValue: (r: TreeRow) => r.name },
      },
    ] as ConsoleTableColumn<TreeRow>[];
    render(<TreeTable columns={columns} onCellCommit={onCellCommit} />);

    const subCell = document.querySelector(
      "tr[data-row-key='c1'] td:nth-child(2)",
    ) as HTMLElement;
    await user.dblClick(subCell);
    const input = screen.getByRole("textbox", { name: "編輯值" });
    await user.clear(input);
    await user.type(input, "改過的子項{Enter}");

    expect(onCellCommit).toHaveBeenCalledWith(
      expect.objectContaining({ id: "c1" }),
      "name",
      "改過的子項",
    );
  });

  it("沒宣告 subRowOf 時完全沒有子項目跡象", () => {
    render(<TreeTable subRowOf={undefined} />);
    expect(rowFlags().every((r) => !r.sub)).toBe(true);
    expect(
      document.querySelector("[data-sub-row-count]"),
    ).not.toBeInTheDocument();
  });
});

describe("拖曳排序", () => {
  /** 拖曳只在捲動模式可用，整組測試都在捲動模式下跑。 */
  function renderDraggable(props: TestTableProps = {}) {
    return renderTable({
      pagination: "scroll",
      initialPageSize: 30,
      ...props,
    });
  }

  /** 以 pointer 事件模擬把第 from 列拖到第 to 個插入點。 */
  function dragRow(from: number, toClientY: number) {
    const handles = [
      ...document.querySelectorAll("[data-drag-handle='true']"),
    ] as HTMLElement[];
    const handle = handles[from];
    handle.setPointerCapture = () => {};
    handle.releasePointerCapture = () => {};
    // pointermove／pointerup 掛在把手上而非 React 的事件系統，state 更新
    // 要自己包 act 才會 flush
    act(() => {
      handle.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, pointerId: 1 }),
      );
      handle.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 1,
          clientY: toClientY,
        }),
      );
      handle.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId: 1,
          clientY: toClientY,
        }),
      );
    });
  }

  /** jsdom 沒有版面，手動餵每一列的位置：第 i 列佔 [i*20, i*20+20)。 */
  function stubRowGeometry() {
    const rows = [...document.querySelectorAll("tr[data-row-key]")];
    rows.forEach((row, i) => {
      row.getBoundingClientRect = () =>
        ({ top: i * 20, height: 20, bottom: i * 20 + 20 }) as DOMRect;
    });
    return rows.length;
  }

  it("分頁模式沒有拖曳把手，捲動模式才有", () => {
    renderTable({ onRowReorder: vi.fn() }); // 預設分頁模式
    expect(
      document.querySelector("[data-drag-handle='true']"),
    ).not.toBeInTheDocument();

    cleanup();
    renderDraggable({ onRowReorder: vi.fn() });
    expect(
      document.querySelector("[data-drag-handle='true']"),
    ).toBeInTheDocument();
  });

  it("沒給 onRowReorder 時沒有拖曳把手", () => {
    renderDraggable();
    expect(
      document.querySelector("[data-drag-handle='true']"),
    ).not.toBeInTheDocument();
  });

  it("分組生效時握把仍然在", async () => {
    const user = userEvent.setup();
    renderDraggable({ onRowReorder: vi.fn(), pagination: "scroll" });
    expect(
      document.querySelector("[data-drag-handle='true']"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "分組" }));
    const menu = document.querySelector(
      '[data-slot="popover-content"]',
    ) as HTMLElement;
    await user.click(within(menu).getByRole("button", { name: "類別" }));
    await user.keyboard("{Escape}");

    expect(
      document.querySelector("[data-drag-handle='true']"),
    ).toBeInTheDocument();
  });

  it("回報被移動的列與新鄰居，且不 mutate rows", () => {
    const onRowReorder = vi.fn();
    const snapshot = structuredClone(ROWS);
    renderDraggable({ onRowReorder });
    stubRowGeometry();

    // 預設以名稱升冪：n01…n10。把第 1 列（n01）拖到第 3、4 列之間
    dragRow(0, 70);

    expect(onRowReorder).toHaveBeenCalledTimes(1);
    const [row, neighbours] = onRowReorder.mock.calls[0];
    expect(row.name).toBe("n01");
    expect(neighbours.before.name).toBe("n03");
    expect(neighbours.after.name).toBe("n04");
    expect(ROWS).toEqual(snapshot);
  });

  it("分組生效時，跨組拖曳回報目的組的分組值", async () => {
    const user = userEvent.setup();
    const onRowReorder = vi.fn();
    renderDraggable({ onRowReorder });

    await user.click(screen.getByRole("button", { name: "分組" }));
    const menu = document.querySelector(
      '[data-slot="popover-content"]',
    ) as HTMLElement;
    await user.click(within(menu).getByRole("button", { name: "類別" }));
    await user.keyboard("{Escape}");

    stubRowGeometry();
    // 分組後群組依 zh-Hant 筆畫序：乙 → 丙 → 甲。把第一列（乙組）拖到最後
    dragRow(0, 999);

    expect(onRowReorder).toHaveBeenCalledTimes(1);
    const [, target] = onRowReorder.mock.calls[0];
    expect(target.groupValue).toBe("甲");
    expect(target.parentKey).toBeNull();
  });

  it("同組內拖曳回報的分組值與原本相同", async () => {
    const user = userEvent.setup();
    const onRowReorder = vi.fn();
    renderDraggable({ onRowReorder });

    await user.click(screen.getByRole("button", { name: "分組" }));
    const menu = document.querySelector(
      '[data-slot="popover-content"]',
    ) as HTMLElement;
    await user.click(within(menu).getByRole("button", { name: "類別" }));
    await user.keyboard("{Escape}");

    stubRowGeometry();
    // 乙組有 4 列（索引 0-3），把第 1 列拖到第 3、4 列之間
    dragRow(0, 70);
    expect(onRowReorder.mock.calls[0][1].groupValue).toBe("乙");
  });

  it("未分組時 groupValue 與 parentKey 都是 null", () => {
    const onRowReorder = vi.fn();
    renderDraggable({ onRowReorder });
    stubRowGeometry();

    dragRow(0, 70);
    const [, target] = onRowReorder.mock.calls[0];
    expect(target.groupValue).toBeNull();
    expect(target.parentKey).toBeNull();
  });

  it("拖到最前面時 before 為 null", () => {
    const onRowReorder = vi.fn();
    renderDraggable({ onRowReorder });
    stubRowGeometry();

    dragRow(2, 5); // 拖到第一列之前
    expect(onRowReorder.mock.calls[0][1].before).toBeNull();
    expect(onRowReorder.mock.calls[0][1].after.name).toBe("n01");
  });

  it("拖到最後面時 after 為 null", () => {
    const onRowReorder = vi.fn();
    renderDraggable({ onRowReorder });
    stubRowGeometry();

    dragRow(0, 999);
    expect(onRowReorder.mock.calls[0][1].after).toBeNull();
    // 捲動模式下 12 列全在畫面上，「最後」就是 n12（分頁時只到該頁的 n10）
    expect(onRowReorder.mock.calls[0][1].before.name).toBe("n12");
  });

  it("拖曳中顯示落點插入線，且隨位置移動", () => {
    renderDraggable({ onRowReorder: vi.fn() });
    stubRowGeometry();
    const handle = document.querySelectorAll(
      "[data-drag-handle='true']",
    )[0] as HTMLElement;
    handle.setPointerCapture = () => {};

    const rowAt = (i: number) =>
      document.querySelectorAll("tr[data-row-key]")[i] as HTMLElement;

    act(() => {
      handle.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, pointerId: 1 }),
      );
      handle.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 1,
          clientY: 70,
        }),
      );
    });
    // 被拖曳的列變淡，落點在第 4 列（索引 3）之上
    expect(rowAt(0).className).toContain("opacity-40");
    expect(rowAt(3).className).toContain("border-t-primary");

    act(() => {
      handle.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 1,
          clientY: 110,
        }),
      );
    });
    // 落點跟著移到第 6 列（索引 5）之上
    expect(rowAt(3).className).not.toContain("border-t-primary");
    expect(rowAt(5).className).toContain("border-t-primary");

    act(() => {
      handle.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId: 1,
          clientY: 110,
        }),
      );
    });
    // 放開後指示消失
    expect(rowAt(5).className).not.toContain("border-t-primary");
  });

  it("原地放下不回報", () => {
    const onRowReorder = vi.fn();
    renderDraggable({ onRowReorder });
    stubRowGeometry();
    dragRow(1, 25); // 還在自己的位置區間內
    expect(onRowReorder).not.toHaveBeenCalled();
  });

  it("拖曳完成即進入手動模式", () => {
    renderDraggable({ onRowReorder: vi.fn() });
    stubRowGeometry();
    expect(screen.getByRole("button", { name: "排序" })).toBeInTheDocument();

    dragRow(0, 70);
    expect(
      screen.getByRole("button", { name: "排序：手動排序" }),
    ).toBeInTheDocument();
  });

  it("開始拖曳會關掉編輯器並丟棄草稿", async () => {
    const user = userEvent.setup();
    const onCellCommit = vi.fn();
    const columns: ConsoleTableColumn<Row>[] = [
      {
        id: "name",
        header: "名稱",
        sortValue: (row) => row.name,
        editable: { type: "text", getValue: (row) => row.name },
      },
    ];
    renderDraggable({ columns, onCellCommit, onRowReorder: vi.fn() });

    const firstCell = document.querySelectorAll("tbody tr td")[1] as HTMLElement;
    await user.dblClick(firstCell);
    const input = screen.getByRole("textbox", { name: "編輯值" });
    await user.clear(input);
    await user.type(input, "草稿");

    stubRowGeometry();
    dragRow(0, 70);

    expect(onCellCommit).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("textbox", { name: "編輯值" }),
    ).not.toBeInTheDocument();
  });
});

describe("搜尋與分頁", () => {
  it("搜尋會過濾列並顯示符合筆數", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.type(screen.getByPlaceholderText("以屬性或值篩選"), "甲");
    expect(screen.getByText("4 筆符合")).toBeInTheDocument();
    expect(document.querySelectorAll("tbody tr")).toHaveLength(4);
  });

  it("預設每頁 10 筆，翻頁後顯示剩餘列，第一頁時上一頁停用", async () => {
    const user = userEvent.setup();
    renderTable();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(document.querySelectorAll("tbody tr")).toHaveLength(10);
    expect(screen.getByRole("button", { name: "上一頁" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "下一頁" }));
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    expect(document.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "下一頁" })).toBeDisabled();
  });

  it("第一頁／最後一頁按鈕直接跳到邊界，邊界時停用", async () => {
    const user = userEvent.setup();
    renderTable();
    expect(screen.getByRole("button", { name: "第一頁" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "最後一頁" }));
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "最後一頁" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "第一頁" }));
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });
});

describe("欄位篩選", () => {
  it("篩選選單兩步走：選欄位、勾值，chips 與 badge 反映生效條件，X 清除整欄", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole("button", { name: "篩選" }));
    // 表頭也有一顆「類別」排序鈕，範圍限定在篩選選單內避免撞名
    const menu = screen.getByText("依欄位篩選").parentElement!;
    await user.click(within(menu).getByRole("button", { name: "類別" }));
    await user.click(screen.getByRole("checkbox", { name: /甲/ }));
    await user.keyboard("{Escape}");

    expect(screen.getByText("類別：甲")).toBeInTheDocument();
    expect(screen.getByText("4 筆符合")).toBeInTheDocument();
    expect(document.querySelectorAll("tbody tr")).toHaveLength(4);

    await user.click(screen.getByRole("button", { name: "清除類別篩選" }));
    expect(screen.queryByText("類別：甲")).not.toBeInTheDocument();
    expect(document.querySelectorAll("tbody tr")).toHaveLength(10);
  });
});

describe("選取", () => {
  it("勾選列後標題顯示 (已選/總數)，本頁全選为半選→全選狀態", async () => {
    const user = userEvent.setup();
    renderTable();
    const rowChecks = screen.getAllByRole("checkbox", { name: "選取此列" });

    await user.click(rowChecks[0]);
    expect(screen.getByText("(1/12)")).toBeInTheDocument();
    // CSS 邏輯：半選時 base-ui 在 root 標 data-indeterminate（減號樣式的依據）
    expect(
      screen.getByRole("checkbox", { name: "選取本頁全部" }),
    ).toHaveAttribute("data-indeterminate");

    await user.click(screen.getByRole("checkbox", { name: "選取本頁全部" }));
    expect(screen.getByText("(10/12)")).toBeInTheDocument();
  });
});

describe("宣告式工具列動作", () => {
  function actionsFixture(
    onDelete = vi.fn(),
  ): [ConsoleTableAction[], typeof onDelete] {
    return [
      [
        {
          id: "delete",
          label: "刪除",
          icon: Trash2,
          intent: "destructive",
          needsSelection: true,
          onClick: onDelete,
        },
        { id: "create", label: "新增", icon: Plus, intent: "primary", href: "/create" },
        { id: "secret", label: "隱藏鈕", icon: Plus, hidden: true },
      ],
      onDelete,
    ];
  }

  it("needsSelection 未選取時停用，選取後 onClick 收到選取列", async () => {
    const user = userEvent.setup();
    const [actions, onDelete] = actionsFixture();
    renderTable({ actions });

    const deleteButton = screen.getByRole("button", { name: "刪除" });
    expect(deleteButton).toBeDisabled();

    await user.click(screen.getAllByRole("checkbox", { name: "選取此列" })[0]);
    expect(deleteButton).toBeEnabled();
    await user.click(deleteButton);
    // 受控模式下 onClick 收到的是選取列的 key（預設排序第一列 n01 = r2）
    expect(onDelete).toHaveBeenCalledWith(["r2"]);
  });

  it("CSS 邏輯：destructive 帶轉紅 class、primary 文字帶響應式隱藏 class、hidden 不渲染", () => {
    const [actions] = actionsFixture();
    renderTable({ actions });

    expect(screen.getByRole("button", { name: "刪除" }).className).toContain(
      "enabled:text-destructive",
    );
    const createLabel = within(
      screen.getByRole("link", { name: "新增" }),
    ).getByText("新增");
    expect(createLabel.className).toContain("hidden");
    expect(createLabel.className).toContain("sm:inline");
    expect(screen.queryByText("隱藏鈕")).not.toBeInTheDocument();
  });

  it("href 動作渲染為連結", () => {
    const [actions] = actionsFixture();
    renderTable({ actions });
    expect(screen.getByRole("link", { name: "新增" })).toHaveAttribute(
      "href",
      "/create",
    );
  });
});

describe("loading 狀態", () => {
  it("loading 時顯示 skeleton 而非空狀態，重新整理鈕停用", () => {
    const onRefresh = vi.fn();
    renderTable({ loading: true, onRefresh, data: [] });
    expect(
      document.querySelectorAll('[data-slot="skeleton-row"]'),
    ).toHaveLength(5);
    expect(screen.queryByText("沒有資料")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新整理" })).toBeDisabled();
  });

  it("重新整理鈕呼叫 onRefresh；未提供 onRefresh 時不渲染", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const { unmount } = renderTable({ onRefresh });
    await user.click(screen.getByRole("button", { name: "重新整理" }));
    expect(onRefresh).toHaveBeenCalledOnce();

    unmount();
    renderTable();
    expect(
      screen.queryByRole("button", { name: "重新整理" }),
    ).not.toBeInTheDocument();
  });
});

describe("跨頁全選", () => {
  it("本頁全勾後出現提示，可一鍵選取篩選後全部、再清除", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole("checkbox", { name: "選取本頁全部" }));
    expect(screen.getByText(/已選取本頁 10 筆/)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "選取全部 12 筆" }),
    );
    expect(screen.getByText("(12/12)")).toBeInTheDocument();
    expect(screen.getByText(/已選取全部 12 筆/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "清除選取" }));
    expect(screen.getByText("(12)")).toBeInTheDocument();
    expect(screen.queryByText(/已選取/)).not.toBeInTheDocument();
  });
});

describe("分組", () => {
  /**
   * 分組只在捲動模式可用，且只有一層。每批 30 筆讓 12 列一次全出來，
   * 斷言不會被分批揭露截斷。
   */
  function renderGrouped(props: TestTableProps = {}) {
    return renderTable({ pagination: "scroll", initialPageSize: 30, ...props });
  }

  /** 從分組選單選一個欄位。只有一層，選了就取代。 */
  async function groupBy(
    user: ReturnType<typeof userEvent.setup>,
    label: string,
  ) {
    await user.click(screen.getByRole("button", { name: "分組" }));
    const menu = document.querySelector(
      '[data-slot="popover-content"]',
    ) as HTMLElement;
    await user.click(within(menu).getByRole("button", { name: label }));
    await user.keyboard("{Escape}");
  }

  function groupHeaderTexts(): string[] {
    return [
      ...document.querySelectorAll('[data-slot="group-header"]'),
    ].map((el) => el.textContent ?? "");
  }

  it("分頁模式沒有分組控制項；捲動模式才有", () => {
    renderTable(); // 預設分頁模式
    expect(
      screen.queryByRole("button", { name: "分組" }),
    ).not.toBeInTheDocument();
    expect(groupHeaderTexts()).toHaveLength(0);

    cleanup();
    renderGrouped();
    expect(screen.getByRole("button", { name: "分組" })).toBeInTheDocument();
  });

  it("分組後同組連續，標題顯示值與筆數；選取整組的 checkbox 在該組欄名列", async () => {
    const user = userEvent.setup();
    renderGrouped();
    await groupBy(user, "類別");

    const headers = groupHeaderTexts();
    expect(headers).toHaveLength(3);
    expect(headers.some((t) => t.includes("甲") && t.includes("（4）"))).toBe(
      true,
    );
    // 標題只顯示值，不再是「欄名：值」
    expect(headers[0]).not.toContain("類別：");

    // 同組連續：逐列掃描，類別變化次數 = 組數 - 1
    const values = [...document.querySelectorAll("tr[data-row-key]")].map(
      (tr) => tr.querySelectorAll("td")[2].textContent,
    );
    const changes = values.filter((v, i) => i > 0 && v !== values[i - 1]);
    expect(changes).toHaveLength(2);

    // 標題列本身沒有 checkbox，也不是可選取的「列」
    const headerRow = document.querySelector(
      '[data-slot="group-header"]',
    ) as HTMLElement;
    expect(within(headerRow).queryByRole("checkbox")).toBeNull();
    expect(headerRow.getAttribute("data-row-key")).toBeNull();

    // 選整組的 checkbox 在該組的欄名列（那才是這一組的表頭）
    const columnsRow = document.querySelector(
      '[data-slot="group-columns"]',
    ) as HTMLElement;
    expect(
      within(columnsRow).getByRole("checkbox", { name: /^選取/ }),
    ).toBeInTheDocument();
  });

  it("每組底下重複一次欄名列，且不渲染頂端共用表頭", async () => {
    const user = userEvent.setup();
    renderGrouped();
    // 未分組時有共用表頭
    expect(document.querySelectorAll("thead")).toHaveLength(1);

    await groupBy(user, "類別");
    // 分組後共用表頭消失，改為每組一條欄名列
    expect(document.querySelectorAll("thead")).toHaveLength(0);
    expect(
      document.querySelectorAll('[data-slot="group-columns"]'),
    ).toHaveLength(3);
  });

  it("每一組的欄名列都有欄寬把手", async () => {
    const user = userEvent.setup();
    renderGrouped();
    await groupBy(user, "類別");
    // 三個可調整欄位 × 三組：捲到哪一組就在哪一組調
    expect(
      document.querySelectorAll('[role="separator"][aria-label$="欄寬"]'),
    ).toHaveLength(9);
  });

  it("分組時欄名列在 tbody，任一組的把手都拖得動", async () => {
    const user = userEvent.setup();
    renderGrouped();
    await groupBy(user, "類別");

    // 刻意拿第二組的把手：第一組以外的欄名列以前拖不動，只會反白選字
    const handle = screen.getAllByLabelText("調整名稱欄寬")[1];
    // jsdom 沒有版面，offsetWidth 一律 0，拖曳的位移就是最後的欄寬
    fireEvent.pointerDown(handle, { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 200 });

    // 拖過之後才切到 table-fixed + colgroup（勾選欄 + 三個資料欄）
    const cols = document.querySelectorAll("colgroup col");
    expect(cols).toHaveLength(4);
    expect((cols[1] as HTMLElement).style.width).toBe("200px");
  });

  it("收合一組只藏該組的列與欄名列，其他組不受影響", async () => {
    const user = userEvent.setup();
    renderGrouped();
    await groupBy(user, "類別");
    const before = document.querySelectorAll("tr[data-row-key]").length;

    const firstDisclosure = document.querySelector(
      '[data-group-disclosure="true"]',
    ) as HTMLElement;
    await user.click(firstDisclosure);

    expect(document.querySelectorAll("tr[data-row-key]").length).toBeLessThan(
      before,
    );
    // 標題還在，組數不變
    expect(groupHeaderTexts()).toHaveLength(3);
    // 該組的欄名列也收起來了
    expect(
      document.querySelectorAll('[data-slot="group-columns"]'),
    ).toHaveLength(2);
  });

  it("空字串分組值歸入（未設定）並排在最後", async () => {
    const user = userEvent.setup();
    renderGrouped({
      data: [
        { id: "e1", name: "n90", group: "", qty: 1 },
        { id: "e2", name: "n91", group: "甲", qty: 2 },
      ],
    });
    await groupBy(user, "類別");
    const headers = groupHeaderTexts();
    expect(headers).toHaveLength(2);
    expect(headers[headers.length - 1]).toContain("（未設定）");
  });

  it("選另一個欄位即取代分組，chip 只有一顆", async () => {
    const user = userEvent.setup();
    renderGrouped();
    await groupBy(user, "類別");
    expect(screen.getByText("分組：類別")).toBeInTheDocument();

    await groupBy(user, "名稱");
    expect(screen.queryByText("分組：類別")).not.toBeInTheDocument();
    expect(screen.getByText("分組：名稱")).toBeInTheDocument();
  });

  it("chip 的 X 清除分組", async () => {
    const user = userEvent.setup();
    renderGrouped();
    await groupBy(user, "類別");
    await user.click(screen.getByRole("button", { name: "清除分組" }));
    expect(groupHeaderTexts()).toHaveLength(0);
  });

  it("「清除篩選」不動分組；隱藏分組欄位不影響分組", async () => {
    const user = userEvent.setup();
    renderGrouped();
    await groupBy(user, "類別");
    await user.type(screen.getByPlaceholderText("以屬性或值篩選"), "甲");
    await user.click(screen.getByRole("button", { name: "清除篩選" }));
    expect(screen.getByText("分組：類別")).toBeInTheDocument();
  });

  it("有 onAddRowToGroup 時每組結尾有新增入口並回報該組的值", async () => {
    const user = userEvent.setup();
    const onAddRowToGroup = vi.fn();
    renderGrouped({ onAddRowToGroup });
    await groupBy(user, "類別");

    // 每組兩個入口：標題右側的「＋」與該組結尾那條新增列
    const inHeadings = document.querySelectorAll(
      '[data-slot="group-header"] [data-add-to-group="true"]',
    );
    const inFooters = document.querySelectorAll(
      '[data-slot="group-add-row"] [data-add-to-group="true"]',
    );
    expect(inHeadings).toHaveLength(3);
    expect(inFooters).toHaveLength(3);

    // 標題那顆 hover 才出現
    const actions = document
      .querySelector('[data-slot="group-header"] [data-group-actions="true"]')!
      .className;
    expect(actions).toContain("opacity-0");
    expect(actions).toContain("group-hover/group:opacity-100");

    // 兩個入口都回報同一組的值
    await user.click(inHeadings[0] as HTMLElement);
    await user.click(inFooters[0] as HTMLElement);
    expect(onAddRowToGroup).toHaveBeenCalledTimes(2);
    expect(onAddRowToGroup.mock.calls[0][0]).toBe(
      onAddRowToGroup.mock.calls[1][0],
    );
    expect(typeof onAddRowToGroup.mock.calls[0][0]).toBe("string");
  });

  it("收合狀態隨 storageKey 存進 localStorage 並還原", async () => {
    const user = userEvent.setup();
    renderGrouped({ storageKey: "g" });
    await groupBy(user, "類別");
    const before = document.querySelectorAll("tr[data-row-key]").length;
    await user.click(
      document.querySelector('[data-group-disclosure="true"]') as HTMLElement,
    );
    const collapsed = document.querySelectorAll("tr[data-row-key]").length;
    expect(collapsed).toBeLessThan(before);
    expect(
      JSON.parse(localStorage.getItem("console-table:g")!).collapsedGroups,
    ).toHaveLength(1);

    cleanup();
    renderGrouped({ storageKey: "g" });
    // 分組與收合狀態都在偏好裡，重新掛載後兩者一起還原——不必再分一次組
    // （groupBy 過去沒被存，那是與 sort 之間的不一致，已經修掉）
    expect(
      await screen.findByRole("button", { name: /^分組/ }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(document.querySelectorAll("[data-slot=group-header]").length)
        .toBeGreaterThan(0),
    );
    expect(document.querySelectorAll("tr[data-row-key]").length).toBe(
      collapsed,
    );
  });

  it("群組值與某列 rowKey 相同時，群組收合不影響子項目的揭露", async () => {
    const user = userEvent.setup();
    // 分組值「甲」與列的 rowKey（r1…r12）不會相同，這裡驗證兩者存在不同的
    // 存檔欄位——收合群組後，disclosure 那欄仍是空的
    renderGrouped({ storageKey: "g2" });
    await groupBy(user, "類別");
    await user.click(
      document.querySelector('[data-group-disclosure="true"]') as HTMLElement,
    );
    const saved = JSON.parse(localStorage.getItem("console-table:g2")!);
    expect(saved.collapsedGroups).toHaveLength(1);
    expect(saved.disclosure).toEqual({});
  });

  it("沒給 onAddRowToGroup 時不渲染新增入口", async () => {
    const user = userEvent.setup();
    renderGrouped();
    await groupBy(user, "類別");
    expect(
      document.querySelector('[data-add-to-group="true"]'),
    ).not.toBeInTheDocument();
    // `⋯` 選單本身仍在——它是表格自己的（內建「隱藏此群組」），
    // 不再是使用端才有的插槽
    expect(document.querySelector('[data-group-menu="true"]')).toBeInTheDocument();
  });

  it("renderGroupActions 的內容原樣渲染在群組標題", async () => {
    const user = userEvent.setup();
    renderGrouped({
      renderGroupActions: (groupValue: string | null) => (
        <button type="button">動作 {groupValue}</button>
      ),
    });
    await groupBy(user, "類別");
    // 逃生口的內容現在渲染在 `⋯` 選單裡，不再直接掛在標題上
    const menus = document.querySelectorAll('[data-group-menu="true"]');
    expect(menus).toHaveLength(3);
    await user.click(menus[0] as HTMLElement);
    const panel = document.querySelector(
      '[data-slot="popover-content"]',
    ) as HTMLElement;
    expect(within(panel).getByText(/^動作/)).toBeInTheDocument();
    // 內建項目仍在，逃生口沒有取代它
    expect(within(panel).getByText("隱藏此群組")).toBeInTheDocument();
  });

  it("分組選單只列出有 filterValue 的欄位，與可篩選的是同一組", async () => {
    const user = userEvent.setup();
    renderGrouped();
    await user.click(screen.getByRole("button", { name: "分組" }));
    const menu = document.querySelector(
      '[data-slot="popover-content"]',
    ) as HTMLElement;

    // 名稱、類別有 filterValue；數量只有 sortValue，分組沒有意義
    expect(within(menu).getByRole("button", { name: "名稱" })).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: "類別" })).toBeInTheDocument();
    expect(
      within(menu).queryByRole("button", { name: "數量" }),
    ).not.toBeInTheDocument();
  });

  it("依分組欄位排序時，群組本身的順序翻轉", async () => {
    const user = userEvent.setup();
    renderGrouped();
    await groupBy(user, "類別");
    const asc = groupHeaderTexts().map((t) => t.trim().charAt(0));

    await sortByMenu(user, "類別"); // 升冪
    const sortedAsc = groupHeaderTexts().map((t) => t.trim().charAt(0));
    await sortByMenu(user, "類別"); // 同一欄再選一次即降冪
    const desc = groupHeaderTexts().map((t) => t.trim().charAt(0));

    expect(desc).toEqual([...sortedAsc].reverse());
    // 分組本身就先照組值排過，升冪與預設一致
    expect(sortedAsc).toEqual(asc);
  });

  it("分組狀態在模式切換之間沒有被清掉", async () => {
    const user = userEvent.setup();
    const { rerender } = renderGrouped();
    await groupBy(user, "類別");
    expect(groupHeaderTexts()).toHaveLength(3);

    // 分頁模式不渲染分組
    rerender(<TestTable pagination="paged" initialPageSize={30} />);
    expect(groupHeaderTexts()).toHaveLength(0);

    // 切回來原樣重現——分組從來沒有被清掉，只是分頁模式不呈現它
    rerender(<TestTable pagination="scroll" initialPageSize={30} />);
    expect(groupHeaderTexts()).toHaveLength(3);
  });

  it("enableGrouping 關閉時分組控制項、chip 與群組標題全部不出現", async () => {
    const user = userEvent.setup();
    const { rerender } = renderGrouped();
    await groupBy(user, "類別");
    expect(groupHeaderTexts()).toHaveLength(3);

    rerender(
      <TestTable
        pagination="scroll"
        initialPageSize={30}
        enableGrouping={false}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "分組" }),
    ).not.toBeInTheDocument();
    expect(groupHeaderTexts()).toHaveLength(0);
    // 每一列都在，只是不分組——關掉的是呈現，不是資料
    expect(document.querySelectorAll("tbody tr[data-row-key]")).toHaveLength(
      ROWS.length,
    );
  });
});


describe("偏好設定", () => {
  it("草稿制：取消丟棄變更，確認才套用", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole("button", { name: "偏好設定" }));
    await user.click(screen.getByRole("radio", { name: "30 筆" }));
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.getByText("1 / 2")).toBeInTheDocument(); // 仍是 10/頁

    await user.click(screen.getByRole("button", { name: "偏好設定" }));
    await user.click(screen.getByRole("radio", { name: "30 筆" }));
    await user.click(screen.getByRole("button", { name: "確認" }));
    expect(screen.getByText("1 / 1")).toBeInTheDocument(); // 12 筆一頁裝完
  });

  it("關閉欄位後該欄不再渲染", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole("button", { name: "偏好設定" }));
    await user.click(screen.getByRole("checkbox", { name: "類別" }));
    await user.click(screen.getByRole("button", { name: "確認" }));
    expect(
      screen.queryByRole("columnheader", { name: /分組/ }),
    ).not.toBeInTheDocument();
  });
});

describe("欄位順序", () => {
  /** 目前表頭的欄名順序（不含勾選欄與操作欄）。 */
  function headerOrder(): string[] {
    return screen
      .getAllByRole("columnheader")
      .map((th) => th.textContent?.trim() ?? "")
      .filter(Boolean);
  }

  async function openPreferences(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "偏好設定" }));
  }

  it("上移／下移改變欄位順序，端點控制停用", async () => {
    const user = userEvent.setup();
    renderTable();
    expect(headerOrder()).toEqual(["名稱", "類別", "數量"]);

    await openPreferences(user);
    expect(screen.getByRole("button", { name: "名稱上移" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "數量下移" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "類別上移" }));
    await user.click(screen.getByRole("button", { name: "確認" }));
    expect(headerOrder()).toEqual(["類別", "名稱", "數量"]);

    // 重新開啟，清單反映新順序
    await openPreferences(user);
    expect(screen.getByRole("button", { name: "類別上移" })).toBeDisabled();
  });

  it("取消丟棄順序變更", async () => {
    const user = userEvent.setup();
    renderTable();
    await openPreferences(user);
    await user.click(screen.getByRole("button", { name: "數量上移" }));
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(headerOrder()).toEqual(["名稱", "類別", "數量"]);
  });

  it("隱藏後再顯示的欄位回到原本位置", async () => {
    const user = userEvent.setup();
    renderTable();

    await openPreferences(user);
    await user.click(screen.getByRole("checkbox", { name: "名稱" }));
    await user.click(screen.getByRole("button", { name: "確認" }));
    expect(headerOrder()).toEqual(["類別", "數量"]);

    await openPreferences(user);
    await user.click(screen.getByRole("checkbox", { name: "名稱" }));
    await user.click(screen.getByRole("button", { name: "確認" }));
    // 回到最左，而不是被擠到最後
    expect(headerOrder()).toEqual(["名稱", "類別", "數量"]);
  });

  it("存檔的順序在掛載後還原；未知欄位補在最後、已刪除的 id 忽略", async () => {
    localStorage.setItem(
      "console-table:t",
      JSON.stringify({
        version: 1,
        columnWidths: {},
        pageSize: 10,
        wrapLines: false,
        hiddenColumns: [],
        // qty 未列入（應補在最後）、gone 已不存在（應忽略）
        columnOrder: ["group", "gone", "name"],
      }),
    );
    renderTable({ storageKey: "t" });
    expect(await screen.findByRole("columnheader", { name: /類別/ })).toBeInTheDocument();
    expect(headerOrder()).toEqual(["類別", "名稱", "數量"]);
  });

  it("順序變更寫回 localStorage；壞存檔退回 columns 原順序", async () => {
    const user = userEvent.setup();
    renderTable({ storageKey: "t" });

    await openPreferences(user);
    await user.click(screen.getByRole("button", { name: "類別上移" }));
    await user.click(screen.getByRole("button", { name: "確認" }));
    expect(
      JSON.parse(localStorage.getItem("console-table:t")!).columnOrder,
    ).toEqual(["group", "name", "qty"]);

    cleanup();
    localStorage.setItem(
      "console-table:t",
      JSON.stringify({
        version: 1, columnOrder: "not-an-array", wrapLines: true }),
    );
    renderTable({ storageKey: "t" });
    expect(headerOrder()).toEqual(["名稱", "類別", "數量"]);
  });

  it("欄寬跟著欄位走，重排不影響排序／篩選與資料", async () => {
    const user = userEvent.setup();
    renderTable();

    // 先排序 + 篩選，記下資料狀態
    await sortByMenu(user, "名稱");
    await sortByMenu(user, "名稱"); // 降冪
    expect(firstRowName()).toBe("n12");

    await openPreferences(user);
    await user.click(screen.getByRole("button", { name: "數量上移" }));
    await user.click(screen.getByRole("button", { name: "確認" }));

    expect(headerOrder()).toEqual(["名稱", "數量", "類別"]);
    // 排序狀態與資料不受影響
    expect(columnHeader("名稱")).toHaveAttribute("aria-sort", "descending");
    expect(firstRowName()).toBe("n12");
  });
});

describe("捲動模式", () => {
  function ScrollTable({
    data = ROWS,
    initialPageSize = 10,
    ...props
  }: TestTableProps) {
    const [query, setQuery] = useState(() =>
      createDefaultTableQuery(initialPageSize),
    );
    const { hasMore, loadMore, ...result } = useProgressiveTableQuery(
      data,
      query,
      COLUMNS,
      rowKeyOf,
    );
    return (
      <ConsoleDataTable
        title="測試表格"
        columns={COLUMNS}
        rowKey={rowKeyOf}
        query={query}
        onQueryChange={setQuery}
        pagination="scroll"
        hasMore={hasMore}
        onLoadMore={loadMore}
        {...result}
        {...props}
      />
    );
  }

  /** 只數真正的資料列——群組的標題／欄名／載入／新增列都不算。 */
  function dataRowCount() {
    return document.querySelectorAll("tbody tr[data-row-key]").length;
  }

  it("前導欄放得下握把與三角形時，colgroup 給的是同一個寬度", () => {
    // 前導欄的寬度看裡面有幾格：勾選框 40、加拖曳握把 64、再加揭露三角形
    // 80。colgroup 若照舊寫死 40px，拖過欄寬切成 table-fixed 之後這一欄
    // 就被壓回一半，握把、勾選框與第一欄的內容全擠在一起。
    function resizeFirstColumn() {
      const handle = screen.getByLabelText("調整名稱欄寬");
      fireEvent.pointerDown(handle, { clientX: 0, pointerId: 1 });
      fireEvent.pointerMove(handle, { clientX: 200 });
      return document.querySelector("colgroup col") as HTMLElement;
    }

    render(<ScrollTable onRowReorder={() => {}} />);
    expect(resizeFirstColumn().style.width).toBe("64px");

    cleanup();
    render(<ScrollTable onRowReorder={() => {}} subRowOf={() => null} />);
    expect(resizeFirstColumn().style.width).toBe("80px");
  });

  it("本來就比 80px 窄的欄位，拖曳跟得上指標而不是黏在地板上", () => {
    render(<ScrollTable />);

    const handle = screen.getByLabelText("調整名稱欄寬");
    const cell = handle.closest("th")!;
    // jsdom 沒有版面。假裝這一欄目前是 45px——auto layout 之下「樓層」
    // 「已複驗」這種短欄本來就比 MIN_COLUMN_WIDTH 還窄
    Object.defineProperty(cell, "offsetWidth", {
      value: 45,
      configurable: true,
    });

    fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 });
    // 往左 20px：要變成 25px，而不是被 80px 的地板反過來撐寬
    fireEvent.pointerMove(handle, { clientX: 80 });
    expect(
      (document.querySelectorAll("colgroup col")[1] as HTMLElement).style.width,
    ).toBe("25px");

    // 一路往左也不會消失，停在短欄的地板
    fireEvent.pointerMove(handle, { clientX: 0 });
    expect(
      (document.querySelectorAll("colgroup col")[1] as HTMLElement).style.width,
    ).toBe("24px");
  });

  it("原本就夠寬的欄位，地板仍是 80px", () => {
    render(<ScrollTable />);

    const handle = screen.getByLabelText("調整名稱欄寬");
    const cell = handle.closest("th")!;
    Object.defineProperty(cell, "offsetWidth", {
      value: 200,
      configurable: true,
    });

    fireEvent.pointerDown(handle, { clientX: 300, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 0 });
    expect(
      (document.querySelectorAll("colgroup col")[1] as HTMLElement).style.width,
    ).toBe("80px");
  });

  it("onOpenRow：第一個可見欄位每列一顆開啟，點了只回報那一列", async () => {
    const user = userEvent.setup();
    const onOpenRow = vi.fn();
    render(<ScrollTable onOpenRow={onOpenRow} />);

    // 每一列一顆，而且只在第一欄
    const buttons = [
      ...document.querySelectorAll("[data-open-row='true']"),
    ] as HTMLElement[];
    expect(buttons).toHaveLength(dataRowCount());
    for (const button of buttons) {
      expect(button.closest("td")).toBe(
        button.closest("tr")!.querySelectorAll("td")[1],
      );
    }

    await user.click(buttons[1]);
    expect(onOpenRow).toHaveBeenCalledTimes(1);
    expect(onOpenRow.mock.calls[0][0]).toMatchObject({
      id: document
        .querySelectorAll("tr[data-row-key]")[1]
        .getAttribute("data-row-key"),
    });
  });

  it("開啟鈕不會順手開編輯器，也不會把儲存格選起來", async () => {
    const user = userEvent.setup();
    render(<ScrollTable onOpenRow={() => {}} />);

    await user.click(
      document.querySelector("[data-open-row='true']") as HTMLElement,
    );
    expect(
      screen.queryByRole("textbox", { name: "編輯值" }),
    ).not.toBeInTheDocument();
    expect(document.querySelector("[data-cell-active]")).not.toBeInTheDocument();
  });

  it("沒給 onOpenRow 就沒有開啟鈕；分頁模式也沒有", () => {
    render(<ScrollTable />);
    expect(document.querySelector("[data-open-row='true']")).toBeNull();

    cleanup();
    renderTable({ onOpenRow: () => {} }); // 預設分頁模式
    expect(document.querySelector("[data-open-row='true']")).toBeNull();
  });

  it("不渲染分頁器，改為列表末端的載入更多", () => {
    render(<ScrollTable />);
    for (const label of ["第一頁", "上一頁", "下一頁", "最後一頁"]) {
      expect(
        screen.queryByRole("button", { name: label }),
      ).not.toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "載入更多" })).toBeInTheDocument();
  });

  it("載入更多逐批追加，載完後觸發區消失", async () => {
    const user = userEvent.setup();
    render(<ScrollTable />);
    expect(dataRowCount()).toBe(10);

    await user.click(screen.getByRole("button", { name: "載入更多" }));
    expect(dataRowCount()).toBe(12); // 只剩 2 筆

    expect(
      screen.queryByRole("button", { name: "載入更多" }),
    ).not.toBeInTheDocument();
  });

  it("表頭 checkbox 即全選，沒有跨頁提示列", async () => {
    const user = userEvent.setup();
    render(<ScrollTable />);
    await user.click(screen.getByRole("checkbox", { name: "選取本頁全部" }));
    expect(screen.getByText("(10/12)")).toBeInTheDocument();
    expect(screen.queryByText(/選取全部/)).not.toBeInTheDocument();
    expect(screen.queryByText(/已選取本頁/)).not.toBeInTheDocument();
  });

  it("分組時載入更多在每組結尾，且只延伸該組", async () => {
    const user = userEvent.setup();
    // 每批 2 筆、每組 4 筆 → 三組都還有未揭露的列
    render(<ScrollTable initialPageSize={2} />);
    await user.click(screen.getByRole("button", { name: "分組" }));
    const menu = document.querySelector(
      '[data-slot="popover-content"]',
    ) as HTMLElement;
    await user.click(within(menu).getByRole("button", { name: "類別" }));
    await user.keyboard("{Escape}");

    // 每組各一個觸發點，列表末端沒有全域的那顆
    const triggers = screen.getAllByRole("button", { name: "載入更多" });
    expect(triggers).toHaveLength(3);
    expect(
      document.querySelectorAll('[data-slot="group-load-more"]'),
    ).toHaveLength(3);
    expect(dataRowCount()).toBe(6); // 3 組 × 2

    // 只延伸第一組：總列數 +2，其餘組不動
    await user.click(triggers[0]);
    expect(dataRowCount()).toBe(8);
    // 第一組滿了，剩兩組還有
    expect(screen.getAllByRole("button", { name: "載入更多" })).toHaveLength(2);
  });

  it("偏好設定的筆數改述為每批載入", async () => {
    const user = userEvent.setup();
    render(<ScrollTable />);
    await user.click(screen.getByRole("button", { name: "偏好設定" }));
    expect(screen.getByText("每批載入筆數")).toBeInTheDocument();
    expect(screen.queryByText("每頁筆數")).not.toBeInTheDocument();
  });

  it("query 變動時揭露視窗重置回第一批", async () => {
    const user = userEvent.setup();
    render(<ScrollTable />);
    await user.click(screen.getByRole("button", { name: "載入更多" }));
    expect(dataRowCount()).toBe(12);

    await user.type(screen.getByPlaceholderText("以屬性或值篩選"), "n");
    expect(dataRowCount()).toBe(10); // 12 筆全符合，但回到第一批
  });
});

describe("localStorage 持久化", () => {
  beforeEach(() => localStorage.clear());

  it("提供 storageKey 時掛載後還原存檔的偏好", async () => {
    localStorage.setItem(
      "console-table:t",
      JSON.stringify({
        version: 1,
        columnWidths: {},
        pageSize: 30,
        wrapLines: false,
        hiddenColumns: ["qty"],
      }),
    );
    renderTable({ storageKey: "t" });

    expect(await screen.findByText("1 / 1")).toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: /數量/ }),
    ).not.toBeInTheDocument();
  });

  it("變更偏好後寫回 localStorage；存檔壞掉時退回預設", async () => {
    const user = userEvent.setup();
    renderTable({ storageKey: "t" });

    await user.click(screen.getByRole("button", { name: "偏好設定" }));
    await user.click(screen.getByRole("radio", { name: "50 筆" }));
    await user.click(screen.getByRole("button", { name: "確認" }));
    expect(
      JSON.parse(localStorage.getItem("console-table:t")!).pageSize,
    ).toBe(50);

    cleanup();
    localStorage.setItem("console-table:t", "not-json{");
    renderTable({ storageKey: "t" });
    expect(screen.getByText("1 / 2")).toBeInTheDocument(); // 預設 10/頁
  });
});

/* ------------------------------------------------------------------ */
/* 儲存格編輯                                                          */
/* ------------------------------------------------------------------ */

/** 六欄涵蓋五種型別與三種顏色寫法的編輯測試資料。 */
type EditRow = {
  id: string;
  name: string;
  qty: number | string | null;
  status: string;
  done: boolean;
  at: string;
  year: number;
};

const EDIT_ROWS: EditRow[] = [
  {
    id: "e1",
    name: "甲案",
    qty: 1234,
    status: "待修繕",
    done: false,
    at: "2026-07-01",
    year: 2026,
  },
  {
    id: "e2",
    name: "乙案",
    qty: null,
    status: "已結案",
    done: true,
    at: "民國 115 年",
    year: 2025,
  },
];

const STATUS_OPTIONS = [
  { value: "待修繕", color: "destructive" },
  { value: "已修繕", color: "secondary" },
  { value: "複驗通過", color: "#16a34a" },
];

function editColumns(
  overrides: Partial<Record<string, unknown>> = {},
): ConsoleTableColumn<EditRow>[] {
  return [
    // 刻意不給 sortValue：沒有可排序欄時 adapter 維持輸入順序，
    // 斷言才不會被 zh-Hant 的預設排序（筆畫序）打亂
    {
      id: "name",
      header: "名稱",
      editable: { type: "text", getValue: (r) => r.name, ...overrides },
    },
    {
      id: "qty",
      header: "數量",
      editable: {
        type: "number",
        getValue: (r) => r.qty as number | null,
      },
    },
    {
      id: "year",
      header: "年份",
      editable: {
        type: "number",
        getValue: (r) => r.year,
        grouping: false,
      },
    },
    {
      id: "status",
      header: "狀態",
      editable: {
        type: "select",
        getValue: (r) => r.status,
        options: STATUS_OPTIONS,
      },
    },
    {
      id: "done",
      header: "完成",
      editable: { type: "boolean", getValue: (r) => r.done },
    },
    {
      id: "at",
      header: "日期",
      editable: { type: "date", getValue: (r) => r.at },
    },
  ] as ConsoleTableColumn<EditRow>[];
}

function EditTable(
  props: Partial<React.ComponentProps<typeof ConsoleDataTable<EditRow>>> & {
    columns?: ConsoleTableColumn<EditRow>[];
    data?: EditRow[];
  } = {},
) {
  const { columns = editColumns(), data = EDIT_ROWS, ...rest } = props;
  const [query, setQuery] = useState(() => createDefaultTableQuery(10));
  const result = useClientTableQuery(data, query, columns, (r) => r.id);
  return (
    <ConsoleDataTable
      title="編輯測試"
      columns={columns}
      rowKey={(r) => r.id}
      query={query}
      onQueryChange={setQuery}
      {...result}
      {...rest}
    />
  );
}

function renderEditTable(
  props: Parameters<typeof EditTable>[0] = {},
) {
  return render(<EditTable {...props} />);
}

/** 指定列（0-based）指定欄的儲存格。 */
function editCell(rowIndex: number, columnIndex: number): HTMLElement {
  const rows = [...document.querySelectorAll("tbody tr")];
  // +1 跳過勾選欄
  return rows[rowIndex].querySelectorAll("td")[columnIndex + 1] as HTMLElement;
}

/**
 * 選取一格但不留下開著的編輯器。可編輯欄單擊即開編輯器（Notion 手勢），
 * 而範圍與鍵盤操作要的是「選了一格、沒有在編輯」——一次 Esc 關掉編輯器，
 * 作用中儲存格留著。
 */
async function focusCell(
  user: ReturnType<typeof userEvent.setup>,
  rowIndex: number,
  columnIndex: number,
) {
  await user.click(editCell(rowIndex, columnIndex));
  if (document.querySelector('[data-slot="popover-content"]')) {
    await user.keyboard("{Escape}");
  }
}

describe("儲存格顯示", () => {
  it("依型別提供預設顯示：數字千分位並靠右、日期固定格式、boolean 為 ✓／—", () => {
    renderEditTable();
    expect(editCell(0, 1)).toHaveTextContent("1,234");
    expect(editCell(0, 1).className).toContain("text-right");
    expect(editCell(0, 5)).toHaveTextContent("2026/07/01");
    // 純文字，不是任何控制項元件；語意仍是可切換的開關
    const off = within(editCell(0, 4)).getByRole("switch");
    expect(off.tagName).toBe("BUTTON");
    expect(off).toHaveTextContent("—"); // 第一列 done: false
    expect(within(editCell(1, 4)).getByRole("switch")).toHaveTextContent("✓");
  });

  it("grouping: false 的數字欄不顯示千分位", () => {
    renderEditTable();
    expect(editCell(0, 2)).toHaveTextContent("2026");
    expect(editCell(0, 2)).not.toHaveTextContent("2,026");
  });

  it("同時給 cell 與 type 時顯示走 cell", () => {
    const columns = editColumns();
    (columns[0] as { cell?: (r: EditRow) => React.ReactNode }).cell = (r) =>
      `自訂:${r.name}`;
    renderEditTable({ columns });
    expect(editCell(0, 0)).toHaveTextContent("自訂:甲案");
  });

  it("空值顯示 — 而不是留白", () => {
    renderEditTable();
    expect(editCell(1, 1)).toHaveTextContent("—");
  });

  it("未知值原樣顯示並標示，不空白也不代換", () => {
    renderEditTable();
    // 日期欄位的值不是有效日期
    const cell = editCell(1, 5);
    expect(cell).toHaveTextContent("民國 115 年");
    expect(
      cell.querySelector("[data-unrecognised='true']"),
    ).toBeInTheDocument();

    // select 值不在選項清單中
    const statusCell = editCell(1, 3);
    expect(statusCell).toHaveTextContent("已結案");
    expect(
      statusCell.querySelector("[data-unrecognised='true']"),
    ).toBeInTheDocument();
  });

  it("select 三種顏色寫法：變體、色碼、無色", () => {
    renderEditTable();
    // destructive 變體
    const badge = editCell(0, 3).querySelector("[data-slot='badge']")!;
    expect(badge.getAttribute("data-variant")).toBe("destructive");

    // 色碼走 CSS 變數
    const coded = render(
      <EditTable
        columns={editColumns().map((c) =>
          c.id === "status"
            ? ({
                ...c,
                editable: {
                  type: "select",
                  getValue: (r: EditRow) => r.status,
                  options: [{ value: "待修繕", color: "#16a34a" }],
                },
              } as ConsoleTableColumn<EditRow>)
            : c,
        )}
      />,
    );
    const tinted = coded.container.querySelector(
      "[data-slot='badge'][style*='--tag-color']",
    );
    expect(tinted).toBeInTheDocument();
  });

  it("colored: true 依選項順序自動配色，同一選項在重繪間穩定", () => {
    const columns = editColumns().map((c) =>
      c.id === "status"
        ? ({
            ...c,
            editable: {
              type: "select",
              getValue: (r: EditRow) => r.status,
              options: [{ value: "待修繕" }, { value: "已結案" }],
              colored: true,
            },
          } as ConsoleTableColumn<EditRow>)
        : c,
    );
    const { container } = render(<EditTable columns={columns} />);
    const badges = [
      ...container.querySelectorAll("[data-slot='badge'][style*='--tag-color']"),
    ];
    expect(badges.length).toBe(2);
    const first = badges[0].getAttribute("style");
    const second = badges[1].getAttribute("style");
    expect(first).not.toBe(second);
  });

  it("boolean 的空值就是未開啟：畫 — 但仍是可按的開關，不是唯讀的空值", async () => {
    const user = userEvent.setup();
    const onCellCommit = vi.fn();
    const columns = editColumns().map((c) =>
      c.id === "done"
        ? ({
            ...c,
            editable: {
              type: "boolean",
              getValue: () => null,
            },
          } as ConsoleTableColumn<EditRow>)
        : c,
    );
    renderEditTable({ columns, onCellCommit });

    const cell = editCell(0, 4);
    const toggle = within(cell).getByRole("switch");
    // 破折號是 boolean 的「未開啟」，不是走空值那條路——空值不會是按鈕
    expect(toggle).toHaveTextContent("—");
    expect(toggle).toHaveAttribute("aria-checked", "false");

    await user.click(toggle);
    expect(onCellCommit).toHaveBeenCalledWith(expect.anything(), "done", true);
  });

  it("內建型別的儲存格帶 title 讓截斷內容可停留檢視", () => {
    renderEditTable();
    expect(editCell(0, 1)).toHaveAttribute("title", "1,234");
    expect(editCell(0, 5)).toHaveAttribute("title", "2026/07/01");
  });
});

describe("儲存格編輯", () => {
  /** 開啟指定格的編輯器。 */
  async function openEditor(
    user: ReturnType<typeof userEvent.setup>,
    rowIndex: number,
    columnIndex: number,
  ) {
    await user.click(editCell(rowIndex, columnIndex));
  }

  it("點擊進入編輯，編輯器以未格式化的原始值填入", async () => {
    const user = userEvent.setup();
    renderEditTable();
    await openEditor(user, 0, 1); // 顯示 1,234 的數字欄
    expect(screen.getByRole("textbox", { name: "編輯值" })).toHaveValue("1234");
  });

  it("Enter 送出，回報列、欄與值，且不 mutate rows", async () => {
    const user = userEvent.setup();
    const onCellCommit = vi.fn();
    const snapshot = structuredClone(EDIT_ROWS);
    renderEditTable({ onCellCommit });

    await openEditor(user, 0, 0);
    const input = screen.getByRole("textbox", { name: "編輯值" });
    await user.clear(input);
    await user.type(input, "丙案{Enter}");

    expect(onCellCommit).toHaveBeenCalledWith(
      expect.objectContaining({ id: "e1" }),
      "name",
      "丙案",
    );
    expect(EDIT_ROWS).toEqual(snapshot);
    // 表格不做樂觀更新：使用端沒餵新資料前畫面仍是舊值
    expect(editCell(0, 0)).toHaveTextContent("甲案");
  });

  it("Esc 取消，值不變且不回報", async () => {
    const user = userEvent.setup();
    const onCellCommit = vi.fn();
    renderEditTable({ onCellCommit });

    await openEditor(user, 0, 0);
    const input = screen.getByRole("textbox", { name: "編輯值" });
    await user.clear(input);
    await user.type(input, "改掉{Escape}");

    expect(onCellCommit).not.toHaveBeenCalled();
    expect(editCell(0, 0)).toHaveTextContent("甲案");
  });

  it("同時間至多一個編輯器", async () => {
    const user = userEvent.setup();
    renderEditTable();
    await openEditor(user, 0, 0);
    expect(screen.getAllByRole("textbox", { name: "編輯值" })).toHaveLength(1);
    await openEditor(user, 1, 0);
    expect(screen.getAllByRole("textbox", { name: "編輯值" })).toHaveLength(1);
  });

  it("number 貼上帶千分位的值會清掉分隔符再回報", async () => {
    const user = userEvent.setup();
    const onCellCommit = vi.fn();
    renderEditTable({ onCellCommit });

    await openEditor(user, 0, 1);
    const input = screen.getByRole("textbox", { name: "編輯值" });
    await user.clear(input);
    await user.type(input, "9,876{Enter}");

    expect(onCellCommit).toHaveBeenCalledWith(expect.anything(), "qty", 9876);
  });

  it("date 回報 YYYY-MM-DD 字串而非 Date 物件", async () => {
    const user = userEvent.setup();
    const onCellCommit = vi.fn();
    renderEditTable({ onCellCommit });

    await openEditor(user, 0, 5);
    const input = document.querySelector("input[type='date']") as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "2026-08-15{Enter}");

    const [, , value] = onCellCommit.mock.calls[0];
    expect(value).toBe("2026-08-15");
    expect(value).not.toBeInstanceOf(Date);
  });

  it("超出 max 的日期拒絕送出並留在編輯態", async () => {
    const user = userEvent.setup();
    const onCellCommit = vi.fn();
    const columns = editColumns().map((c) =>
      c.id === "at"
        ? ({
            ...c,
            editable: {
              type: "date",
              getValue: (r: EditRow) => r.at,
              max: "2026-07-31",
            },
          } as ConsoleTableColumn<EditRow>)
        : c,
    );
    renderEditTable({ columns, onCellCommit });

    await openEditor(user, 0, 5);
    const input = document.querySelector("input[type='date']") as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "2026-12-01{Enter}");

    expect(onCellCommit).not.toHaveBeenCalled();
    expect(document.querySelector("input[type='date']")).toBeInTheDocument();
  });

  it("boolean 單擊即回報，不進入編輯態", async () => {
    const user = userEvent.setup();
    const onCellCommit = vi.fn();
    renderEditTable({ onCellCommit });

    await user.click(within(editCell(0, 4)).getByRole("switch"));
    expect(onCellCommit).toHaveBeenCalledWith(
      expect.objectContaining({ id: "e1" }),
      "done",
      true,
    );
    expect(
      screen.queryByRole("textbox", { name: "編輯值" }),
    ).not.toBeInTheDocument();
  });

  it("儲存中的格子降透明度且點不開編輯器", async () => {
    const user = userEvent.setup();
    renderEditTable({ savingCells: ["e1::name"] });
    const cell = editCell(0, 0);
    expect(cell).toHaveAttribute("data-cell-saving", "true");
    expect(cell.className).toContain("opacity-50");
    expect(within(cell).queryByRole("button")).not.toBeInTheDocument();

    await user.click(cell);
    expect(
      screen.queryByRole("textbox", { name: "編輯值" }),
    ).not.toBeInTheDocument();
  });

  it("失敗的格子保留使用者輸入的值而不是回滾", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [errors, setErrors] = useState<Record<string, string>>({});
      return (
        <EditTable
          cellErrors={errors}
          onCellCommit={() => setErrors({ "e1::name": "儲存失敗" })}
        />
      );
    }
    render(<Harness />);

    await user.dblClick(editCell(0, 0));
    const input = screen.getByRole("textbox", { name: "編輯值" });
    await user.clear(input);
    await user.type(input, "沒存成功{Enter}");

    const cell = editCell(0, 0);
    expect(cell).toHaveAttribute("data-cell-error", "true");
    expect(cell).toHaveTextContent("沒存成功");
    expect(cell).not.toHaveTextContent("甲案");
  });

  it("失敗的 select 仍是標籤，不會掉成純文字", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [errors, setErrors] = useState<Record<string, string>>({});
      return (
        <EditTable
          cellErrors={errors}
          onCellCommit={() => setErrors({ "e1::status": "儲存失敗" })}
        />
      );
    }
    render(<Harness />);

    await user.click(editCell(0, 3)); // 狀態欄，原值「待修繕」（destructive）
    const popover = document.querySelector(
      '[data-slot="popover-content"]',
    ) as HTMLElement;
    await user.click(within(popover).getByRole("button", { name: /複驗通過/ }));

    const cell = editCell(0, 3);
    expect(cell).toHaveAttribute("data-cell-error", "true");
    // 顯示的是剛才選的值，而且仍照該選項的顏色畫成標籤
    const badge = cell.querySelector("[data-slot='badge']")!;
    expect(badge).toHaveTextContent("複驗通過");
    expect(badge.getAttribute("style")).toContain("--tag-color");
  });

  it("失敗的數字仍套千分位", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [errors, setErrors] = useState<Record<string, string>>({});
      return (
        <EditTable
          cellErrors={errors}
          onCellCommit={() => setErrors({ "e1::qty": "儲存失敗" })}
        />
      );
    }
    render(<Harness />);

    await user.click(editCell(0, 1));
    const input = screen.getByRole("textbox", { name: "編輯值" });
    await user.clear(input);
    await user.type(input, "98765{Enter}");

    expect(editCell(0, 1)).toHaveTextContent("98,765");
  });

  it("disabled 以列為單位控制可編輯性", async () => {
    const columns = editColumns().map((c) =>
      c.id === "name"
        ? ({
            ...c,
            editable: {
              type: "text",
              getValue: (r: EditRow) => r.name,
              disabled: (r: EditRow) => r.id === "e1",
            },
          } as ConsoleTableColumn<EditRow>)
        : c,
    );
    renderEditTable({ columns });
    expect(
      editCell(0, 0).querySelector("[data-editable-cell]"),
    ).not.toBeInTheDocument();
    expect(
      editCell(1, 0).querySelector("[data-editable-cell]"),
    ).toBeInTheDocument();
  });

  it("自訂編輯器仍由表格管生命週期", async () => {
    const user = userEvent.setup();
    const onCellCommit = vi.fn();
    const columns = editColumns().map((c) =>
      c.id === "name"
        ? ({
            ...c,
            editable: {
              type: "text",
              getValue: (r: EditRow) => r.name,
              renderEditor: ({
                value,
                onChange,
                onCommit,
              }: {
                value: string;
                onChange: (v: string) => void;
                onCommit: (v?: string) => void;
              }) => (
                <div>
                  <input
                    aria-label="自訂輸入"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                  />
                  <button type="button" onClick={() => onCommit()}>
                    自訂送出
                  </button>
                </div>
              ),
            },
          } as ConsoleTableColumn<EditRow>)
        : c,
    );
    renderEditTable({ columns, onCellCommit });

    await user.dblClick(editCell(0, 0));
    const custom = screen.getByRole("textbox", { name: "自訂輸入" });
    await user.clear(custom);
    await user.type(custom, "自訂值");
    await user.click(screen.getByRole("button", { name: "自訂送出" }));

    expect(onCellCommit).toHaveBeenCalledWith(
      expect.anything(),
      "name",
      "自訂值",
    );
  });
});

describe("編輯與既有功能的互動", () => {
  it("換頁關閉編輯器並丟棄草稿，不回報", async () => {
    const user = userEvent.setup();
    const onCellCommit = vi.fn();
    const many: EditRow[] = Array.from({ length: 12 }, (_, i) => ({
      id: `m${i}`,
      name: `案${i}`,
      qty: i,
      status: "待修繕",
      done: false,
      at: "2026-07-01",
      year: 2026,
    }));
    renderEditTable({ data: many, onCellCommit });

    await user.dblClick(editCell(0, 0));
    const input = screen.getByRole("textbox", { name: "編輯值" });
    await user.clear(input);
    await user.type(input, "草稿");

    await user.click(screen.getByRole("button", { name: "下一頁" }));
    expect(onCellCommit).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("textbox", { name: "編輯值" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "上一頁" }));
    expect(editCell(0, 0)).toHaveTextContent("案0");
  });

  it("編輯不影響列選取，選取中的列一樣可編輯", async () => {
    const user = userEvent.setup();
    const onCellCommit = vi.fn();
    renderEditTable({ onCellCommit });

    const checkboxes = screen.getAllByRole("checkbox", { name: "選取此列" });
    await user.click(checkboxes[0]);
    expect(screen.getByText("(1/2)")).toBeInTheDocument();

    await user.dblClick(editCell(0, 0));
    const input = screen.getByRole("textbox", { name: "編輯值" });
    await user.clear(input);
    await user.type(input, "改過{Enter}");

    // 已選取的列編輯後仍選取，未選取的列編輯後仍未選取
    expect(screen.getByText("(1/2)")).toBeInTheDocument();
    expect(onCellCommit).toHaveBeenCalled();

    await user.dblClick(editCell(1, 0));
    await user.keyboard("{Escape}");
    expect(screen.getByText("(1/2)")).toBeInTheDocument();
  });

  it("編輯排序中的欄位後，餵回新資料時該列依排序規則重排", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [data, setData] = useState<EditRow[]>([
        { id: "s1", name: "AAA", qty: 1, status: "待修繕", done: false, at: "2026-07-01", year: 2026 },
        { id: "s2", name: "BBB", qty: 2, status: "待修繕", done: false, at: "2026-07-02", year: 2026 },
      ]);
      const columns = [
        {
          id: "name",
          header: "名稱",
          sortValue: (r: EditRow) => r.name,
          editable: { type: "text", getValue: (r: EditRow) => r.name },
        },
      ] as ConsoleTableColumn<EditRow>[];
      return (
        <EditTable
          data={data}
          columns={columns}
          onCellCommit={(row, _columnId, value) =>
            setData((prev) =>
              prev.map((r) =>
                r.id === (row as EditRow).id
                  ? { ...r, name: value as string }
                  : r,
              ),
            )
          }
        />
      );
    }
    render(<Harness />);

    // 預設以 name 升冪：AAA 在前
    expect(editCell(0, 0)).toHaveTextContent("AAA");

    await user.dblClick(editCell(0, 0));
    const input = screen.getByRole("textbox", { name: "編輯值" });
    await user.clear(input);
    await user.type(input, "ZZZ{Enter}");

    // 餵回新資料後該列依排序移到最後
    expect(editCell(0, 0)).toHaveTextContent("BBB");
    expect(editCell(1, 0)).toHaveTextContent("ZZZ");
  });
});

describe("儲存格選取與複製", () => {
  /** 觸發一次 copy 並回傳寫進剪貼簿的兩種格式。 */
  function fireCopy(): { plain: string; html: string } {
    const written: Record<string, string> = {};
    const event = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        setData: (type: string, value: string) => {
          written[type] = value;
        },
      },
    });
    editCell(0, 0).dispatchEvent(event);
    return { plain: written["text/plain"] ?? "", html: written["text/html"] ?? "" };
  }

  it("點一格成為作用中儲存格，範圍就是那一格", async () => {
    const user = userEvent.setup();
    renderEditTable();

    await focusCell(user, 0, 1);
    expect(editCell(0, 1)).toHaveAttribute("data-cell-active", "true");
    expect(editCell(0, 1)).toHaveAttribute("data-cell-selected", "true");
    expect(editCell(0, 0)).not.toHaveAttribute("data-cell-selected");
  });

  it("方向鍵移動作用中儲存格並收合範圍", async () => {
    const user = userEvent.setup();
    renderEditTable();

    await focusCell(user, 0, 0);
    await user.keyboard("{ArrowRight}{ArrowDown}");
    expect(editCell(1, 1)).toHaveAttribute("data-cell-active", "true");
    expect(editCell(0, 0)).not.toHaveAttribute("data-cell-selected");
  });

  it("移動到頭到尾就停住，不繞回另一端", async () => {
    const user = userEvent.setup();
    renderEditTable();

    await focusCell(user, 0, 0);
    await user.keyboard("{ArrowLeft}{ArrowUp}");
    expect(editCell(0, 0)).toHaveAttribute("data-cell-active", "true");
  });

  it("Shift+方向鍵從 anchor 擴選，anchor 不動", async () => {
    const user = userEvent.setup();
    renderEditTable();

    await focusCell(user, 0, 0);
    await user.keyboard("{Shift>}{ArrowRight}{ArrowDown}{/Shift}");
    // 兩列兩欄的矩形全部在範圍內，作用中仍是最後移到的那一格
    for (const [r, c] of [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ]) {
      expect(editCell(r, c)).toHaveAttribute("data-cell-selected", "true");
    }
    expect(editCell(1, 1)).toHaveAttribute("data-cell-active", "true");
    expect(editCell(0, 2)).not.toHaveAttribute("data-cell-selected");
  });

  it("多格範圍複製成 TSV，欄以 tab、列以換行分隔", async () => {
    const user = userEvent.setup();
    renderEditTable();

    await focusCell(user, 0, 0);
    await user.keyboard("{Shift>}{ArrowRight}{ArrowDown}{/Shift}");
    const { plain, html } = fireCopy();

    const lines = plain.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0].split("\t")).toEqual(["甲案", "1,234"]);
    // 空值複製空字串，該欄仍然佔一個欄位
    expect(lines[1].split("\t")).toEqual(["乙案", ""]);
    expect(html).toBe(
      "<table><tr><td>甲案</td><td>1,234</td></tr><tr><td>乙案</td><td></td></tr></table>",
    );
  });

  it("單格複製就是那一格的值，不加分隔符", async () => {
    const user = userEvent.setup();
    renderEditTable();

    await focusCell(user, 0, 1);
    const { plain } = fireCopy();
    expect(plain).toBe("1,234");
  });

  it("值裡的 tab 與換行換成空白，避免欄位錯位", async () => {
    const user = userEvent.setup();
    renderEditTable({
      data: [{ ...EDIT_ROWS[0], name: "甲\t案\n下一行" }],
    });

    await focusCell(user, 0, 0);
    await user.keyboard("{Shift>}{ArrowRight}{/Shift}");
    const { plain } = fireCopy();
    expect(plain.split("\n")).toHaveLength(1);
    expect(plain.split("\t")).toEqual(["甲 案 下一行", "1,234"]);
  });

  it("boolean 欄複製「是」／「否」而不是空白", async () => {
    const user = userEvent.setup();
    renderEditTable();

    await focusCell(user, 0, 4);
    expect(fireCopy().plain).toBe("否");
  });

  it("沒有選取時不攔截 copy，交給瀏覽器預設行為", () => {
    renderEditTable();
    expect(fireCopy().plain).toBe("");
  });

  it("Cmd+A 全選可見的格子", async () => {
    const user = userEvent.setup();
    renderEditTable();

    await focusCell(user, 0, 0);
    await user.keyboard("{Meta>}a{/Meta}");
    expect(editCell(0, 0)).toHaveAttribute("data-cell-selected", "true");
    expect(editCell(1, 5)).toHaveAttribute("data-cell-selected", "true");
  });

  it("儲存格選取不影響列選取", async () => {
    const user = userEvent.setup();
    renderEditTable();

    await focusCell(user, 0, 0);
    await user.keyboard("{Shift>}{ArrowDown}{/Shift}");
    const checkboxes = screen.getAllByRole("checkbox", { name: "選取此列" });
    for (const box of checkboxes) {
      expect(box).not.toBeChecked();
    }
  });

  it("篩掉選取的列之後選取整個清掉", async () => {
    const user = userEvent.setup();
    renderEditTable();

    await focusCell(user, 1, 0);
    expect(editCell(1, 0)).toHaveAttribute("data-cell-active", "true");

    await user.type(screen.getByPlaceholderText(/以屬性或值篩選/), "甲案");
    expect(document.querySelector("[data-cell-active]")).not.toBeInTheDocument();
  });

  it("單擊即開編輯器，同一下也讓該格成為作用中", async () => {
    const user = userEvent.setup();
    renderEditTable();

    await user.click(editCell(0, 0));
    expect(screen.getByRole("textbox", { name: "編輯值" })).toBeInTheDocument();
    expect(editCell(0, 0)).toHaveAttribute("data-cell-active", "true");
  });

  it("單擊 select 就展開選項清單", async () => {
    const user = userEvent.setup();
    renderEditTable();

    await user.click(editCell(0, 3)); // 狀態欄
    const popover = document.querySelector(
      '[data-slot="popover-content"]',
    ) as HTMLElement;
    expect(within(popover).getByText("已修繕")).toBeInTheDocument();
  });

  it("停用的儲存格單擊只選取，不開編輯器", async () => {
    const user = userEvent.setup();
    const columns = editColumns().map((c) =>
      c.id === "name" && c.editable
        ? { ...c, editable: { ...c.editable, disabled: () => true } }
        : c,
    );
    renderEditTable({ columns });

    await user.click(editCell(0, 0));
    expect(editCell(0, 0)).toHaveAttribute("data-cell-active", "true");
    expect(
      screen.queryByRole("textbox", { name: "編輯值" }),
    ).not.toBeInTheDocument();
  });

  it("Esc 關掉編輯器之後，方向鍵仍然移得動作用中儲存格", async () => {
    const user = userEvent.setup();
    renderEditTable();

    await user.click(editCell(0, 0));
    await user.keyboard("{Escape}");
    // 編輯器是 popover，關掉後焦點會掉回 body——表格要把它收回來，
    // 否則使用者得再點一下才接得回鍵盤
    await user.keyboard("{ArrowRight}");
    expect(editCell(0, 1)).toHaveAttribute("data-cell-active", "true");
  });

  it("雙擊只開一次編輯器，第二下不會被當成點到別處而送出", async () => {
    const user = userEvent.setup();
    const onCellCommit = vi.fn();
    renderEditTable({ onCellCommit });

    await user.dblClick(editCell(0, 0));
    expect(screen.getAllByRole("textbox", { name: "編輯值" })).toHaveLength(1);
    expect(onCellCommit).not.toHaveBeenCalled();
  });

  it("作用中儲存格上按 Enter 也開得了編輯器", async () => {
    const user = userEvent.setup();
    renderEditTable();

    await focusCell(user, 0, 0);
    await user.keyboard("{Enter}");
    expect(screen.getByRole("textbox", { name: "編輯值" })).toBeInTheDocument();
  });

  it("編輯器開著時方向鍵歸編輯器，不移動範圍", async () => {
    const user = userEvent.setup();
    renderEditTable();

    await user.dblClick(editCell(0, 0));
    await user.keyboard("{ArrowRight}{ArrowDown}");
    expect(editCell(0, 0)).toHaveAttribute("data-cell-active", "true");
  });

  it("沒宣告 editable 的欄位：點了只成為作用中，不開編輯器", async () => {
    const user = userEvent.setup();
    // 整欄拿掉 editable——這與「宣告了但 disabled 擋掉某一列」是兩件事
    const columns = editColumns().map((c) =>
      c.id === "name" ? { id: c.id, header: c.header } : c,
    ) as ConsoleTableColumn<EditRow>[];
    renderEditTable({ columns, onCellCommit: vi.fn() });

    await user.click(editCell(0, 0));
    expect(editCell(0, 0)).toHaveAttribute("data-cell-active", "true");
    expect(
      screen.queryByRole("textbox", { name: "編輯值" }),
    ).not.toBeInTheDocument();
    // 雙擊也一樣——沒宣告就是沒宣告
    await user.dblClick(editCell(0, 0));
    expect(
      screen.queryByRole("textbox", { name: "編輯值" }),
    ).not.toBeInTheDocument();
  });

  it("按著拖成一片再放開不是「點」，不會跳出編輯器", async () => {
    renderEditTable({ onCellCommit: vi.fn() });
    const from = editCell(0, 0);
    const to = editCell(0, 1);

    // 單擊即編輯之後，用指標框範圍就得靠拖曳——放開時若被當成點，
    // 每次框完一片都會彈出編輯器蓋住剛選好的東西
    act(() => {
      fireEvent.mouseDown(from);
      document.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, pointerId: 1 }),
      );
      to.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, pointerId: 1 }),
      );
      document.dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }),
      );
      fireEvent.click(from);
    });

    expect(to).toHaveAttribute("data-cell-selected", "true");
    expect(
      screen.queryByRole("textbox", { name: "編輯值" }),
    ).not.toBeInTheDocument();
  });

  it("範圍可以涵蓋沒宣告 editable 的欄位", async () => {
    const user = userEvent.setup();
    const columns: ConsoleTableColumn<EditRow>[] = [
      { id: "name", header: "名稱", cell: (r) => r.name, copyValue: (r) => r.name },
      { id: "plain", header: "唯讀", cell: (r) => r.status },
    ];
    renderEditTable({ columns });

    await focusCell(user, 0, 0);
    await user.keyboard("{Shift>}{ArrowRight}{/Shift}");
    expect(editCell(0, 1)).toHaveAttribute("data-cell-selected", "true");
    // 沒有 copyValue 也沒有 filterValue／sortValue 的欄位複製空字串，仍佔一欄
    expect(fireCopy().plain.split("\t")).toEqual(["甲案", ""]);
  });
});

describe("範圍編輯：刪除、剪下、貼上、復原", () => {
  /** 觸發 cut / paste 並回傳寫進剪貼簿的內容。 */
  function fireClipboard(
    type: "cut" | "paste",
    data?: string,
  ): Record<string, string> {
    const written: Record<string, string> = {};
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        setData: (t: string, v: string) => {
          written[t] = v;
        },
        getData: () => data ?? "",
      },
    });
    act(() => {
      editCell(0, 0).dispatchEvent(event);
    });
    return written;
  }

  async function selectRange(
    user: ReturnType<typeof userEvent.setup>,
    from: [number, number],
    to: [number, number],
  ) {
    await focusCell(user, from[0], from[1]);
    for (let c = from[1]; c < to[1]; c++) {
      await user.keyboard("{Shift>}{ArrowRight}{/Shift}");
    }
    for (let r = from[0]; r < to[0]; r++) {
      await user.keyboard("{Shift>}{ArrowDown}{/Shift}");
    }
  }

  it("沒給 onCellsCommit 時刪除完全不作用", async () => {
    const user = userEvent.setup();
    renderEditTable();
    await focusCell(user, 0, 0);
    await user.keyboard("{Delete}");
    // 沒有任何回報訊息出現
    expect(
      document.querySelector("[data-slot=range-write-message]"),
    ).not.toBeInTheDocument();
  });

  it("清空範圍：一次操作只呼叫一次 callback，逐型別給對的空值", async () => {
    const user = userEvent.setup();
    const onCellsCommit = vi.fn();
    renderEditTable({ onCellsCommit });

    // 名稱、數量、年份、狀態、完成（boolean）五欄
    await selectRange(user, [0, 0], [0, 4]);
    await user.keyboard("{Delete}");

    expect(onCellsCommit).toHaveBeenCalledTimes(1);
    const edits = onCellsCommit.mock.calls[0][0];
    expect(edits).toHaveLength(5);
    const byColumn = Object.fromEntries(
      edits.map((e: { columnId: string; value: unknown }) => [
        e.columnId,
        e.value,
      ]),
    );
    expect(byColumn.name).toBeNull();
    expect(byColumn.qty).toBeNull();
    expect(byColumn.status).toBeNull();
    // boolean 的空是 false 而不是 null——開關沒有空狀態
    expect(byColumn.done).toBe(false);
  });

  it("唯讀欄與 disabled 列被跳過，其餘照常寫入", async () => {
    const user = userEvent.setup();
    const onCellsCommit = vi.fn();
    const columns: ConsoleTableColumn<EditRow>[] = [
      { id: "name", header: "名稱", cell: (r) => r.name },
      {
        id: "qty",
        header: "數量",
        editable: {
          type: "number",
          getValue: (r: EditRow) => r.qty as number | null,
          disabled: (r: EditRow) => r.id === "e2",
        },
      },
    ];
    renderEditTable({ columns, onCellsCommit });

    await selectRange(user, [0, 0], [1, 1]);
    await user.keyboard("{Delete}");

    const edits = onCellsCommit.mock.calls[0][0];
    // 4 格裡只有 e1 的 qty 寫得進去
    expect(edits).toHaveLength(1);
    expect(edits[0].columnId).toBe("qty");
    expect(
      document.querySelector("[data-slot=range-write-message]"),
    ).toHaveTextContent("已更新 1 格，略過 3 格");
  });

  it("剪下先寫剪貼簿再清空，只回報一次", async () => {
    const user = userEvent.setup();
    const onCellsCommit = vi.fn();
    renderEditTable({ onCellsCommit });

    await selectRange(user, [0, 0], [0, 1]);
    const written = fireClipboard("cut");

    expect(written["text/plain"]).toBe("甲案\t1,234");
    expect(onCellsCommit).toHaveBeenCalledTimes(1);
    expect(onCellsCommit.mock.calls[0][0]).toHaveLength(2);
  });

  it("貼上從作用中儲存格往右下鋪，忽略選取大小", async () => {
    const user = userEvent.setup();
    const onCellsCommit = vi.fn();
    renderEditTable({ onCellsCommit });

    // 只選一格，但貼兩列兩欄
    await focusCell(user, 0, 0);
    fireClipboard("paste", "丙案\t5,678\n丁案\t9,012");

    const edits = onCellsCommit.mock.calls[0][0];
    expect(edits).toHaveLength(4);
    expect(edits.map((e: { value: unknown }) => e.value)).toEqual([
      "丙案",
      5678,
      "丁案",
      9012,
    ]);
  });

  it("貼上超出最後一列就截斷，不新增列", async () => {
    const user = userEvent.setup();
    const onCellsCommit = vi.fn();
    renderEditTable({ onCellsCommit });

    // 表格只有兩列，從第二列開始貼三列
    await focusCell(user, 1, 0);
    fireClipboard("paste", "一\n二\n三");

    expect(onCellsCommit.mock.calls[0][0]).toHaveLength(1);
    expect(document.querySelectorAll("tbody tr[data-row-key]")).toHaveLength(2);
    expect(
      document.querySelector("[data-slot=range-write-message]"),
    ).toHaveTextContent("略過 2 格");
  });

  it("貼上以 label 反解 select，對不上的值只拒絕該格", async () => {
    const user = userEvent.setup();
    const onCellsCommit = vi.fn();
    renderEditTable({ onCellsCommit });

    // 狀態欄（index 3）：一格給合法標籤、一格給不存在的值
    await focusCell(user, 0, 3);
    fireClipboard("paste", "已修繕\n不存在的狀態");

    const edits = onCellsCommit.mock.calls[0][0];
    expect(edits).toHaveLength(1);
    expect(edits[0].value).toBe("已修繕");
    expect(
      document.querySelector("[data-slot=range-write-message]"),
    ).toHaveTextContent("1 格的值無法辨識");
  });

  it("貼上的數字吃得下千分位，與編輯器同一套規則", async () => {
    const user = userEvent.setup();
    const onCellsCommit = vi.fn();
    const onCellCommit = vi.fn();
    renderEditTable({ onCellsCommit, onCellCommit });

    // 貼上
    await focusCell(user, 0, 1);
    fireClipboard("paste", "1,234");
    expect(onCellsCommit.mock.calls[0][0][0].value).toBe(1234);

    // 同一個字串走編輯器
    await user.dblClick(editCell(0, 1));
    const input = screen.getByRole("textbox", { name: "編輯值" });
    await user.clear(input);
    await user.type(input, "1,234{Enter}");
    expect(onCellCommit).toHaveBeenCalledWith(
      expect.objectContaining({ id: "e1" }),
      "qty",
      1234,
    );
  });

  it("全部成功時不提略過與拒絕，不製造雜訊", async () => {
    const user = userEvent.setup();
    renderEditTable({ onCellsCommit: vi.fn() });

    await focusCell(user, 0, 0);
    await user.keyboard("{Delete}");

    const message = document.querySelector("[data-slot=range-write-message]");
    expect(message).toHaveTextContent("已更新 1 格");
    expect(message).not.toHaveTextContent("略過");
    expect(message).not.toHaveTextContent("無法辨識");
  });

  it("復原把清空前的值再送一次", async () => {
    const user = userEvent.setup();
    const onCellsCommit = vi.fn();
    renderEditTable({ onCellsCommit });

    await selectRange(user, [0, 0], [0, 1]);
    await user.keyboard("{Delete}");
    await user.keyboard("{Meta>}z{/Meta}");

    expect(onCellsCommit).toHaveBeenCalledTimes(2);
    const restored = onCellsCommit.mock.calls[1][0];
    expect(
      restored.map((e: { columnId: string; value: unknown }) => [
        e.columnId,
        e.value,
      ]),
    ).toEqual([
      ["name", "甲案"],
      ["qty", 1234],
    ]);
  });

  it("復原不涵蓋單格編輯", async () => {
    const user = userEvent.setup();
    const onCellsCommit = vi.fn();
    renderEditTable({ onCellsCommit, onCellCommit: vi.fn() });

    await user.dblClick(editCell(0, 0));
    const input = screen.getByRole("textbox", { name: "編輯值" });
    await user.clear(input);
    await user.type(input, "改過{Enter}");

    await focusCell(user, 0, 0);
    await user.keyboard("{Meta>}z{/Meta}");
    expect(onCellsCommit).not.toHaveBeenCalled();
  });

  it("拖過三格就框出三格", async () => {
    renderEditTable({ onCellsCommit: vi.fn() });
    act(() => {
      editCell(0, 0).dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    for (const columnIndex of [1, 2]) {
      act(() => {
        editCell(0, columnIndex).dispatchEvent(
          new PointerEvent("pointermove", { bubbles: true }),
        );
      });
    }
    act(() => {
      document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });

    expect(document.querySelectorAll("td[data-cell-selected]")).toHaveLength(3);
  });

  it("從列的 checkbox 按下不會框選", async () => {
    renderEditTable({ onCellsCommit: vi.fn() });
    const checkbox = screen.getAllByRole("checkbox", { name: "選取此列" })[0];
    act(() => {
      checkbox.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      editCell(0, 2).dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true }),
      );
      document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });

    expect(document.querySelectorAll("td[data-cell-selected]")).toHaveLength(0);
  });
});

describe("select 選項管理", () => {
  /** 開啟狀態欄（index 3）的編輯器。 */
  async function openStatusEditor(user: ReturnType<typeof userEvent.setup>) {
    await user.click(editCell(0, 3));
  }

  /** 編輯器浮層；選項文字與儲存格的標籤同名，查詢一律限縮在這裡。 */
  function panel(): HTMLElement {
    return document.querySelector(
      '[data-slot="popover-content"]',
    ) as HTMLElement;
  }

  it("沒給 onOptionsChange 時清單唯讀，沒有建立與設定入口", async () => {
    const user = userEvent.setup();
    renderEditTable();
    await openStatusEditor(user);

    expect(within(panel()).getByText("待修繕")).toBeInTheDocument();
    expect(
      within(panel()).queryByLabelText("搜尋或建立選項"),
    ).not.toBeInTheDocument();
    expect(within(panel()).queryByLabelText(/的設定$/)).not.toBeInTheDocument();
  });

  it("點選項即送出", async () => {
    const user = userEvent.setup();
    const onCellCommit = vi.fn();
    renderEditTable({ onCellCommit });
    await openStatusEditor(user);

    await user.click(screen.getByRole("button", { name: /已修繕/ }));
    expect(onCellCommit).toHaveBeenCalledWith(
      expect.objectContaining({ id: "e1" }),
      "status",
      "已修繕",
    );
  });

  it("建立：value 就是輸入文字，顏色不撞既有選項", async () => {
    const user = userEvent.setup();
    const onOptionsChange = vi.fn();
    renderEditTable({ onOptionsChange });
    await openStatusEditor(user);

    await user.type(screen.getByLabelText("搜尋或建立選項"), "待驗收");
    await user.click(screen.getByRole("button", { name: /建立/ }));

    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    const [columnId, next] = onOptionsChange.mock.calls[0];
    expect(columnId).toBe("status");
    const created = next.at(-1);
    expect(created.value).toBe("待驗收");
    expect(created.label).toBe("待驗收");
    // 既有選項用的是 destructive / secondary / #16a34a，新的取調色盤第一色
    expect(created.color).toBe(TAG_PALETTE[0]);
  });

  it("建立：撞到既有 value 時說已存在，不建立重複的", async () => {
    const user = userEvent.setup();
    const onOptionsChange = vi.fn();
    renderEditTable({ onOptionsChange });
    await openStatusEditor(user);

    await user.type(screen.getByLabelText("搜尋或建立選項"), "已修繕");
    expect(screen.getByText(/已經存在/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /建立/ }),
    ).not.toBeInTheDocument();
  });

  it("輸入會過濾清單", async () => {
    const user = userEvent.setup();
    renderEditTable({ onOptionsChange: vi.fn() });
    await openStatusEditor(user);

    await user.type(screen.getByLabelText("搜尋或建立選項"), "複驗");
    expect(within(panel()).getByText("複驗通過")).toBeInTheDocument();
    expect(within(panel()).queryByText("待修繕")).not.toBeInTheDocument();
  });

  it("改名只變 label，沒有改 value 的入口", async () => {
    const user = userEvent.setup();
    const onOptionsChange = vi.fn();
    renderEditTable({ onOptionsChange });
    await openStatusEditor(user);

    await user.click(screen.getByLabelText("待修繕 的設定"));
    const nameInput = screen.getByLabelText("選項名稱");
    expect(nameInput).toHaveValue("待修繕");
    // 面板上只有這一個文字輸入框——沒有第二個給 value 用的
    expect(within(panel()).getAllByRole("textbox")).toHaveLength(1);

    await user.type(nameInput, "！");
    const next = onOptionsChange.mock.calls.at(-1)![1];
    expect(next[0].label).toBe("待修繕！");
    expect(next[0].value).toBe("待修繕");
  });

  it("改色：調色盤與自訂色；面板不提供 badge 變體", async () => {
    const user = userEvent.setup();
    const onOptionsChange = vi.fn();
    renderEditTable({ onOptionsChange });
    await openStatusEditor(user);
    await user.click(screen.getByLabelText("待修繕 的設定"));

    await user.click(screen.getByLabelText(`顏色 ${TAG_PALETTE[2]}`));
    expect(onOptionsChange.mock.calls.at(-1)![1][0].color).toBe(TAG_PALETTE[2]);

    expect(screen.getByLabelText("自訂顏色")).toHaveAttribute("type", "color");
    // 變體是給程式碼宣告用的，不是給使用者挑的外觀
    for (const variant of ["default", "secondary", "destructive"]) {
      expect(
        screen.queryByRole("button", { name: variant }),
      ).not.toBeInTheDocument();
    }
  });

  it("色票以色相排序呈現，剛好排成完整的兩排", async () => {
    const user = userEvent.setup();
    renderEditTable({ onOptionsChange: vi.fn() });
    await openStatusEditor(user);
    await user.click(screen.getByLabelText("待修繕 的設定"));

    const swatches = [
      ...panel().querySelectorAll('button[aria-label^="顏色 "]'),
    ].map((b) => b.getAttribute("aria-label")!.replace("顏色 ", ""));
    // 預設排第一（比照 Notion），後面是依色相排好的十色
    expect(swatches).toEqual(["預設", ...TAG_PALETTE_BY_HUE]);
    // 加上自訂那一格剛好 12 格＝ 6 欄兩排
    expect(swatches.length + 1).toBe(12);
  });

  it("預設＝不給顏色，選了就把 color 清掉", async () => {
    const user = userEvent.setup();
    const onOptionsChange = vi.fn();
    renderEditTable({ onOptionsChange });
    await openStatusEditor(user);
    await user.click(screen.getByLabelText("待修繕 的設定"));

    await user.click(screen.getByLabelText("顏色 預設"));
    expect(onOptionsChange.mock.calls.at(-1)![1][0].color).toBeUndefined();
  });

  it("刪除：不阻擋，影響範圍放在刪除鈕的 title 而不是多一行字", async () => {
    const user = userEvent.setup();
    const onOptionsChange = vi.fn();
    renderEditTable({ onOptionsChange });
    await openStatusEditor(user);
    await user.click(screen.getByLabelText("待修繕 的設定"));

    // 面板底下不再有常駐的說明文字
    expect(
      within(panel()).queryByText(/列使用/),
    ).not.toBeInTheDocument();
    const del = screen.getByRole("button", { name: "刪除選項" });
    // EDIT_ROWS 裡 e1 是「待修繕」，所以是 1 列
    expect(del).toHaveAttribute(
      "title",
      expect.stringContaining("有 1 列使用"),
    );
    expect(del).toBeEnabled();

    await user.click(del);
    const next = onOptionsChange.mock.calls.at(-1)![1];
    expect(next.map((o: { value: string }) => o.value)).toEqual([
      "已修繕",
      "複驗通過",
    ]);
  });

  it("沒有列在用的選項，刪除鈕的 title 不提數字", async () => {
    const user = userEvent.setup();
    renderEditTable({ onOptionsChange: vi.fn() });
    await openStatusEditor(user);
    await user.click(screen.getByLabelText("複驗通過 的設定"));

    expect(screen.getByRole("button", { name: "刪除選項" })).toHaveAttribute(
      "title",
      "刪除選項",
    );
  });

  it("開設定面板不會關掉編輯器，返回鍵回到清單", async () => {
    const user = userEvent.setup();
    renderEditTable({ onOptionsChange: vi.fn() });
    await openStatusEditor(user);

    await user.click(screen.getByLabelText("待修繕 的設定"));
    // 面板開著＝編輯器仍在
    expect(screen.getByLabelText("選項名稱")).toBeInTheDocument();

    await user.click(screen.getByLabelText("返回選項清單"));
    expect(screen.getByLabelText("搜尋或建立選項")).toBeInTheDocument();
    expect(screen.queryByLabelText("選項名稱")).not.toBeInTheDocument();
  });

  it("按面板裡的顏色不會關掉編輯器", async () => {
    const user = userEvent.setup();
    renderEditTable({ onOptionsChange: vi.fn() });
    await openStatusEditor(user);
    await user.click(screen.getByLabelText("待修繕 的設定"));

    await user.click(screen.getByLabelText(`顏色 ${TAG_PALETTE[1]}`));
    expect(screen.getByLabelText("選項名稱")).toBeInTheDocument();
  });
});

describe("select 選項的 Esc 分層與排序", () => {
  function panel(): HTMLElement {
    return document.querySelector(
      '[data-slot="popover-content"]',
    ) as HTMLElement;
  }

  it("Esc 先關設定面板，編輯器留著", async () => {
    const user = userEvent.setup();
    renderEditTable({ onOptionsChange: vi.fn() });
    await user.dblClick(editCell(0, 3));
    await user.click(screen.getByLabelText("待修繕 的設定"));

    await user.keyboard("{Escape}");
    // 退回清單，編輯器沒關
    expect(screen.queryByLabelText("選項名稱")).not.toBeInTheDocument();
    expect(screen.getByLabelText("搜尋或建立選項")).toBeInTheDocument();
  });

  it("清單畫面按 Esc 才關掉整個編輯器", async () => {
    const user = userEvent.setup();
    renderEditTable({ onOptionsChange: vi.fn() });
    await user.dblClick(editCell(0, 3));
    expect(panel()).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(
      document.querySelector('[data-slot="popover-content"]'),
    ).not.toBeInTheDocument();
  });

  it("排序把每項當下的顏色寫死，順序變了顏色不變", async () => {
    const user = userEvent.setup();
    const onOptionsChange = vi.fn();
    // colored: true 的欄位才有「顏色依順序」的問題
    const columns = editColumns().map((c) =>
      c.id === "status"
        ? ({
            ...c,
            editable: {
              type: "select",
              getValue: (r: EditRow) => r.status,
              colored: true,
              options: [{ value: "甲" }, { value: "乙" }, { value: "丙" }],
            },
          } as ConsoleTableColumn<EditRow>)
        : c,
    );
    renderEditTable({ columns, onOptionsChange });
    await user.dblClick(editCell(0, 3));

    const grips = panel().querySelectorAll("[data-option-grip]");
    const rows = panel().querySelectorAll("[data-option-row]");
    rows.forEach((row, i) => {
      row.getBoundingClientRect = () =>
        ({ top: i * 20, height: 20, bottom: i * 20 + 20 }) as DOMRect;
    });

    const grip = grips[0] as HTMLElement;
    grip.setPointerCapture = () => {};
    act(() => {
      grip.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, pointerId: 1 }),
      );
      grip.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId: 1,
          clientY: 999,
        }),
      );
    });

    const next = onOptionsChange.mock.calls.at(-1)![1];
    expect(next.map((o: { value: string }) => o.value)).toEqual([
      "乙",
      "丙",
      "甲",
    ]);
    // 甲原本是調色盤第 0 色，搬到最後仍然是第 0 色（不會變成第 2 色）
    expect(next.find((o: { value: string }) => o.value === "甲").color).toBe(
      TAG_PALETTE[0],
    );
    expect(next.find((o: { value: string }) => o.value === "乙").color).toBe(
      TAG_PALETTE[1],
    );
  });
});

describe("唯讀（readOnly）", () => {
  function panel(): HTMLElement | null {
    return document.querySelector('[data-slot="popover-content"]');
  }

  /** 六條寫入路徑的回呼全給齊，唯讀時都不該被呼叫。 */
  function allWriteHandlers() {
    return {
      onCellCommit: vi.fn(),
      onCellsCommit: vi.fn(),
      onOptionsChange: vi.fn(),
    };
  }

  it("單格編輯：雙擊與 Enter 都不開編輯器", async () => {
    const user = userEvent.setup();
    const handlers = allWriteHandlers();
    renderEditTable({ ...handlers, readOnly: true });

    await user.dblClick(editCell(0, 0));
    expect(panel()).not.toBeInTheDocument();

    await user.click(editCell(0, 0));
    await user.keyboard("{Enter}");
    expect(panel()).not.toBeInTheDocument();
    expect(handlers.onCellCommit).not.toHaveBeenCalled();
  });

  it("boolean 開關點下去沒有反應（它沒有編輯態，控制項本身就是寫入入口）", async () => {
    const user = userEvent.setup();
    const handlers = allWriteHandlers();
    renderEditTable({ ...handlers, readOnly: true });

    const toggle = within(editCell(0, 4)).getByRole("switch");
    // 停用走 aria-disabled 而不是原生的 disabled：按鈕留在 tab 順序裡，
    // 唯讀時仍讀得到「已開啟／未開啟」，只是按下去不回報
    expect(toggle).toHaveAttribute("aria-disabled", "true");
    await user.click(toggle);
    expect(handlers.onCellCommit).not.toHaveBeenCalled();
  });

  it("範圍寫入：刪除、剪下、貼上、復原都不作用", async () => {
    const user = userEvent.setup();
    const handlers = allWriteHandlers();
    renderEditTable({ ...handlers, readOnly: true });

    await user.click(editCell(0, 0));
    await user.keyboard("{Shift>}{ArrowRight}{/Shift}");
    await user.keyboard("{Delete}");
    await user.keyboard("{Meta>}z{/Meta}");

    const fire = (type: "cut" | "paste") => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", {
        value: { setData: vi.fn(), getData: () => "丙案\t9" },
      });
      act(() => {
        editCell(0, 0).dispatchEvent(event);
      });
    };
    fire("cut");
    fire("paste");

    expect(handlers.onCellsCommit).not.toHaveBeenCalled();
    expect(
      document.querySelector("[data-slot=range-write-message]"),
    ).not.toBeInTheDocument();
  });

  it("選項管理：清單維持唯讀，沒有建立與設定入口", async () => {
    const user = userEvent.setup();
    const handlers = allWriteHandlers();
    // select 欄位在唯讀時連編輯器都開不了，改由「有宣告但唯讀」確認
    renderEditTable({ ...handlers, readOnly: true });
    await user.dblClick(editCell(0, 3));
    expect(panel()).not.toBeInTheDocument();
    expect(handlers.onOptionsChange).not.toHaveBeenCalled();
  });

  it("拖曳排序：沒有握把", () => {
    renderEditTable({
      ...allWriteHandlers(),
      onRowReorder: vi.fn(),
      pagination: "scroll",
      readOnly: true,
    });
    expect(
      document.querySelector("[data-drag-handle='true']"),
    ).not.toBeInTheDocument();
  });

  it("可編輯提示不渲染", () => {
    renderEditTable({ ...allWriteHandlers(), readOnly: true });
    expect(
      document.querySelector("[data-editable-cell]"),
    ).not.toBeInTheDocument();
  });

  it("儲存格不可點：唯讀時不選取，連帶也不能複製", async () => {
    const user = userEvent.setup();
    renderEditTable({ ...allWriteHandlers(), readOnly: true });

    await user.click(editCell(0, 0));
    // 點下去只會亮一個什麼都做不了的框，那比沒有回饋更糟
    expect(editCell(0, 0)).not.toHaveAttribute("data-cell-active");
    expect(
      document.querySelector("[data-cell-selected]"),
    ).not.toBeInTheDocument();

    const written: Record<string, string> = {};
    const event = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        setData: (t: string, v: string) => {
          written[t] = v;
        },
      },
    });
    act(() => {
      editCell(0, 0).dispatchEvent(event);
    });
    // 沒有選取就沒有範圍——複製交還給瀏覽器的預設行為
    expect(written["text/plain"]).toBeUndefined();
  });

  it("唯讀時表格不留一個什麼都不做的 tab stop", () => {
    renderEditTable({ ...allWriteHandlers(), readOnly: true });
    expect(document.querySelector("[aria-busy]")).not.toHaveAttribute(
      "tabindex",
    );
  });

  it("讀取照常：列選取仍然可用", async () => {
    const user = userEvent.setup();
    renderEditTable({ ...allWriteHandlers(), readOnly: true });

    await user.click(screen.getAllByRole("checkbox", { name: "選取此列" })[0]);
    expect(screen.getByText("(1/2)")).toBeInTheDocument();
  });

  it("新增入口整組消失：新增子項目與新增到群組都不渲染", async () => {
    const user = userEvent.setup();
    renderEditTable({
      readOnly: true,
      pagination: "scroll",
      subRowOf: () => null,
      onAddSubRow: vi.fn(),
      onAddRowToGroup: vi.fn(),
    });
    // 沒有子項目的列本來要點三角形才展開；唯讀時連三角形都不該有新增入口
    const disclosure = document.querySelector('[data-disclosure="true"]');
    if (disclosure) await user.click(disclosure as HTMLElement);

    expect(document.querySelector('[data-add-sub-row="true"]')).toBeNull();
    expect(document.querySelector('[data-add-to-group="true"]')).toBeNull();
  });

  it("儲存格裡的連結照樣點得到——那是唯讀版唯一的出口", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const columns = editColumns().map((c) =>
      c.id === "name"
        ? ({
            ...c,
            cell: (r: EditRow) => (
              <a
                href="#detail"
                onClick={(event) => {
                  event.preventDefault();
                  onOpen(r.id);
                }}
              >
                {r.name}
              </a>
            ),
          } as ConsoleTableColumn<EditRow>)
        : c,
    );
    renderEditTable({ columns, readOnly: true });

    await user.click(screen.getAllByRole("link")[0]);
    expect(onOpen).toHaveBeenCalledWith("e1");
  });

  it("整理照舊：唯讀不影響排序與欄寬", async () => {
    const user = userEvent.setup();
    // editColumns 刻意都不可排序，這裡替名稱補上 sortValue 才有得排
    const columns = editColumns().map((c) =>
      c.id === "name"
        ? ({ ...c, sortValue: (r: EditRow) => r.name } as ConsoleTableColumn<EditRow>)
        : c,
    );
    renderEditTable({ columns, readOnly: true });

    const names = () =>
      [...document.querySelectorAll("tbody tr td:nth-child(2)")].map(
        (td) => td.textContent,
      );
    // 名稱一可排序，隱性預設就是它的升冪，所以要選兩次才看得出方向翻轉
    const asc = names();
    await sortByMenu(user, "名稱");
    await sortByMenu(user, "名稱");
    expect(names()).toEqual([...asc].reverse());

    // 欄寬：把手還在，拖得動
    const handle = screen.getByLabelText("調整名稱欄寬");
    fireEvent.pointerDown(handle, { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 150 });
    expect(
      (document.querySelectorAll("colgroup col")[1] as HTMLElement).style.width,
    ).toBe("150px");
  });

  it("readOnly 為 false 時不會憑空長出沒宣告的能力", async () => {
    const user = userEvent.setup();
    const columns: ConsoleTableColumn<EditRow>[] = [
      { id: "name", header: "名稱", cell: (r) => r.name },
    ];
    renderEditTable({ columns, readOnly: false });

    await user.dblClick(editCell(0, 0));
    expect(panel()).not.toBeInTheDocument();
    expect(
      document.querySelector("[data-editable-cell]"),
    ).not.toBeInTheDocument();
  });
});

describe("全部展開／收合", () => {
  type Node = { id: string; name: string; parent: string | null; grp: string };
  const TREE: Node[] = [
    { id: "p1", name: "父一", parent: null, grp: "甲" },
    { id: "c1", name: "子一", parent: "p1", grp: "甲" },
    { id: "p2", name: "父二", parent: null, grp: "乙" },
    { id: "c2", name: "子二", parent: "p2", grp: "乙" },
  ];
  const COLS: ConsoleTableColumn<Node>[] = [
    { id: "name", header: "名稱", cell: (r) => r.name, sortValue: (r) => r.name },
    { id: "grp", header: "類別", cell: (r) => r.grp, filterValue: (r) => r.grp },
  ];
  const subRowOf = (r: Node) => r.parent;

  function Tree({
    grouped = false,
    withSubRows = true,
    ...props
  }: Partial<React.ComponentProps<typeof ConsoleDataTable<Node>>> & {
    grouped?: boolean;
    withSubRows?: boolean;
  } = {}) {
    const [query, setQuery] = useState(() => ({
      ...createDefaultTableQuery(30),
      groupBy: grouped ? "grp" : null,
    }));
    const result = useClientTableQuery(
      TREE,
      query,
      COLS,
      (r) => r.id,
      withSubRows ? subRowOf : undefined,
    );
    return (
      <ConsoleDataTable
        title="樹"
        columns={COLS}
        rowKey={(r) => r.id}
        query={query}
        onQueryChange={setQuery}
        pagination="scroll"
        subRowOf={withSubRows ? subRowOf : undefined}
        {...result}
        {...props}
      />
    );
  }

  const keys = () =>
    [...document.querySelectorAll("tr[data-row-key]")].map((r) =>
      r.getAttribute("data-row-key"),
    );
  const toggleAll = () =>
    screen.getByRole("button", { name: /^全部(展開|收合)$/ });

  it("沒有巢狀時按鈕不存在", () => {
    render(<Tree withSubRows={false} />);
    expect(
      screen.queryByRole("button", { name: /^全部(展開|收合)$/ }),
    ).not.toBeInTheDocument();
  });

  it("全部收合會收掉從未點過的父列（不是把覆寫清空）", async () => {
    const user = userEvent.setup();
    render(<Tree />);
    // 有子項目的父列預設就是展開，且使用者一次都沒點過
    expect(keys()).toEqual(["p1", "c1", "p2", "c2"]);

    expect(toggleAll()).toHaveAccessibleName("全部收合");
    await user.click(toggleAll());
    expect(keys()).toEqual(["p1", "p2"]);
  });

  it("全部展開把每個有子項目的父列打開", async () => {
    const user = userEvent.setup();
    render(<Tree />);
    await user.click(toggleAll()); // 先全部收合
    expect(toggleAll()).toHaveAccessibleName("全部展開");

    await user.click(toggleAll());
    expect(keys()).toEqual(["p1", "c1", "p2", "c2"]);
  });

  it("分組也一起收合，展開群組後看到的是一致的收合狀態", async () => {
    const user = userEvent.setup();
    render(<Tree grouped />);
    await user.click(toggleAll());

    // 群組收起來＝一列資料都不畫
    expect(keys()).toEqual([]);
    const headings = document.querySelectorAll("[data-slot=group-header]");
    expect(headings.length).toBeGreaterThan(0);

    // 單獨展開一組：只出現那一組的父列，子項目仍是收合的
    // （組間依 zh-Hant 筆畫序，乙 在 甲 之前，所以第一組是 p2）
    const first = headings[0].querySelector(
      "[data-group-disclosure='true']",
    ) as HTMLElement;
    await user.click(first);
    expect(keys()).toHaveLength(1);
    expect(keys()[0]).toMatch(/^p\d$/); // 是父列，不是被一起展開的子列
  });

  it("全部收合後單獨展開一個，其餘維持收合", async () => {
    const user = userEvent.setup();
    render(<Tree />);
    await user.click(toggleAll());
    expect(keys()).toEqual(["p1", "p2"]);

    const p1 = document.querySelector(
      "tr[data-row-key='p1'] [data-disclosure='true']",
    ) as HTMLElement;
    await user.click(p1);
    expect(keys()).toEqual(["p1", "c1", "p2"]);
    expect(toggleAll()).toHaveAccessibleName("全部展開");
  });

  it("Alt ＋ 點三角形套用到全部；不按 Alt 只動那一個", async () => {
    const user = userEvent.setup();
    render(<Tree />);
    const p1 = () =>
      document.querySelector(
        "tr[data-row-key='p1'] [data-disclosure='true']",
      ) as HTMLElement;

    // 不按 Alt：只收 p1
    await user.click(p1());
    expect(keys()).toEqual(["p1", "p2", "c2"]);

    // Alt ＋ 展開 p1 → 全部展開
    await user.keyboard("{Alt>}");
    await user.click(p1());
    await user.keyboard("{/Alt}");
    expect(keys()).toEqual(["p1", "c1", "p2", "c2"]);
  });

  it("篩選造成的強制展開不算「已展開」", async () => {
    const user = userEvent.setup();
    render(<Tree />);
    await user.click(toggleAll()); // 全部收合
    expect(toggleAll()).toHaveAccessibleName("全部展開");

    // 篩選命中子列會強制展開它的父列，但那是暫時覆寫
    await user.type(screen.getByPlaceholderText(/以屬性或值篩選/), "子一");
    expect(toggleAll()).toHaveAccessibleName("全部展開");
  });
});

describe("全部收合的結果會被記住", () => {
  type Node = { id: string; name: string; parent: string | null };
  const TREE: Node[] = [
    { id: "p1", name: "父一", parent: null },
    { id: "c1", name: "子一", parent: "p1" },
    { id: "p2", name: "父二", parent: null },
    { id: "c2", name: "子二", parent: "p2" },
  ];
  const COLS: ConsoleTableColumn<Node>[] = [
    { id: "name", header: "名稱", cell: (r) => r.name, sortValue: (r) => r.name },
  ];
  const subRowOf = (r: Node) => r.parent;

  function Tree() {
    const [query, setQuery] = useState(() => createDefaultTableQuery(30));
    const result = useClientTableQuery(TREE, query, COLS, (r) => r.id, subRowOf);
    return (
      <ConsoleDataTable
        title="樹"
        columns={COLS}
        rowKey={(r) => r.id}
        query={query}
        onQueryChange={setQuery}
        pagination="scroll"
        subRowOf={subRowOf}
        storageKey="collapse-all"
        {...result}
      />
    );
  }

  const keys = () =>
    [...document.querySelectorAll("tr[data-row-key]")].map((r) =>
      r.getAttribute("data-row-key"),
    );

  it("重新掛載後仍然是收合的（存的是收合狀態本身，不是一個模式）", async () => {
    const user = userEvent.setup();
    render(<Tree />);
    await user.click(screen.getByRole("button", { name: "全部收合" }));
    expect(keys()).toEqual(["p1", "p2"]);

    cleanup();
    render(<Tree />);
    // 掛載後才從 localStorage 補水，等它套用
    expect(await screen.findByRole("button", { name: "全部展開" })).toBeInTheDocument();
    expect(keys()).toEqual(["p1", "p2"]);
  });
});

describe("群組選單：隱藏與宣告式動作", () => {
  /** 開某一組的 ⋯ 選單，回傳浮層。 */
  async function openGroupMenu(
    user: ReturnType<typeof userEvent.setup>,
    index = 0,
  ): Promise<HTMLElement> {
    const menus = document.querySelectorAll('[data-group-menu="true"]');
    await user.click(menus[index] as HTMLElement);
    return document.querySelector(
      '[data-slot="popover-content"]',
    ) as HTMLElement;
  }

  async function group(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: /^分組/ }));
    const menu = document.querySelector(
      '[data-slot="popover-content"]',
    ) as HTMLElement;
    await user.click(within(menu).getByRole("button", { name: "類別" }));
    await user.keyboard("{Escape}");
  }

  const groupLabels = () =>
    [...document.querySelectorAll("[data-slot=group-header]")].map(
      (h) => h.getAttribute("data-group-value"),
    );

  function renderIt(props: TestTableProps = {}) {
    return renderTable({ pagination: "scroll", initialPageSize: 30, ...props });
  }

  it("隱藏後該組的列與標題都不在", async () => {
    const user = userEvent.setup();
    renderIt();
    await group(user);
    const before = groupLabels();
    expect(before.length).toBeGreaterThan(1);

    const panel = await openGroupMenu(user);
    await user.click(within(panel).getByText("隱藏此群組"));
    await user.keyboard("{Escape}");

    expect(groupLabels()).toHaveLength(before.length - 1);
    expect(groupLabels()).not.toContain(before[0]);
    // 該組的列也不在
    const rows = [...document.querySelectorAll("tr[data-row-key]")];
    expect(rows.length).toBeGreaterThan(0);
  });

  it("隱藏不改變總筆數（隱藏是「不想看」不是「不算」）", async () => {
    const user = userEvent.setup();
    renderIt();
    await group(user);
    // 標題列的總數，不是群組標題的——兩者現在都是「（N）」的形狀
    const toolbarCount = () =>
      document.querySelector("h2 span")?.textContent;
    const total = toolbarCount();

    const panel = await openGroupMenu(user);
    await user.click(within(panel).getByText("隱藏此群組"));
    await user.keyboard("{Escape}");

    expect(toolbarCount()).toBe(total);
  });

  it("分組選單列出隱藏的組、可逐一與全部恢復，且按鈕有標示", async () => {
    const user = userEvent.setup();
    renderIt();
    await group(user);
    const hiddenValue = groupLabels()[0];

    const panel = await openGroupMenu(user);
    await user.click(within(panel).getByText("隱藏此群組"));
    await user.keyboard("{Escape}");

    // 按鈕帶上隱藏數量
    const groupButton = screen.getByRole("button", { name: /已隱藏 1 組/ });
    await user.click(groupButton);
    const menu = document.querySelector(
      '[data-slot="popover-content"]',
    ) as HTMLElement;
    expect(within(menu).getByText("已隱藏的群組")).toBeInTheDocument();
    expect(
      menu.querySelector(`[data-unhide-group="${hiddenValue}"]`),
    ).toBeInTheDocument();

    await user.click(within(menu).getByText("全部恢復"));
    await user.keyboard("{Escape}");
    expect(groupLabels()).toContain(hiddenValue);
  });

  it("收合→隱藏→恢復後仍是收合（兩份狀態分開存）", async () => {
    const user = userEvent.setup();
    renderIt();
    await group(user);
    const target = groupLabels()[0];

    // 先收合
    const disclosure = document.querySelector(
      `[data-group-value="${target}"] [data-group-disclosure="true"]`,
    ) as HTMLElement;
    await user.click(disclosure);
    expect(disclosure).toHaveAttribute("aria-expanded", "false");

    // 隱藏再恢復
    const panel = await openGroupMenu(user);
    await user.click(within(panel).getByText("隱藏此群組"));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: /已隱藏 1 組/ }));
    const menu = document.querySelector(
      '[data-slot="popover-content"]',
    ) as HTMLElement;
    await user.click(within(menu).getByText("全部恢復"));
    await user.keyboard("{Escape}");

    const back = document.querySelector(
      `[data-group-value="${target}"] [data-group-disclosure="true"]`,
    );
    expect(back).toHaveAttribute("aria-expanded", "false");
  });

  it("宣告式動作：destructive 在分隔線之後，確認後才回報", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderIt({
      groupActions: [
        {
          id: "delete",
          label: "刪除這一組",
          icon: Trash2,
          intent: "destructive" as const,
          confirm: { title: "刪除這一組？", description: "不可復原" },
          onSelect,
        },
      ],
    });
    await group(user);

    const panel = await openGroupMenu(user);
    expect(panel.querySelector(".bg-border")).toBeInTheDocument();
    await user.click(within(panel).getByText("刪除這一組"));

    // 先跳確認，還沒回報
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByText("刪除這一組？")).toBeInTheDocument();
    expect(screen.getByText("不可復原")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "確認" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    const [groupValue, loadedKeys] = onSelect.mock.calls[0];
    expect(typeof groupValue === "string" || groupValue === null).toBe(true);
    expect(Array.isArray(loadedKeys)).toBe(true);
    expect(loadedKeys.length).toBeGreaterThan(0);
  });

  it("取消確認什麼都不回報", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderIt({
      groupActions: [
        {
          id: "delete",
          label: "刪除這一組",
          icon: Trash2,
          intent: "destructive" as const,
          confirm: { title: "刪除這一組？" },
          onSelect,
        },
      ],
    });
    await group(user);
    const panel = await openGroupMenu(user);
    await user.click(within(panel).getByText("刪除這一組"));
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("沒宣告 confirm 就直接回報", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderIt({
      groupActions: [
        { id: "export", label: "匯出這一組", icon: Upload, onSelect },
      ],
    });
    await group(user);
    const panel = await openGroupMenu(user);
    await user.click(within(panel).getByText("匯出這一組"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});


describe("群組選取與全域全選", () => {
  async function group(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: /^分組/ }));
    const menu = document.querySelector(
      '[data-slot="popover-content"]',
    ) as HTMLElement;
    await user.click(within(menu).getByRole("button", { name: "類別" }));
    await user.keyboard("{Escape}");
  }

  function renderIt(props: TestTableProps = {}) {
    return renderTable({ pagination: "scroll", initialPageSize: 30, ...props });
  }

  const groupCheckboxes = () =>
    [...document.querySelectorAll('[data-group-select="true"]')] as HTMLElement[];
  const selectedCount = () =>
    Number(screen.getByText(/\(\d+\/\d+\)/).textContent!.match(/\((\d+)\//)![1]);
  const rowsOfGroup = (index: number) => {
    const headers = [...document.querySelectorAll("[data-slot=group-header]")];
    const value = headers[index].getAttribute("data-group-value");
    return [...document.querySelectorAll("tr[data-row-key]")].filter((tr) => {
      let el: Element | null = tr;
      while ((el = el.previousElementSibling)) {
        if (el.getAttribute("data-slot") === "group-header") {
          return el.getAttribute("data-group-value") === value;
        }
      }
      return false;
    }).length;
  };

  it("群組 checkbox 只選取該組，不影響其他組", async () => {
    const user = userEvent.setup();
    renderIt();
    await group(user);

    const firstGroupRows = rowsOfGroup(0);
    await user.click(groupCheckboxes()[0]);
    expect(selectedCount()).toBe(firstGroupRows);
  });

  it("三態：部分→全選→全不選", async () => {
    const user = userEvent.setup();
    renderIt();
    await group(user);

    // 先單獨勾該組的一列，讓它變成部分選取
    const firstRow = document.querySelector(
      "tr[data-row-key] [role=checkbox]",
    ) as HTMLElement;
    await user.click(firstRow);
    expect(groupCheckboxes()[0]).toHaveAttribute("aria-checked", "mixed");

    // 點未定 → 全選
    await user.click(groupCheckboxes()[0]);
    expect(groupCheckboxes()[0]).toHaveAttribute("aria-checked", "true");

    // 再點 → 全不選
    await user.click(groupCheckboxes()[0]);
    expect(groupCheckboxes()[0]).toHaveAttribute("aria-checked", "false");
  });

  it("adapter 說得出整組時，勾一下就是整組——含還沒載入的列", async () => {
    const user = userEvent.setup();
    // 一頁只有 2 筆，但每組實際上有 4 筆；記憶體型 adapter 全量在手
    renderIt({ initialPageSize: 2 });
    await group(user);

    const drawn = document.querySelectorAll("tbody tr[data-row-key]").length;
    await user.click(groupCheckboxes()[0]);

    expect(groupCheckboxes()[0]).toHaveAttribute("aria-checked", "true");
    // 選到的比畫出來的多——那正是這件事的重點
    expect(selectedCount()).toBe(4);
    expect(drawn).toBeLessThan(4);
  });

  it("adapter 說不出整組時維持原樣：只動已載入的，且不顯示為全勾", async () => {
    const user = userEvent.setup();
    // 蓋掉 adapter 供應的每組 key，模擬 server 分塊模式給不出來的情況
    renderIt({ initialPageSize: 2, allFilteredKeysByGroup: undefined });
    await group(user);

    await user.click(groupCheckboxes()[0]);
    expect(groupCheckboxes()[0]).toHaveAttribute("aria-checked", "mixed");
    expect(selectedCount()).toBeLessThan(4);
  });

  it("整組選中後再勾一次，整組移除——含從沒畫出來的那些", async () => {
    const user = userEvent.setup();
    renderIt({ initialPageSize: 2 });
    await group(user);

    await user.click(groupCheckboxes()[0]);
    expect(selectedCount()).toBe(4);
    await user.click(groupCheckboxes()[0]);
    expect(groupCheckboxes()[0]).toHaveAttribute("aria-checked", "false");
  });

  it("只動那一組，別組不受影響", async () => {
    const user = userEvent.setup();
    // 一頁 6 筆才畫得出第二組（每組 4 筆）——一頁 2 筆時只有一組看得到
    renderIt({ initialPageSize: 6 });
    await group(user);

    await user.click(groupCheckboxes()[0]);
    expect(groupCheckboxes()[1]).toHaveAttribute("aria-checked", "false");
    expect(selectedCount()).toBe(4);
  });

  it("分組時工具列有全選，未分組時沒有（表頭那顆才在）", async () => {
    const user = userEvent.setup();
    renderIt();
    expect(
      document.querySelector('[data-select-everything="true"]'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "選取本頁全部" }),
    ).toBeInTheDocument();

    await group(user);
    expect(
      document.querySelector('[data-select-everything="true"]'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "選取本頁全部" }),
    ).not.toBeInTheDocument();
  });

  it("全選會排除隱藏的群組（上一個 change 測不到的就是這條）", async () => {
    const user = userEvent.setup();
    renderIt();
    await group(user);

    const hiddenRows = rowsOfGroup(0);
    const totalRows = document.querySelectorAll("tr[data-row-key]").length;

    // 隱藏第一組
    await user.click(
      document.querySelectorAll('[data-group-menu="true"]')[0] as HTMLElement,
    );
    const panel = document.querySelector(
      '[data-slot="popover-content"]',
    ) as HTMLElement;
    await user.click(within(panel).getByText("隱藏此群組"));
    await user.keyboard("{Escape}");

    // 全選：隱藏組的列一個都不該進來
    await user.click(
      within(
        document.querySelector('[data-select-everything="true"]') as HTMLElement,
      ).getByRole("checkbox"),
    );
    expect(selectedCount()).toBe(totalRows - hiddenRows);
  });

  it("沒有 allFilteredKeys 時全選退為「已載入的全部」", async () => {
    const user = userEvent.setup();
    // server adapter 給不出全部 key 的情境
    renderIt({ allFilteredKeys: undefined, initialPageSize: 4 });
    await group(user);

    const loaded = document.querySelectorAll("tr[data-row-key]").length;
    await user.click(
      within(
        document.querySelector('[data-select-everything="true"]') as HTMLElement,
      ).getByRole("checkbox"),
    );
    // 只選到畫得出來的那些，不假裝選到了全部
    expect(selectedCount()).toBe(loaded);
  });

  it("再點一次全選即取消全部", async () => {
    const user = userEvent.setup();
    renderIt();
    await group(user);
    const box = () =>
      within(
        document.querySelector('[data-select-everything="true"]') as HTMLElement,
      ).getByRole("checkbox");

    await user.click(box());
    expect(selectedCount()).toBeGreaterThan(0);
    await user.click(box());
    expect(
      screen.queryByText(/\(\d+\/\d+\)/),
    ).not.toBeInTheDocument();
  });
});

describe("選取跨頁保留", () => {
  it("在第一頁選幾列，換頁再回來仍然選著", async () => {
    const user = userEvent.setup();
    renderTable({ initialPageSize: 5 });

    const boxes = () => screen.getAllByRole("checkbox", { name: "選取此列" });
    await user.click(boxes()[0]);
    await user.click(boxes()[1]);
    expect(screen.getByText(/\(2\/\d+\)/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "下一頁" }));
    // 換頁後選取數不變（選的是 key，不是畫面上的位置）
    expect(screen.getByText(/\(2\/\d+\)/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "上一頁" }));
    expect(boxes()[0]).toHaveAttribute("aria-checked", "true");
    expect(boxes()[1]).toHaveAttribute("aria-checked", "true");
  });
});

describe("偏好的持久化契約", () => {
  const KEY = "console-table:pref";

  it("有 onPreferencesChange 時回報整包，且完全不寫 localStorage", async () => {
    const user = userEvent.setup();
    const onPreferencesChange = vi.fn();
    renderTable({ onPreferencesChange, storageKey: "pref" });

    await sortByMenu(user, "名稱");

    expect(onPreferencesChange).toHaveBeenCalled();
    const last = onPreferencesChange.mock.calls.at(-1)![0];
    // 整包，不是「改了哪一項」
    expect(last).toMatchObject({
      version: 1,
      sort: { columnId: "name", direction: "asc" },
    });
    expect(last).toHaveProperty("columnWidths");
    expect(last).toHaveProperty("hiddenColumns");
    expect(last).toHaveProperty("groupBy");
    // 兩者都給時以受控為準，不重複寫入
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("只有 storageKey 時仍寫 localStorage（既有行為不變）", async () => {
    const user = userEvent.setup();
    renderTable({ storageKey: "pref" });
    await sortByMenu(user, "名稱");

    const saved = JSON.parse(localStorage.getItem(KEY)!);
    expect(saved.version).toBe(1);
    expect(saved.sort).toEqual({ columnId: "name", direction: "asc" });
  });

  it("兩者都沒給就不持久化", async () => {
    const user = userEvent.setup();
    renderTable();
    await sortByMenu(user, "名稱");
    expect(localStorage.length).toBe(0);
  });

  it("版本不認得就整包忽略，回到預設", async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ version: 999, wrapLines: true, hiddenColumns: ["qty"] }),
    );
    renderTable({ storageKey: "pref" });
    // 整包丟掉 → 欄位沒有被隱藏
    expect(
      await screen.findByRole("columnheader", { name: /數量/ }),
    ).toBeInTheDocument();
  });

  it("沒有 version 的舊存檔一樣重置（語意漂移無法逐欄偵測）", async () => {
    localStorage.setItem(KEY, JSON.stringify({ hiddenColumns: ["qty"] }));
    renderTable({ storageKey: "pref" });
    expect(
      await screen.findByRole("columnheader", { name: /數量/ }),
    ).toBeInTheDocument();
  });

  it("groupBy 存得下也讀得回來（原本完全沒存）", async () => {
    const user = userEvent.setup();
    renderTable({ storageKey: "pref", pagination: "scroll" });
    await user.click(screen.getByRole("button", { name: /^分組/ }));
    const menu = document.querySelector(
      '[data-slot="popover-content"]',
    ) as HTMLElement;
    await user.click(within(menu).getByRole("button", { name: "類別" }));
    await user.keyboard("{Escape}");

    expect(JSON.parse(localStorage.getItem(KEY)!).groupBy).toBe("group");
  });

  it("偏好裡有已不存在的欄位就忽略該項，其餘仍套用", async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        version: 1,
        groupBy: "不存在的欄位",
        wrapLines: true,
      }),
    );
    renderTable({ storageKey: "pref", pagination: "scroll" });
    // groupBy 被忽略 → 沒有群組標題
    await waitFor(() =>
      expect(
        document.querySelectorAll("[data-slot=group-header]"),
      ).toHaveLength(0),
    );
    // 但 wrapLines 照常套用
    expect(JSON.parse(localStorage.getItem(KEY)!).wrapLines).toBe(true);
  });

  it("欄寬拖曳只回報一次，不是每一幀", async () => {
    const onPreferencesChange = vi.fn();
    renderTable({ onPreferencesChange });
    const before = onPreferencesChange.mock.calls.length;

    const handle = document.querySelector(
      '[role="separator"][aria-label^="調整"]',
    ) as HTMLElement;
    handle.setPointerCapture = () => {};
    handle.releasePointerCapture = () => {};
    act(() => {
      handle.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX: 0 }),
      );
    });
    // 拖過好幾個中間值
    for (const clientX of [20, 40, 60, 80]) {
      act(() => {
        handle.dispatchEvent(
          new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX }),
        );
      });
    }
    expect(onPreferencesChange.mock.calls.length).toBe(before);

    act(() => {
      handle.dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }),
      );
    });
    // 放開才提交一次
    expect(onPreferencesChange.mock.calls.length).toBe(before + 1);
  });
});

describe("結構化值的自訂編輯器", () => {
  type Range = { start: string; end: string | null };
  type RangeRow = { id: string; name: string; span: Range };
  const RANGE_ROWS: RangeRow[] = [
    { id: "s1", name: "甲", span: { start: "2026-08-12", end: null } },
    { id: "s2", name: "乙", span: { start: "2026-08-01", end: "2026-08-05" } },
  ];

  function rangeColumns(
    extra: Partial<ConsoleTableColumn<RangeRow>> = {},
  ): ConsoleTableColumn<RangeRow>[] {
    return [
      { id: "name", header: "名稱", cell: (r) => r.name },
      {
        id: "span",
        header: "期間",
        // 顯示端自由：那顆「📅 08/12」是 cell 畫的
        cell: (r) => <span>{r.span.start.slice(5).replace("-", "/")}</span>,
        editable: {
          type: "custom",
          getValue: (r) => r.span,
          renderEditor: ({
            value,
            onChange,
            onCommit,
          }: CellEditorContext<Range>) => (
            <div>
              <input
                aria-label="開始"
                value={value.start}
                onChange={(e) => onChange({ ...value, start: e.target.value })}
              />
              <input
                aria-label="結束日"
                value={value.end ?? ""}
                onChange={(e) =>
                  onChange({ ...value, end: e.target.value || null })
                }
              />
              <button type="button" onClick={() => onCommit()}>
                儲存
              </button>
            </div>
          ),
        },
        ...extra,
      } as ConsoleTableColumn<RangeRow>,
    ];
  }

  function RangeTable(
    props: Partial<React.ComponentProps<typeof ConsoleDataTable<RangeRow>>> & {
      columns?: ConsoleTableColumn<RangeRow>[];
    } = {},
  ) {
    const { columns = rangeColumns(), ...rest } = props;
    const [query, setQuery] = useState(() => createDefaultTableQuery(10));
    const result = useClientTableQuery(RANGE_ROWS, query, columns, (r) => r.id);
    return (
      <ConsoleDataTable
        title="期間測試"
        columns={columns}
        rowKey={(r) => r.id}
        query={query}
        onQueryChange={setQuery}
        {...result}
        {...rest}
      />
    );
  }

  const spanCell = () =>
    document.querySelector(
      'tr[data-row-key="s1"] td[data-column-id="span"]',
    ) as HTMLElement;

  it("編輯器收到的是結構化值，不是字串", async () => {
    const user = userEvent.setup();
    render(<RangeTable />);
    await user.dblClick(spanCell());

    // 值原樣進到編輯器：兩個欄位分別填著物件的兩個屬性
    expect(screen.getByLabelText("開始")).toHaveValue("2026-08-12");
    expect(screen.getByLabelText("結束日")).toHaveValue("");
  });

  it("送出時原樣回報結構化值，不經解析", async () => {
    const user = userEvent.setup();
    const onCellCommit = vi.fn();
    render(<RangeTable onCellCommit={onCellCommit} />);
    await user.dblClick(spanCell());

    await user.clear(screen.getByLabelText("結束日"));
    await user.type(screen.getByLabelText("結束日"), "2026-08-20");
    await user.click(screen.getByRole("button", { name: "儲存" }));

    expect(onCellCommit).toHaveBeenCalledTimes(1);
    const [row, columnId, value] = onCellCommit.mock.calls[0];
    expect(row.id).toBe("s1");
    expect(columnId).toBe("span");
    // 物件原樣送出——沒有被 String() 掉，也沒有被解析拒絕
    expect(value).toEqual({ start: "2026-08-12", end: "2026-08-20" });
  });

  it("取消不回報", async () => {
    const user = userEvent.setup();
    const onCellCommit = vi.fn();
    render(<RangeTable onCellCommit={onCellCommit} />);
    await user.dblClick(spanCell());
    await user.type(screen.getByLabelText("開始"), "x");
    await user.keyboard("{Escape}");
    expect(onCellCommit).not.toHaveBeenCalled();
  });

  it("editorWidth: wide 的浮層比預設寬", async () => {
    const user = userEvent.setup();
    render(<RangeTable />);
    await user.dblClick(spanCell());
    const defaultWidth = (
      document.querySelector('[data-slot="popover-content"]') as HTMLElement
    ).className;
    expect(defaultWidth).toContain("w-64");
    cleanup();

    const wide = rangeColumns();
    (wide[1].editable as { editorWidth?: string }).editorWidth = "wide";
    render(<RangeTable columns={wide} />);
    await user.dblClick(spanCell());
    expect(
      (document.querySelector('[data-slot="popover-content"]') as HTMLElement)
        .className,
    ).toContain("w-96");
  });

  it("內建型別的解析行為完全不變", async () => {
    const user = userEvent.setup();
    const onCellCommit = vi.fn();
    renderEditTable({ onCellCommit });

    await user.dblClick(editCell(0, 1)); // 數量（number）
    const input = screen.getByRole("textbox", { name: "編輯值" });
    await user.clear(input);
    await user.type(input, "1,234{Enter}");
    expect(onCellCommit).toHaveBeenCalledWith(
      expect.objectContaining({ id: "e1" }),
      "qty",
      1234,
    );
  });
});

describe("貼上仍然走解析（輸入確實是文字）", () => {
  it("有自帶編輯器的欄位，貼上時照樣依型別解析", async () => {
    const user = userEvent.setup();
    const onCellsCommit = vi.fn();
    // qty 是 number，但額外給一個自帶編輯器
    const columns = editColumns().map((c) =>
      c.id === "qty"
        ? ({
            ...c,
            editable: {
              type: "number",
              getValue: (r: EditRow) => r.qty as number | null,
              renderEditor: ({ value }: { value: string }) => (
                <span>自訂 {value}</span>
              ),
            },
          } as ConsoleTableColumn<EditRow>)
        : c,
    );
    renderEditTable({ columns, onCellsCommit });

    await user.click(editCell(0, 1));
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { getData: () => "1,234", setData: () => {} },
    });
    act(() => {
      editCell(0, 1).dispatchEvent(event);
    });

    // 剪貼簿來的是文字 → 解析成數字，與怎麼手動編輯無關
    expect(onCellsCommit.mock.calls[0][0][0].value).toBe(1234);
  });
});

describe("自動儲存的編輯器（回報但不關閉）", () => {
  type Log = { date: string; hours: number };
  type LogRow = { id: string; name: string; logs: Log[] };
  const LOG_ROWS: LogRow[] = [
    { id: "l1", name: "甲", logs: [{ date: "2026-08-01", hours: 1 }] },
    { id: "l2", name: "乙", logs: [] },
  ];

  /**
   * 開關就落在使用端的編輯器裡：`autoSave` 走 onSave（回報但不關閉），
   * 否則走 onChange ＋ 最後 onCommit。同一個編輯器服務兩種系統。
   */
  function logColumns(autoSave: boolean): ConsoleTableColumn<LogRow>[] {
    return [
      { id: "name", header: "名稱", cell: (r) => r.name },
      {
        id: "logs",
        header: "工時",
        cell: (r) => <span>{r.logs.length} 筆</span>,
        editable: {
          type: "custom",
          getValue: (r) => r.logs,
          renderEditor: ({
            value,
            onChange,
            onSave,
            onCommit,
          }: CellEditorContext<Log[]>) => {
            const write = autoSave ? onSave : onChange;
            return (
              <div>
                <button
                  type="button"
                  onClick={() =>
                    write([...value, { date: "2026-08-09", hours: 2 }])
                  }
                >
                  新增一筆
                </button>
                {/* 一律只改草稿——模擬 debounce 還沒到期的那段時間 */}
                <button
                  type="button"
                  onClick={() =>
                    onChange([...value, { date: "2026-08-10", hours: 3 }])
                  }
                >
                  只改草稿
                </button>
                <button type="button" onClick={() => onCommit()}>
                  關閉
                </button>
              </div>
            );
          },
        },
      } as ConsoleTableColumn<LogRow>,
    ];
  }

  function LogTable({
    autoSave = true,
    ...rest
  }: { autoSave?: boolean } & Partial<
    React.ComponentProps<typeof ConsoleDataTable<LogRow>>
  >) {
    const columns = logColumns(autoSave);
    const [query, setQuery] = useState(() => createDefaultTableQuery(10));
    const result = useClientTableQuery(LOG_ROWS, query, columns, (r) => r.id);
    return (
      <ConsoleDataTable
        title="工時測試"
        columns={columns}
        rowKey={(r) => r.id}
        query={query}
        onQueryChange={setQuery}
        {...result}
        {...rest}
      />
    );
  }

  const logCell = () =>
    document.querySelector(
      'tr[data-row-key="l1"] td[data-column-id="logs"]',
    ) as HTMLElement;
  const editorOpen = () =>
    !!document.querySelector('[data-slot="popover-content"]');
  const add = () => screen.getByRole("button", { name: "新增一筆" });

  it("onSave 回報之後編輯器留著，連續多次都回報", async () => {
    const user = userEvent.setup();
    const onCellCommit = vi.fn();
    render(<LogTable onCellCommit={onCellCommit} />);
    await user.dblClick(logCell());

    await user.click(add());
    expect(editorOpen()).toBe(true);
    await user.click(add());
    expect(editorOpen()).toBe(true);

    expect(onCellCommit).toHaveBeenCalledTimes(2);
    // 草稿跟著走：第二次是在第一次的結果上再加一筆
    expect((onCellCommit.mock.calls[0][2] as Log[]).length).toBe(2);
    expect((onCellCommit.mock.calls[1][2] as Log[]).length).toBe(3);
  });

  it("已存過而草稿沒再動時，關閉不重複回報", async () => {
    const user = userEvent.setup();
    const onCellCommit = vi.fn();
    render(<LogTable onCellCommit={onCellCommit} />);
    await user.dblClick(logCell());

    await user.click(add());
    await user.click(screen.getByRole("button", { name: "關閉" }));

    expect(editorOpen()).toBe(false);
    expect(onCellCommit).toHaveBeenCalledTimes(1);
  });

  it("存過之後草稿又動過，關閉時補送最新草稿", async () => {
    const user = userEvent.setup();
    const onCellCommit = vi.fn();
    render(<LogTable onCellCommit={onCellCommit} />);
    await user.dblClick(logCell());

    await user.click(add()); // 存過一次（2 筆）
    await user.click(screen.getByRole("button", { name: "只改草稿" })); // 3 筆，還沒存
    await user.click(screen.getByRole("button", { name: "關閉" }));

    // 關閉時補送——那正是 debounce 還沒到期就被關掉時的 flush
    expect(onCellCommit).toHaveBeenCalledTimes(2);
    expect((onCellCommit.mock.calls[1][2] as Log[]).length).toBe(3);
  });

  it("存過之後按 Esc 只關閉，不再回報", async () => {
    const user = userEvent.setup();
    const onCellCommit = vi.fn();
    render(<LogTable onCellCommit={onCellCommit} />);
    await user.dblClick(logCell());

    await user.click(add());
    await user.keyboard("{Escape}");

    expect(editorOpen()).toBe(false);
    expect(onCellCommit).toHaveBeenCalledTimes(1);
  });

  it("同一格重開、這次沒存過就按 Esc，照舊丟掉草稿不回報", async () => {
    const user = userEvent.setup();
    const onCellCommit = vi.fn();
    render(<LogTable onCellCommit={onCellCommit} />);

    // 第一次：存過一次
    await user.dblClick(logCell());
    await user.click(add());
    await user.keyboard("{Escape}");
    expect(onCellCommit).toHaveBeenCalledTimes(1);

    // 第二次：開起來看看就走——語意跟著這一次編輯，不跟著欄位
    await user.dblClick(logCell());
    await user.keyboard("{Escape}");
    expect(onCellCommit).toHaveBeenCalledTimes(1);
  });

  it("沒用 onSave 的編輯器行為完全不變", async () => {
    const user = userEvent.setup();
    const onCellCommit = vi.fn();
    render(<LogTable autoSave={false} onCellCommit={onCellCommit} />);
    await user.dblClick(logCell());

    // 改草稿不回報，浮層留著
    await user.click(add());
    expect(onCellCommit).not.toHaveBeenCalled();
    expect(editorOpen()).toBe(true);

    // 送出才回報，並關閉
    await user.click(screen.getByRole("button", { name: "關閉" }));
    expect(onCellCommit).toHaveBeenCalledTimes(1);
    expect(editorOpen()).toBe(false);
  });
});

describe("欄寬拖曳：命中區與首次拖曳的快照", () => {
  // 「每組都有把手」與「任一組都拖得動」在「分組」那組測試裡（見
  // 「每一組的欄名列都有欄寬把手」「分組時欄名列在 tbody…」），這裡只補
  // 那兩個沒蓋到的：命中區的幾何，以及切到 table-fixed 前的寬度快照。
  function GroupedTable() {
    const [query, setQuery] = useState(() => ({
      ...createDefaultTableQuery(30),
      groupBy: "group" as string | null,
    }));
    const { hasMore, loadMore, ...result } = useProgressiveTableQuery(
      ROWS,
      query,
      COLUMNS,
      rowKeyOf,
    );
    return (
      <ConsoleDataTable
        title="測試表格"
        columns={COLUMNS}
        rowKey={rowKeyOf}
        query={query}
        onQueryChange={setQuery}
        pagination="scroll"
        hasMore={hasMore}
        onLoadMore={loadMore}
        {...result}
      />
    );
  }

  const firstGroupColumnRow = () =>
    document.querySelector('[data-slot="group-columns"]') as HTMLElement;

  it("命中區跨在分隔線兩側、比線寬得多，並蓋得過隔壁欄名格", () => {
    render(<GroupedTable />);
    const handle = within(firstGroupColumnRow()).getByLabelText(
      "調整名稱欄寬",
    );
    // 這裡只驗幾何是由哪些 class 決定的。命中區實際上有多大、跨不跨得過
    // 欄位邊界，量在 resize-handle.layout.test.tsx（真瀏覽器）。
    const className = handle.className;
    expect(className).toContain("w-4"); // 線只有 0.5px，命中區 16px
    expect(className).toContain("-right-1"); // 往線的右邊越界
    expect(className).toContain("-inset-y-1"); // 矮的欄名列上下也多給
    expect(className).toContain("z-20"); // 越界的部分要蓋在隔壁格之上
    expect(className).toContain("cursor-col-resize");
  });

  it("第一次拖曳會快照每一欄當下的寬度，其他欄不跳動", () => {
    render(<GroupedTable />);
    const row = firstGroupColumnRow();
    const cells = [
      ...row.querySelectorAll("td[data-column-id]"),
    ] as HTMLElement[];
    // jsdom 沒有版面，手動餵三欄各不相同的寬度，且都不是 fallback 的 120
    cells.forEach((cell, i) =>
      Object.defineProperty(cell, "offsetWidth", {
        value: [200, 90, 150][i],
        configurable: true,
      }),
    );

    const handle = within(row).getByLabelText("調整名稱欄寬");
    fireEvent.pointerDown(handle, { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 30 });
    fireEvent.pointerUp(handle, { clientX: 30 });

    const cols = [...document.querySelectorAll("colgroup col")] as HTMLElement[];
    // 被拖的那欄照拖曳結果；沒被碰的「類別」保留切換前的寬度，不會因為
    // 切成 table-fixed 而掉到 120
    expect(cols[1].style.width).toBe("230px");
    expect(cols[2].style.width).toBe("90px");
  });
});

describe("列的分隔：橫線兩種模式都有，縱線只有捲動版", () => {
  const dataRows = () =>
    [...document.querySelectorAll("tbody tr[data-row-key]")] as HTMLElement[];

  it("分頁模式每一列之間有橫線", () => {
    renderTable();
    // 一筆一筆之間要分得開——這在唯讀的分頁版尤其重要，那裡沒有任何
    // 互動線索可以幫忙界定一列到哪裡結束
    for (const row of dataRows()) expect(row.className).toContain("border-b");
  });

  it("分頁模式不把列切成格子：儲存格之間沒有縱線", () => {
    renderTable();
    const cells = dataRows()[0].querySelectorAll("td");
    for (const cell of cells)
      expect((cell as HTMLElement).className).not.toContain("border-r");
  });

  it("捲動模式才畫縱線，且最後一欄不畫（外框感的來源）", () => {
    render(<TestTable pagination="scroll" initialPageSize={30} />);
    const cells = [...dataRows()[0].querySelectorAll("td")] as HTMLElement[];
    // 前導欄與中間各欄都有，最後一欄沒有
    expect(cells[0].className).toContain("border-r");
    expect(cells[cells.length - 1].className).not.toContain("border-r");
  });

  it("新增子項目那條是一整條，沒有縱線，但橫線仍在", async () => {
    const user = userEvent.setup();
    render(
      <TestTable
        pagination="scroll"
        initialPageSize={30}
        subRowOf={() => null}
        onAddSubRow={() => {}}
      />,
    );
    // 沒有子項目的列要先展開才看得到那條
    await user.click(
      document.querySelectorAll('[data-disclosure="true"]')[0] as HTMLElement,
    );
    const addRow = document.querySelector(
      '[data-slot="add-sub-row"]',
    ) as HTMLElement;
    const cells = addRow.querySelectorAll("td");
    // 它是一個動作而不是一筆資料：整列一格
    expect(cells).toHaveLength(1);
    expect(cells[0].getAttribute("colspan")).not.toBeNull();
    expect((cells[0] as HTMLElement).className).not.toContain("border-r");
    // 橫線仍然畫——動作列一樣要跟後面的東西分開
    expect(addRow.className).toContain("border-b");
  });

  it("群組的新增列同樣是一整條", async () => {
    const user = userEvent.setup();
    renderTable({
      pagination: "scroll",
      initialPageSize: 30,
      onAddRowToGroup: () => {},
    });
    await user.click(screen.getByRole("button", { name: "分組" }));
    const menu = document.querySelector(
      '[data-slot="popover-content"]',
    ) as HTMLElement;
    await user.click(within(menu).getByRole("button", { name: "類別" }));
    await user.keyboard("{Escape}");

    const addRow = document.querySelector(
      '[data-slot="group-add-row"]',
    ) as HTMLElement;
    const cells = addRow.querySelectorAll("td");
    expect(cells).toHaveLength(1);
    expect((cells[0] as HTMLElement).className).not.toContain("border-r");
    expect(addRow.className).toContain("border-b");
  });
});

describe("欄位自己宣告統計值", () => {
  type LogRow = {
    id: string;
    group: string;
    label: string;
    logs: { hours: number }[] | null;
    qty: number;
  };
  const LOG_ROWS: LogRow[] = [
    { id: "a1", group: "甲", label: "一", logs: [{ hours: 3.5 }, { hours: 4 }], qty: 2 },
    { id: "a2", group: "甲", label: "二", logs: [{ hours: 0.5 }], qty: 3 },
    // 沒有紀錄——貢獻「沒有」，不是 0
    { id: "b1", group: "乙", label: "三", logs: null, qty: 4 },
  ];

  const totalHours = (logs: LogRow["logs"]) =>
    (logs ?? []).reduce((sum, log) => sum + log.hours, 0);

  function logColumns(
    extra: Partial<ConsoleTableColumn<LogRow>> = {},
  ): ConsoleTableColumn<LogRow>[] {
    return [
      { id: "label", header: "名稱", cell: (r) => r.label, filterValue: (r) => r.label },
      { id: "group", header: "類別", cell: (r) => r.group, filterValue: (r) => r.group },
      {
        id: "qty",
        header: "數量",
        cell: (r) => r.qty,
        editable: { type: "number", getValue: (r) => r.qty },
      },
      {
        // 值是一串紀錄，型別說不出「加得起來」——所以直接宣告怎麼取。
        // 而且這一欄**完全沒有 editable**，純顯示也要加得了總。
        id: "logs",
        header: "工時",
        cell: (r) => (r.logs ? `${totalHours(r.logs)}h` : "—"),
        aggregateValue: (r) => (r.logs ? totalHours(r.logs) : null),
        ...extra,
      } as ConsoleTableColumn<LogRow>,
    ];
  }

  function LogTable({
    columns = logColumns(),
  }: { columns?: ConsoleTableColumn<LogRow>[] } = {}) {
    const [query, setQuery] = useState(() => ({
      ...createDefaultTableQuery(30),
      groupBy: "group" as string | null,
    }));
    const { hasMore, loadMore, ...result } = useProgressiveTableQuery(
      LOG_ROWS,
      query,
      columns,
      (r) => r.id,
    );
    return (
      <ConsoleDataTable
        title="工時"
        columns={columns}
        rowKey={(r) => r.id}
        query={query}
        onQueryChange={setQuery}
        pagination="scroll"
        hasMore={hasMore}
        onLoadMore={loadMore}
        {...result}
      />
    );
  }

  /** 開偏好面板，把某一欄的統計設成某個值，確認套用。 */
  async function chooseAggregate(
    user: ReturnType<typeof userEvent.setup>,
    header: string,
    label: string,
  ) {
    await user.click(screen.getByRole("button", { name: "偏好設定" }));
    const select = screen.getByLabelText(`${header}的每組統計`);
    await user.selectOptions(select, label);
    await user.click(screen.getByRole("button", { name: "確認" }));
  }

  const optionsOf = (header: string) =>
    [...screen.getByLabelText(`${header}的每組統計`).querySelectorAll("option")]
      .map((o) => o.textContent);

  it("宣告了 aggregateValue 的欄位，選單就有「總和」——即使它沒有 editable", async () => {
    const user = userEvent.setup();
    render(<LogTable />);
    await user.click(screen.getByRole("button", { name: "偏好設定" }));
    expect(optionsOf("工時")).toEqual(["無", "筆數", "總和"]);
  });

  it("沒宣告、也不是數字的欄位仍然只有「無」與「筆數」", async () => {
    const user = userEvent.setup();
    render(<LogTable />);
    await user.click(screen.getByRole("button", { name: "偏好設定" }));
    expect(optionsOf("名稱")).toEqual(["無", "筆數"]);
  });

  it("總和是逐列取值相加，且不外露浮點誤差", async () => {
    const user = userEvent.setup();
    render(<LogTable />);
    await chooseAggregate(user, "工時", "總和");

    // 甲組：3.5 + 4 + 0.5 = 8（相加的浮點痕跡收掉了）
    expect(screen.getByText("8")).toBeInTheDocument();

    // 設定選的是「總和」，顯示出來的是「SUM」——兩套說法是刻意的
    const row = document.querySelector(
      '[data-slot="group-aggregates"]',
    ) as HTMLElement;
    expect(row.textContent).toContain("SUM");
    expect(row.textContent).not.toContain("總和");
  });

  it("回傳 null 的列不貢獻，也不被當成 0", async () => {
    const user = userEvent.setup();
    render(<LogTable />);
    await chooseAggregate(user, "工時", "總和");

    // 乙組只有一列且它沒有紀錄 → 總和是 0（沒有任何值可加），不是 NaN
    const sums = [...document.querySelectorAll("tbody .tabular-nums")].map(
      (el) => el.textContent,
    );
    expect(sums).not.toContain("NaN");
  });

  it("formatAggregate 有給就照它寫", async () => {
    const user = userEvent.setup();
    render(
      <LogTable
        columns={logColumns({
          formatAggregate: (total: number) => `${total}h`,
        } as Partial<ConsoleTableColumn<LogRow>>)}
      />,
    );
    await chooseAggregate(user, "工時", "總和");
    expect(screen.getByText("8h")).toBeInTheDocument();
  });

  it("內建數字欄的總和行為完全不變", async () => {
    const user = userEvent.setup();
    render(<LogTable />);
    await chooseAggregate(user, "數量", "總和");
    // 甲組：2 + 3 = 5
    expect(screen.getByText("5")).toBeInTheDocument();
  });
});

describe("窄欄裡的標籤縮成省略號，不是被切斷", () => {
  const statusBadge = () =>
    editCell(0, 3).querySelector('[data-slot="badge"]') as HTMLElement;

  // 這一組驗的是「哪些 class 該在」。標籤實際上會不會縮、文字有沒有被截斷，
  // 量在 cell-display.layout.test.tsx（真瀏覽器）。
  it("標籤准許變窄——Badge 平常的 shrink-0 在欄位裡是錯的", () => {
    renderEditTable();
    const badge = statusBadge();
    expect(badge.className).toContain("min-w-0");
    expect(badge.className).toContain("max-w-full");
    // shrink-0 必須被蓋掉，否則盒子根本不縮，字只會被 overflow-hidden 切掉
    expect(badge.className).not.toContain("shrink-0");
  });

  it("文字自己截斷，藥丸的形狀留著", () => {
    renderEditTable();
    const badge = statusBadge();
    const label = badge.querySelector("span") as HTMLElement;
    // min-w-0 是關鍵：flex 子元素的預設最小寬度是內容寬度，少了它 truncate
    // 不會生效
    expect(label.className).toContain("min-w-0");
    expect(label.className).toContain("truncate");
    // 圓角與內距不變——被切一半的藥丸就不再讀起來像一顆標籤
    expect(badge.className).toContain("rounded-4xl");
    expect(badge.className).toContain("px-2");
  });

  it("自由色碼那條路一樣縮得動", () => {
    const columns = editColumns().map((c) =>
      c.id === "status" && c.editable
        ? ({
            ...c,
            editable: {
              ...c.editable,
              options: [{ value: "待修繕", color: "#16a34a" }],
            },
          } as ConsoleTableColumn<EditRow>)
        : c,
    );
    renderEditTable({ columns });
    const badge = statusBadge();
    expect(badge.className).toContain("min-w-0");
    expect(badge.querySelector("span")!.className).toContain("truncate");
  });

  it("不上色的 select 是純文字，本來就正常縮——不該被包成標籤", () => {
    const columns = editColumns().map((c) =>
      c.id === "status" && c.editable
        ? ({
            ...c,
            editable: {
              ...c.editable,
              options: [{ value: "待修繕" }],
              colored: false,
            },
          } as ConsoleTableColumn<EditRow>)
        : c,
    );
    renderEditTable({ columns });
    expect(editCell(0, 3).querySelector('[data-slot="badge"]')).toBeNull();
    expect(editCell(0, 3).textContent).toContain("待修繕");
  });

  it("被截斷的內容停留看得到全文——select 的儲存格也有 title", () => {
    renderEditTable();
    expect(editCell(0, 3)).toHaveAttribute("title", "待修繕");
  });

  it("空值的儲存格不掛一個空的 title", () => {
    const columns = editColumns().map((c) =>
      c.id === "status" && c.editable
        ? ({ ...c, editable: { ...c.editable, getValue: () => null } } as ConsoleTableColumn<EditRow>)
        : c,
    );
    renderEditTable({ columns });
    expect(editCell(0, 3)).not.toHaveAttribute("title");
  });
});

describe("疏密與撐滿高度", () => {
  const headCell = () =>
    document.querySelector('thead th[data-column-id="name"]') as HTMLElement;
  const bodyCell = () =>
    document.querySelector('tbody td[data-column-id="name"]') as HTMLElement;
  const container = () =>
    document.querySelector('[data-slot="table-container"]') as HTMLElement;

  it("預設不加任何疏密的 class", () => {
    renderTable();
    expect(bodyCell().className).not.toContain("py-1");
    expect(headCell().className).not.toContain("h-8");
  });

  it("compact 只縮直向內距，不動字級", () => {
    renderTable({ density: "compact" });
    expect(bodyCell().className).toContain("py-1");
    expect(headCell().className).toContain("h-8");
    // 字級不變——縮字會讓一張本來就密的表更難讀
    expect(bodyCell().className).not.toContain("text-xs");
  });

  it("fillHeight 把高度交給 flex，捲動落在容器那一層", () => {
    renderTable({ fillHeight: true });
    // 高度必須在捲動容器上：sticky 表頭是對最近的捲動祖先定位的
    expect(container().className).toContain("overflow-auto");
    expect(container().className).toContain("flex-1");
    expect(container().className).toContain("min-h-0");
  });

  it("沒開 fillHeight 時維持固定的高度上限", () => {
    renderTable();
    expect(container().className).not.toContain("flex-1");
  });

  it("標題吃得下 ReactNode，不只是字串", () => {
    renderTable({
      title: (
        <span>
          <span data-testid="title-icon">◆</span> 缺失
        </span>
      ),
    });
    expect(screen.getByTestId("title-icon")).toBeInTheDocument();
    expect(screen.getByRole("heading")).toHaveTextContent("缺失");
  });
});

describe("日期區間篩選", () => {
  /** 到期日欄：一列逾期、一列很遠、一列沒有日期。 */
  const DATE_COLUMNS: ConsoleTableColumn<Row>[] = [
    ...COLUMNS,
    {
      id: "due",
      header: "到期",
      dateFilterValue: (row) =>
        row.id === "r1" ? "2020-01-01" : row.id === "r2" ? "2999-12-31" : "",
      cell: (row) => row.id,
    },
  ];

  const openFilterMenu = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("button", { name: "篩選" }));
  };

  it("日期欄出現在可篩選欄位裡，即使它沒有任何選項值", async () => {
    const user = userEvent.setup();
    renderTable({ columns: DATE_COLUMNS });
    await openFilterMenu(user);
    expect(screen.getByRole("button", { name: /到期/ })).toBeInTheDocument();
  });

  it("選的是區間，不是資料裡出現過的日期", async () => {
    const user = userEvent.setup();
    renderTable({ columns: DATE_COLUMNS });
    await openFilterMenu(user);
    await user.click(screen.getByRole("button", { name: /到期/ }));

    // 一份每天一個選項的清單對到期日毫無用處——這裡給的是區間
    expect(document.querySelector("[data-date-bucket=today]")).toBeTruthy();
    expect(document.querySelector("[data-date-bucket=overdue]")).toBeTruthy();
    expect(screen.getByLabelText("起")).toBeInTheDocument();
    expect(screen.getByLabelText("訖")).toBeInTheDocument();
  });

  it("選了區間就只留區間內的列", async () => {
    const user = userEvent.setup();
    renderTable({ columns: DATE_COLUMNS, initialPageSize: 30 });
    await openFilterMenu(user);
    await user.click(screen.getByRole("button", { name: /到期/ }));
    await user.click(
      document.querySelector("[data-date-bucket=overdue]") as HTMLElement,
    );

    const body = document.querySelector("tbody")!;
    expect(within(body).getAllByRole("row")).toHaveLength(1);
  });

  it("chip 顯示區間的名稱，不顯示它今天解析成什麼", async () => {
    const user = userEvent.setup();
    renderTable({ columns: DATE_COLUMNS, initialPageSize: 30 });
    await openFilterMenu(user);
    await user.click(screen.getByRole("button", { name: /到期/ }));
    await user.click(
      document.querySelector("[data-date-bucket=overdue]") as HTMLElement,
    );
    await user.keyboard("{Escape}");

    // 顯示解析後的日期會讓人以為那是固定的
    expect(screen.getByText(/到期：逾期/)).toBeInTheDocument();
  });

  it("同一個區間再選一次就取消，而且不留下空的 chip", async () => {
    const user = userEvent.setup();
    renderTable({ columns: DATE_COLUMNS, initialPageSize: 30 });
    await openFilterMenu(user);
    await user.click(screen.getByRole("button", { name: /到期/ }));
    const overdue = () =>
      document.querySelector("[data-date-bucket=overdue]") as HTMLElement;
    await user.click(overdue());
    await user.click(overdue());
    await user.keyboard("{Escape}");

    expect(screen.queryByText(/到期：/)).not.toBeInTheDocument();
    expect(within(document.querySelector("tbody")!).getAllByRole("row")).toHaveLength(12);
  });

  it("區間是單選——換一個就取代，不是兩個聯集", async () => {
    const user = userEvent.setup();
    renderTable({ columns: DATE_COLUMNS, initialPageSize: 30 });
    await openFilterMenu(user);
    await user.click(screen.getByRole("button", { name: /到期/ }));
    await user.click(
      document.querySelector("[data-date-bucket=overdue]") as HTMLElement,
    );
    await user.click(
      document.querySelector("[data-date-bucket=future]") as HTMLElement,
    );
    await user.keyboard("{Escape}");

    expect(screen.getByText(/到期：未來/)).toBeInTheDocument();
    expect(screen.queryByText(/逾期/)).not.toBeInTheDocument();
  });
});
