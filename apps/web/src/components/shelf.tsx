import { Link } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DefaultShelf, Top10Shelf } from '../lib/titles/shelves.ts';
import { scrollDistance, scrollEdges } from '../lib/ui/scroll-edges.ts';
import { PosterCard } from './poster-card.tsx';
import { ChevronLeft, ChevronRight } from './ui/icons.ts';

const SEE_ALL_SHELVES = new Set([
  'new-episodes',
  'top-10-today',
  'airing-this-season',
]);

const ARROW_CLASS =
  'bg-border-strong/70 text-ink hover:bg-border-strong/90 cursor-pointer border-0';

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function Shelf({ shelf }: { shelf: DefaultShelf | Top10Shelf }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ atStart: true, atEnd: false });
  const top = shelf.kind === 'top10';

  const measure = useCallback(() => {
    const el = scroller.current;
    if (el) setEdges(scrollEdges(el));
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  const scrollBy = (direction: -1 | 1) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({
      left: scrollDistance(el.clientWidth, direction),
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const covers = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[data-cover]',
      ),
    ];
    const index = covers.findIndex((cover) => cover === document.activeElement);
    if (index < 0) return;
    const next = covers[index + (event.key === 'ArrowRight' ? 1 : -1)];
    if (!next) return;
    event.preventDefault();
    next.focus();
    next.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  };

  return (
    <section
      data-testid={`shelf:${shelf.id}`}
      aria-label={shelf.title}
      className={`relative mt-row ${top ? 'shelf--top' : ''}`}
    >
      <div className="mb-2 flex items-center gap-4 px-(--pad)">
        <h2 className="text-xl/[1.3] font-bold md:text-rail-title">
          {shelf.title}
        </h2>
        {SEE_ALL_SHELVES.has(shelf.id) ? (
          <Link
            to="/browse"
            data-testid={`shelf:${shelf.id}:see-all`}
            className="ml-auto flex min-h-11 items-center gap-1 text-sm/[1.3] font-medium text-muted hover:text-ink"
          >
            Xem tất cả
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        ) : null}
      </div>
      <div className="shelf-rail relative">
        <div className="shelf-arrows">
          <button
            type="button"
            aria-label="Cuộn sang trái"
            data-testid={`shelf:${shelf.id}:scroll-left`}
            hidden={edges.atStart}
            onClick={() => scrollBy(-1)}
            className={`shelf-arrow shelf-arrow--prev ${ARROW_CLASS}`}
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Cuộn sang phải"
            data-testid={`shelf:${shelf.id}:scroll-right`}
            hidden={edges.atEnd}
            onClick={() => scrollBy(1)}
            className={`shelf-arrow shelf-arrow--next ${ARROW_CLASS}`}
          >
            <ChevronRight aria-hidden="true" className="size-5" />
          </button>
        </div>
        <div
          ref={scroller}
          role="list"
          className="shelf-scroller"
          onScroll={measure}
          onKeyDown={onKeyDown}
        >
          {shelf.items.map((title) => (
            <div
              key={title.path}
              role="listitem"
              className={top ? 'shelf-item shelf-item--rank' : 'shelf-item'}
            >
              <PosterCard
                title={title}
                rank={'rank' in title ? title.rank : undefined}
                newEpisode={shelf.id === 'new-episodes'}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const SHIMMER =
  "relative overflow-hidden bg-surface-alt after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer after:bg-linear-to-r after:from-transparent after:via-white/6 after:to-transparent after:content-[''] motion-reduce:after:animate-none";

export function ShelfSkeleton({ id }: { id: string }) {
  return (
    <section
      data-testid={`shelf:${id}:loading`}
      aria-busy="true"
      aria-label="Đang tải"
      className="relative mt-row"
    >
      <div className="mb-2 flex min-h-11 items-center px-(--pad)">
        <div className={`h-6 w-48 rounded-sm ${SHIMMER}`} />
      </div>
      <div className="shelf-scroller">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="shelf-item">
            <div
              className={`aspect-(--card-art-ratio) rounded-lg ${SHIMMER}`}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
