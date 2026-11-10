import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ErrorScreen } from '../components/error-screen.tsx';
import { fetchHomeTitles } from '../lib/titles/home.ts';
import { useTransport } from '../lib/transport/index.ts';

export const Route = createFileRoute('/')({ component: Home });

function Home() {
  const { t } = useTranslation();
  const transport = useTransport();
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ['home'],
    queryFn: ({ signal }) => fetchHomeTitles(transport, signal),
  });

  if (error)
    return <ErrorScreen error={error} onRetry={() => void refetch()} />;
  if (isPending) {
    return (
      <p className="py-16 text-ink-muted" data-testid="home:loading">
        {t('common.loading')}
      </p>
    );
  }

  return (
    <section className="py-8">
      <h1 className="mb-4 text-xl font-semibold">{t('home.titles')}</h1>
      <ul
        data-testid="home:titles"
        className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6"
      >
        {data.map((title) => (
          <li
            key={title.path}
            data-testid={`card:${title.path}`}
            className="overflow-hidden rounded-card bg-surface shadow-card"
          >
            <img
              src={title.image}
              alt=""
              className="aspect-[2/3] w-full object-cover"
            />
            <div className="p-3">
              <p className="font-medium">{title.name}</p>
              <p className="text-sm text-ink-muted">
                {[
                  title.episodeLabel,
                  title.rating === undefined
                    ? undefined
                    : t('title.rating', { rating: title.rating }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
