"use client";

import type * as React from "react";

/**
 * 表格向宿主索取的介面。
 *
 * 這個資料夾要能同時活在兩個 app 裡，而那兩個 app 的 primitive 不一樣（一邊
 * base-ui、一邊 Radix）。硬選一邊，另一邊就得為了一張表格搬遷整套 primitive；
 * 所以表格改成不認識任何 primitive 函式庫，只認識這份契約，由每個 app 用它
 * 手上已經有的東西實作。
 *
 * 契約刻意只列**表格真的用到的**：`size` 只有 `sm` 與 `icon-sm`，`align` 只有
 * `start`。多列一個就是多要求實作者一件事，而沒有人會因為契約寬鬆而受益。
 * （這幾個 union 是被型別檢查逼出來的——手動 grep 只找得到字面值，找不到
 * `variant={isPrimary ? "default" : "outline"}` 這種。）
 *
 * 設定是模組層級而不是 React context：context 要包整棵樹，現有的四百多個測試
 * 每一個 `render()` 都要改；工廠函式型別乾淨但泛型推導會卡在回傳值上。註冊表
 * 的代價是一個 process 只能有一套實作——對一個 app 而言那正好是事實。
 */

type Cls = { className?: string };

export type TableUIComponents = {
  Badge: React.ComponentType<
    Cls & {
      variant?: "default" | "secondary" | "destructive" | "outline" | "ghost";
      style?: React.CSSProperties;
      title?: string;
      children?: React.ReactNode;
    }
  >;

  /**
   * `render` 是「把觸發器變成這個元素」的多型寫法（base-ui 的形式）。Radix 用
   * `asChild` 表達同一件事，實作端轉一下即可：
   * `<RadixTrigger asChild>{render}</RadixTrigger>`。
   */
  Button: React.ComponentType<
    Cls &
      Omit<React.ComponentProps<"button">, "ref"> & {
        variant?: "default" | "secondary" | "outline" | "ghost" | "destructive";
        size?: "sm" | "icon-sm";
        render?: React.ReactElement;
      }
  >;

  Checkbox: React.ComponentType<
    Cls & {
      checked?: boolean;
      /** 三態的中間態。缺了它群組與全選的「部分選取」表達不出來。 */
      indeterminate?: boolean;
      onCheckedChange?: (checked: boolean) => void;
      "aria-label"?: string;
      [dataAttr: `data-${string}`]: unknown;
    }
  >;

  Input: React.ComponentType<
    Cls & Omit<React.ComponentProps<"input">, "ref"> & { ref?: React.Ref<HTMLInputElement> }
  >;

  Label: React.ComponentType<Cls & React.ComponentProps<"label">>;

  Popover: React.ComponentType<{
    /** 受控開關——選項設定面板那類需要程式決定何時關。 */
    open?: boolean;
    onOpenChange?: (open: boolean, details?: unknown) => void;
    children?: React.ReactNode;
  }>;
  PopoverTrigger: React.ComponentType<{
    render?: React.ReactElement;
    children?: React.ReactNode;
  }>;
  PopoverContent: React.ComponentType<
    Cls & { align?: "start" | "center" | "end"; children?: React.ReactNode }
  >;

  Dialog: React.ComponentType<{
    open?: boolean;
    onOpenChange?: (open: boolean, details?: unknown) => void;
    children?: React.ReactNode;
  }>;
  DialogTrigger: React.ComponentType<{
    render?: React.ReactElement;
    children?: React.ReactNode;
  }>;
  DialogContent: React.ComponentType<
    Cls & {
      /** `sheet` 在窄螢幕貼著底邊；寬螢幕仍是置中對話框。 */
      variant?: "dialog" | "sheet";
      onDismiss?: () => void;
      showCloseButton?: boolean;
      children?: React.ReactNode;
    }
  >;
  DialogHeader: React.ComponentType<Cls & { children?: React.ReactNode }>;
  DialogTitle: React.ComponentType<Cls & { children?: React.ReactNode }>;
  DialogFooter: React.ComponentType<Cls & { children?: React.ReactNode }>;

  /**
   * 錨在某一格上的浮層——整張表共用一個編輯器，浮在正在編輯的儲存格旁邊。
   *
   * 用一個元件而不是把 portal／定位／彈出層拆成四個：表格要說的是「把這個放
   * 在那一格旁邊」，不是「用一個 Positioner，sideOffset 給 4」。定位由實作決
   * 定，但**必須是下方靠左、緊貼儲存格**——換一邊會讓編輯器蓋住它正在編輯的
   * 那一格。
   *
   * `details.reason` 是**吃重的**，不是附帶資訊：表格靠它分辨 Esc（取消）、
   * 點在別處（送出）、以及點在會換掉可見列的控制項上（丟棄草稿）。base-ui 直
   * 接給；Radix 沒有這個參數，但 `onEscapeKeyDown` /
   * `onPointerDownOutside` / `onFocusOutside` 合起來組得出來——實作端要負責
   * 組出它，不能省。
   *
   * 其餘的 props（含 `data-*`）原樣傳到彈出層那個元素上：測試與版面測試都靠
   * `data-slot="popover-content"` 找它，那個 DOM 契約留在表格這一側。
   */
  AnchoredPopup: React.ComponentType<
    Cls & {
      anchor: HTMLElement;
      open: boolean;
      onOpenChange: (
        open: boolean,
        details: { reason: string; event: Event },
      ) => void;
      children?: React.ReactNode;
      [dataAttr: `data-${string}`]: unknown;
    }
  >;

  /**
   * `containerClassName` 落在**捲動容器**上，不是 `<table>` 上。
   *
   * sticky 表頭是對「最近的捲動祖先」定位的，所以高度上限與 overflow 必須設
   * 在容器那一層；設在外面一層，表頭會錨在一個從不垂直捲動的元素上，跟著內容
   * 捲走。實作端要把它套到容器，不能只是併進 `<table>` 的 className。
   */
  Table: React.ComponentType<
    Cls & React.ComponentProps<"table"> & { containerClassName?: string }
  >;
  TableHeader: React.ComponentType<Cls & React.ComponentProps<"thead">>;
  TableBody: React.ComponentType<
    Cls & Omit<React.ComponentProps<"tbody">, "ref"> & { ref?: React.Ref<HTMLTableSectionElement> }
  >;
  TableRow: React.ComponentType<Cls & React.ComponentProps<"tr">>;
  TableHead: React.ComponentType<Cls & React.ComponentProps<"th">>;
  TableCell: React.ComponentType<Cls & React.ComponentProps<"td">>;
};

