import { Link } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { episodeProgress } from '../lib/titles/episode-progress.ts';
import { titleWatchLink } from '../lib/titles/link.ts';
import { releaseInfo } from '../lib/titles/release.ts';
import type { Title } from '../lib/titles/title.ts';
import {
  HOVER_WIDTH,
  hoverPosition,
  type Anchor,
} from '../lib/ui/hover-position.ts';
import { useDetails } from './details/details-context.tsx';
import { Play, ChevronDown, Star } from './ui/icons.ts';

const OPEN_DELAY_MS = 250;
const NO_HOVER_QUERY = '(hover: none), (pointer: coarse)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const CLOSE_FALLBACK_MS = 300;

type Opening = Anchor & { height: number };

function formatVoters(n: number): string {
  return n >= 1000
    ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`
    : String(n);
}

function RatingChip({
  score,
  label,
  voters,
}: {
  score: string;
  label: string;
  voters: number | null | undefined;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm/[1.3] text-muted">
      <Star aria-hidden="true" className="size-3.5 fill-rating stroke-none" />
      <b className="text-base font-bold text-ink">{score}</b>
      <span>
        {label}
        {voters == null ? '' : ` ${formatVoters(voters)}`}
      </span>
    </span>
  );
}

interface PosterCardProps {
  title: Title;
  rank?: number;
  newEpisode?: boolean;
  upcoming?: boolean;
}

function CardImage({
  title,
  alt,
  src = title.image,
}: {
  title: Title;
  alt: string;
  src?: string;
}) {
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className="size-full object-cover object-top"
    />
  );
}

const HOVER_GENRES = 3;

export function PosterCard({
  title,
  rank,
  newEpisode = false,
  upcoming = false,
}: PosterCardProps) {
  const isRank = rank !== undefined;
  const [shownAt] = useState(Date.now);
  const details = useDetails();
  const coverRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);
  const [anchor, setAnchor] = useState<Opening | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      window.clearTimeout(closeTimer.current);
    },
    [],
  );

  const closeRef = useRef<() => void>(() => undefined);

  const unmount = () => {
    window.clearTimeout(closeTimer.current);
    setClosing(false);
    setAnchor(null);
  };

  const close = () => {
    window.clearTimeout(timer.current);
    if (!anchor || closing) return;
    if (window.matchMedia(REDUCED_MOTION_QUERY).matches) {
      unmount();
      return;
    }
    setClosing(true);
    closeTimer.current = window.setTimeout(unmount, CLOSE_FALLBACK_MS);
  };

  useEffect(() => {
    closeRef.current = close;
  });

  const isOpen = anchor !== null && !closing;
  useEffect(() => {
    if (!isOpen) return;
    const onScroll = () => closeRef.current();
    window.addEventListener('scroll', onScroll, {
      capture: true,
      passive: true,
    });
    return () =>
      window.removeEventListener('scroll', onScroll, { capture: true });
  }, [isOpen]);

  const scheduleOpen = () => {
    if (window.matchMedia(NO_HOVER_QUERY).matches) return;
    window.clearTimeout(timer.current);
    if (anchor) {
      window.clearTimeout(closeTimer.current);
      setClosing(false);
      return;
    }
    timer.current = window.setTimeout(() => {
      const rect = coverRef.current?.getBoundingClientRect();
      if (rect)
        setAnchor({
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        });
    }, OPEN_DELAY_MS);
  };

  const place = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el || !anchor) return;
      el.style.setProperty('--grow-scale', String(anchor.width / HOVER_WIDTH));
      const { left, top } = hoverPosition(
        anchor,
        { width: window.innerWidth, height: window.innerHeight },
        el.offsetHeight,
      );
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      const scale = anchor.width / HOVER_WIDTH;
      const art = el.firstElementChild as HTMLElement;
      const coverX = anchor.left + anchor.width / 2 - left;
      const coverY = anchor.top + anchor.height / 2 - top;
      const originOf = (cover: number, artMid: number) =>
        scale >= 0.99 ? cover : (cover - scale * artMid) / (1 - scale);
      el.style.transformOrigin = `${originOf(coverX, HOVER_WIDTH / 2)}px ${originOf(coverY, art.offsetHeight / 2)}px`;
      el.style.visibility = 'visible';
    },
    [anchor],
  );

  const openDetails = () => {
    unmount();
    details.open(title);
  };
  const watch = titleWatchLink(title);
  const countdown = upcoming
    ? (releaseInfo(title, shownAt)?.label ?? null)
    : null;
  const label = `${isRank ? `Hạng ${rank}: ` : ''}${title.name}, ${title.episodeLabel}${countdown ? `, ${countdown}` : ''}`;
  const airing = title.mal?.airing === 'currently_airing';
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
        <button
          type="button"
          ref={coverRef}
          data-cover=""
          aria-label={label}
          className="block w-full cursor-pointer rounded-lg border-0 bg-transparent p-0 text-left"
          onClick={openDetails}
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
            ) : countdown ? (
              <div className="af-tags bottom-2 z-2 flex-col items-stretch text-center [&>.af-tag:first-child]:rounded-[var(--radius-sm)_var(--radius-sm)_0_0]! [&>.af-tag:last-child]:rounded-[0_0_var(--radius-sm)_var(--radius-sm)]!">
                <span className="af-tag">Sắp chiếu</span>
                <span
                  className="af-tag af-tag--watch"
                  data-testid="card:countdown"
                >
                  {countdown}
                </span>
              </div>
            ) : airing ? (
              <div className="af-tags bottom-2 z-2">
                <span className="af-tag" data-testid="card:airing">
                  Đang chiếu
                </span>
              </div>
            ) : null}
          </div>
        </button>
      </div>
      {anchor ? (
        <div
          ref={place}
          data-testid={`card:${title.path}:preview`}
          data-state={closing ? 'closing' : 'open'}
          style={{ visibility: 'hidden' }}
          onTransitionEnd={(event) => {
            if (
              closing &&
              event.target === event.currentTarget &&
              event.propertyName === 'opacity'
            )
              unmount();
          }}
          className="af-hover card-preview fixed top-0 left-0 z-100 w-[340px]"
        >
          <Link
            {...watch}
            tabIndex={-1}
            aria-hidden="true"
            className="block aspect-(--card-art-ratio) bg-surface-alt"
          >
            <CardImage
              title={title}
              alt=""
              src={title.backdrop ?? title.image}
            />
          </Link>
          <div
            className="af-hover-body card-preview-body cursor-pointer hover:bg-surface-alt"
            data-testid={`card:${title.path}:body`}
            onClick={openDetails}
          >
            <div className="af-hover-actions">
              <Link
                {...watch}
                aria-label={`Phát ${title.name}`}
                className="af-circle af-circle--play"
                onClick={(event) => event.stopPropagation()}
              >
                <Play aria-hidden="true" />
              </Link>
              <span className="af-spacer" />
              <button
                type="button"
                aria-label={`Xem chi tiết ${title.name}`}
                data-testid={`card:${title.path}:details`}
                className="af-circle"
                onClick={(event) => {
                  event.stopPropagation();
                  openDetails();
                }}
              >
                <ChevronDown aria-hidden="true" />
              </button>
            </div>
            <h3 className="m-0 mb-2 text-xl/[1.25] font-bold">{title.name}</h3>
            <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
              {title.mal?.score == null ? null : (
                <RatingChip
                  score={title.mal.score.toFixed(2)}
                  label="MAL"
                  voters={title.mal.voters}
                />
              )}
              <RatingChip
                score={title.rating.toFixed(1)}
                label="AVS"
                voters={title.avsVoters}
              />
            </div>
            <div className="af-hover-meta">
              {title.year === undefined ? null : <span>{title.year}</span>}
              <span>{episodeProgress(title)}</span>
              {hd ? <span className="af-box">{hd}</span> : null}
            </div>
            {title.genres.length > 0 ? (
              <div className="af-hover-genres flex-wrap">
                {title.genres.slice(0, HOVER_GENRES).map((genre) => (
                  <span key={genre}>{genre}</span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
