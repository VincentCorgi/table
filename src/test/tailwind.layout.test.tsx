import { render } from "@testing-library/react";
import { expect, it } from "vitest";

/**
 * 這個檔案不測任何產品行為，只證明整套設定站得住：Tailwind v4 的樣式真的被
 * 編進測試頁、瀏覽器真的算了版面。
 *
 * 它先寫、也該一直留著——後面所有版面測試的前提都是它。它紅掉的時候，別的
 * 版面測試給的答案一個都不能信。
 */
it("Tailwind 的樣式真的生效，瀏覽器真的算了版面", () => {
  const { container } = render(<div className="h-4 w-10" />);
  const box = (container.firstChild as HTMLElement).getBoundingClientRect();

  // w-10 = 2.5rem = 40px、h-4 = 1rem = 16px。jsdom 兩個都會給 0。
  expect(box.width).toBe(40);
  expect(box.height).toBe(16);
});
