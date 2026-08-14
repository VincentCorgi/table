/**
 * 儲存格值的格式化與解析——數字與日期。
 *
 * 語系一律寫死（`zh-TW`），不用 `toLocaleString()` 跟隨執行環境：部分語系
 * 以點為千分位、逗號為小數點（德文 `1.234,56`），伺服器與瀏覽器算出不同
 * 字串會造成 hydration mismatch。同 src/lib/format.ts 的理由，該檔把時間
 * 格式的語系與時區寫死也是為此。
 *
 * 這個模組刻意不依賴任何 UI 或樣式，跨專案複製 src/components/table/ 時
 * 可獨立運作。
 */

import type { ConsoleTableEditable } from "./console-data-table";

const NUMBER_LOCALE = "zh-TW";

/**
 * `Intl.NumberFormat` 的建構成本不該在每格、每次重繪重複支付（一頁數十格
 * 乘上重繪次數）。選項組合有限（千分位開關 × 小數位），依組合快取即可。
 */
const numberFormatters = new Map<string, Intl.NumberFormat>();

function numberFormatter(
  grouping: boolean,
  precision: number | undefined,
): Intl.NumberFormat {
  const key = `${grouping}:${precision ?? ""}`;
  const cached = numberFormatters.get(key);
  if (cached) return cached;
  const formatter = new Intl.NumberFormat(NUMBER_LOCALE, {
    useGrouping: grouping,
    ...(precision === undefined
      ? {}
      : {
          minimumFractionDigits: precision,
          maximumFractionDigits: precision,
        }),
  });
  numberFormatters.set(key, formatter);
  return formatter;
}

export type NumberFormatOptions = {
  /** 千分位，預設開啟；年份／樓層／編號等欄位要給 false。 */
  grouping?: boolean;
  /** 固定小數位；未給則照數值原樣（最多 3 位，Intl 預設）。 */
  precision?: number;
};

/** 數字 → 顯示字串。千分位預設開啟（design D6）。 */
export function formatNumber(
  value: number,
  { grouping = true, precision }: NumberFormatOptions = {},
): string {
  return numberFormatter(grouping, precision).format(value);
}

/**
 * 顯示字串 → 數字。先清掉千分位分隔符與空白再解析：從試算表貼上的
 * `1,234` 必須能存進去，直接丟給 Number() 會得到 NaN。
 *
 * 解析不出數字時回傳 null，由呼叫端決定怎麼處理（不自行代換為 0）。
 */
export function parseNumber(input: string): number | null {
  const cleaned = input.replace(/[,\s]/g, "");
  if (cleaned === "") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** `YYYY-MM-DD`。日曆日期沒有時間點，全程以字串收發，不轉 Date（design D7）。 */
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * 是否為合法的日曆日期字串。格式對但日子不存在（`2026-02-31`）也算不合法
 * ——用 UTC 建構再比對回來，避免踩到本地時區的跨日位移。
 */
export function isValidDateValue(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day)
  );
}

/**
 * `2026-07-01` → `2026/07/01`。純字串代換，不經 Date 也不經 Intl——日曆
 * 日期一旦轉成 Date 就會被套上時區，跨日邊界會位移一天。
 *
 * 無法解析的值原樣回傳，由呼叫端標示為未知（design D10：看不懂的值可以
 * 標記，但不能藏起來）。
 */
export function formatDateValue(value: string): string {
  if (!isValidDateValue(value)) return value;
  return value.replace(DATE_PATTERN, "$1/$2/$3");
}

/** 日期是否落在宣告的範圍內；`min`／`max` 皆為 `YYYY-MM-DD`，字串比較即可。 */
export function isDateWithinRange(
  value: string,
  min?: string,
  max?: string,
): boolean {
  if (min && value < min) return false;
  if (max && value > max) return false;
  return true;
}

/* ---------------- 文字 → 值 ---------------- */

/** 解析結果。失敗時帶原因，呼叫端據此決定要留在編輯態還是標記為拒絕。 */
export type ParsedCellValue =
  | { ok: true; value: unknown }
  | { ok: false; reason: string };

/** boolean 認得的字面值。開關沒有第三態，認不得的字串一律拒絕。 */
const TRUE_WORDS = new Set(["是", "true", "1", "y", "yes", "✓"]);
const FALSE_WORDS = new Set(["否", "false", "0", "n", "no"]);

/**
 * 一格的「清空」是什麼值。`boolean` 是 `false` 而不是 `null`——它的顯示是
 * 開關，開關沒有空狀態，給 null 會讓使用端收到一個渲染不出來的值。
 */
export function emptyCellValue<T>(
  editable: ConsoleTableEditable<T>,
): unknown {
  return editable.type === "boolean" ? false : null;
}

/**
 * 文字 → 值，**單格編輯與貼上共用這一份**。兩套解析遲早會漂移，而漂移的
 * 症狀是「手動打 `1,234` 可以，貼 `1,234` 變成 null」這種沒人想 debug 的
 * bug（design D2）。
 *
 * 解析不出來一律回 `{ ok: false }`，絕不代換成預設值、最接近的選項或空值
 * ——這與「看不懂的值原樣顯示、不吞掉」是同一條原則。
 */
export function parseCellValue<T>(
  editable: ConsoleTableEditable<T>,
  text: string,
): ParsedCellValue {
  switch (editable.type) {
    case "number": {
      if (text.trim() === "") return { ok: true, value: null };
      const parsed = parseNumber(text);
      return parsed === null
        ? { ok: false, reason: "不是數字" }
        : { ok: true, value: parsed };
    }
    case "date": {
      if (text.trim() === "") return { ok: true, value: null };
      if (!isValidDateValue(text)) return { ok: false, reason: "不是有效的日期" };
      if (!isDateWithinRange(text, editable.min, editable.max)) {
        return { ok: false, reason: "日期超出允許範圍" };
      }
      return { ok: true, value: text };
    }
    case "select": {
      if (text.trim() === "") return { ok: true, value: null };
      // 先比 value 再比 label：複製寫出去的是 label，不反解的話「複製一欄
      // 貼回同一欄」會全滅；而資料庫既有的原始值也仍然貼得回去。
      const byValue = editable.options.find((o) => o.value === text);
      if (byValue) return { ok: true, value: byValue.value };
      const byLabel = editable.options.find((o) => o.label === text);
      return byLabel
        ? { ok: true, value: byLabel.value }
        : { ok: false, reason: "不在選項清單中" };
    }
    case "boolean": {
      const word = text.trim().toLowerCase();
      if (TRUE_WORDS.has(word)) return { ok: true, value: true };
      if (FALSE_WORDS.has(word)) return { ok: true, value: false };
      return { ok: false, reason: "無法判讀為是／否" };
    }
    default:
      return { ok: true, value: text };
  }
}
