import {
  createFileRoute,
  stripSearchParams,
  useNavigate,
} from '@tanstack/react-router';
import { SearchResults } from '../components/search-results.tsx';
import {
  DEFAULT_QUERY,
  DEFAULT_SEARCH_PAGE,
  SearchSchema,
} from '../lib/titles/search.ts';

export const Route = createFileRoute('/search')({
  validateSearch: SearchSchema,
  search: {
    middlewares: [
      stripSearchParams({ q: DEFAULT_QUERY, page: DEFAULT_SEARCH_PAGE }),
    ],
  },
  component: SearchRoute,
});

function SearchRoute() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { q, page } = Route.useSearch();

  return (
    <SearchResults
      q={q}
      page={page}
      onPage={(next) =>
        navigate({ search: (prev) => ({ ...prev, page: next }) })
      }
    />
  );
}
