"use client";

import { Badge } from "./table-ui";
import { cn } from "./cn";
import { formatDateValue, formatNumber, isValidDateValue } from "./cell-format";
import {
  TAG_COLOR_CLASS,
  paletteColorAt,
  resolveTagColor,
  tagColorStyle,
} from "./tag-colors";
import type {
  ConsoleTableColumn,
  ConsoleTableEditable,
  ConsoleTableSelectOption,
} from "./console-data-table";

/**
 * 內建型別的預設顯示。
 *
 * 兩條規則貫穿整個檔案（design D10）：
 * - 空值顯示 `—` 而不是留白。表格有框線，空白格看起來像渲染失敗，而且要有
 *   東西可以點才能填值。
 * - 看不懂的值原樣顯示並標示，不吞掉、不代換為預設選項、不強制轉成最接近的
 *   合法值。選項改名後資料庫既有的列仍寫著舊值，顯示成空白會讓使用者以為
 *   資料掉了，然後手動「補」一個值——本來只是選單改名，結果真的改掉原始資料。
 */

/** 空值的統一呈現；同時也是可點擊的編輯目標。 */
export const EMPTY_DISPLAY = "—";

export function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

/** 取選項的顯示文字；沒有 label 就用 value。 */
function optionLabel(option: ConsoleTableSelectOption): string {
  return option.label ?? option.value;
}

/**
 * 儲存格的純文字值——供 `title` 使用，讓截斷的內容可用滑鼠停留看到全文。
 * 只有宣告了內建型別的欄位取得到；自訂 `cell` 的欄位表格看不到值，維持現況。
 */
export function cellTitleText<T>(
  editable: ConsoleTableEditable<T>,
  row: T,
): string | undefined {
  const value = editable.getValue(row);
  if (isEmptyValue(value)) return undefined;
  switch (editable.type) {
    case "number": {
      const raw = value as number;
      return typeof raw === "number" && Number.isFinite(raw)
        ? formatNumber(raw, {
            grouping: editable.grouping ?? true,
            precision: editable.precision,
          })
        : String(raw);
    }
    case "date":
      return formatDateValue(String(value));
    case "select": {
      const option = editable.options.find((o) => o.value === value);
      return option ? optionLabel(option) : String(value);
    }
    case "boolean":
      return undefined;
    default:
      return String(value);
  }
}

/** boolean 的複製呈現。顯示是開關沒有文字，複製時得換成看得懂的字。 */
const BOOLEAN_COPY_TEXT = { true: "是", false: "否" } as const;

/**
 * 一格複製到剪貼簿的純文字。要的是「人看得懂的文字」而不是原始值，所以
 * 有宣告 `editable` 時走 `cellTitleText`——千分位、日期格式、select 的標籤
 * 都已經套過。
 *
 * 順序：`copyValue` → `editable` → `filterValue` → `sortValue` → 空字串。
 * 取不到時回空字串而不是跳過，該欄仍然佔一個欄位，貼過去才不會錯位。
 */
export function cellCopyText<T>(
  column: ConsoleTableColumn<T>,
  row: T,
): string {
  if (column.copyValue) return column.copyValue(row);
  const editable = column.editable;
  if (editable) {
    // boolean 的 cellTitleText 是 undefined（它的顯示是開關不是文字）
    if (editable.type === "boolean") {
      return BOOLEAN_COPY_TEXT[editable.getValue(row) === true ? "true" : "false"];
    }
    const text = cellTitleText(editable, row);
    if (text !== undefined) return text;
    // 空值複製空字串，不複製顯示用的 `—`——貼進試算表會變成一個破折號
    if (isEmptyValue(editable.getValue(row))) return "";
  }
  if (column.filterValue) return column.filterValue(row);
  const sortValue = column.sortValue?.(row);
  if (sortValue !== null && sortValue !== undefined) return String(sortValue);
  return "";
}

/** 未知值的統一呈現：原樣顯示、虛線外框標示、滑鼠停留說明為什麼。 */
function Unrecognised({ text, reason }: { text: string; reason: string }) {
  return (
    <span
      data-unrecognised="true"
      title={reason}
      className="text-muted-foreground decoration-muted-foreground/60 underline decoration-dashed underline-offset-2"
    >
      {text}
    </span>
  );
}

function EmptyValue() {
  return <span className="text-muted-foreground/60">{EMPTY_DISPLAY}</span>;
}

/**
 * 讓標籤在窄欄裡縮得動。
 *
 * `Badge` 的基底是 `inline-flex w-fit shrink-0 overflow-hidden`，三件事各自
 * 都對：它平常是一列裡的一顆狀態標記，本來就不該被旁邊的東西擠扁。但放進一
 * 個會被拖窄的欄位之後，儲存格的 `text-ellipsis` 既進不去那個 flex 脈絡、也
 * 推不動一個拒絕收縮的盒子——於是標籤被切在半個字上，後面跟著儲存格自己擠
 * 出來的省略號。
 *
 * 兩件事要一起做才有用：盒子准許變窄（這裡），文字在盒子裡自己截斷
 * （`TagLabel`）。只做前者字會被 `overflow-hidden` 直接切掉，只做後者盒子
 * 根本不縮。
 *
 * 改在這裡而不是改 `Badge`：會被拖窄的是表格的欄位，不是標籤這個概念，而
 * `Badge` 另外六個使用端都沒有這個問題。
 */
