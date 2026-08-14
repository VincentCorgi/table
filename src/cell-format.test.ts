import { describe, expect, it } from "vitest";
import {
  emptyCellValue,
  formatDateValue,
  formatNumber,
  isDateWithinRange,
  isValidDateValue,
  parseCellValue,
  parseNumber,
} from "./cell-format";
import type { ConsoleTableEditable } from "./console-data-table";

describe("數字格式化", () => {
  it("千分位預設開啟", () => {
    expect(formatNumber(1234)).toBe("1,234");
    expect(formatNumber(1234567)).toBe("1,234,567");
  });

  it("grouping: false 關掉千分位（年份、樓層、編號等欄位）", () => {
    expect(formatNumber(2026, { grouping: false })).toBe("2026");
  });

  it("格式不跟隨執行環境的語系", () => {
    // 德文以點為千分位、逗號為小數點（1.234,5）。語系若跟著環境跑，
    // 伺服器與瀏覽器會算出不同字串——那是 hydration mismatch。
    const german = new Intl.NumberFormat("de-DE").format(1234.5);
    expect(german).not.toBe("1,234.5");
    expect(formatNumber(1234.5)).toBe("1,234.5");

    // 上面那條在英文環境的機器上恆真，擋不住「拿掉語系參數」這種改動，
    // 所以直接盯住契約本身：一定帶明確語系，不能讓 Intl 自己挑。
    const seen: unknown[] = [];
    const Original = Intl.NumberFormat;
    const spy = function (this: unknown, ...args: unknown[]) {
      seen.push(args[0]);
      // @ts-expect-error 轉呼叫原建構子
      return new Original(...args);
    } as unknown as typeof Intl.NumberFormat;
    Intl.NumberFormat = spy;
    try {
      // 沒用過的小數位，才會真的建一個新的 formatter（有快取）
      formatNumber(1234.5, { precision: 7 });
    } finally {
      Intl.NumberFormat = Original;
    }
    expect(seen).toEqual(["zh-TW"]);
  });

  it("precision 固定小數位", () => {
    expect(formatNumber(1234.5, { precision: 2 })).toBe("1,234.50");
    expect(formatNumber(3, { precision: 2 })).toBe("3.00");
  });

  it("未給 precision 時不補小數位", () => {
    expect(formatNumber(3)).toBe("3");
  });

  it("同樣的選項重複呼叫結果一致（formatter 有快取）", () => {
    expect(formatNumber(1234, { precision: 2 })).toBe(
      formatNumber(1234, { precision: 2 }),
    );
  });
});

describe("數字解析", () => {
  it("先清掉千分位分隔符再解析（從試算表貼上的值）", () => {
    expect(parseNumber("1,234")).toBe(1234);
    expect(parseNumber("1,234,567.5")).toBe(1234567.5);
  });

  it("清掉空白", () => {
    expect(parseNumber(" 42 ")).toBe(42);
  });

  it("解析不出數字回傳 null，不代換為 0", () => {
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("1.2.3")).toBeNull();
  });

  it("負數與小數", () => {
    expect(parseNumber("-1,234.25")).toBe(-1234.25);
  });
});

describe("日期", () => {
  it("YYYY-MM-DD 顯示為 YYYY/MM/DD", () => {
    expect(formatDateValue("2026-07-01")).toBe("2026/07/01");
  });

  it("不合法的日期字串原樣回傳，不吞掉", () => {
    expect(formatDateValue("民國 115 年")).toBe("民國 115 年");
    expect(formatDateValue("2026-13-01")).toBe("2026-13-01");
    expect(formatDateValue("2026-02-31")).toBe("2026-02-31");
    expect(formatDateValue("")).toBe("");
  });

  it("合法性判斷含日曆有效性", () => {
    expect(isValidDateValue("2026-07-01")).toBe(true);
    expect(isValidDateValue("2024-02-29")).toBe(true); // 閏年
    expect(isValidDateValue("2026-02-29")).toBe(false);
    expect(isValidDateValue("2026-7-1")).toBe(false);
  });

  it("跨日邊界不因時區位移（純字串代換）", () => {
    expect(formatDateValue("2026-01-01")).toBe("2026/01/01");
    expect(formatDateValue("2026-12-31")).toBe("2026/12/31");
  });

  it("範圍判斷", () => {
    expect(isDateWithinRange("2026-07-01", "2026-01-01", "2026-12-31")).toBe(
      true,
    );
    expect(isDateWithinRange("2027-01-01", undefined, "2026-12-31")).toBe(false);
    expect(isDateWithinRange("2025-01-01", "2026-01-01")).toBe(false);
    expect(isDateWithinRange("2026-07-01")).toBe(true);
  });
});

