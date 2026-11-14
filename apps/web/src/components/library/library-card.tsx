import { Link } from '@tanstack/react-router';
import type { LibraryTitle } from '../../lib/library/model.ts';
import { watchLink } from '../../lib/titles/link.ts';
import { X } from '../ui/icons.ts';

export interface LibraryCardProps {
  title: LibraryTitle;
  removeLabel: string;
  onRemove: () => void;
}

export function LibraryCard({
  title,
  removeLabel,
  onRemove,
}: LibraryCardProps) {
  return (
    <div
      role="listitem"
      data-testid={`library:card:${title.slug}`}
      className="min-w-0"
    >
      <Link
        {...watchLink(title.slug)}
        aria-label={title.titleName}
        className="af-thumb-art block w-full"
      >
        <img
          src={title.image}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      </Link>
      <div className="mt-(--space-sm) flex items-start justify-between gap-(--space-sm)">
        <div className="min-w-0">
          <div className="text-base/[1.4] font-medium">{title.titleName}</div>
          <div className="text-[13px]/[1.4] text-muted">
            {title.genres.join(' · ')}
          </div>
        </div>
        <button
          type="button"
          className="af-circle shrink-0"
          aria-label={removeLabel}
          title={removeLabel}
          onClick={onRemove}
        >
          <X aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
