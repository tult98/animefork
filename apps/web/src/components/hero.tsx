import { Link } from '@tanstack/react-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { titleLink } from '../lib/titles/link.ts';
import type { Title } from '../lib/titles/title.ts';
import {
  HERO_ADVANCE_MS,
  counterLabel,
  heroMeta,
  nextIndex,
  prevIndex,
} from '../lib/ui/carousel.ts';
import { ChevronLeft, ChevronRight, Pause, Play } from './ui/icons.ts';

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
  'grid size-11 cursor-pointer place-items-center rounded-full border-2 border-border bg-canvas/80 p-0 text-ink hover:bg-pill-active';

export function Hero({ items }: { items: Title[] }) {
  const reducedMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const length = items.length;
  const autoplay = !reducedMotion && !userPaused && !hovered && !focused;

  useEffect(() => {
    if (!autoplay) return;
    const id = window.setTimeout(
      () => setIndex((current) => nextIndex(current, length)),
      HERO_ADVANCE_MS,
    );
    return () => window.clearTimeout(id);
  }, [autoplay, index, length]);

  return (
    <section
      data-testid="hero"
      aria-roledescription="carousel"
      aria-label="Phim nổi bật"
      className="af-billboard mx-(--pad) block h-(--bb-h) min-h-0 after:hidden"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={(event) => {
        // A mouse click on a control also focuses it; only keyboard focus should hold the carousel still.
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
              <img
                src={title.image}
                alt=""
                loading={slide === 0 ? 'eager' : 'lazy'}
                decoding="async"
                className="af-billboard-art object-cover object-center"
              />
              <div className="hero-scrim absolute inset-0" />
              <div className="af-billboard-body absolute bottom-0 left-0 pb-8 max-md:right-0 max-md:max-w-none max-md:p-4">
                <h2 className="af-billboard-title line-clamp-2 max-md:text-4xl">
                  {title.name}
                </h2>
                <div className="af-billboard-meta flex flex-wrap items-center gap-x-2 gap-y-1">
                  {heroMeta(title)}
                </div>
                {title.description ? (
                  <p className="af-billboard-text line-clamp-2">
                    {title.description}
                  </p>
                ) : null}
                <div className="af-billboard-actions">
                  <Link
                    {...titleLink(title)}
                    tabIndex={active ? undefined : -1}
                    className="af-pill af-pill--play max-md:flex-1"
                  >
                    <Play
                      aria-hidden="true"
                      className="fill-current stroke-none"
                    />
                    Phát
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="absolute right-4 bottom-4 z-3 flex items-center gap-2 max-md:top-2 max-md:right-2 max-md:bottom-auto">
        <span
          data-testid="hero:counter"
          className="rounded-md bg-canvas/80 px-2.5 py-2 text-badge"
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
