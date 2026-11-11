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

const NEW_EPISODES_PATH = '/anime-moi/';
const NEW_EPISODES_LIMIT = 200;

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
  component: NewEpisodes,
});

function NewEpisodes() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { sort, page } = Route.useSearch();

  return (
    <TitleListing
      heading="Mới cập nhật"
      emptyText="Chưa có phim nào mới cập nhật."
      sourcePath={NEW_EPISODES_PATH}
      newEpisode
      showCount={false}
      limit={NEW_EPISODES_LIMIT}
      search={{ sort, page }}
      onSearch={(next, { replace }) =>
        navigate({ search: (prev) => ({ ...prev, ...next }), replace })
      }
    />
  );
}
