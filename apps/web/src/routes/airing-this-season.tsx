import { useQuery } from '@tanstack/react-query';
import {
  createFileRoute,
  stripSearchParams,
  useNavigate,
} from '@tanstack/react-router';
import { TitleListing } from '../components/title-listing.tsx';
import {
  DEFAULT_PAGE,
  DEFAULT_SORT,
  ListSearchSchema,
  seasonLabel,
} from '../lib/titles/airing-list.ts';
import { fetchHome, japaneseSeasonPath } from '../lib/titles/home.ts';
import { useTransport } from '../lib/transport/index.ts';

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

function AiringThisSeason() {
  const transport = useTransport();
  const navigate = useNavigate({ from: Route.fullPath });
  const { sort, page } = Route.useSearch();
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
      search={{ sort, page }}
      onSearch={(next, { replace }) =>
        navigate({ search: (prev) => ({ ...prev, ...next }), replace })
      }
      sourceError={home.error}
      onRetrySource={() => void home.refetch()}
    />
  );
}
