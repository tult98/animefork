import { pageWindow } from '../lib/ui/paging.ts';
import { ChevronLeft, ChevronRight } from './ui/icons.ts';

const PILL =
  'af-pill af-pill--outline gap-1 px-4 disabled:cursor-default disabled:opacity-40';
const NUMBER =
  'size-11 cursor-pointer rounded-full border border-transparent bg-transparent text-base/none font-medium text-muted hover:bg-pill-active hover:text-ink disabled:cursor-default aria-[current=page]:border-ink aria-[current=page]:bg-pill-active aria-[current=page]:font-semibold aria-[current=page]:text-ink';

export function Pager({
  page,
  pageCount,
  disabled,
  onPage,
}: {
  page: number;
  pageCount: number;
  disabled: boolean;
  onPage: (page: number) => void;
}) {
  return (
    <nav
      aria-label="Phân trang"
      data-testid="listing:pager"
      className="mt-(--space-xl) flex items-center justify-center gap-2"
    >
      <button
        type="button"
        data-testid="listing:prev"
        className={PILL}
        disabled={disabled || page <= 1}
        onClick={() => onPage(page - 1)}
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        Trước
      </button>
      <ol className="m-0 hidden list-none gap-1 p-0 md:flex">
        {pageWindow(page, pageCount).map((slot, index) =>
          slot === 'gap' ? (
            <li
              key={`gap-${index}`}
              aria-hidden="true"
              className="grid size-11 place-items-center text-muted"
            >
              …
            </li>
          ) : (
            <li key={slot}>
              <button
                type="button"
                data-testid={`listing:page:${slot}`}
                aria-label={`Trang ${slot}`}
                aria-current={slot === page ? 'page' : undefined}
                className={NUMBER}
                disabled={disabled}
                onClick={() => onPage(slot)}
              >
                {slot}
              </button>
            </li>
          ),
        )}
      </ol>
      <span
        data-testid="listing:summary"
        className="min-w-24 text-center text-sm/[1.3] text-muted md:hidden"
      >
        Trang {page} / {pageCount}
      </span>
      <button
        type="button"
        data-testid="listing:next"
        className={PILL}
        disabled={disabled || page >= pageCount}
        onClick={() => onPage(page + 1)}
      >
        Sau
        <ChevronRight aria-hidden="true" className="size-4" />
      </button>
    </nav>
  );
}
