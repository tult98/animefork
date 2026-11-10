import { Link } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { titleLink } from '../lib/titles/link.ts';
import type { Title } from '../lib/titles/title.ts';
import { hoverPosition, type Anchor } from '../lib/ui/hover-position.ts';
import { Play, ChevronDown } from './ui/icons.ts';

const OPEN_DELAY_MS = 250;
const NO_HOVER_QUERY = '(hover: none), (pointer: coarse)';

interface PosterCardProps {
  title: Title;
  rank?: number;
  newEpisode?: boolean;
}

function CardImage({ title, alt }: { title: Title; alt: string }) {
  return (
    <img
      src={title.image}
      alt={alt}
      loading="lazy"
      decoding="async"
      className="size-full object-cover object-top"
    />
  );
}

export function PosterCard({
  title,
  rank,
  newEpisode = false,
}: PosterCardProps) {
  const isRank = rank !== undefined;
  const coverRef = useRef<HTMLAnchorElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const close = () => {
    window.clearTimeout(timer.current);
    setAnchor(null);
  };

  const scheduleOpen = () => {
    if (window.matchMedia(NO_HOVER_QUERY).matches) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const rect = coverRef.current?.getBoundingClientRect();
      if (rect)
        setAnchor({ left: rect.left, top: rect.top, width: rect.width });
    }, OPEN_DELAY_MS);
  };

  const place = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el || !anchor) return;
      const { left, top } = hoverPosition(
        anchor,
        { width: window.innerWidth, height: window.innerHeight },
        el.offsetHeight,
      );
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.visibility = 'visible';
    },
    [anchor],
  );

  const link = titleLink(title);
  const label = `${isRank ? `Hạng ${rank}: ` : ''}${title.name}, ${title.episodeLabel}`;
  const hd = title.quality && /hd/i.test(title.quality) ? title.quality : null;

  return (
    <div
      data-testid={`card:${title.path}`}
      className={
        isRank ? 'relative flex w-(--rkslot) justify-end' : 'relative w-full'
      }
      onMouseEnter={scheduleOpen}
      onMouseLeave={close}
      onFocus={scheduleOpen}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          close();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') close();
      }}
    >
      {isRank ? (
        <span
          aria-hidden="true"
          className="af-rank-n pointer-events-none text-(length:--rkfs)"
        >
          {rank}
        </span>
      ) : null}
      <div className={isRank ? 'relative z-1 w-(--rkposter)' : 'relative z-1'}>
        <Link
          {...link}
          ref={coverRef}
          data-cover=""
          aria-label={label}
          className="block rounded-lg"
        >
          <div className="relative">
            {isRank ? (
              <div className="af-poster-art">
                <CardImage title={title} alt={title.name} />
              </div>
            ) : (
              <div className="af-thumb-art aspect-(--card-art-ratio)">
                <CardImage title={title} alt={title.name} />
              </div>
            )}
            {newEpisode ? (
              <div className="af-tags bottom-2 z-2">
                <span className="af-tag">Tập mới</span>
                <span className="af-tag af-tag--watch">
                  {title.episodeLabel}
                </span>
              </div>
            ) : null}
          </div>
          <div className="pt-2">
            <p className="truncate text-sm/[1.3] font-medium">{title.name}</p>
            {newEpisode ? null : (
              <p className="truncate text-legal text-muted">
                {title.episodeLabel}
              </p>
            )}
          </div>
        </Link>
      </div>
      {anchor ? (
        <div
          ref={place}
          data-testid={`card:${title.path}:preview`}
          style={{ visibility: 'hidden' }}
          className="af-hover fixed top-0 left-0 z-100 w-[340px]"
        >
          <div className="aspect-(--card-art-ratio) bg-surface-alt">
            <CardImage title={title} alt="" />
          </div>
          <div className="af-hover-body">
            <div className="af-hover-actions">
              <Link
                {...link}
                aria-label="Phát"
                className="af-circle af-circle--play"
              >
                <Play aria-hidden="true" />
              </Link>
              <span className="af-spacer" />
              <Link {...link} aria-label="Xem chi tiết" className="af-circle">
                <ChevronDown aria-hidden="true" />
              </Link>
            </div>
            <p className="mb-2 text-body-strong">{title.name}</p>
            <div className="af-hover-meta">
              <span className="af-box">{title.rating.toFixed(1)}</span>
              {title.year === undefined ? null : <span>{title.year}</span>}
              <span>{title.episodeLabel}</span>
              {hd ? <span className="af-box">{hd}</span> : null}
            </div>
            {title.genres.length > 0 ? (
              <div className="af-hover-genres flex-wrap">
                {title.genres.map((genre) => (
                  <span key={genre}>{genre}</span>
                ))}
              </div>
            ) : null}
            {title.description ? (
              <p className="mt-2 line-clamp-2 text-legal text-muted">
                {title.description}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