let registry: TableUIComponents | null = null;

/** 每個 app 啟動時呼叫一次（測試在 setup 檔裡呼叫）。 */
export function configureTableUI(components: TableUIComponents) {
  registry = components;
}

function need(): TableUIComponents {
  if (!registry) {
    throw new Error(
      "ConsoleDataTable 還沒拿到 UI 元件。請在 app 啟動時（測試則在 setup 檔）" +
        "呼叫一次 configureTableUI({ Badge, Button, ... })。",
    );
  }
  return registry;
}

/*
 * 以下的轉接元件讓表格的 JSX 一個字都不用改——只有 import 的來源換掉。
 * 每次渲染多一層函式呼叫，那是換掉整份 JSX 的代價相比之下便宜得多的選擇。
 */

type P<K extends keyof TableUIComponents> = React.ComponentProps<
  TableUIComponents[K]
>;

export const Badge = (p: P<"Badge">) => {
  const C = need().Badge;
  return <C {...p} />;
};
export const Button = (p: P<"Button">) => {
  const C = need().Button;
  return <C {...p} />;
};
export const Checkbox = (p: P<"Checkbox">) => {
  const C = need().Checkbox;
  return <C {...p} />;
};
export const Input = (p: P<"Input">) => {
  const C = need().Input;
  return <C {...p} />;
};
export const Label = (p: P<"Label">) => {
  const C = need().Label;
  return <C {...p} />;
};
export const Popover = (p: P<"Popover">) => {
  const C = need().Popover;
  return <C {...p} />;
};
export const PopoverTrigger = (p: P<"PopoverTrigger">) => {
  const C = need().PopoverTrigger;
  return <C {...p} />;
};
export const PopoverContent = (p: P<"PopoverContent">) => {
  const C = need().PopoverContent;
  return <C {...p} />;
};
export const Dialog = (p: P<"Dialog">) => {
  const C = need().Dialog;
  return <C {...p} />;
};
export const DialogTrigger = (p: P<"DialogTrigger">) => {
  const C = need().DialogTrigger;
  return <C {...p} />;
};
export const DialogContent = (p: P<"DialogContent">) => {
  const C = need().DialogContent;
  return <C {...p} />;
};
export const DialogHeader = (p: P<"DialogHeader">) => {
  const C = need().DialogHeader;
  return <C {...p} />;
};
export const DialogTitle = (p: P<"DialogTitle">) => {
  const C = need().DialogTitle;
  return <C {...p} />;
};
export const DialogFooter = (p: P<"DialogFooter">) => {
  const C = need().DialogFooter;
  return <C {...p} />;
};
export const AnchoredPopup = (p: P<"AnchoredPopup">) => {
  const C = need().AnchoredPopup;
  return <C {...p} />;
};
export const Table = (p: P<"Table">) => {
  const C = need().Table;
  return <C {...p} />;
};
export const TableHeader = (p: P<"TableHeader">) => {
  const C = need().TableHeader;
  return <C {...p} />;
};
export const TableBody = (p: P<"TableBody">) => {
  const C = need().TableBody;
  return <C {...p} />;
};
export const TableRow = (p: P<"TableRow">) => {
  const C = need().TableRow;
  return <C {...p} />;
};
export const TableHead = (p: P<"TableHead">) => {
  const C = need().TableHead;
  return <C {...p} />;
};
export const TableCell = (p: P<"TableCell">) => {
  const C = need().TableCell;
  return <C {...p} />;
};
