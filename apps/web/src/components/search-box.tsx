import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { HeaderIconButton } from './ui/header.tsx';
import { Search, X } from './ui/icons.ts';

const ICON_BUTTON_CLASS =
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
  inputRef,
  onSubmitted,
}: {
  initial: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onSubmitted: () => void;
}) {
  const navigate = useNavigate();
  const [value, setValue] = useState(initial);

  return (
    <form
      role="search"
      className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-pill border border-border bg-canvas pr-3 pl-4 focus-within:border-focus desk:w-[clamp(240px,32vw,460px)] desk:flex-none"
      onSubmit={(event) => {
        event.preventDefault();
        const q = value.trim();
        if (q === '') return;
        void navigate({ to: '/search', search: { q } });
        onSubmitted();
      }}
    >
      <Search aria-hidden="true" className="af-icon flex-none" />
      <input
        ref={inputRef}
        type="search"
        data-testid="search:input"
        aria-label="Tìm phim"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="h-11 min-w-0 flex-1 border-0 bg-transparent text-base/normal text-ink outline-0 [&::-webkit-search-cancel-button]:hidden"
      />
      {value === '' ? null : (
        <button
          type="button"
          aria-label="Xóa nội dung tìm kiếm"
          className="grid size-7 flex-none cursor-pointer place-items-center rounded-full bg-pill-active text-ink"
          onClick={() => {
            setValue('');
            inputRef.current?.focus();
          }}
        >
          <X aria-hidden="true" className="af-icon size-4" />
        </button>
      )}
    </form>
  );
}

export function SearchBox() {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const q = useCurrentQuery();

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  return (
    <>
      <HeaderIconButton
        icon={Search}
        label="Tìm kiếm"
        className={ICON_BUTTON_CLASS}
        onClick={() => setOpen(true)}
      />
      <div
        data-testid="search:bar"
        className={
          open
            ? 'flex items-center gap-2 bg-canvas px-(--pad) max-desk:absolute max-desk:inset-0 max-desk:z-10'
            : 'max-desk:hidden desk:flex'
        }
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
      >
        <SearchForm
          key={q}
          initial={q}
          inputRef={inputRef}
          onSubmitted={() => setOpen(false)}
        />
        <button
          type="button"
          className="min-h-11 flex-none cursor-pointer px-2 text-base/none font-medium desk:hidden"
          onClick={() => setOpen(false)}
        >
          Hủy
        </button>
      </div>
    </>
  );
}
