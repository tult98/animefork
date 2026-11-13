import {
  createFileRoute,
  stripSearchParams,
  useNavigate,
} from '@tanstack/react-router';
import { NewEpisodes } from '../components/new-episodes.tsx';
import {
  DEFAULT_PAGE,
  DEFAULT_SORT,
  ListSearchSchema,
} from '../lib/titles/airing-list.ts';

export const Route = createFileRoute('/new-episodes')({
  validateSearch: ListSearchSchema,
  search: {
    middlewares: [
      stripSearchParams({
        sort: DEFAULT_SORT,
        page: DEFAULT_PAGE,
      }),
    ],
  },
  component: NewEpisodesRoute,
});

function NewEpisodesRoute() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { sort, page } = Route.useSearch();

  return (
    <NewEpisodes
      search={{ sort, page }}
      onSearch={(next, { replace }) =>
        navigate({ search: (prev) => ({ ...prev, ...next }), replace })
      }
    />
  );
}
