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
} from '../lib/titles/airing-list.ts';
import { UPCOMING_PATH } from '../lib/titles/home.ts';

export const Route = createFileRoute('/upcoming')({
  validateSearch: ListSearchSchema,
  search: {
    middlewares: [
      stripSearchParams({
        sort: DEFAULT_SORT,
        page: DEFAULT_PAGE,
      }),
    ],
  },
  component: Upcoming,
});

function Upcoming() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { sort, page } = Route.useSearch();

  return (
    <TitleListing
      heading="Sắp ra mắt"
      emptyText="Chưa có phim nào sắp ra mắt."
      sourcePath={UPCOMING_PATH}
      upcoming
      search={{ sort, page }}
      onSearch={(next, { replace }) =>
        navigate({ search: (prev) => ({ ...prev, ...next }), replace })
      }
    />
  );
}
