import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { titleWatchLink } from '../lib/titles/link.ts';
import { useCardVideoShowing } from '../lib/ui/card-video.ts';
import type { Title } from '../lib/titles/title.ts';
import {
  HERO_ADVANCE_MS,
  counterLabel,
  heroMeta,
  nextIndex,
  prevIndex,
} from '../lib/ui/carousel.ts';
import { useDetails } from './details/details-context.tsx';
import { TrailerSoundButton } from './trailer-sound-button.tsx';
import { Trailer, type TrailerPhase } from './trailer.tsx';
import { ChevronLeft, ChevronRight, Info, Pause, Play } from './ui/icons.ts';
import { NO_HOVER_QUERY } from './use-hover-preview.ts';
import { SHIMMER } from './ui/shimmer.ts';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function useReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

const CONTROL_CLASS =
  'grid size-11 cursor-pointer place-items-center rounded-full border-2 border-border bg-hero-overlay p-0 text-ink hover:bg-pill-active';

export function Hero({ items }: { items: Title[] }) {
  const reducedMotion = useReducedMotion();
  const details = useDetails();
  const cardVideoShowing = useCardVideoShowing();
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [inView, setInView] = useState(true);
  const sectionRef = useRef<HTMLElement>(null);
  const [trailer, setTrailer] = useState<{
    index: number;
    phase: TrailerPhase;
  } | null>(null);

  const length = items.length;
  const autoplay =
    inView &&
    !reducedMotion &&
    !userPaused &&
    !hovered &&
    !focused &&
    !details.isOpen &&
    !cardVideoShowing;
  // A touch device did not ask for the video, and the open modal or a card popover plays its own.
  const trailerId =
    !inView ||
    reducedMotion ||
    details.isOpen ||
    cardVideoShowing ||
    window.matchMedia(NO_HOVER_QUERY).matches
      ? null
      : (items[index]?.mal?.trailerYoutubeId ?? null);
  const trailerPhase = trailerId
    ? trailer?.index === index
      ? trailer.phase
      : 'loading'
    : null;

  // A trailer still loading when the timer fires counts as ended, so a slow embed cannot stall the carousel.
  useEffect(() => {
    if (!autoplay || trailerPhase === 'playing') return;
    const id = window.setTimeout(
      () => setIndex((current) => nextIndex(current, length)),
      HERO_ADVANCE_MS,
    );
    return () => window.clearTimeout(id);
  }, [autoplay, index, length, trailerPhase]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setInView(entry.intersectionRatio >= 0.5);
      },
      { threshold: 0.5 },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  const onTrailerPhase = (phase: TrailerPhase) => {
    setTrailer({ index, phase });
    if (phase === 'ended' && autoplay) setIndex(nextIndex(index, length));
  };

  return (
    <section
      ref={sectionRef}
      data-testid="hero"
      aria-roledescription="carousel"
      aria-label="Phim nổi bật"
      className="af-billboard mx-(--pad) block h-(--bb-h) min-h-0 after:hidden"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={(event) => {
        if (event.target.matches(':focus-visible')) setFocused(true);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setFocused(false);
      }}
    >
      <div aria-live={autoplay ? 'off' : 'polite'}>
        {items.map((title, slide) => {
          const active = slide === index;
          return (
            <div
              key={title.path}
              role="group"
              aria-roledescription="slide"
              aria-label={counterLabel(slide, length)}
              data-testid={`hero:slide:${slide}`}
              data-active={active ? '' : undefined}
              className="hero-slide absolute inset-0"
            >
              {title.artPending ? (
                <div
                  data-testid="hero:art-skeleton"
                  className={`af-billboard-art ${SHIMMER}`}
                />
              ) : (
                <img
                  src={title.image}
                  alt=""
                  loading={slide === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                  className="af-billboard-art object-cover object-[50%_15%]"
                />
              )}
              {active && trailerId ? (
                <Trailer youtubeId={trailerId} onPhase={onTrailerPhase} />
              ) : null}
              <div className="hero-scrim absolute inset-0" />
              <div className="af-billboard-body absolute bottom-0 left-0 pb-8 max-md:right-0 max-md:max-w-none max-md:p-4">
                <h2
                  data-testid="hero:title"
                  title={title.name}
                  className="af-billboard-title line-clamp-3 text-4xl leading-[1.1] max-md:text-[28px]"
                >
                  {title.name}
                </h2>
                <div className="af-billboard-meta flex flex-wrap items-center gap-x-2 gap-y-1">
                  {heroMeta(title)}
                </div>
                {title.description ? (
                  <p
                    data-testid="hero:description"
                    className="af-billboard-text line-clamp-2"
                  >
                    {title.description}
                  </p>
                ) : null}
                <div className="af-billboard-actions">
                  <Link
                    {...titleWatchLink(title)}
                    tabIndex={active ? undefined : -1}
                    className="af-pill af-pill--play max-md:flex-1"
                  >
                    <Play
                      aria-hidden="true"
                      className="fill-current stroke-none"
                    />
                    Phát
                  </Link>
                  <button
                    type="button"
                    data-testid="hero:info"
                    tabIndex={active ? undefined : -1}
                    className="af-pill af-pill--quiet max-md:flex-1"
                    onClick={() => details.open(title)}
                  >
                    <Info
                      aria-hidden="true"
                      className="fill-none stroke-current stroke-2"
                    />
                    Thông tin
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="absolute right-4 bottom-4 z-3 flex items-center gap-2 max-md:top-2 max-md:right-2 max-md:bottom-auto">
        {trailerPhase === 'playing' ? (
          <TrailerSoundButton className={CONTROL_CLASS} testId="hero:mute" />
        ) : null}
        <span
          data-testid="hero:counter"
          className="rounded-md bg-hero-overlay px-2.5 py-2 text-badge"
        >
          {counterLabel(index, length)}
        </span>
        <button
          type="button"
          data-testid="hero:prev"
          aria-label="Phim trước"
          className={CONTROL_CLASS}
          onClick={() => setIndex(prevIndex(index, length))}
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        {reducedMotion ? null : (
          <button
            type="button"
            data-testid="hero:pause"
            aria-label={
              userPaused ? 'Tiếp tục tự chuyển' : 'Tạm dừng tự chuyển'
            }
            className={CONTROL_CLASS}
            onClick={() => setUserPaused(!userPaused)}
          >
            {userPaused ? (
              <Play aria-hidden="true" />
            ) : (
              <Pause aria-hidden="true" />
            )}
          </button>
        )}
        <button
          type="button"
          data-testid="hero:next"
          aria-label="Phim sau"
          className={CONTROL_CLASS}
          onClick={() => setIndex(nextIndex(index, length))}
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

export function HeroSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Đang tải"
      className="relative mx-(--pad) h-(--bb-h) overflow-hidden rounded-billboard bg-surface-alt after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer after:bg-linear-to-r after:from-transparent after:via-white/6 after:to-transparent after:content-[''] motion-reduce:after:animate-none"
    />
  );
}
