import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * 這個資料夾自己的 `cn`，不從 `@/lib/utils` 拿。
 *
 * 它要能離開任何一個 app 獨立成立——共用元件對 `@/` 的每一個相依，都是複製
 * 或安裝它的人要先補上的東西。
 *
 * `twMerge` 不能省。表格靠它蓋掉底層元件的基底 class（例如標籤在窄欄裡要縮，
 * 是用 `shrink` 蓋掉 Badge 基底的 `shrink-0`）。換成純 `clsx` 會兩個都留著，
 * 而後果是安靜的：class 都在，效果沒有。
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
