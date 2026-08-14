import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import {
  ConsoleDataTable,
  createDefaultTableQuery,
  type ConsoleTableColumn,
  type TableQuery,
} from "./console-data-table";
import {
  useChunkedTableQuery,
  type TablePageRequest,
  type TablePageResponse,
} from "./use-chunked-table-query";

type Row = { id: string; name: string; group: string };

const ALL: Row[] = Array.from({ length: 25 }, (_, i) => ({
  id: `r${i + 1}`,
  name: `n${String(i + 1).padStart(2, "0")}`,
  group: i % 2 === 0 ? "甲" : "乙",
}));

const COLUMNS: ConsoleTableColumn<Row>[] = [
  { id: "name", header: "名稱", cell: (r) => r.name, filterValue: (r) => r.name },
  { id: "group", header: "類別", cell: (r) => r.group, filterValue: (r) => r.group },
];

const CHUNK = 10;

/**
 * 假後端：以 offset 當游標切塊。`extra` 用來模擬後端提供／不提供各種
 * 中繼資料（totalCount、groupCounts…）。
 */
function makeFetcher(
  extra: Partial<TablePageResponse<Row>> = {},
  onCall?: (req: TablePageRequest) => void,
) {
  return vi.fn(async (req: TablePageRequest) => {
    onCall?.(req);
    const offset = req.cursor ? Number(req.cursor) : 0;
    // 依 query.search 過濾，證明查詢狀態確實有傳到後端
    const matched = req.query.search
      ? ALL.filter((r) => r.name.includes(req.query.search))
      : ALL;
    const rows = matched.slice(offset, offset + CHUNK);
    const next = offset + CHUNK;
    return {
      rows,
      cursor: next < matched.length ? String(next) : null,
      ...extra,
    } satisfies TablePageResponse<Row>;
  });
}

function ChunkedTable({
  fetchPage,
}: {
  fetchPage: (req: TablePageRequest) => Promise<TablePageResponse<Row>>;
}) {
  const [query, setQuery] = useState<TableQuery>(() =>
    createDefaultTableQuery(CHUNK),
  );
  const {
    rows,
    totalCount,
    hasTotalCount,
    hasMore,
    loadMore,
    loading,
    loadingMore,
    groupValues,
    groupCounts,
    allFilteredKeys,
  } = useChunkedTableQuery(query, fetchPage, COLUMNS);
  return (
    <ConsoleDataTable
      title="測試表格"
      columns={COLUMNS}
      rows={rows}
      totalCount={hasTotalCount ? totalCount : rows.length}
      groupValues={groupValues}
      groupCounts={groupCounts}
      allFilteredKeys={allFilteredKeys}
      query={query}
      onQueryChange={setQuery}
      rowKey={(r) => r.id}
      pagination="scroll"
      loading={loading}
      hasMore={hasMore}
      onLoadMore={loadMore}
      loadingMore={loadingMore}
    />
  );
}

function dataRowCount() {
  return document.querySelectorAll(
    'tbody tr:not([data-slot="group-header"]):not([data-slot="skeleton-row"])',
  ).length;
}

afterEach(cleanup);

