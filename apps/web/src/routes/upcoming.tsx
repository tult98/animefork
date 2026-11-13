import {
  createFileRoute,
  stripSearchParams,
  useNavigate,
} from '@tanstack/react-router';
import { Upcoming } from '../components/upcoming.tsx';
import {
  DEFAULT_PAGE,
  DEFAULT_SORT,
  ListSearchSchema,
} from '../lib/titles/airing-list.ts';

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
  component: UpcomingRoute,
});

function UpcomingRoute() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { sort, page } = Route.useSearch();

  return (
    <Upcoming
      search={{ sort, page }}
      onSearch={(next, { replace }) =>
        navigate({ search: (prev) => ({ ...prev, ...next }), replace })
      }
    />
  );
}
