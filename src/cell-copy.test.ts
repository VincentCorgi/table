import { describe, expect, it } from "vitest";
import { cellCopyText } from "./cell-display";
import type { ConsoleTableColumn } from "./console-data-table";

type Row = {
  name: string;
  amount: number;
  status: string;
  done: boolean;
  date: string;
  note: string | null;
};

const row: Row = {
  name: "欄杆烤漆剝落",
  amount: 1234567,
  status: "fixed",
  done: true,
  date: "2026-07-09",
  note: null,
};

describe("cellCopyText 依型別取格式化後的文字", () => {
  it("text 取原值", () => {
    const column: ConsoleTableColumn<Row> = {
      id: "name",
      header: "缺失",
      editable: { type: "text", getValue: (r) => r.name },
    };
    expect(cellCopyText(column, row)).toBe("欄杆烤漆剝落");
  });

  it("number 帶千分位，與畫面顯示一致", () => {
    const column: ConsoleTableColumn<Row> = {
      id: "amount",
      header: "數量",
      editable: { type: "number", getValue: (r) => r.amount },
    };
    expect(cellCopyText(column, row)).toBe("1,234,567");
  });

  it("date 用顯示格式而不是 ISO", () => {
    const column: ConsoleTableColumn<Row> = {
      id: "date",
      header: "記錄日期",
      editable: { type: "date", getValue: (r) => r.date },
    };
    expect(cellCopyText(column, row)).toBe("2026/07/09");
  });

  it("select 複製選項的標籤而不是 value", () => {
    const column: ConsoleTableColumn<Row> = {
      id: "status",
      header: "狀態",
      editable: {
        type: "select",
        getValue: (r) => r.status,
        options: [
          { value: "fixed", label: "已修繕" },
          { value: "pending", label: "待修繕" },
        ],
      },
    };
    expect(cellCopyText(column, row)).toBe("已修繕");
  });

  it("boolean 複製「是」／「否」而不是空字串", () => {
    const column: ConsoleTableColumn<Row> = {
      id: "done",
      header: "已複驗",
      editable: { type: "boolean", getValue: (r) => r.done },
    };
    expect(cellCopyText(column, row)).toBe("是");
    expect(cellCopyText(column, { ...row, done: false })).toBe("否");
  });

  it("空值複製空字串，不複製顯示用的破折號", () => {
    const column: ConsoleTableColumn<Row> = {
      id: "note",
      header: "備註",
      editable: { type: "text", getValue: (r) => r.note },
    };
    expect(cellCopyText(column, row)).toBe("");
  });
});

describe("cellCopyText 的退回順序", () => {
  it("copyValue 優先於其他所有來源", () => {
    const column: ConsoleTableColumn<Row> = {
      id: "amount",
      header: "數量",
      cell: (r) => r.amount,
      copyValue: () => "自訂",
      filterValue: () => "篩選值",
      editable: { type: "number", getValue: (r) => r.amount },
    };
    expect(cellCopyText(column, row)).toBe("自訂");
  });

  it("只有自訂 cell 時退回 filterValue", () => {
    const column: ConsoleTableColumn<Row> = {
      id: "status",
      header: "狀態",
      cell: (r) => r.status,
      filterValue: () => "已修繕",
      sortValue: () => "fixed",
    };
    expect(cellCopyText(column, row)).toBe("已修繕");
  });

  it("沒有 filterValue 時退回 sortValue", () => {
    const column: ConsoleTableColumn<Row> = {
      id: "amount",
      header: "數量",
      cell: (r) => r.amount,
      sortValue: (r) => r.amount,
    };
    expect(cellCopyText(column, row)).toBe("1234567");
  });

  it("什麼都沒宣告時是空字串，該欄仍然佔一個欄位", () => {
    const column: ConsoleTableColumn<Row> = {
      id: "name",
      header: "缺失",
      cell: (r) => r.name,
    };
    expect(cellCopyText(column, row)).toBe("");
  });

  it("sortValue 回傳 null 時是空字串而不是「null」", () => {
    const column: ConsoleTableColumn<Row> = {
      id: "note",
      header: "備註",
      cell: (r) => r.note,
      sortValue: (r) => r.note,
    };
    expect(cellCopyText(column, row)).toBe("");
  });
});