describe("useChunkedTableQuery", () => {
  it("首次載入取第一塊，載入更多會追加", async () => {
    const user = userEvent.setup();
    const fetchPage = makeFetcher();
    render(<ChunkedTable fetchPage={fetchPage} />);

    await waitFor(() => expect(dataRowCount()).toBe(10));
    expect(fetchPage.mock.calls[0][0].cursor).toBeNull();

    await user.click(screen.getByRole("button", { name: "載入更多" }));
    await waitFor(() => expect(dataRowCount()).toBe(20));
    expect(fetchPage.mock.calls[1][0].cursor).toBe("10");
  });

  it("cursor 為 null 時停止，載入更多消失", async () => {
    const user = userEvent.setup();
    render(<ChunkedTable fetchPage={makeFetcher()} />);
    await waitFor(() => expect(dataRowCount()).toBe(10));

    await user.click(screen.getByRole("button", { name: "載入更多" }));
    await waitFor(() => expect(dataRowCount()).toBe(20));
    await user.click(screen.getByRole("button", { name: "載入更多" }));
    await waitFor(() => expect(dataRowCount()).toBe(25));

    expect(
      screen.queryByRole("button", { name: "載入更多" }),
    ).not.toBeInTheDocument();
  });

  it("query 變動時丟棄累積列並自第一塊重取", async () => {
    const user = userEvent.setup();
    const requests: TablePageRequest[] = [];
    const fetchPage = makeFetcher({}, (req) => requests.push(req));
    render(<ChunkedTable fetchPage={fetchPage} />);
    await waitFor(() => expect(dataRowCount()).toBe(10));
    await user.click(screen.getByRole("button", { name: "載入更多" }));
    await waitFor(() => expect(dataRowCount()).toBe(20));

    await user.type(screen.getByPlaceholderText("以屬性或值篩選"), "n1");
    // n1、n10-n19 共 11 筆 → 第一塊 10 筆，且查詢字串有送到後端
    await waitFor(() => expect(dataRowCount()).toBe(10));
    const last = requests[requests.length - 1];
    expect(last.cursor).toBeNull();
    expect(last.query.search).toBe("n1");
  });

  it("載入中不重複請求同一塊", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const base = makeFetcher();
    const fetchPage = vi.fn(async (req: TablePageRequest) => {
      const result = await base(req);
      if (req.cursor !== null) await gate; // 卡住「載入更多」那一次
      return result;
    });

    render(<ChunkedTable fetchPage={fetchPage} />);
    await waitFor(() => expect(dataRowCount()).toBe(10));

    const button = screen.getByRole("button", { name: /載入/ });
    await user.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    // 卡住期間再觸發也不會多發請求（停用的按鈕直接派事件驗證）
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(fetchPage).toHaveBeenCalledTimes(2);

    release();
    await waitFor(() => expect(dataRowCount()).toBe(20));
  });
});

describe("後端中繼資料缺席時的降級", () => {
  it("沒有 totalCount 時標題顯示已載入筆數而非錯的總數", async () => {
    render(<ChunkedTable fetchPage={makeFetcher()} />);
    await waitFor(() => expect(dataRowCount()).toBe(10));
    expect(screen.getByText("(10)")).toBeInTheDocument();
  });

  it("有 totalCount 時標題顯示總數", async () => {
    render(<ChunkedTable fetchPage={makeFetcher({ totalCount: 25 })} />);
    await waitFor(() => expect(dataRowCount()).toBe(10));
    expect(screen.getByText("(25)")).toBeInTheDocument();
  });

  it("沒有 allFilteredKeys 時全選僅限已載入列", async () => {
    const user = userEvent.setup();
    render(<ChunkedTable fetchPage={makeFetcher({ totalCount: 25 })} />);
    await waitFor(() => expect(dataRowCount()).toBe(10));

    await user.click(screen.getByRole("checkbox", { name: "選取本頁全部" }));
    expect(screen.getByText("(10/25)")).toBeInTheDocument();
    expect(screen.queryByText(/選取全部/)).not.toBeInTheDocument();
  });

  it("沒有 groupCounts 時群組標題省略筆數", async () => {
    const user = userEvent.setup();
    render(<ChunkedTable fetchPage={makeFetcher({ filterOptions: { group: ["甲", "乙"] } })} />);
    await waitFor(() => expect(dataRowCount()).toBe(10));

    await user.click(screen.getByRole("button", { name: "分組" }));
    const menu = document.querySelector(
      '[data-slot="popover-content"]',
    ) as HTMLElement;
    await user.click(
      [...menu.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "類別",
      )!,
    );
    await user.keyboard("{Escape}");

    const headers = [
      ...document.querySelectorAll('[data-slot="group-header"]'),
    ].map((el) => el.textContent ?? "");
    expect(headers.length).toBeGreaterThan(0);
    expect(headers.every((t) => !t.includes("筆）"))).toBe(true);
  });
});
