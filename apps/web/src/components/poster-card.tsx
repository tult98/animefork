import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { episodeProgress } from '../lib/titles/episode-progress.ts';
import { titleWatchLink } from '../lib/titles/link.ts';
import { releaseInfo } from '../lib/titles/release.ts';
import type { Title } from '../lib/titles/title.ts';
import { DetailsButton } from './details-button.tsx';
import { useDetails } from './details/details-context.tsx';
import { TitleActions } from './library/title-actions.tsx';
import { PromoVideo } from './promo-video.tsx';
import { useHoverPreview } from './use-hover-preview.ts';
import { Play, Star } from './ui/icons.ts';
import { SHIMMER } from './ui/shimmer.ts';

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
  if (title.artPending) {
    return (
      <div data-testid="card:art-skeleton" className={`size-full ${SHIMMER}`} />
    );
  }
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
  const { coverRef, open, unmount, pin, wrapperProps, previewProps } =
    useHoverPreview<HTMLButtonElement>();

  const openDetails = () => {
    unmount();
    details.open(title, { upcoming });
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
      {...wrapperProps}
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
      {open ? (
        <div
          {...previewProps}
          data-testid={`card:${title.path}:preview`}
          className="af-hover card-preview fixed top-0 left-0 z-100 w-[340px]"
        >
          <div className="relative aspect-(--card-art-ratio) bg-surface-alt">
            <Link
              {...watch}
              tabIndex={-1}
              aria-hidden="true"
              className="block size-full"
            >
              <CardImage
                title={title}
                alt=""
                src={title.backdrop ?? title.image}
              />
            </Link>
            {title.mal?.trailerYoutubeId ? (
              <PromoVideo youtubeId={title.mal.trailerYoutubeId} />
            ) : null}
          </div>
          <div
            className="af-hover-body card-preview-body cursor-pointer hover:bg-surface-alt"
            data-testid={`card:${title.path}:body`}
            onClick={openDetails}
          >
            <div className="af-hover-actions">
              {upcoming ? null : (
                <Link
                  {...watch}
                  aria-label={`Phát ${title.name}`}
                  className="af-circle af-circle--play"
                  onClick={(event) => event.stopPropagation()}
                >
                  <Play aria-hidden="true" />
                </Link>
              )}
              <TitleActions title={title} onDialogChange={pin} />
              <span className="af-spacer" />
              <DetailsButton
                name={title.name}
                testId={`card:${title.path}:details`}
                upcoming={upcoming}
                onOpen={openDetails}
              />
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
