import { defineConfig } from "vitest/config";

// 行為測試（jsdom，不需要瀏覽器）。版面測試——會不會溢出、命中區有多大、對齊
// 在哪一邊——在 vitest.browser.config.mts，因為 jsdom 沒有排版引擎。
//
// 刻意不用 @vitejs/plugin-react（它會拉進 babel 8，與 shadcn 依賴的 babel 7
// 衝突）——Vitest 內建的轉譯就編得動 TSX，設定裡不必指定 jsx（指定了也會被
// 忽略，vitest 會警告 oxc 的設定優先）。
export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "src/**/*.layout.test.tsx"],
  },
});
