import { describe, expect, it } from "vitest";

import {
  customRangeValue,
  dateFilterLabel,
  dateInRange,
  resolveBucket,
  resolveDateFilter,
} from "./date-buckets";

/** 週三。前後都有同週的日子，週界才驗得出來。 */
const WED = new Date(2026, 0, 14);

describe("相對區間對當下的時鐘解析", () => {
  it("今天是一天，不是一個開區間", () => {
    expect(resolveBucket("today", WED)).toEqual({
      from: "2026-01-14",
      to: "2026-01-14",
    });
  });

  it("逾期是「昨天以前」，不含今天", () => {
    // 今天到期的還沒逾期——把今天算進去會讓人以為今天的事已經遲了
    expect(resolveBucket("overdue", WED)).toEqual({
      from: "",
      to: "2026-01-13",
    });
  });

  it("未來是「明天以後」，不含今天", () => {
    expect(resolveBucket("future", WED)).toEqual({
      from: "2026-01-15",
      to: "",
    });
  });

  it("本週從週一到週日", () => {
    expect(resolveBucket("thisWeek", WED)).toEqual({
      from: "2026-01-12",
      to: "2026-01-18",
    });
  });

  it("週日算成那一週的最後一天，不是下一週的開頭", () => {
    // getDay() 的週日是 0，直接拿來當偏移量會把週日推成下一週
    const sunday = new Date(2026, 0, 18);
    expect(resolveBucket("thisWeek", sunday)).toEqual({
      from: "2026-01-12",
      to: "2026-01-18",
    });
  });

  it("本月到當月最後一天，閏年也對", () => {
    expect(resolveBucket("thisMonth", new Date(2024, 1, 10))).toEqual({
      from: "2024-02-01",
      to: "2024-02-29",
    });
  });

  it("同一個 bucket 隔天解析出來是隔天", () => {
    // 這就是存 bucket 而不是存解析後區間的全部理由
    const thu = new Date(2026, 0, 15);
    expect(resolveBucket("today", WED).from).toBe("2026-01-14");
    expect(resolveBucket("today", thu).from).toBe("2026-01-15");
  });

  it("認不得的 id 當作不限，而不是讓整張表打不開", () => {
    expect(resolveBucket("从前有座山", WED)).toEqual({ from: "", to: "" });
  });
});

describe("存下來的值解析成區間", () => {
  it("空值代表不限，呼叫端不必篩", () => {
    expect(resolveDateFilter("")).toBeNull();
    expect(resolveDateFilter(undefined)).toBeNull();
    expect(resolveDateFilter("|")).toBeNull();
  });

  it("bucket: 前綴走相對解析", () => {
    expect(resolveDateFilter("bucket:today", WED)).toEqual({
      from: "2026-01-14",
      to: "2026-01-14",
    });
  });

  it("絕對區間原樣通過，不隨時鐘改變", () => {
    expect(resolveDateFilter("2026-03-01|2026-03-31", WED)).toEqual({
      from: "2026-03-01",
      to: "2026-03-31",
    });
  });

  it("只有一端也是合法的區間", () => {
    expect(resolveDateFilter("2026-03-01|")).toEqual({
      from: "2026-03-01",
      to: "",
    });
  });
});

describe("比對", () => {
  it("兩端都含端點", () => {
    const range = { from: "2026-01-10", to: "2026-01-20" };
    expect(dateInRange("2026-01-10", range)).toBe(true);
    expect(dateInRange("2026-01-20", range)).toBe(true);
    expect(dateInRange("2026-01-09", range)).toBe(false);
    expect(dateInRange("2026-01-21", range)).toBe(false);
  });

  it("沒有日期的列不在任何區間內", () => {
    // 包含「不限那一側」的區間也一樣——沒有日期不是「任何日期」
    expect(dateInRange("", { from: "", to: "" })).toBe(false);
  });
});

describe("chip 上的文字", () => {
  it("相對區間顯示名稱，不顯示它今天解析成什麼", () => {
    // 顯示「2026-01-14」會讓人以為那是固定的
    expect(dateFilterLabel("bucket:today")).toBe("今天");
  });

  it("同一天的絕對區間只寫一次", () => {
    expect(dateFilterLabel("2026-01-14|2026-01-14")).toBe("2026-01-14");
  });

  it("單邊區間寫成起／訖", () => {
    expect(dateFilterLabel("2026-01-14|")).toBe("2026-01-14 起");
    expect(dateFilterLabel("|2026-01-14")).toBe("至 2026-01-14");
  });

  it("認不得的 bucket 顯示 id 而不是空白", () => {
    expect(dateFilterLabel("bucket:nope")).toBe("nope");
  });
});

describe("自訂區間的兩個欄位", () => {
  it("兩邊都空就是不限", () => {
    expect(customRangeValue("", "")).toBe("");
  });

  it("填一邊也成立", () => {
    expect(customRangeValue("2026-01-01", "")).toBe("2026-01-01|");
  });
});
