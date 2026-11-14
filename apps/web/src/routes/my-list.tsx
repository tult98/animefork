import {
  createFileRoute,
  stripSearchParams,
  useNavigate,
} from '@tanstack/react-router';
import { LibraryPage } from '../components/library/library-page.tsx';
import { HISTORY, LibrarySearchSchema } from '../lib/library/section.ts';

export const Route = createFileRoute('/my-list')({
  validateSearch: LibrarySearchSchema,
  search: { middlewares: [stripSearchParams({ section: HISTORY })] },
  component: MyListRoute,
});

function MyListRoute() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { section } = Route.useSearch();
  return (
    <LibraryPage
      section={section}
      onSection={(next) =>
        navigate({ search: (prev) => ({ ...prev, section: next }) })
      }
    />
  );
}
