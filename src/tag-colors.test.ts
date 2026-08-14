import { describe, expect, it } from "vitest";
import {
  TAG_PALETTE,
  TAG_PALETTE_BY_HUE,
  paletteColorAt,
  resolveTagColor,
  resolvedColorOf,
  tagColorStyle,
  unusedPaletteColor,
} from "./tag-colors";

describe("調色盤", () => {
  it("同一索引在多次呼叫回傳同一顏色", () => {
    expect(paletteColorAt(3)).toBe(paletteColorAt(3));
    expect(paletteColorAt(0)).toBe(TAG_PALETTE[0]);
  });

  it("相鄰索引是不同顏色", () => {
    expect(paletteColorAt(0)).not.toBe(paletteColorAt(1));
  });

  it("超過調色盤長度時循環，不會回傳 undefined", () => {
    expect(paletteColorAt(TAG_PALETTE.length)).toBe(TAG_PALETTE[0]);
    expect(paletteColorAt(TAG_PALETTE.length + 2)).toBe(TAG_PALETTE[2]);
  });
});

describe("顏色判別", () => {
  it("badge 變體名稱判別為變體", () => {
    expect(resolveTagColor("destructive")).toEqual({
      kind: "variant",
      variant: "destructive",
    });
    expect(resolveTagColor("secondary")).toEqual({
      kind: "variant",
      variant: "secondary",
    });
  });

  it("# 開頭判別為自由色碼", () => {
    expect(resolveTagColor("#dc2626")).toEqual({
      kind: "code",
      code: "#dc2626",
    });
  });

  it("沒給顏色回傳 null（純文字）", () => {
    expect(resolveTagColor(undefined)).toBeNull();
  });

  it("不認得的字串回傳 null，不猜一個顏色", () => {
    expect(resolveTagColor("bright-yellow")).toBeNull();
  });
});

describe("色碼樣式", () => {
  it("色碼掛在 CSS 變數上交給 color-mix", () => {
    expect(tagColorStyle("#dc2626")).toEqual({ "--tag-color": "#dc2626" });
  });
});

describe("unusedPaletteColor：新選項的配色", () => {
  it("回傳清單裡還沒用過的調色盤色", () => {
    const first = TAG_PALETTE[0];
    expect(unusedPaletteColor([])).toBe(first);
    expect(unusedPaletteColor([{ color: first }])).toBe(TAG_PALETTE[1]);
  });

  it("跳過已使用的，不管它們的順序", () => {
    const used = [{ color: TAG_PALETTE[1] }, { color: TAG_PALETTE[0] }];
    expect(unusedPaletteColor(used)).toBe(TAG_PALETTE[2]);
  });

  it("沒宣告顏色的選項不佔用色票", () => {
    expect(unusedPaletteColor([{}, {}])).toBe(TAG_PALETTE[0]);
  });

  it("全部用過就依索引循環，不回傳 undefined", () => {
    const all = TAG_PALETTE.map((color) => ({ color }));
    expect(TAG_PALETTE).toContain(unusedPaletteColor(all));
  });

  it("badge 變體不算佔用調色盤", () => {
    expect(unusedPaletteColor([{ color: "destructive" }])).toBe(TAG_PALETTE[0]);
  });
});

describe("resolvedColorOf：選項當下顯示的顏色", () => {
  it("逐選項指定的優先", () => {
    expect(resolvedColorOf({ color: "#123456" }, 3, true)).toBe("#123456");
  });

  it("沒指定但 colored 開著就依索引取色", () => {
    expect(resolvedColorOf({}, 2, true)).toBe(TAG_PALETTE[2]);
  });

  it("沒指定也沒開 colored 就沒有顏色（純文字）", () => {
    expect(resolvedColorOf({}, 2, false)).toBeUndefined();
  });

  it("整份 colored 清單解析出來的顏色與宣告順序一致", () => {
    const options = [{}, {}, {}];
    expect(options.map((o, i) => resolvedColorOf(o, i, true))).toEqual([
      TAG_PALETTE[0],
      TAG_PALETTE[1],
      TAG_PALETTE[2],
    ]);
  });
});

describe("顯示用的色相排序", () => {
  it("與自動配色用的是同一組色，只是排列不同", () => {
    expect([...TAG_PALETTE_BY_HUE].sort()).toEqual([...TAG_PALETTE].sort());
  });

  it("十色；面板另有預設與自訂兩格，加起來剛好排成完整的兩排", () => {
    expect(TAG_PALETTE_BY_HUE).toHaveLength(10);
    // 預設 + 10 色 + 自訂 = 12 格 = 6 欄 × 2 排
    expect(1 + TAG_PALETTE_BY_HUE.length + 1).toBe(12);
  });

  it("任兩色都夠好分", () => {
    // 不比色相：棕色與橘色的色相只差 10 度，靠的是明度差異——那正是
    // Notion 有棕色的理由。要測「看起來像不像」就得連明度一起算。
    const rgb = (hex: string) =>
      [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    let closest = Infinity;
    for (let i = 0; i < TAG_PALETTE_BY_HUE.length; i++) {
      for (let j = i + 1; j < TAG_PALETTE_BY_HUE.length; j++) {
        const a = rgb(TAG_PALETTE_BY_HUE[i]);
        const b = rgb(TAG_PALETTE_BY_HUE[j]);
        // 綠色權重最高：人眼對綠的差異最敏感
        const distance = Math.sqrt(
          2 * (a[0] - b[0]) ** 2 +
            4 * (a[1] - b[1]) ** 2 +
            3 * (a[2] - b[2]) ** 2,
        );
        closest = Math.min(closest, distance);
      }
    }
    expect(closest).toBeGreaterThan(100);
  });
});
