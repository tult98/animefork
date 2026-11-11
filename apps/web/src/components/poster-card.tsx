import { Link } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { titleLink, titleWatchLink } from '../lib/titles/link.ts';
import type { Title } from '../lib/titles/title.ts';
import {
  HOVER_WIDTH,
  hoverPosition,
  type Anchor,
} from '../lib/ui/hover-position.ts';
import { Play, ChevronDown } from './ui/icons.ts';

const OPEN_DELAY_MS = 250;
const NO_HOVER_QUERY = '(hover: none), (pointer: coarse)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const CLOSE_FALLBACK_MS = 300;

type Opening = Anchor & { height: number };

interface PosterCardProps {
  title: Title;
  rank?: number;
  newEpisode?: boolean;
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

export function PosterCard({
  title,
  rank,
  newEpisode = false,
}: PosterCardProps) {
  const isRank = rank !== undefined;
  const coverRef = useRef<HTMLAnchorElement>(null);
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

  const detailLink = titleLink(title);
  const watch = titleWatchLink(title);
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
          {...detailLink}
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
        </Link>
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
          <div className="af-hover-body card-preview-body">
            <div className="af-hover-actions">
              <Link
                {...watch}
                aria-label={`Phát ${title.name}`}
                className="af-circle af-circle--play"
              >
                <Play aria-hidden="true" />
              </Link>
              <span className="af-spacer" />
              <Link
                {...detailLink}
                aria-label={`Xem chi tiết ${title.name}`}
                className="af-circle"
              >
                <ChevronDown aria-hidden="true" />
              </Link>
            </div>
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
