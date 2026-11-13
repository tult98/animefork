import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { episodeProgress } from '../../lib/titles/episode-progress.ts';
import { titleWatchLink, watchLink } from '../../lib/titles/link.ts';
import type { Title } from '../../lib/titles/title.ts';
import { useEpisodeInfo } from '../../lib/titles/use-episode-info.ts';
import { useWatchPage } from '../../lib/titles/use-watch-page.ts';
import type { Episode } from '../../lib/titles/watch.ts';
import { useListWindow } from '../../lib/ui/use-list-window.ts';
import { Trailer, type TrailerPhase } from '../trailer.tsx';
import {
  Check,
  ChevronDown,
  Play,
  Star,
  Volume2,
  VolumeX,
  X,
} from '../ui/icons.ts';
import { REDUCED_MOTION_QUERY } from '../use-hover-preview.ts';

const number = new Intl.NumberFormat('vi-VN');

function compact(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

function episodeNumber(episode: Episode): string {
  return /^Tập (\d+)/.exec(episode.label)?.[1] ?? '•';
}

function RatingBlock({
  source,
  name,
  score,
  voters,
}: {
  source: string;
  name: string;
  score: number;
  voters: number | null | undefined;
}) {
  return (
    <div className="details-rc" data-testid={`details:rating:${source}`}>
      <Star aria-hidden="true" className="details-rc-star" />
      <span className="details-rc-score">
        {score.toFixed(source === 'mal' ? 2 : 1)}
      </span>
      <div>
        <div className="details-rc-name">
          <span className="af-box">{source.toUpperCase()}</span>
          {name}
        </div>
        {voters == null ? null : (
          <div className="details-rc-votes">
            bởi {number.format(voters)} người đánh giá
          </div>
        )}
      </div>
    </div>
  );
}

function Description({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      if (!expanded) setClamped(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, expanded]);

  return (
    <>
      <p
        ref={ref}
        className="details-desc"
        data-expanded={expanded ? '' : undefined}
        data-testid="details:description"
      >
        {text}
      </p>
      {clamped || expanded ? (
        <button
          type="button"
          className="details-link mt-2"
          aria-expanded={expanded}
          data-testid="details:description-toggle"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Thu gọn' : 'Xem thêm'}
        </button>
      ) : null}
    </>
  );
}

function Episodes({
  title,
  onNavigate,
}: {
  title: Title;
  onNavigate: () => void;
}) {
  const firstSlug = titleWatchLink(title).params.slug;
  const [slug, setSlug] = useState(firstSlug);
  const [menu, setMenu] = useState(false);
  const watch = useWatchPage(slug);
  const total = watch.data?.episodes.length ?? 0;
  const { end, bottomRef } = useListWindow(total, {
    anchor: 0,
    before: 0,
    size: 12,
    step: 50,
    resetKey: slug,
  });
  const page = useEpisodeInfo(slug, watch.data, { start: 0, end });
  const seasons = page?.seasons ?? [];

  useEffect(() => {
    const onCancel = (event: Event) => {
      if (!menu) return;
      event.preventDefault();
      setMenu(false);
    };
    const dialog = document.querySelector('dialog[data-testid="details"]');
    dialog?.addEventListener('cancel', onCancel);
    return () => dialog?.removeEventListener('cancel', onCancel);
  }, [menu]);

  const episodes = page?.episodes ?? [];

  return (
    <section
      aria-labelledby="details-episodes"
      className="details-episodes"
      data-testid="details:episodes"
    >
      <div className="details-episodes-head">
        <h3 id="details-episodes" className="af-rail-title m-0">
          Các tập
        </h3>
        {seasons.length > 1 && page ? (
          <div className="details-dd">
            <button
              type="button"
              className="af-pill af-pill--outline details-dd-btn"
              aria-haspopup="true"
              aria-expanded={menu}
              aria-label="Chọn mùa"
              data-testid="details:season-button"
              onClick={() => setMenu(!menu)}
            >
              <span>{page.currentSeason.name}</span>
              <ChevronDown aria-hidden="true" />
            </button>
            {menu ? (
              <div className="details-dd-menu">
                {seasons.map((season) => (
                  <button
                    key={season.slug}
                    type="button"
                    className="details-dd-item"
                    aria-current={season.slug === slug}
                    data-testid={`details:season:${season.slug}`}
                    onClick={() => {
                      setSlug(season.slug);
                      setMenu(false);
                    }}
                  >
                    <span>{season.name}</span>
                    {season.slug === slug ? (
                      <Check aria-hidden="true" className="size-4" />
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {watch.error ? (
        <p role="alert" className="details-note">
          Không tải được danh sách tập.{' '}
          <button
            type="button"
            className="details-link"
            onClick={() => void watch.refetch()}
          >
            Thử lại
          </button>
        </p>
      ) : !page ? (
        <div aria-busy="true" aria-label="Đang tải" className="details-eps">
          {[0, 1, 2].map((n) => (
            <div key={n} className="details-ep details-skeleton" />
          ))}
        </div>
      ) : (
        <>
          <ol className="details-eps">
            {episodes.slice(0, end).map((episode) => (
              <li key={episode.id}>
                <Link
                  {...watchLink(slug, episode.id)}
                  className="details-ep"
                  data-testid={`details:episode:${episode.id}`}
                  onClick={onNavigate}
                >
                  <span className="details-ep-n">{episodeNumber(episode)}</span>
                  <span className="details-ep-thumb">
                    {episode.thumbnail ? (
                      <img src={episode.thumbnail} alt="" loading="lazy" />
                    ) : (
                      <Play aria-hidden="true" />
                    )}
                  </span>
                  <span className="details-ep-text">
                    <strong>{episode.name ?? episode.label}</strong>
                    {episode.name ? <small>{episode.label}</small> : null}
                    {episode.synopsis ? (
                      <span
                        className="details-ep-synopsis"
                        data-testid={`details:episode:${episode.id}:synopsis`}
                      >
                        {episode.synopsis}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
          {end < total ? <div ref={bottomRef} aria-hidden="true" /> : null}
          <p className="details-note">
            Hiển thị {end} / {episodes.length} tập
          </p>
        </>
      )}
    </section>
  );
}

export function DetailsModal({
  title,
  upcoming = false,
  onClose,
}: {
  title: Title;
  upcoming?: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const mal = title.mal;
  const trailerId = window.matchMedia(REDUCED_MOTION_QUERY).matches
    ? null
    : (mal?.trailerYoutubeId ?? null);
  const [trailerPhase, setTrailerPhase] = useState<TrailerPhase>('loading');
  const [muted, setMuted] = useState(true);
  const hd = title.quality && /hd/i.test(title.quality) ? title.quality : null;
  const hasMalScore = mal?.score != null;
  const stats = [
    mal?.rank != null && {
      label: 'Xếp hạng',
      value: `#${number.format(mal.rank)}`,
    },
    mal?.popularity != null && {
      label: 'Độ phổ biến',
      value: `#${number.format(mal.popularity)}`,
    },
    mal?.members != null && {
      label: 'Thành viên',
      value: compact(mal.members),
    },
  ].filter((s): s is { label: string; value: string } => Boolean(s));

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  return (
    <dialog
      ref={ref}
      data-testid="details"
      aria-labelledby="details-title"
      className="details-dialog"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) ref.current?.close();
      }}
    >
      <div className="details-modal">
        <div className="details-hero">
          <img
            src={title.backdrop ?? title.image}
            alt=""
            className="details-art"
          />
          {trailerId ? (
            <Trailer
              youtubeId={trailerId}
              muted={muted}
              onPhase={setTrailerPhase}
            />
          ) : null}
          <button
            type="button"
            className="details-close"
            aria-label="Đóng"
            data-testid="details:close"
            onClick={() => ref.current?.close()}
          >
            <X aria-hidden="true" />
          </button>
          {trailerId && trailerPhase === 'playing' ? (
            <button
              type="button"
              className="details-mute"
              aria-label={muted ? 'Bật tiếng' : 'Tắt tiếng'}
              data-testid="details:mute"
              onClick={() => setMuted(!muted)}
            >
              {muted ? (
                <VolumeX aria-hidden="true" />
              ) : (
                <Volume2 aria-hidden="true" />
              )}
            </button>
          ) : null}
        </div>

        <div className="details-head">
          <h2 id="details-title">{title.name}</h2>
          {upcoming ? null : (
            <Link
              {...titleWatchLink(title)}
              className="af-pill af-pill--play"
              data-testid="details:play"
              onClick={onClose}
            >
              <Play aria-hidden="true" className="fill-current stroke-none" />
              Phát
            </Link>
          )}
        </div>

        <div className="details-info">
          <div className="details-main">
            <div className="af-hover-meta" style={{ fontSize: 16 }}>
              {title.year === undefined ? null : <span>{title.year}</span>}
              <span>{episodeProgress(title)}</span>
              {hd ? <span className="af-box">{hd}</span> : null}
            </div>
            {title.description ? (
              <Description text={title.description} />
            ) : null}
          </div>
          <dl className="details-facts">
            {title.genres.length > 0 ? (
              <div>
                <dt>Thể loại: </dt>
                <dd>{title.genres.join(', ')}</dd>
              </div>
            ) : null}
            {title.studio ? (
              <div>
                <dt>Studio: </dt>
                <dd>{title.studio}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        <section aria-label="Đánh giá" className="details-ratings">
          {hasMalScore ? (
            <RatingBlock
              source="mal"
              name="MyAnimeList"
              score={mal.score!}
              voters={mal.voters}
            />
          ) : null}
          {title.avsVoters !== undefined ? (
            <RatingBlock
              source="avs"
              name="AnimeVietSub"
              score={title.rating}
              voters={title.avsVoters}
            />
          ) : null}
          {hasMalScore && stats.length > 0 ? (
            <div className="details-tiles" data-testid="details:mal-stats">
              {stats.map((s) => (
                <div key={s.label} className="details-tile">
                  <span>{s.label}</span>
                  <div>{s.value}</div>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {upcoming ? null : <Episodes title={title} onNavigate={onClose} />}
      </div>
    </dialog>
  );
}
