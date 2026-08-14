/**
 * 群組統計：算什麼，以及**什麼時候不准算**。
 *
 * 這個檔案刻意不碰 React、不碰渲染。整個功能真正的難處不是加總，是「手上的
 * 列不一定是這一組的全部」——而那個判斷跟算術混在一起就沒人測得到。
 */

export type Aggregate = "none" | "count" | "sum";

/**
 * 一欄答得出哪些統計。
 *
 * 判斷的是「取不取得到數字」，不是「宣告成哪個型別」。內建的 number 欄位取
 * 得到，宣告了自己怎麼取的欄位也取得到——後者可能存的是一串逐日紀錄，也可能
 * 根本不可編輯。**加不加得起來是關於值的問題，不是關於型別的問題**；讓型別
 * 多背這一題，結果就是一個存著 `{date, hours}[]` 的欄位算得出總和卻選不到。
 */
export function aggregatesFor(summable: boolean): Aggregate[] {
  return summable ? ["none", "count", "sum"] : ["none", "count"];
}

export function supportsAggregate(
  aggregate: Aggregate,
  summable: boolean,
): boolean {
  return aggregatesFor(summable).includes(aggregate);
}

/**
 * 小數相加會留下二進位浮點的痕跡（`0.1 + 0.2`），而總和是要被讀的數字。
 *
 * 收斂到小數第三位：工時、金額、數量這些會用到小數的量都在這個尺度內，再細
 * 就不是人在讀的東西了。整數不受影響。
 */
export function tidySum(total: number): number {
  return Math.round(total * 1000) / 1000;
}

/**
 * 一個統計值的三種下場。
 *
 * `unavailable` 不是失敗，是這個功能存在的理由：一組兩百筆只揭露二十筆時，
 * 那二十筆的和看起來就是一個總數、被當成總數用，而畫面上沒有任何東西會跟它
 * 牴觸。使用者是從他拿這個數字去做的事情上才發現錯的。
 */
export type AggregateOutcome =
  | { kind: "hidden" }
  | { kind: "value"; value: number }
  | { kind: "unavailable"; reason: "partial" };

/** 這一組的可信度：能不能拿手上的列算出整組的答案。 */
export type GroupCoverage = {
  /** 這一組還有沒有未揭露的列。 */
  hasMore: boolean;
  /**
   * 列是不是整批分塊從伺服器來的。分塊模式下批次是全域的，所以「這一組看起來
   * 沒有 hasMore」也不代表它的列都到齊了——只代表目前這批裡沒有更多。
   */
  chunked: boolean;
};

/**
 * 決定一個欄位在一組裡要顯示什麼。
 *
 * 供應值優先於一切：呼叫端說得出整組的答案時，揭露到哪裡就不重要了。這跟
 * `groupCounts` 是同一個安排——真實的總數由知道的人給，不知道就不要猜。
 */
export function outcomeFor({
  aggregate,
  supplied,
  count,
  coverage,
  values,
}: {
  aggregate: Aggregate;
  /** 呼叫端供應的整組答案，若有。 */
  supplied?: number;
  /** 整組的真實筆數（`groupCounts`），若有。 */
  count?: number;
  coverage: GroupCoverage;
  /** 手上這一組的值，已經過濾掉沒有數字的。 */
  values: number[];
}): AggregateOutcome {
  if (aggregate === "none") return { kind: "hidden" };

  if (supplied !== undefined) return { kind: "value", value: supplied };

  // 筆數走群組標題用的同一個數字。同一個畫面上兩個筆數卻是不同定義，比沒有
  // 筆數更糟——差異本身要先被解釋，兩個才都不能用。
  if (aggregate === "count" && count !== undefined) {
    return { kind: "value", value: count };
  }

  if (coverage.hasMore || coverage.chunked) {
    return { kind: "unavailable", reason: "partial" };
  }

  return {
    kind: "value",
    value: aggregate === "count" ? values.length : sum(values),
  };
}

function sum(values: number[]): number {
  return tidySum(values.reduce((total, value) => total + value, 0));
}

/** 任何一欄選了統計沒有。全部都是 none 時整條列不該存在。 */
export function anyAggregateChosen(
  aggregates: Record<string, Aggregate> | undefined,
): boolean {
  if (!aggregates) return false;
  return Object.values(aggregates).some((value) => value !== "none");
}
