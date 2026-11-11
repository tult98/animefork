import {
  keepPreviousData,
  skipToken,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  createFileRoute,
  stripSearchParams,
  useNavigate,
} from '@tanstack/react-router';
import { useMemo, useRef } from 'react';
import { Dropdown } from '../components/dropdown.tsx';
import { ErrorScreen } from '../components/error-screen.tsx';
import { Pager } from '../components/pager.tsx';
import { PosterCard } from '../components/poster-card.tsx';
import { SHIMMER } from '../components/shelf.tsx';
import {
  arrange,
  DEFAULT_PAGE,
  DEFAULT_SORT,
  ListSearchSchema,
  seasonLabel,
  SORT_LABELS,
  type SortKey,
} from '../lib/titles/airing-list.ts';
import {
  applyHomeArt,
  applyRatings,
  artPollDelay,
  artSkeletonLeft,
  fetchHomeArt,
  markArtPending,
} from '../lib/titles/art.ts';
import { fetchHome } from '../lib/titles/home.ts';
import {
  fetchSeasonFirstPage,
  fetchSeasonRest,
  joinSeasonPages,
} from '../lib/titles/season-pages.ts';
import { lookupTitles } from '../lib/titles/lookup.ts';
import type { DefaultShelf } from '../lib/titles/shelves.ts';
import { useTransport } from '../lib/transport/index.ts';
import { paginate } from '../lib/ui/paging.ts';

export const Route = createFileRoute('/airing-this-season')({
  validateSearch: ListSearchSchema,
  search: {
    middlewares: [
      stripSearchParams({
        sort: DEFAULT_SORT,
        page: DEFAULT_PAGE,
      }),
    ],
  },
  component: AiringThisSeason,
});

const GRID_CLASS =
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

function AiringThisSeason() {
  const transport = useTransport();
  const navigate = useNavigate({ from: Route.fullPath });
  const { sort, page } = Route.useSearch();
  const grid = useRef<HTMLDivElement>(null);

  const home = useQuery({
    queryKey: ['home'],
    queryFn: ({ signal }) => fetchHome(transport, signal),
  });
  const seasonPath = home.data?.seasonPath ?? null;
  const first = useQuery({
    queryKey: ['season-first', seasonPath],
    queryFn: seasonPath
      ? ({ signal }) => fetchSeasonFirstPage(transport, seasonPath, signal)
      : skipToken,
  });
  const pageCount = first.data?.pageCount ?? 1;
  const rest = useQuery({
    queryKey: ['season-rest', seasonPath, pageCount],
    queryFn:
      seasonPath && first.data
        ? ({ signal }) =>
            fetchSeasonRest(transport, seasonPath, pageCount, signal)
        : skipToken,
  });
  const settled = seasonPath === null || rest.isSuccess;

  const shelf = useMemo<DefaultShelf[]>(
    () => [
      {
        kind: 'default',
        id: 'airing-this-season',
        title: 'Đang chiếu mùa này',
        items: joinSeasonPages([
          first.data?.titles ?? [],
          rest.data?.titles ?? [],
        ]),
      },
    ],
    [first.data?.titles, rest.data?.titles],
  );
  const lookup = useMemo(() => lookupTitles(shelf), [shelf]);
  const apiOn = Boolean(import.meta.env.VITE_API_URL);
  const queryClient = useQueryClient();
  const artKey = ['home-art', lookup];
  const art = useQuery({
    queryKey: artKey,
    queryFn: ({ signal }) =>
      fetchHomeArt(lookup, { env: import.meta.env, signal }),
    enabled: settled && lookup.length > 0 && apiOn,
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      artPollDelay(query.state.data?.pending, query.state.dataUpdateCount),
  });
  const pollsLeft =
    art.isPlaceholderData ||
    artSkeletonLeft(queryClient.getQueryState(artKey)?.dataUpdateCount ?? 0);
  const titles = useMemo(() => {
    const applied = art.data
      ? applyRatings(applyHomeArt(shelf, art.data.paths), art.data.ratings)
      : shelf;
    const [marked] = markArtPending(applied, {
      apiOn,
      art: art.data,
      pollsLeft,
      failed: art.isError,
      sent: new Set(lookup.map((t) => t.slug)),
    });
    return marked?.items ?? shelf[0]?.items ?? [];
  }, [shelf, lookup, art.data, art.isError, apiOn, pollsLeft]);

  const entries = useMemo(() => arrange(titles, { sort }), [titles, sort]);
  const paged = paginate(entries, page);

  if (home.error || first.error) {
    return (
      <ErrorScreen
        error={home.error ?? first.error}
        onRetry={() => {
          void home.refetch();
          void first.refetch();
        }}
      />
    );
  }

  const label = seasonLabel(seasonPath);
  const count = `${entries.length} phim`;
  const loading = home.isPending || (seasonPath !== null && first.isPending);
  const preview = !settled && sort === DEFAULT_SORT && page === 1;
  const showSkeleton = loading || (!settled && !preview);
  const change = (next: Partial<{ sort: SortKey }>) =>
    void navigate({
      search: (prev) => ({ ...prev, ...next, page: DEFAULT_PAGE }),
      replace: true,
    });
  const goToPage = async (next: number) => {
    await navigate({ search: (prev) => ({ ...prev, page: next }) });
    grid.current?.scrollIntoView({ block: 'start' });
  };

  return (
    <div className="px-(--pad) pt-(--space-xl)" data-testid="listing">
      <div>
        <h1 className="text-title-lg">Đang chiếu mùa này</h1>
        {showSkeleton || !settled ? null : (
          <p className="mt-(--space-xs) text-muted" data-testid="listing:count">
            {label ? `${label} · ${count}` : count}
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
                <PosterCard title={title} />
              </div>
            ))}
          </div>
        ) : (
          <p data-testid="listing:empty" className="mt-(--space-xl) text-muted">
            Chưa có phim nào đang chiếu.
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
