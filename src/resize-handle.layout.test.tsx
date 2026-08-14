import { render } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import {
  ConsoleDataTable,
  createDefaultTableQuery,
  type ConsoleTableColumn,
} from "./console-data-table";
import { useProgressiveTableQuery } from "./use-progressive-table-query";

/**
 * 欄寬把手的命中區。
 *
 * spec 說它要「跨在分隔線兩側，而且比線本身大得多」，理由是只鋪在線左邊的
 * 話，瞄準線本身或線右邊一兩 px 就落到下一格、按下去毫無反應。
 *
 * jsdom 對這件事只能回答「class 在不在」。命中區有多大、跨不跨得過邊界，是
 * 量出來的。
 */

type Row = { id: string; a: string; b: string };
const ROWS: Row[] = [{ id: "r1", a: "甲", b: "乙" }];
const COLUMNS: ConsoleTableColumn<Row>[] = [
  { id: "a", header: "第一欄", cell: (r) => r.a },
  { id: "b", header: "第二欄", cell: (r) => r.b },
];

function Table() {
  const [query, setQuery] = useState(() => createDefaultTableQuery(10));
  const { hasMore, loadMore, ...result } = useProgressiveTableQuery(
    ROWS,
    query,
    COLUMNS,
    (r) => r.id,
  );
  return (
    <ConsoleDataTable
      title="把手"
      columns={COLUMNS}
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

describe("欄寬把手的命中區", () => {
  const handle = () =>
    document.querySelector(
      '[role="separator"][aria-label="調整第一欄欄寬"]',
    ) as HTMLElement;
  const headerCell = () => handle().closest("th") as HTMLElement;

  it("比它畫出來的那條線寬得多", () => {
    render(<Table />);
    const hit = handle().getBoundingClientRect();
    const line = handle().querySelector("span")!.getBoundingClientRect();

    // 看得見的是一條 2px 上下的細線；能按的要是它的好幾倍
    expect(line.width).toBeLessThanOrEqual(4);
    expect(hit.width).toBeGreaterThanOrEqual(line.width * 4);
  });

  it("跨在欄位邊界的兩側，不是只鋪在線的左邊", () => {
    render(<Table />);
    const hit = handle().getBoundingClientRect();
    const cellBox = headerCell().getBoundingClientRect();

    // 越到下一格那一側——瞄準線本身或線右邊一兩 px 都還按得到
    expect(hit.right).toBeGreaterThan(cellBox.right);
    // 也要留在自己這一側
    expect(hit.left).toBeLessThan(cellBox.right);
  });

  it("縱向也比欄名列高——分組的欄名列只有二十幾 px", () => {
    render(<Table />);
    const hit = handle().getBoundingClientRect();
    const cellBox = headerCell().getBoundingClientRect();
    expect(hit.height).toBeGreaterThan(cellBox.height);
  });
});
