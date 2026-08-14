import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

/**
 * 版面測試——在真的瀏覽器裡跑，量得到寬度、溢出與命中區。
 *
 * 與 `vitest.config.ts` 分開是刻意的。那一份的註解寫著「讓這份設定複製到其
 * 他專案時零額外依賴」，而 `src/components/table/` 正是為了被複製而寫的。把
 * browser mode 加進去，複製的人就得一併扛 Playwright 才跑得動他本來就有的
 * 行為測試。
 *
 * 這裡載入專案真正的 `globals.css`：測試看到的必須是實際會生效的樣式，否則
 * 又回到「class 在不在」——而最近一次標籤沒截斷，正是每個 class 都在、被隔
 * 壁的 `shrink-0` 蓋掉。
 */
export default defineConfig({
  test: {
    include: ["src/**/*.layout.test.tsx"],
    setupFiles: ["./vitest.browser.setup.ts"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
  },
});
