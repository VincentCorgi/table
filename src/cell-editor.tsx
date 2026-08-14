"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  GripVertical,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "./cn";
import { AnchoredPopup, Input } from "./table-ui";
import {
  TAG_PALETTE,
  TAG_PALETTE_BY_HUE,
  resolveTagColor,
  resolvedColorOf,
  unusedPaletteColor,
} from "./tag-colors";
import type {
  CellEditorContext,
  ConsoleTableEditable,
  ConsoleTableSelectOption,
} from "./console-data-table";

/**
 * 儲存格編輯器。表格管生命週期（開、關、送出、取消、儲存中、失敗），
 * 這裡只負責畫控制項並把草稿值往上吐。
 *
 * 編輯器一律吃「未格式化」的原始值：原生數字輸入框不接受逗號，把顯示用的
 * `1,234` 塞進去會直接變成空的（design D6）。
 */

/** 一格的識別；`savingCells` / `cellErrors` 以此為 key。 */
export function cellId(rowKey: string, columnId: string): string {
  return `${rowKey}::${columnId}`;
}

/**
 * 浮出的編輯器容器。整張表只有一個實例，以「正在編輯的那一格」為錨點——
 * 不是每格各掛一顆 Popover（一頁數十列乘上可編輯欄位會是上百個 Root），
 * 也不是把編輯器塞在儲存格內（欄寬 120px 裝不下長文字，design D4）。
 *
 * 錨在儲存格上的浮層走 `AnchoredPopup` 契約而不是 `ui/popover.tsx`，
 * 因為需要傳 `anchor`，而那個 wrapper 沒有轉發它——改 wrapper 會讓「複製
 * src/components/table/ 到別的專案」時對方的 popover.tsx 缺這個能力。
 */
export function CellEditorPopover<T>({
  anchor,
  editable,
  context,
  error,
  onOpenChange,
  onOptionsChange,
  optionUsage,
}: {
  anchor: HTMLElement | null;
  editable: ConsoleTableEditable<T>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: CellEditorContext<any>;
  error?: string;
  onOpenChange: (open: boolean, details: { reason: string; event: Event }) => void;
  onOptionsChange?: (next: ConsoleTableSelectOption[]) => void;
  optionUsage?: (optionValue: string) => number;
}) {
  if (!anchor) return null;
  return (
    <AnchoredPopup
      anchor={anchor}
      open
      onOpenChange={onOpenChange}
      data-slot="popover-content"
      className={cn(
        "bg-popover text-popover-foreground ring-foreground/10 z-50 flex origin-(--transform-origin) flex-col gap-2.5 rounded-lg p-2 text-sm shadow-md ring-1 outline-hidden",
        // 具名尺寸而不是任意像素：任意寬度會讓各欄的編輯器寬度
        // 各異，看起來像沒對齊的意外
        editable.editorWidth === "wide" ? "w-96" : "w-64",
      )}
    >
      <CellEditor
        editable={editable}
        context={context}
        error={error}
        onOptionsChange={onOptionsChange}
        optionUsage={optionUsage}
      />
    </AnchoredPopup>
  );
}

