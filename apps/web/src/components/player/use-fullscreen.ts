import { useCallback, useEffect, useState, type RefObject } from 'react';

export function useFullscreen(target: RefObject<HTMLElement | null>) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const sync = () =>
      setActive(
        !!target.current && document.fullscreenElement === target.current,
      );
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, [target]);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void target.current?.requestFullscreen().catch(() => undefined);
  }, [target]);

  return { active, toggle };
}
