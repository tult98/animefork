import { useCallback, useEffect, useRef, useState } from 'react';
import {
  HOVER_WIDTH,
  hoverPosition,
  type Anchor,
} from '../lib/ui/hover-position.ts';

const OPEN_DELAY_MS = 250;
const NO_HOVER_QUERY = '(hover: none), (pointer: coarse)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const CLOSE_FALLBACK_MS = 300;

type Opening = Anchor & { height: number };

// The hover popover shared by the shelf cards. The first child of the preview element is its art, which the grow animation centres on the cover.
export function useHoverPreview<Cover extends HTMLElement>() {
  const coverRef = useRef<Cover>(null);
  const timer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);
  const [anchor, setAnchor] = useState<Opening | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      window.clearTimeout(closeTimer.current);
    },
    [],
  );

  const closeRef = useRef<() => void>(() => undefined);

  const unmount = () => {
    window.clearTimeout(closeTimer.current);
    setClosing(false);
    setAnchor(null);
  };

  const close = () => {
    window.clearTimeout(timer.current);
    if (!anchor || closing) return;
    if (window.matchMedia(REDUCED_MOTION_QUERY).matches) {
      unmount();
      return;
    }
    setClosing(true);
    closeTimer.current = window.setTimeout(unmount, CLOSE_FALLBACK_MS);
  };

  useEffect(() => {
    closeRef.current = close;
  });

  const isOpen = anchor !== null && !closing;
  useEffect(() => {
    if (!isOpen) return;
    const onScroll = () => closeRef.current();
    window.addEventListener('scroll', onScroll, {
      capture: true,
      passive: true,
    });
    return () =>
      window.removeEventListener('scroll', onScroll, { capture: true });
  }, [isOpen]);

  const scheduleOpen = () => {
    if (window.matchMedia(NO_HOVER_QUERY).matches) return;
    window.clearTimeout(timer.current);
    if (anchor) {
      window.clearTimeout(closeTimer.current);
      setClosing(false);
      return;
    }
    timer.current = window.setTimeout(() => {
      const rect = coverRef.current?.getBoundingClientRect();
      if (rect)
        setAnchor({
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        });
    }, OPEN_DELAY_MS);
  };

  const place = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el || !anchor) return;
      el.style.setProperty('--grow-scale', String(anchor.width / HOVER_WIDTH));
      const { left, top } = hoverPosition(
        anchor,
        { width: window.innerWidth, height: window.innerHeight },
        el.offsetHeight,
      );
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      const scale = anchor.width / HOVER_WIDTH;
      const art = el.firstElementChild as HTMLElement;
      const coverX = anchor.left + anchor.width / 2 - left;
      const coverY = anchor.top + anchor.height / 2 - top;
      const originOf = (cover: number, artMid: number) =>
        scale >= 0.99 ? cover : (cover - scale * artMid) / (1 - scale);
      el.style.transformOrigin = `${originOf(coverX, HOVER_WIDTH / 2)}px ${originOf(coverY, art.offsetHeight / 2)}px`;
      el.style.visibility = 'visible';
    },
    [anchor],
  );

  return {
    coverRef,
    open: anchor !== null,
    unmount,
    wrapperProps: {
      onMouseEnter: scheduleOpen,
      onMouseLeave: close,
      onFocus: scheduleOpen,
      onBlur: (event: React.FocusEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          close();
      },
      onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
        if (event.key === 'Escape') close();
      },
    },
    previewProps: {
      ref: place,
      'data-state': closing ? 'closing' : 'open',
      style: { visibility: 'hidden' } as const,
      onTransitionEnd: (event: React.TransitionEvent<HTMLElement>) => {
        if (
          closing &&
          event.target === event.currentTarget &&
          event.propertyName === 'opacity'
        )
          unmount();
      },
    },
  };
}
