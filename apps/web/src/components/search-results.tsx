import { skipToken, useQuery } from '@tanstack/react-query';
import { useMemo, useRef } from 'react';
import { fetchSearchPage } from '../lib/titles/search.ts';
import type { DefaultShelf } from '../lib/titles/shelves.ts';
import { ErrorScreen } from './error-screen.tsx';
import { Pager } from './pager.tsx';
import { PosterCard } from './poster-card.tsx';
import { SHIMMER } from './shelf.tsx';
import { GRID_CLASS } from './title-listing.tsx';
import { useArtTitles } from './use-art-titles.ts';

export interface SearchResultsProps {
  q: string;
  page: number;
  onPage: (page: number) => Promise<void> | void;
}

const SUGGESTIONS = [
  'Thử từ khóa khác',
  'Thử tên romaji thay cho tên tiếng Anh',
  'Thử một thể loại, như lãng mạn, khoa học viễn tưởng, thể thao hoặc hài',
];

function ResultsSkeleton() {
  return (
    <div
      data-testid="search:loading"
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

function NoMatches({ q }: { q: string }) {
  return (
    <section
      data-testid="search:empty"
      aria-labelledby="search-empty"
      className="mx-auto mt-(--space-xl) max-w-[900px]"
    >
      <h1 id="search-empty" className="mb-6 text-xl/[1.4]">
        {q === ''
          ? 'Hãy nhập từ khóa để tìm phim.'
          : `Không tìm thấy kết quả nào cho “${q}”.`}
      </h1>
      <p className="mb-4 text-xl/[1.4]">Gợi ý:</p>
      <ul className="m-0 list-disc pl-10 text-xl/[1.5]">
        {SUGGESTIONS.map((suggestion) => (
          <li key={suggestion}>{suggestion}</li>
        ))}
      </ul>
    </section>
  );
}

export function SearchResults({ q, page, onPage }: SearchResultsProps) {
  const grid = useRef<HTMLDivElement>(null);
  const results = useQuery({
    queryKey: ['search', q, page],
    queryFn:
      q === '' ? skipToken : ({ signal }) => fetchSearchPage(q, page, signal),
  });
  const shelf = useMemo<DefaultShelf[]>(
    () => [
      {
        kind: 'default',
        id: 'airing-this-season',
        title: 'Kết quả tìm kiếm',
        items: results.data?.titles ?? [],
      },
    ],
    [results.data?.titles],
  );
  const titles = useArtTitles(shelf, results.isSuccess);

  if (results.error) {
    return (
      <ErrorScreen
        error={results.error}
        onRetry={() => void results.refetch()}
      />
    );
  }
  if (q === '' || (results.isSuccess && results.data.titles.length === 0)) {
    return (
      <div className="px-(--pad)">
        <NoMatches q={q} />
      </div>
    );
  }

  const pageCount = results.data?.pageCount ?? 1;
  const goToPage = async (next: number) => {
    await onPage(next);
    grid.current?.scrollIntoView({ block: 'start' });
  };

  return (
    <div className="px-(--pad) pt-(--space-xl)" data-testid="search">
      <h1 className="text-title-lg">Kết quả cho “{q}”</h1>
      <div ref={grid} className="scroll-mt-4">
        {results.isPending ? (
          <ResultsSkeleton />
        ) : (
          <div role="list" className={GRID_CLASS} data-testid="search:grid">
            {titles.map((title) => (
              <div key={title.path} role="listitem" className="min-w-0">
                <PosterCard title={title} />
              </div>
            ))}
          </div>
        )}
      </div>
      {results.isPending || pageCount <= 1 ? null : (
        <Pager
          page={page}
          pageCount={pageCount}
          disabled={results.isFetching}
          onPage={(next) => void goToPage(next)}
        />
      )}
    </div>
  );
}
