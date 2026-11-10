import { Link, createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../components/placeholder-page.tsx';
import { Play } from '../components/ui/icons.ts';
import { watchLink } from '../lib/titles/link.ts';

export const Route = createFileRoute('/title/$')({ component: TitlePage });

function TitlePage() {
  const { _splat } = Route.useParams();
  const slug = (_splat ?? '').replace(/\/+$/, '');
  return (
    <>
      <PlaceholderPage name="Title" />
      <div className="px-(--pad)">
        <Link
          {...watchLink(slug)}
          data-testid="title:watch"
          className="af-pill af-pill--play"
        >
          <Play aria-hidden="true" className="fill-current stroke-none" />
          Xem phim
        </Link>
      </div>
    </>
  );
}
