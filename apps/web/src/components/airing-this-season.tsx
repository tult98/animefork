import { useQuery } from '@tanstack/react-query';
import { seasonLabel } from '../lib/titles/airing-list.ts';
import { fetchHome, japaneseSeasonPath } from '../lib/titles/home.ts';
import { useTransport } from '../lib/transport/index.ts';
import { TitleListing, type TitleListingProps } from './title-listing.tsx';

export function AiringThisSeason({
  search,
  onSearch,
}: Pick<TitleListingProps, 'search' | 'onSearch'>) {
  const transport = useTransport();
  const home = useQuery({
    queryKey: ['home'],
    queryFn: ({ signal }) => fetchHome(transport, signal),
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
