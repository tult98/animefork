import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { nextMenuIndex, type MenuNavKey } from '../lib/ui/menu-nav.ts';
import { Button } from './ui/button.tsx';
import { Check, ChevronDown } from './ui/icons.ts';

const NAV_KEYS: readonly string[] = ['ArrowDown', 'ArrowUp', 'Home', 'End'];

export function Dropdown<T extends string>({
  testId,
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  testId: string;
  label: string;
  value: T;
  options: Record<T, string>;
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  const uid = useId();
  const labelId = `${uid}-label`;
  const valueId = `${uid}-value`;
  const [requested, setOpen] = useState(false);
  const [alignEnd, setAlignEnd] = useState(false);
  const open = requested && !disabled;
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const entries = Object.entries<string>(options) as [T, string][];

  const items = () =>
    Array.from(
      menu.current?.querySelectorAll<HTMLButtonElement>(
        '[role=menuitemradio]',
      ) ?? [],
    );

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    items()
      .find((item) => item.getAttribute('aria-checked') === 'true')
      ?.focus();
  }, [open]);

  // The menu is 220px wide at least, so a trigger near the right edge of a phone needs it flush right instead.
  useLayoutEffect(() => {
    if (!open || !menu.current || !trigger.current) return;
    const left = trigger.current.getBoundingClientRect().left;
    setAlignEnd(
      left + menu.current.offsetWidth >
        document.documentElement.clientWidth - 8,
    );
  }, [open]);

  const onMenuKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      close();
    } else if (NAV_KEYS.includes(event.key)) {
      event.preventDefault();
      const all = items();
      const index = all.findIndex((item) => item === document.activeElement);
      all[nextMenuIndex(index, all.length, event.key as MenuNavKey)]?.focus();
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span id={labelId} className="text-sm/[1.3] text-muted">
        {label}
      </span>
      <div className="relative">
        <Button
          ref={trigger}
          kind="pill"
          tone="outline"
          data-testid={testId}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-labelledby={`${labelId} ${valueId}`}
          disabled={disabled}
          onClick={() => setOpen((was) => !was)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' && !open) {
              event.preventDefault();
              setOpen(true);
            }
          }}
          className="px-4 aria-expanded:border-ink [&_svg]:size-4 [&_svg]:fill-none aria-expanded:[&_svg]:rotate-180"
        >
          <span id={valueId}>{options[value]}</span>
          <ChevronDown aria-hidden="true" />
        </Button>
        {open ? (
          <>
            <button
              type="button"
              aria-label="Đóng"
              tabIndex={-1}
              className="fixed inset-0 z-50 cursor-default border-0 bg-transparent p-0"
              onClick={() => setOpen(false)}
            />
            <div
              ref={menu}
              role="menu"
              aria-labelledby={labelId}
              onKeyDown={onMenuKey}
              className={`absolute top-[calc(100%+var(--space-sm))] z-60 flex min-w-[max(100%,220px)] flex-col gap-0.5 rounded-lg bg-surface p-(--space-sm) whitespace-nowrap shadow-card ${alignEnd ? 'right-0' : 'left-0'}`}
            >
              {entries.map(([key, text]) => (
                <button
                  key={key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={key === value}
                  data-testid={`${testId}:option:${key}`}
                  onClick={() => {
                    onChange(key);
                    close();
                  }}
                  className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-(--space-md) rounded-md border-0 bg-transparent px-4 text-left text-base/none text-muted hover:bg-pill-active hover:text-ink focus-visible:bg-pill-active focus-visible:text-ink aria-checked:font-semibold aria-checked:text-ink"
                >
                  {text}
                  {key === value ? (
                    <Check aria-hidden="true" className="size-4" />
                  ) : null}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
