import { describe, expect, it } from "vitest";
import {
  aggregatesFor,
  tidySum,
  anyAggregateChosen,
  outcomeFor,
  supportsAggregate,
  type GroupCoverage,
} from "./aggregate";

/**
 * 這一層唯一真正會害到人的是「部分揭露時算出一個和」。它不會拋錯、不會變色、
 * 畫面上沒有任何東西會跟它牴觸——使用者是從他拿那個數字去做的事情上才發現錯
 * 的。所以下面每一條都在釘那個判斷，而不是釘加法。
 */

const whole: GroupCoverage = { hasMore: false, chunked: false };
const partial: GroupCoverage = { hasMore: true, chunked: false };
const chunked: GroupCoverage = { hasMore: false, chunked: true };

describe("小數相加不外露浮點誤差", () => {
  it("0.1 + 0.2 這種加法收斂到看得懂的數字", () => {
    expect(tidySum(0.1 + 0.2)).toBe(0.3);
    expect(tidySum(3.5 + 4 + 0.5)).toBe(8);
  });

  it("整數與尋常小數原樣通過", () => {
    expect(tidySum(12)).toBe(12);
    expect(tidySum(25.5)).toBe(25.5);
  });
});

describe("aggregatesFor", () => {
  it("只有數字欄提供加總", () => {
    expect(aggregatesFor(true)).toEqual(["none", "count", "sum"]);
    expect(aggregatesFor(false)).toEqual(["none", "count"]);
  });

  it("文字欄不接受加總", () => {
    expect(supportsAggregate("sum", false)).toBe(false);
    expect(supportsAggregate("count", false)).toBe(true);
  });
});

describe("outcomeFor", () => {
  it("沒選就什麼都不顯示", () => {
    expect(
      outcomeFor({ aggregate: "none", coverage: whole, values: [1, 2] }),
    ).toEqual({ kind: "hidden" });
  });

  it("整組都在手上時才算加總", () => {
    expect(
      outcomeFor({ aggregate: "sum", coverage: whole, values: [1, 2, 3] }),
    ).toEqual({ kind: "value", value: 6 });
  });

  it("這一組還有沒載入的列時，不給部分和", () => {
    expect(
      outcomeFor({ aggregate: "sum", coverage: partial, values: [1, 2, 3] }),
    ).toEqual({ kind: "unavailable", reason: "partial" });
  });

  it("分塊模式下即使這組看起來沒有更多，也不算", () => {
    // 分塊時批次是全域的，所以「這一組沒有 hasMore」只代表目前這批裡沒有更
    // 多，不代表它的列到齊了。這是最容易被當成安全的那一格。
    expect(
      outcomeFor({ aggregate: "sum", coverage: chunked, values: [1, 2] }),
    ).toEqual({ kind: "unavailable", reason: "partial" });
  });

  it("呼叫端供應的答案凌駕揭露狀態", () => {
    expect(
      outcomeFor({
        aggregate: "sum",
        supplied: 999,
        coverage: partial,
        values: [1, 2],
      }),
    ).toEqual({ kind: "value", value: 999 });
  });

  it("筆數走群組標題用的那個數字，不數手上的列", () => {
    expect(
      outcomeFor({
        aggregate: "count",
        count: 200,
        coverage: partial,
        values: [1, 2, 3],
      }),
    ).toEqual({ kind: "value", value: 200 });
  });

  it("沒有真實筆數又只揭露一部分時，筆數也不給", () => {
    expect(
      outcomeFor({ aggregate: "count", coverage: partial, values: [1, 2] }),
    ).toEqual({ kind: "unavailable", reason: "partial" });
  });

  it("沒有真實筆數但整組都在手上時，數手上的列", () => {
    expect(
      outcomeFor({ aggregate: "count", coverage: whole, values: [1, 2] }),
    ).toEqual({ kind: "value", value: 2 });
  });

  it("一組沒有任何值時加總是零，不是不可用", () => {
    expect(
      outcomeFor({ aggregate: "sum", coverage: whole, values: [] }),
    ).toEqual({ kind: "value", value: 0 });
  });
});

describe("anyAggregateChosen", () => {
  it("全部是 none 就當作沒選", () => {
    expect(anyAggregateChosen({ a: "none", b: "none" })).toBe(false);
  });

  it("有一個選了就算選了", () => {
    expect(anyAggregateChosen({ a: "none", b: "sum" })).toBe(true);
  });

  it("沒有偏好就是沒選", () => {
    expect(anyAggregateChosen(undefined)).toBe(false);
  });
});
