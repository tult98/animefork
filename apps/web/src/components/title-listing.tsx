import { skipToken, useQuery } from '@tanstack/react-query';
import { useMemo, useRef } from 'react';
import {
  arrange,
  DEFAULT_PAGE,
  DEFAULT_SORT,
  SORT_LABELS,
  type SortKey,
} from '../lib/titles/airing-list.ts';
import {
  fetchSeasonFirstPage,
  fetchSeasonRest,
  joinSeasonPages,
  limitTitles,
  pagesNeeded,
} from '../lib/titles/season-pages.ts';
import type { DefaultShelf } from '../lib/titles/shelves.ts';
import { paginate } from '../lib/ui/paging.ts';
import { Dropdown } from './dropdown.tsx';
import { ErrorScreen } from './error-screen.tsx';
import { Pager } from './pager.tsx';
import { PosterCard } from './poster-card.tsx';
import { SHIMMER } from './shelf.tsx';
import { useArtTitles } from './use-art-titles.ts';

export interface TitleListingProps {
  heading: string;
  emptyText: string;
  /** undefined while the path is still being resolved, null when there is no list to show. */
  sourcePath: string | undefined | null;
  headerLabel?: string | null;
  newEpisode?: boolean;
  upcoming?: boolean;
  showCount?: boolean;
  /** Keep only the newest `limit` titles of the source and fetch no more pages than that needs. */
  limit?: number;
  search: { sort: SortKey; page: number };
  onSearch: (
    next: Partial<{ sort: SortKey; page: number }>,
    options: { replace: boolean },
  ) => Promise<void> | void;
  sourceError?: unknown;
  onRetrySource?: () => void;
}

export const GRID_CLASS =
  'mt-(--space-lg) grid grid-cols-2 gap-x-2 gap-y-(--space-lg) md:grid-cols-3 desk:grid-cols-6';

function ListSkeleton() {
  return (
    <div
      data-testid="listing:loading"
      aria-busy="true"
      aria-label="Đang tải"
      className={GRID_CLASS}
    >
      {Array.from({ length: 12 }, (_, index) => (
        <div
          key={index}
          className={`aspect-(--card-art-ratio) rounded-lg ${SHIMMER}`}
        />
      ))}
    </div>
  );
}

export function TitleListing({
  heading,
  emptyText,
  sourcePath,
  headerLabel = null,
  newEpisode = false,
  upcoming = false,
  showCount = true,
  limit,
  search: { sort, page },
  onSearch,
  sourceError,
  onRetrySource,
}: TitleListingProps) {
  const grid = useRef<HTMLDivElement>(null);

  const seasonPath = sourcePath ?? null;
  const first = useQuery({
    queryKey: ['season-first', seasonPath, limit],
    queryFn: seasonPath
      ? ({ signal }) => fetchSeasonFirstPage(seasonPath, signal)
      : skipToken,
  });
  const pageCount = first.data
    ? pagesNeeded(first.data.pageCount, first.data.titles.length, limit)
    : 1;
  const rest = useQuery({
    queryKey: ['season-rest', seasonPath, pageCount, limit],
    queryFn:
      seasonPath && first.data
        ? ({ signal }) => fetchSeasonRest(seasonPath, pageCount, signal)
        : skipToken,
  });
  const settled = seasonPath === null || rest.isSuccess;

  const shelf = useMemo<DefaultShelf[]>(
    () => [
      {
        kind: 'default',
        id: 'airing-this-season',
        title: 'Đang chiếu mùa này',
        items: limitTitles(
          joinSeasonPages([first.data?.titles ?? [], rest.data?.titles ?? []]),
          limit,
        ),
      },
    ],
    [first.data?.titles, rest.data?.titles, limit],
  );
  const titles = useArtTitles(shelf, settled);

  const entries = useMemo(() => arrange(titles, { sort }), [titles, sort]);
  const paged = paginate(entries, page);

  if (sourceError || first.error) {
    return (
      <ErrorScreen
        error={sourceError ?? first.error}
        onRetry={() => {
          onRetrySource?.();
          void first.refetch();
        }}
      />
    );
  }

  const count = `${entries.length} phim`;
  const loading =
    sourcePath === undefined || (seasonPath !== null && first.isPending);
  const preview = !settled && sort === DEFAULT_SORT && page === 1;
  const showSkeleton = loading || (!settled && !preview);
  const change = (next: Partial<{ sort: SortKey }>) =>
    void onSearch({ ...next, page: DEFAULT_PAGE }, { replace: true });
  const goToPage = async (next: number) => {
    await onSearch({ page: next }, { replace: false });
    grid.current?.scrollIntoView({ block: 'start' });
  };

  return (
    <div className="px-(--pad) pt-(--space-xl)" data-testid="listing">
      <div>
        <h1 className="text-title-lg">{heading}</h1>
        {!showCount || showSkeleton || !settled ? null : (
          <p className="mt-(--space-xs) text-muted" data-testid="listing:count">
            {headerLabel ? `${headerLabel} · ${count}` : count}
          </p>
        )}
      </div>
      <div className="mt-(--space-lg) flex flex-wrap items-center gap-(--space-lg)">
        <Dropdown
          testId="listing:sort"
          label="Sắp xếp"
          value={sort}
          options={SORT_LABELS}
          disabled={!settled}
          onChange={(next) => change({ sort: next })}
        />
      </div>
      {rest.data?.complete === false ? (
        <p
          role="status"
          data-testid="listing:partial"
          className="mt-(--space-md) text-sm/[1.3] text-muted"
        >
          Chưa tải hết danh sách.
        </p>
      ) : null}
      <div ref={grid} className="scroll-mt-4">
        {showSkeleton ? (
          <ListSkeleton />
        ) : paged.items.length > 0 ? (
          <div role="list" className={GRID_CLASS} data-testid="listing:grid">
            {paged.items.map((title) => (
              <div key={title.path} role="listitem" className="min-w-0">
                <PosterCard
                  title={title}
                  newEpisode={newEpisode}
                  upcoming={upcoming}
                />
              </div>
            ))}
          </div>
        ) : (
          <p data-testid="listing:empty" className="mt-(--space-xl) text-muted">
            {emptyText}
          </p>
        )}
      </div>
      {showSkeleton || paged.pageCount <= 1 ? null : (
        <Pager
          page={paged.page}
          pageCount={paged.pageCount}
          disabled={!settled}
          onPage={(next) => void goToPage(next)}
        />
      )}
    </div>
  );
}
