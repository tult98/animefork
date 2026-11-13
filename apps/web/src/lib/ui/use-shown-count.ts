import { useCallback, useState } from 'react';

export function useShownCount(
  total: number,
  {
    initial,
    step,
    resetKey,
  }: { initial: number; step: number; resetKey: string },
) {
  const [state, setState] = useState({ key: resetKey, count: initial });
  if (state.key !== resetKey) setState({ key: resetKey, count: initial });
  const shown = Math.min(state.key === resetKey ? state.count : initial, total);

  // The ref changes with `shown`, so each step watches the sentinel afresh: an observer reports only changes,
  // and a sentinel still in view after a step would otherwise never ask for the next one.
  const sentinelRef = useCallback(
    (el: HTMLElement | null) => {
      if (!el || typeof IntersectionObserver === 'undefined') return;
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting))
            setState({ key: resetKey, count: shown + step });
        },
        { rootMargin: '400px' },
      );
      observer.observe(el);
      return () => observer.disconnect();
    },
    [resetKey, shown, step],
  );

  return { shown, more: shown < total, sentinelRef };
}
