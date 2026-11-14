import { Link } from '@tanstack/react-router';
import type { ContinueItem } from '../../lib/titles/shelves.ts';
import { ProgressBar, watchedText } from '../continue-card.tsx';

export function HistoryCard({ item }: { item: ContinueItem }) {
  const id = `library:history:${item.slug}`;
  return (
    <div role="listitem" data-testid={id} className="min-w-0">
      <Link
        {...item.link}
        aria-label={`${item.titleName}, ${item.episodeLabel}, ${watchedText(item)}`}
        className="af-thumb-art block w-full"
      >
        <img
          src={item.image}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      </Link>
      <ProgressBar
        item={item}
        testId={`${id}:progress`}
        className="mt-2 h-[3px] w-3/5"
      />
      <div className="mt-(--space-sm) min-w-0">
        <div className="text-base/[1.4] font-medium">{item.titleName}</div>
        <div className="text-[13px]/[1.4] text-muted">{item.episodeLabel}</div>
      </div>
    </div>
  );
}