const SHRINKABLE = "min-w-0 max-w-full shrink";

/** 標籤裡的文字。`min-w-0` 是關鍵——flex 子元素的預設最小寬度是內容寬度，
 *  少了它 `truncate` 不會生效。 */
function TagLabel({ children }: { children: React.ReactNode }) {
  return <span className="min-w-0 truncate">{children}</span>;
}

/**
 * `select` 的標籤：三種顏色寫法（design D9）。
 * 不給顏色＝純文字；`colored: true` 依選項宣告順序自動配色；逐選項指定＝
 * badge 變體名稱或自由色碼。自由色碼一律半透明淡底＋同色文字，不做實心
 * 填色——填亮黃時白字會直接消失。
 */
function SelectTag({
  option,
  index,
  colored,
}: {
  option: ConsoleTableSelectOption;
  index: number;
  colored: boolean;
}) {
  const label = optionLabel(option);
  const explicit = resolveTagColor(option.color);

  if (explicit?.kind === "variant") {
    return (
      <Badge variant={explicit.variant} className={SHRINKABLE}>
        <TagLabel>{label}</TagLabel>
      </Badge>
    );
  }
  // 逐選項指定的色碼優先；沒指定但開了 colored 就依索引取色
  const code = explicit?.kind === "code" ? explicit.code : undefined;
  const autoCode = code ?? (colored ? paletteColorAt(index) : undefined);
  if (autoCode) {
    return (
      <Badge
        style={tagColorStyle(autoCode)}
        className={cn(TAG_COLOR_CLASS, SHRINKABLE)}
      >
        <TagLabel>{label}</TagLabel>
      </Badge>
    );
  }
  // 「我只要下拉選單、不要彩色標籤」的欄位不必被迫配色
  return <>{label}</>;
}

/**
 * 依型別渲染預設顯示。欄位有給 `cell` 時不會走到這裡——`cell` 仍是主要的
 * 顯示 API，型別只管編輯（design D3）。
 */
export function CellDisplay<T>({
  editable,
  row,
  onBooleanToggle,
  disabled,
}: {
  editable: ConsoleTableEditable<T>;
  row: T;
  /** boolean 沒有編輯態，顯示的就是可點的開關（design D12）。 */
  onBooleanToggle?: (next: boolean) => void;
  disabled?: boolean;
}) {
  const value = editable.getValue(row);

  // boolean 先處理：它的「空」就是未開啟，走不到下面的空值分支。
  // 顯示是純文字的 ✓／—，不借用任何控制項元件；它沒有編輯態，這顆字
  // 本身就是寫入入口（design D12），所以仍是 role="switch" 的按鈕。
  // 停用走 aria-disabled 而不是原生 disabled：按鈕留在 tab 順序裡，唯讀
  // 時仍讀得到「已開啟／未開啟」，只是按下去不回報。
  if (editable.type === "boolean") {
    const checked = value === true;
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-disabled={disabled || undefined}
        aria-label="切換"
        className={cn(
          "inline-flex min-w-4 justify-center rounded-sm text-sm",
          checked ? "text-foreground" : "text-muted-foreground",
          !disabled && "hover:text-foreground cursor-pointer",
        )}
        onClick={() => {
          if (!disabled) onBooleanToggle?.(!checked);
        }}
      >
        {checked ? "✓" : EMPTY_DISPLAY}
      </button>
    );
  }

  if (isEmptyValue(value)) return <EmptyValue />;

  switch (editable.type) {
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return (
          <Unrecognised text={String(value)} reason="這個值不是數字，原樣顯示" />
        );
      }
      return (
        <>
          {formatNumber(value, {
            grouping: editable.grouping ?? true,
            precision: editable.precision,
          })}
        </>
      );
    }
    case "date": {
      const text = String(value);
      if (!isValidDateValue(text)) {
        return (
          <Unrecognised text={text} reason="這個值不是有效的日期，原樣顯示" />
        );
      }
      return <>{formatDateValue(text)}</>;
    }
    case "select": {
      const text = String(value);
      const index = editable.options.findIndex((o) => o.value === text);
      if (index === -1) {
        return (
          <Unrecognised text={text} reason="這個值不在選項清單中，原樣顯示" />
        );
      }
      return (
        <SelectTag
          option={editable.options[index]}
          index={index}
          colored={editable.colored === true}
        />
      );
    }
    default:
      return <>{String(value)}</>;
  }
}

/** 可編輯儲存格的 hover 提示，讓使用者看得出哪些格子能改。 */
export const EDITABLE_HINT_CLASS = cn(
  "-mx-1 -my-0.5 cursor-text rounded-sm px-1 py-0.5 transition-colors",
  "hover:bg-muted/60 hover:ring-border hover:ring-1 hover:ring-inset",
);
