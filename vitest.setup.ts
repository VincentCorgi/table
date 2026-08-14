import "@testing-library/jest-dom/vitest";

// jsdom 缺的瀏覽器 API，base-ui 的 popup／positioner 會用到。
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

Element.prototype.scrollIntoView ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};

// 測試也需要一份契約的實作。套件執行時期不認識任何 primitive 函式庫，但它自己
// 的測試得有東西可以渲染——見 src/test-ui.tsx。
import "./src/test-ui";
