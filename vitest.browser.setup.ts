// 專案真正的樣式。沒有它，量出來的每一個數字都是預設值，測試就只是換個地方
// 確認 class 字串存在。
import "./src/test/tokens.css";
import "@testing-library/jest-dom/vitest";

// 每個測試之間清乾淨。少了它，`document.querySelector` 會撈到上一個測試留
// 下來的節點——而版面測試量的是尺寸，撈錯節點會得到一個看起來合理的數字。
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
afterEach(cleanup);

import "./src/test-ui";
