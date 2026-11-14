import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { HeaderIconButton } from './ui/header.tsx';
import { Search, X } from './ui/icons.ts';

const MOBILE_ICON_CLASS =
  'grid size-11 place-items-center rounded-full hover:bg-pill-active desk:hidden';

function useCurrentQuery(): string {
  const { pathname, search } = useRouterState({
    select: (state) => state.location,
  });
  const q = (search as { q?: unknown }).q;
  return pathname === '/search' && typeof q === 'string' ? q : '';
}

function SearchForm({
  initial,
  open,
  setOpen,
}: {
  initial: string;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initial);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  return (
    <form
      role="search"
      data-testid="search:bar"
      data-open={open}
      className={`flex h-12 min-w-0 items-center gap-1 overflow-hidden rounded-pill border bg-canvas pl-0 transition-[width,opacity,border-color] duration-200 ease-out max-desk:absolute max-desk:inset-0 max-desk:z-10 max-desk:h-auto max-desk:rounded-none max-desk:border-0 max-desk:px-(--pad) ${
        open
          ? 'border-border focus-within:border-focus desk:w-[clamp(240px,32vw,460px)]'
          : 'border-transparent bg-transparent max-desk:invisible max-desk:opacity-0 desk:w-11'
      }`}
      onSubmit={(event) => {
        event.preventDefault();
        const q = value.trim();
        if (q === '') return;
        void navigate({ to: '/search', search: { q } });
      }}
      onBlur={(event) => {
        if (value === '' && !event.currentTarget.contains(event.relatedTarget))
          setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label="Tìm kiếm"
        tabIndex={open ? -1 : 0}
        className="grid size-11 flex-none cursor-pointer place-items-center rounded-full hover:bg-pill-active max-desk:pointer-events-none"
        onClick={() => setOpen(true)}
      >
        <Search aria-hidden="true" className="af-icon" />
      </button>
      <input
        ref={input}
        type="search"
        data-testid="search:input"
        aria-label="Tìm phim"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className={`h-11 min-w-0 flex-1 border-0 bg-transparent text-base/normal text-ink outline-0! [&::-webkit-search-cancel-button]:hidden ${
          open ? '' : 'invisible'
        }`}
      />
      {open && value !== '' ? (
        <button
          type="button"
          aria-label="Xóa nội dung tìm kiếm"
          className="mr-3 grid size-7 flex-none cursor-pointer place-items-center rounded-full bg-pill-active text-ink"
          onClick={() => {
            setValue('');
            input.current?.focus();
          }}
        >
          <X aria-hidden="true" className="af-icon size-4" />
        </button>
      ) : null}
      <button
        type="button"
        className="min-h-11 flex-none cursor-pointer px-2 text-base/none font-medium desk:hidden"
        onClick={() => setOpen(false)}
      >
        Hủy
      </button>
    </form>
  );
}

export function SearchBox() {
  const q = useCurrentQuery();
  const [open, setOpen] = useState(q !== '');

  const [seenQ, setSeenQ] = useState(q);
  if (q !== seenQ) {
    setSeenQ(q);
    if (q !== '') setOpen(true);
  }

  return (
    <>
      <HeaderIconButton
        icon={Search}
        label="Mở tìm kiếm"
        className={MOBILE_ICON_CLASS}
        onClick={() => setOpen(true)}
      />
      <SearchForm key={q} initial={q} open={open} setOpen={setOpen} />
    </>
  );
}
