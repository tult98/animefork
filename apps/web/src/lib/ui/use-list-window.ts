import { useCallback, useLayoutEffect, useRef, useState } from 'react';

interface ListWindow {
  key: string;
  start: number;
  end: number;
}

function around(
  key: string,
  anchor: number,
  before: number,
  size: number,
): ListWindow {
  const start = Math.max(0, anchor - before);
  return { key, start, end: start + size };
}

function watch(el: HTMLElement, onSeen: () => void) {
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) onSeen();
    },
    { rootMargin: '400px' },
  );
  observer.observe(el);
  return () => observer.disconnect();
}

function offsetIn(row: HTMLElement, scroller: HTMLElement) {
  return row.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
}

function putBack(row: HTMLElement, scroller: HTMLElement, offset: number) {
  scroller.scrollTop += offsetIn(row, scroller) - offset;
  return scroller.scrollTop;
}

export function useListWindow(
  total: number,
  {
    anchor,
    before,
    size,
    step,
    resetKey,
  }: {
    anchor: number;
    before: number;
    size: number;
    step: number;
    resetKey: string;
  },
) {
  // The anchor is part of the key so the window moves to it once the list it indexes has loaded.
  const key = `${resetKey}\n${anchor}`;
  const [state, setState] = useState(() => around(key, anchor, before, size));
  const current = state.key === key ? state : around(key, anchor, before, size);
  if (current !== state) setState(current);
  const start = Math.min(current.start, total);
  const end = Math.min(current.end, total);

  const held = useRef<{
    key: string;
    row: HTMLElement;
    offset: number;
    scrollTop?: number;
  } | null>(null);

  // The refs change with `start` and `end`, so each step watches its sentinel afresh: an observer reports only
  // changes, and a sentinel still in view after a step would otherwise never ask for the next one.
  const topRef = useCallback(
    (el: HTMLElement | null) => {
      if (!el || typeof IntersectionObserver === 'undefined') return;
      return watch(el, () => {
        const row = el.nextElementSibling;
        const scroller = el.parentElement;
        if (row instanceof HTMLElement && scroller)
          held.current = {
            key,
            row,
            offset: offsetIn(row, scroller),
          };
        setState((s) =>
          s.key === key ? { ...s, start: Math.max(0, start - step) } : s,
        );
      });
    },
    [key, start, step],
  );

  const bottomRef = useCallback(
    (el: HTMLElement | null) => {
      if (!el || typeof IntersectionObserver === 'undefined') return;
      return watch(el, () =>
        setState((s) => (s.key === key ? { ...s, end: end + step } : s)),
      );
    },
    [key, end, step],
  );

  // Rows added above would push the visible ones down, so the row that was first goes back to where it sat in the
  // scroll container, which must be the sentinel's parent. It is held there on every commit until the viewer
  // scrolls, because the added rows grow again when their episode info arrives. The offset is measured after the
  // commit, so the fix is right whether or not the browser already anchored the scroll itself.
  useLayoutEffect(() => {
    const kept = held.current;
    const scroller = kept?.row.parentElement;
    const scrolled =
      kept?.scrollTop !== undefined &&
      Math.abs((scroller?.scrollTop ?? 0) - kept.scrollTop) > 1;
    if (!kept || !scroller || kept.key !== key || scrolled) {
      held.current = null;
      return;
    }
    held.current = {
      ...kept,
      scrollTop: putBack(kept.row, scroller, kept.offset),
    };
  });

  return { start, end, topRef, bottomRef };
}
