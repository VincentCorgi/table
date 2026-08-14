/**
 * `select` 標籤的顏色解析。
 *
 * 這份調色盤刻意不 import src/lib/region-colors.ts（design D8）：
 * 一是那個檔在 src/lib/ 底下，跨專案複製 src/components/table/ 時會缺，
 * 破壞 README 的可攜承諾；二是用途不同——區域色要疊在平面圖線稿上，提供的
 * 是半透明 fill 與實心 stroke，標籤要的是底色與文字色。共用同一份資料會讓
 * 兩邊互相牽制：為了標籤可讀性去調某個色，平面圖那邊就跟著變。
 *
 * 色相順序比照 region-colors 以維持視覺一致，但兩份各自演進。
 */

/** badge.tsx 現成的語意變體，逐選項指定顏色時可直接填變體名稱。 */
const BADGE_VARIANTS = [
  "default",
  "secondary",
  "destructive",
  "outline",
  "ghost",
] as const;

export type BadgeVariantName = (typeof BADGE_VARIANTS)[number];

/**
 * 十色。色相刻意拉開——上一版有紅／玫／粉、藍／靛、綠／萊姆這種相鄰色，
 * 攤在色票上分不出來，選色時等於只有一半的選項。
 *
 * 這個順序是**自動配色**用的：`colored: true` 依「選項的宣告順序」取色，
 * 所以相鄰索引要一眼分得出來，順序刻意打散。同一組色的色相排序另見
 * `TAG_PALETTE_BY_HUE`。
 */
export const TAG_PALETTE: readonly string[] = [
  "#ec4899", // pink
  "#eab308", // yellow
  "#3b82f6", // blue
  "#f97316", // orange
  "#22c55e", // green
  "#a855f7", // purple
  "#ef4444", // red
  "#14b8a6", // teal
  "#a16207", // brown
  "#6b7280", // gray
];

/**
 * 同一組色，但依色相排好，供顏色面板呈現。
 *
 * 面板另有「預設」（不給顏色＝純文字）與「自訂」兩格，加起來剛好 12 格、
 * 排成完整的兩排。
 *
 * 兩份必須是同一組色，只是排列不同——統一成一份會犧牲其中一邊的用途。
 */
export const TAG_PALETTE_BY_HUE: readonly string[] = [
  "#6b7280", // gray
  "#a16207", // brown
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#3b82f6", // blue
  "#a855f7", // purple
  "#ec4899", // pink
];

/** 依索引取色，超過調色盤長度就循環。 */
export function paletteColorAt(index: number): string {
  const size = TAG_PALETTE.length;
  return TAG_PALETTE[((index % size) + size) % size];
}

/**
 * 清單裡還沒被用到的調色盤顏色。新增選項時用它配色——新選項一出生就跟
 * 別人撞色，會讓人以為建立失敗。全部用過了就退回依索引循環。
 */
export function unusedPaletteColor(
  options: readonly { color?: string }[],
): string {
  const used = new Set(options.map((o) => o.color).filter(Boolean));
  return (
    TAG_PALETTE.find((code) => !used.has(code)) ??
    paletteColorAt(options.length)
  );
}

/**
 * 某個選項**當下實際顯示**的顏色宣告。逐選項指定就用它自己的；沒指定但
 * 開了 `colored` 就是依宣告順序取的調色盤色；都不是就沒有顏色（純文字）。
 *
 * 拖曳排序時要靠它把顏色寫死回 `color`：`colored` 是依順序取色，順序一變
 * 所有顏色都會跳，而使用者只是想換個位置。
 */
export function resolvedColorOf(
  option: { color?: string },
  index: number,
  colored: boolean,
): string | undefined {
  if (option.color) return option.color;
  return colored ? paletteColorAt(index) : undefined;
}

export type ResolvedTagColor =
  | { kind: "variant"; variant: BadgeVariantName }
  | { kind: "code"; code: string };

/**
 * 判別逐選項指定的顏色：`#` 開頭走自由色碼（既有的區域色票也是這樣畫），
 * 否則對應到 badge 變體名稱。都不是就回傳 null，由呼叫端退為純文字，而不是
 * 猜一個顏色。
 */
export function resolveTagColor(
  color: string | undefined,
): ResolvedTagColor | null {
  if (!color) return null;
  if (color.startsWith("#")) return { kind: "code", code: color };
  return BADGE_VARIANTS.includes(color as BadgeVariantName)
    ? { kind: "variant", variant: color as BadgeVariantName }
    : null;
}

/**
 * 自由色碼的樣式。以 CSS 變數把色碼交給 class 裡的 `color-mix()`：
 * 底色是該色的半透明淡底，文字色是該色與 `--foreground` 的混合。
 *
 * 混 `--foreground` 而不是寫死黑或白，是為了同時服務深淺色模式——淺色模式
 * 下 foreground 近黑會把色相壓暗，深色模式下近白會提亮，兩邊都讀得到。
 * 實心填色則不行：使用者填亮黃時白字會直接消失（design D9）。
 */
export function tagColorStyle(code: string): React.CSSProperties {
  return { "--tag-color": code } as React.CSSProperties;
}

/**
 * 與 tagColorStyle 搭配的 class。字面寫出來讓 Tailwind 掃得到，不要用字串
 * 組出來——組出來的 class 不會被產生。
 */
export const TAG_COLOR_CLASS =
  "bg-[color-mix(in_oklch,var(--tag-color)_15%,transparent)] text-[color-mix(in_oklch,var(--tag-color)_75%,var(--foreground))]";
