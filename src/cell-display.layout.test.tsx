import { render } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import {
  ConsoleDataTable,
  createDefaultTableQuery,
  type ConsoleTableColumn,
} from "./console-data-table";
import { useClientTableQuery } from "./use-client-table-query";

/**
 * 版面測試：量得到的事實，不是 class 在不在。
 *
 * 這一組存在的理由是一次真實的失誤——標籤帶著每一個截斷該有的 class 卻完全
 * 沒有截斷，因為 `Badge` 基底的 `shrink-0` 蓋掉了它，而所有 class 斷言都通過。
 */

type Row = { id: string; status: string; tail: string };

const LONG = "這是一個長到絕對放不進窄欄位裡的選項標籤";
const ROWS: Row[] = [{ id: "r1", status: LONG, tail: "尾" }];

/**
 * 用「使用者把欄位拖窄」的那條路壓窄欄位——存進偏好的 `columnWidths`。
 *
 * 一開始我只是把表格放進一個窄的外框，那不會讓欄位變窄：表格會橫向溢出，
 * 外框只是產生捲動條。真實世界裡欄位變窄的方式就是欄寬被拖過，而那會讓表格
 * 切到 `table-fixed` 並由 colgroup 決定寬度。
 */
function NarrowTable({
  colored,
  width,
}: {
  colored: boolean;
  width: number;
}) {
  const columns: ConsoleTableColumn<Row>[] = [
    {
      id: "status",
      header: "狀態",
      editable: {
        type: "select",
        getValue: (r) => r.status,
        options: [{ value: LONG, ...(colored ? { color: "secondary" } : {}) }],
      },
    },
    // colgroup 刻意不給最後一欄寬度（讓它獨自吸收剩餘空間），所以要壓窄的
    // 欄位不能是最後一欄。這一欄的存在只為了讓「狀態」不是最後一個。
    { id: "tail", header: "尾", cell: (r) => r.tail },
  ];
  const [query, setQuery] = useState(() => createDefaultTableQuery(10));
  const result = useClientTableQuery(ROWS, query, columns, (r) => r.id);
  return (
    <ConsoleDataTable
      title="窄欄"
      columns={columns}
      rowKey={(r) => r.id}
      query={query}
      onQueryChange={setQuery}
      preferences={{ version: 1, columnWidths: { status: width } }}
      onPreferencesChange={() => {}}
      {...result}
    />
  );
}

const cell = () =>
  document.querySelector('td[data-column-id="status"]') as HTMLElement;

describe("窄欄裡的 select 標籤", () => {
  it("縮進儲存格裡，不是溢出去被切掉", () => {
    render(<NarrowTable colored width={90} />);
    const badge = cell().querySelector('[data-slot="badge"]') as HTMLElement;

    // 這是整件事的重點：藥丸必須真的變窄到放得進格子裡。
    // 蓋不掉 shrink-0 的話它會維持完整寬度，然後被儲存格切掉——而每一個
    // class 斷言仍然會通過。
    expect(badge.getBoundingClientRect().width).toBeLessThanOrEqual(
      cell().getBoundingClientRect().width,
    );
  });

  it("裡面的文字真的被截斷（內容比看得到的寬）", () => {
    render(<NarrowTable colored width={90} />);
    const label = cell().querySelector(
      '[data-slot="badge"] > span',
    ) as HTMLElement;


    // scrollWidth 是完整文字的寬度，clientWidth 是看得到的部分。
    // 截斷成立時前者大於後者；沒截斷時兩者相等。
    expect(label.scrollWidth).toBeGreaterThan(label.clientWidth);
  });

  it("藥丸的形狀留著——沒有被切成半個", () => {
    render(<NarrowTable colored width={90} />);
    const badge = cell().querySelector('[data-slot="badge"]') as HTMLElement;
    const box = badge.getBoundingClientRect();

    // 高度不變（h-5 = 20px），圓角量得到
    expect(box.height).toBe(20);
    expect(getComputedStyle(badge).borderTopLeftRadius).not.toBe("0px");
  });

  it("放得下的時候不縮也不截斷", () => {
    render(<NarrowTable colored width={600} />);
    const label = cell().querySelector(
      '[data-slot="badge"] > span',
    ) as HTMLElement;
    expect(label.scrollWidth).toBe(label.clientWidth);
  });
});
