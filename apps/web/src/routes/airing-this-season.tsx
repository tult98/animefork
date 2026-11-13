import {
  createFileRoute,
  stripSearchParams,
  useNavigate,
} from '@tanstack/react-router';
import { AiringThisSeason } from '../components/airing-this-season.tsx';
import {
  DEFAULT_PAGE,
  DEFAULT_SORT,
  ListSearchSchema,
} from '../lib/titles/airing-list.ts';

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
  component: AiringThisSeasonRoute,
});

function AiringThisSeasonRoute() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { sort, page } = Route.useSearch();

  return (
    <AiringThisSeason
      search={{ sort, page }}
      onSearch={(next, { replace }) =>
        navigate({ search: (prev) => ({ ...prev, ...next }), replace })
      }
    />
  );
}