describe("parseCellValue：文字 → 值", () => {
  const text: ConsoleTableEditable<unknown> = {
    type: "text",
    getValue: () => "",
  };
  const number: ConsoleTableEditable<unknown> = {
    type: "number",
    getValue: () => 0,
  };
  const date: ConsoleTableEditable<unknown> = {
    type: "date",
    getValue: () => "",
  };
  const select: ConsoleTableEditable<unknown> = {
    type: "select",
    getValue: () => "",
    options: [
      { value: "fixed", label: "已修繕" },
      { value: "pending", label: "待修繕" },
    ],
  };
  const bool: ConsoleTableEditable<unknown> = {
    type: "boolean",
    getValue: () => false,
  };

  it("number 吃得下千分位（從試算表貼過來的形狀）", () => {
    expect(parseCellValue(number, "1,234")).toEqual({ ok: true, value: 1234 });
  });

  it("number 解析不出來就拒絕，不代換為 0", () => {
    expect(parseCellValue(number, "abc")).toMatchObject({ ok: false });
  });

  it("空字串是清空而不是拒絕", () => {
    expect(parseCellValue(number, "  ")).toEqual({ ok: true, value: null });
    expect(parseCellValue(date, "")).toEqual({ ok: true, value: null });
    expect(parseCellValue(select, "")).toEqual({ ok: true, value: null });
  });

  it("date 要是有效日曆日期", () => {
    expect(parseCellValue(date, "2026-07-01")).toEqual({
      ok: true,
      value: "2026-07-01",
    });
    expect(parseCellValue(date, "2026-02-31")).toMatchObject({ ok: false });
  });

  it("date 超出 min/max 就拒絕，不夾進範圍內", () => {
    const bounded = { ...date, min: "2026-01-01", max: "2026-12-31" };
    expect(parseCellValue(bounded, "2025-12-31")).toMatchObject({ ok: false });
  });

  it("select 先比 value 再比 label——複製出去的是 label，要貼得回來", () => {
    expect(parseCellValue(select, "fixed")).toEqual({ ok: true, value: "fixed" });
    expect(parseCellValue(select, "已修繕")).toEqual({
      ok: true,
      value: "fixed",
    });
  });

  it("select 撞名時 value 優先", () => {
    const ambiguous = {
      ...select,
      options: [
        { value: "A", label: "B" },
        { value: "B", label: "C" },
      ],
    };
    expect(parseCellValue(ambiguous, "B")).toEqual({ ok: true, value: "B" });
  });

  it("select 對不上就拒絕，不猜最接近的選項", () => {
    expect(parseCellValue(select, "已修")).toMatchObject({ ok: false });
  });

  it("boolean 認得是／否與其字面等價值，不分大小寫", () => {
    for (const yes of ["是", "true", "TRUE", "1", "yes"]) {
      expect(parseCellValue(bool, yes)).toEqual({ ok: true, value: true });
    }
    for (const no of ["否", "false", "0", "No"]) {
      expect(parseCellValue(bool, no)).toEqual({ ok: true, value: false });
    }
    expect(parseCellValue(bool, "也許")).toMatchObject({ ok: false });
  });

  it("text 原樣通過", () => {
    expect(parseCellValue(text, " 帶空白 ")).toEqual({
      ok: true,
      value: " 帶空白 ",
    });
  });
});

describe("emptyCellValue：清空是什麼", () => {
  it("boolean 是 false 而不是 null（開關沒有空狀態）", () => {
    expect(
      emptyCellValue({
        type: "boolean",
        getValue: () => false,
      } as ConsoleTableEditable<unknown>),
    ).toBe(false);
  });

  it("其餘型別都是 null", () => {
    for (const type of ["text", "number", "date"] as const) {
      expect(
        emptyCellValue({ type, getValue: () => null } as ConsoleTableEditable<unknown>),
      ).toBeNull();
    }
    expect(
      emptyCellValue({
        type: "select",
        getValue: () => "",
        options: [],
      } as ConsoleTableEditable<unknown>),
    ).toBeNull();
  });
});
