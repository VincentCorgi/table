/**
 * 日期區間篩選的值模型。沒有 DOM，可以單獨測。
 *
 * 一個日期篩選的值是三種形狀之一：
 *   ""              → 不限
 *   "bucket:<id>"   → **相對**區間（今天／本週／逾期…）。每次讀取都對**當下的
 *                     牆上時鐘**重新解析，所以存下來的「今天」隔天仍然是那天
 *                     的今天。存「解析後的區間」會在過夜之後漂成「昨天」——
 *                     這是這個模組存在的理由。
 *   "<from>|<to>"   → 使用者自己挑的絕對區間，固定不動
 *
 * 兩端都是**含端點**，且用 `YYYY-MM-DD` 字串比大小——那個格式的字典序就是
 * 時間序，不必轉成 Date。
 */

export type DateBucket = { id: string; label: string };

export const DATE_BUCKETS: DateBucket[] = [
  { id: "overdue", label: "逾期" },
  { id: "today", label: "今天" },
  { id: "thisWeek", label: "本週" },
  { id: "thisMonth", label: "本月" },
  { id: "future", label: "未來" },
];

export type DateRange = { from: string; to: string };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * 把 bucket id 解析成區間；任一端為空字串代表那一側不限。
 *
 * `now` 只在測試裡傳——正式路徑一律讀當下的時鐘，那正是相對區間的意思。
 */
export function resolveBucket(id: string, now: Date = new Date()): DateRange {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const shift = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return d;
  };

  switch (id) {
    case "overdue":
      return { from: "", to: fmt(shift(-1)) };
    case "yesterday":
      return { from: fmt(shift(-1)), to: fmt(shift(-1)) };
    case "today":
      return { from: fmt(today), to: fmt(today) };
    case "tomorrow":
      return { from: fmt(shift(1)), to: fmt(shift(1)) };
    case "thisWeek": {
      // 週一為第一天：getDay() 的星期日是 0，換算成 6 才不會把週日算成
      // 下一週的開頭。
      const offset = (today.getDay() + 6) % 7;
      return { from: fmt(shift(-offset)), to: fmt(shift(6 - offset)) };
    }
    case "thisMonth": {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      // 下個月的第 0 天 = 這個月的最後一天，閏年與大小月都不必自己判斷。
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { from: fmt(first), to: fmt(last) };
    }
    case "future":
      return { from: fmt(shift(1)), to: "" };
    default:
      // 認不得的 id 當作不限，而不是丟出錯誤：存檔可能來自一份提供了不同
      // bucket 清單的舊版本，整張表不該因此打不開。
      return { from: "", to: "" };
  }
}

/** 存下來的值 → 區間。`null` 代表不限，呼叫端不必篩。 */
export function resolveDateFilter(
  value: string | undefined,
  now?: Date,
): DateRange | null {
  if (!value) return null;
  if (value.startsWith("bucket:")) return resolveBucket(value.slice(7), now);
  const [from = "", to = ""] = value.split("|");
  if (!from && !to) return null;
  return { from, to };
}

/** 這一列在不在區間內。兩端含端點；沒有日期的列一律不在任何區間內。 */
export function dateInRange(date: string, range: DateRange): boolean {
  if (!date) return false;
  if (range.from && date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
}

/** chip 上顯示的文字。相對區間顯示 bucket 名稱，不顯示它今天解析成什麼。 */
export function dateFilterLabel(
  value: string | undefined,
  buckets: DateBucket[] = DATE_BUCKETS,
): string {
  if (!value) return "";
  if (value.startsWith("bucket:")) {
    const id = value.slice(7);
    return buckets.find((b) => b.id === id)?.label ?? id;
  }
  const [from = "", to = ""] = value.split("|");
  if (from && to) return from === to ? from : `${from} ~ ${to}`;
  return from ? `${from} 起` : `至 ${to}`;
}

/** 自訂區間的兩個欄位 → 存下來的值。兩邊都空就是「不限」。 */
export function customRangeValue(from: string, to: string): string {
  return from || to ? `${from}|${to}` : "";
}
