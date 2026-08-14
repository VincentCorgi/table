import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import {
  ConsoleDataTable,
  createDefaultTableQuery,
  type ConsoleTableColumn,
} from "./console-data-table";
import { useProgressiveTableQuery } from "./use-progressive-table-query";

/**
 * spec：「An aggregate SHALL follow its column's alignment」，理由是一個坐在
 * 靠右欄位底下卻靠左讀的總和，讀起來是另一種量。
 *
 * 對齊是版面。jsdom 只驗得到 `text-right` 這個字串在不在，量不到數字實際上
 * 靠哪一邊。
 */

type Row = { id: string; group: string; qty: number };
const ROWS: Row[] = [
  { id: "a", group: "甲", qty: 120 },
  { id: "b", group: "甲", qty: 3 },
];
const COLUMNS: ConsoleTableColumn<Row>[] = [
  { id: "group", header: "類別", cell: (r) => r.group, filterValue: (r) => r.group },
  {
    id: "qty",
    header: "數量",
    cell: (r) => r.qty,
    editable: { type: "number", getValue: (r) => r.qty },
  },
];

function Grouped() {
  const [query, setQuery] = useState(() => ({
    ...createDefaultTableQuery(30),
    groupBy: "group" as string | null,
  }));
  const { hasMore, loadMore, ...result } = useProgressiveTableQuery(
    ROWS,
    query,
    COLUMNS,
    (r) => r.id,
  );
  return (
    <ConsoleDataTable
      title="統計"
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

describe("統計列的對齊", () => {
  it("數字欄的總和與它上面的數字靠同一邊", async () => {
    const user = userEvent.setup();
    render(<Grouped />);

    await user.click(screen.getByRole("button", { name: "偏好設定" }));
    await user.selectOptions(screen.getByLabelText("數量的每組統計"), "總和");
    await user.click(screen.getByRole("button", { name: "確認" }));

    const valueCell = document.querySelector(
      'tr[data-row-key="a"] td[data-column-id="qty"]',
    ) as HTMLElement;
    const sumCell = document.querySelector(
      '[data-slot="group-aggregates"] td:nth-child(3)',
    ) as HTMLElement;

    // 兩者的文字都靠右——量的是文字的右緣，不是 class
    const valueText = valueCell.getBoundingClientRect();
    const sumText = sumCell.getBoundingClientRect();
    expect(sumCell.textContent).toContain("123");
    // 同一欄，所以格子本身的右緣一致；真正要驗的是文字有沒有貼著右緣
    expect(Math.abs(sumText.right - valueText.right)).toBeLessThan(1);
    expect(getComputedStyle(sumCell).textAlign).toBe("right");
    expect(getComputedStyle(valueCell).textAlign).toBe("right");
  });
});
