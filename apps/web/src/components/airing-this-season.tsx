import { useQuery } from '@tanstack/react-query';
import { seasonLabel } from '../lib/titles/airing-list.ts';
import { japaneseSeasonPath, parseHome } from '../lib/titles/home.ts';
import { upstream } from '../lib/transport/index.ts';
import { TitleListing, type TitleListingProps } from './title-listing.tsx';

export function AiringThisSeason({
  search,
  onSearch,
}: Pick<TitleListingProps, 'search' | 'onSearch'>) {
  const home = useQuery({
    queryKey: ['home'],
    queryFn: ({ signal }) =>
      upstream
        .get('', { signal })
        .text()
        .then((html) => parseHome(html)),
  });
  const seasonPath = home.data?.seasonPath ?? null;

  return (
    <TitleListing
      heading="Đang chiếu mùa này"
      emptyText="Chưa có phim nào đang chiếu."
      sourcePath={
        home.isPending
          ? undefined
          : seasonPath && japaneseSeasonPath(seasonPath)
      }
      headerLabel={seasonLabel(seasonPath)}
      search={search}
      onSearch={onSearch}
      sourceError={home.error}
      onRetrySource={() => void home.refetch()}
    />
  );
}
