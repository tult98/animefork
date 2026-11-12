import fetchMock from '@fetch-mock/vitest';
import { afterEach, beforeEach, vi } from 'vitest';

// A developer's .env points VITE_API_URL at a local service, which no test may reach.
beforeEach(() => {
  vi.stubEnv('VITE_API_URL', '');
});

// No test reaches a real server. A request without a route throws, so a test lists every call it expects.
beforeEach(() => {
  fetchMock.mockGlobal();
});
afterEach(() => {
  fetchMock.mockRestore();
});

if (typeof document !== 'undefined') {
  const { cleanup, configure } = await import('@testing-library/react');
  afterEach(cleanup);
  // Whole-app renders parse fixture pages, which a loaded CI machine can stretch past the 1s default.
  configure({ asyncUtilTimeout: 5_000 });

  // jsdom has no layout or media engine, so the browser APIs the app calls get inert stand-ins.
  window.scrollTo = () => {};
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.scrollBy = () => {};
  window.matchMedia = (query) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  HTMLMediaElement.prototype.pause = () => {};
  HTMLMediaElement.prototype.load = () => {};
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
}