export function CellEditor<T>({
  editable,
  context,
  error,
  onOptionsChange,
  optionUsage,
}: {
  editable: ConsoleTableEditable<T>;
  context: CellEditorContext;
  error?: string;
  /** 有給才會出現選項編輯（建立／改名／改色／刪除／排序）。 */
  onOptionsChange?: (next: ConsoleTableSelectOption[]) => void;
  /** 目前已載入的列裡有幾列用了某個選項值；刪除前告知影響範圍。 */
  optionUsage?: (optionValue: string) => number;
}) {
  const { value, onChange, onCommit, onCancel } = context;
  const inputRef = useRef<HTMLInputElement>(null);

  // 開啟就把游標放進去，使用者不必再點一次
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  /** Enter 送出、Esc 取消。Esc 交給 Popover 關閉，這裡只負責標記為取消。 */
  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      onCommit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  }

  // 逃生口：型別裝不下的欄位自帶編輯器，生命週期仍由表格管
  if (editable.renderEditor) {
    return (
      <div onKeyDown={handleKeyDown}>
        {editable.renderEditor(context)}
        {error ? <EditorError message={error} /> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {editable.type === "select" ? (
        <SelectOptionList
          options={editable.options}
          colored={editable.colored === true}
          value={value}
          onPick={(next) => {
            // 選了就等於決定了，不必再按 Enter
            onChange(next);
            onCommit(next);
          }}
          onOptionsChange={
            onOptionsChange
              ? (next) => onOptionsChange(next)
              : undefined
          }
          optionUsage={optionUsage}
        />
      ) : (
        <Input
          ref={inputRef}
          // date 用原生控制項（零依賴、可鍵盤輸入、行動裝置叫系統選擇器）；
          // number 用 text 而非 number，才收得下貼上的 1,234 再自行清理
          type={editable.type === "date" ? "date" : "text"}
          inputMode={editable.type === "number" ? "decimal" : undefined}
          min={editable.type === "date" ? editable.min : undefined}
          max={editable.type === "date" ? editable.max : undefined}
          value={value}
          aria-label="編輯值"
          aria-invalid={error ? true : undefined}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
      )}
      {error ? <EditorError message={error} /> : null}
    </div>
  );
}

function EditorError({ message }: { message: string }) {
  return (
    <p role="alert" className="text-destructive text-xs">
      {message}
    </p>
  );
}

/* ---------------- select 的選項清單與管理 ---------------- */

/** 一個選項的色塊；沒有顏色就畫一個空心框（＝純文字選項）。 */
function OptionSwatch({ color }: { color: string | undefined }) {
  const resolved = resolveTagColor(color);
  if (resolved?.kind === "code") {
    return (
      <span
        aria-hidden
        className="size-3 shrink-0 rounded-full"
        style={{ backgroundColor: resolved.code }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "border-border size-3 shrink-0 rounded-full border",
        resolved?.kind === "variant" && "bg-muted",
      )}
    />
  );
}

/**
 * `select` 的選項清單。沒給 `onOptionsChange` 時就是一份唯讀清單（行為與
 * 加入這個功能之前相同）；有給才長出建立、改名、改色、刪除、排序。
 *
 * **設定面板畫在同一個 popup 裡**，不另開一層浮層。浮層掛在 portal 上、
 * 不在編輯器的 DOM 子樹裡，會被關閉判定當成 outside-press 而把整個編輯器
 * 關掉；畫在裡面就完全沒有這個問題，焦點也留在同一個範圍內。
 */
function SelectOptionList({
  options,
  colored,
  value,
  onPick,
  onOptionsChange,
  optionUsage,
}: {
  options: ConsoleTableSelectOption[];
  colored: boolean;
  value: string;
  onPick: (next: string) => void;
  onOptionsChange?: (next: ConsoleTableSelectOption[]) => void;
  /** 目前**已載入的列**裡有幾列用了這個值；刪除前告知影響範圍。 */
  optionUsage?: (optionValue: string) => number;
}) {
  const editable = !!onOptionsChange;
  const [query, setQuery] = useState("");
  /** 開著設定面板的選項 value；null 代表在清單畫面。 */
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const text = query.trim();
  const shown = text
    ? options.filter((o) =>
        (o.label ?? o.value).toLowerCase().includes(text.toLowerCase()),
      )
    : options;
  const exact = options.find((o) => o.value === text);
  const settings = settingsFor
    ? options.find((o) => o.value === settingsFor)
    : undefined;

  function create() {
    if (!text || exact || !onOptionsChange) return;
    onOptionsChange([
      ...options,
      { value: text, label: text, color: unusedPaletteColor(options) },
    ]);
    setQuery("");
  }

  function patch(optionValue: string, next: Partial<ConsoleTableSelectOption>) {
    onOptionsChange?.(
      options.map((o) => (o.value === optionValue ? { ...o, ...next } : o)),
    );
  }

  function remove(optionValue: string) {
    onOptionsChange?.(options.filter((o) => o.value !== optionValue));
    setSettingsFor(null);
  }

  /**
   * 拖曳排序。排序前先把每個選項當下顯示的顏色寫進 `color`——`colored` 是
   * 依宣告順序取色，順序一變所有顏色都會跟著跳，而使用者只是想換個位置。
   */
  function reorder(from: number, to: number) {
    if (!onOptionsChange || from === to) return;
    const fixed = options.map((o, index) => ({
      ...o,
      color: resolvedColorOf(o, index, colored),
    }));
    const next = [...fixed];
    const [moved] = next.splice(from, 1);
    next.splice(to > from ? to - 1 : to, 0, moved);
    onOptionsChange(next);
  }

  function startReorder(event: React.PointerEvent<HTMLElement>, from: number) {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    handle.setPointerCapture?.(event.pointerId);
    setDragFrom(from);

    const indexAt = (clientY: number) => {
      const rows = [
        ...(listRef.current?.querySelectorAll("[data-option-row]") ?? []),
      ];
      let index = 0;
      for (const element of rows) {
        const box = element.getBoundingClientRect();
        if (clientY > box.top + box.height / 2) index += 1;
      }
      return index;
    };
    const onUp = (upEvent: PointerEvent) => {
      handle.removeEventListener("pointerup", onUp);
      setDragFrom(null);
      reorder(from, indexAt(upEvent.clientY));
    };
    handle.addEventListener("pointerup", onUp);
  }

  /**
   * Esc 只關最內層：面板開著就退回清單，不要一路把編輯器也關掉。
   * Popover 的 escape 處理掛在更外層，所以連原生事件的傳遞一起擋掉。
   */
  function handleEscape(event: React.KeyboardEvent) {
    if (event.key !== "Escape" || !settingsFor) return;
    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
    setSettingsFor(null);
  }

  // 設定面板：改名、改色、刪除。畫在同一個 popup 裡（見上方註解）
  if (settings) {
    const usage = optionUsage?.(settings.value) ?? 0;
    // 自訂色＝色碼且不在調色盤裡（在調色盤裡的由色票自己標示選中）
    const isCustom =
      !!settings.color?.startsWith("#") &&
      !TAG_PALETTE.includes(settings.color);
    return (
      <div
        className="flex flex-col gap-2"
        data-option-settings="true"
        onKeyDown={handleEscape}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="返回選項清單"
            className="text-muted-foreground hover:text-foreground flex size-6 items-center justify-center rounded-sm"
            onClick={() => setSettingsFor(null)}
          >
            <ChevronLeft className="size-4" />
          </button>
          <Input
            autoFocus
            aria-label="選項名稱"
            value={settings.label ?? settings.value}
            onChange={(event) =>
              patch(settings.value, { label: event.target.value })
            }
            className="h-7"
          />
        </div>

        <div>
          <p className="text-muted-foreground px-0.5 pb-1.5 text-xs">顏色</p>
          {/* 固定 6 欄：預設 ＋ 十色 ＋ 自訂 = 12 格，剛好兩排。
              擠不進格線的東西一律不放，否則會多出孤零零的第三排 */}
          <div className="grid grid-cols-6 gap-1.5">
            {/* 預設＝不給顏色（純文字），比照 Notion 排在第一個 */}
            <button
              type="button"
              aria-label="顏色 預設"
              aria-pressed={!settings.color}
              title="預設"
              onClick={() => patch(settings.value, { color: undefined })}
              className={cn(
                "border-muted-foreground/40 size-5 justify-self-center rounded-full border",
                !settings.color &&
                  "ring-foreground ring-offset-(--color-popover) ring-2 ring-offset-1",
              )}
            />
            {TAG_PALETTE_BY_HUE.map((code) => (
              <button
                key={code}
                type="button"
                aria-label={`顏色 ${code}`}
                aria-pressed={settings.color === code}
                onClick={() => patch(settings.value, { color: code })}
                style={{ backgroundColor: code }}
                className={cn(
                  "size-5 justify-self-center rounded-full",
                  settings.color === code &&
                    "ring-foreground ring-offset-(--color-popover) ring-2 ring-offset-1",
                )}
              />
            ))}
            {/* 自訂色是第 12 格。用原生控制項：零依賴、行動裝置叫系統選擇器 */}
            <label
              title="自訂顏色"
              className={cn(
                "relative flex size-5 cursor-pointer items-center justify-center justify-self-center rounded-full border border-dashed",
                isCustom
                  ? "ring-foreground ring-offset-(--color-popover) border-solid ring-2 ring-offset-1"
                  : "border-muted-foreground/40",
              )}
              style={isCustom ? { backgroundColor: settings.color } : undefined}
            >
              {!isCustom && (
                <Plus className="text-muted-foreground size-3" />
              )}
              <input
                type="color"
                aria-label="自訂顏色"
                value={isCustom ? settings.color : "#888888"}
                onChange={(event) =>
                  patch(settings.value, { color: event.target.value })
                }
                className="absolute inset-0 size-full cursor-pointer opacity-0"
              />
            </label>
          </div>
        </div>

        <div className="bg-border h-px" />
        {/* 影響範圍放在 title 而不是底下多一行字：面板要乾淨，但「刪掉會
            影響幾列」不該就此消失。數字只涵蓋已載入的列，文案照實說。 */}
        <button
          type="button"
          title={
            usage > 0
              ? `目前載入的列中有 ${usage} 列使用，刪除後會顯示為未識別的值`
              : "刪除選項"
          }
          className="text-destructive hover:bg-destructive/10 flex items-center gap-1.5 rounded-sm px-1 py-1 text-left text-sm"
          onClick={() => remove(settings.value)}
        >
          <Trash2 className="size-3.5" />
          刪除選項
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {editable && (
        <Input
          autoFocus
          aria-label="搜尋或建立選項"
          placeholder="搜尋或建立選項"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && text && !exact) {
              event.preventDefault();
              create();
            }
          }}
          className="h-7"
        />
      )}

      <div ref={listRef} className="max-h-56 overflow-y-auto">
        {shown.map((option) => {
          const index = options.indexOf(option);
          return (
            <div
              key={option.value}
              data-option-row="true"
              className={cn(
                "hover:bg-muted/60 group/option flex items-center gap-1 rounded-sm px-1",
                dragFrom === index && "opacity-40",
              )}
            >
              {editable && (
                <span
                  data-option-grip="true"
                  aria-hidden
                  className="text-muted-foreground/60 hover:text-foreground shrink-0 cursor-grab touch-none"
                  onPointerDown={(event) => startReorder(event, index)}
                >
                  <GripVertical className="size-3.5" />
                </span>
              )}
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
                onClick={() => onPick(option.value)}
              >
                <OptionSwatch
                  color={resolvedColorOf(option, index, colored)}
                />
                <span className="truncate">{option.label ?? option.value}</span>
                {option.value === value && (
                  <Check className="text-muted-foreground ml-auto size-3.5 shrink-0" />
                )}
              </button>
              {editable && (
                <button
                  type="button"
                  aria-label={`${option.label ?? option.value} 的設定`}
                  className="text-muted-foreground hover:text-foreground shrink-0 opacity-0 transition-opacity group-hover/option:opacity-100 focus-visible:opacity-100"
                  onClick={() => setSettingsFor(option.value)}
                >
                  <MoreHorizontal className="size-4" />
                </button>
              )}
            </div>
          );
        })}

        {editable && text && !exact && (
          <button
            type="button"
            className="hover:bg-muted/60 flex w-full items-center gap-1.5 rounded-sm px-1 py-1 text-left"
            onClick={create}
          >
            <Plus className="text-muted-foreground size-3.5 shrink-0" />
            <span className="truncate">
              建立「{text}」
            </span>
          </button>
        )}
        {editable && exact && text && (
          <p className="text-muted-foreground px-1 py-1 text-xs">
            「{text}」已經存在
          </p>
        )}
        {shown.length === 0 && !text && (
          <p className="text-muted-foreground px-1 py-1 text-xs">尚無選項</p>
        )}
      </div>
    </div>
  );
}
