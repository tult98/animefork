import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IconButton } from './icon-button.tsx';

interface HoverPopupProps {
  id: string;
  label: string;
  icon: ReactNode;
  width: number;
  children: ReactNode;
}

// Opens on hover and keyboard focus through CSS. The click toggle is for touch, where there is no hover.
export function HoverPopup({
  id,
  label,
  icon,
  width,
  children,
}: HoverPopupProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === 'Escape') setOpen(false);
      } else if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div ref={root} className="pl-pw" data-open={open}>
      <IconButton
        label={label}
        data-testid={`player:${id}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {icon}
      </IconButton>
      <div className="pl-pop" style={{ width }}>
        {children}
      </div>
    </div>
  );
}
