import { Link } from '@tanstack/react-router';
import { FINISHED_LABEL, formatWatched } from '../lib/titles/continue-time.ts';
import type { ContinueItem } from '../lib/titles/shelves.ts';
import type { Title } from '../lib/titles/title.ts';
import { DetailsButton } from './details-button.tsx';
import { useDetails } from './details/details-context.tsx';
import { PromoVideo } from './promo-video.tsx';
import { useHoverPreview } from './use-hover-preview.ts';
import { Play } from './ui/icons.ts';

// The details modal reads a catalog title; a history row only carries what the shelf shows, and the modal loads the rest by slug.
function detailsTitle(item: ContinueItem): Title {
  return {
    path: item.slug,
    name: item.titleName,
    image: item.image,
    rating: 0,
    episodeLabel: item.episodeLabel,
    genres: [],
    ...(item.mal ? { mal: item.mal } : {}),
  };
}

function watchedText({ state }: ContinueItem): string {
  return state.kind === 'finished'
    ? FINISHED_LABEL
    : formatWatched(state.positionS, state.durationS);
}

function ProgressBar({
  item,
  testId,
  className,
}: {
  item: ContinueItem;
  testId: string;
  className: string;
}) {
  const percent =
    item.state.kind === 'finished'
      ? 100
      : Math.round(item.state.fraction * 100);
  return (
    <div
      role="progressbar"
      aria-label={`Tiến độ xem ${item.titleName}, ${item.episodeLabel}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={watchedText(item)}
      data-testid={testId}
      className={`overflow-hidden rounded-full bg-progress-track ${className}`}
    >
      <div
        className="h-full rounded-full bg-brand"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function ContinueCard({ item }: { item: ContinueItem }) {
  const details = useDetails();
  const { coverRef, open, unmount, wrapperProps, previewProps } =
    useHoverPreview<HTMLAnchorElement>();
  const openDetails = () => {
    unmount();
    details.open(detailsTitle(item));
  };
  const id = `card:continue:${item.slug}`;
  const label = `${item.titleName}, ${item.episodeLabel}, ${watchedText(item)}`;

  return (
    <div data-testid={id} className="relative w-full" {...wrapperProps}>
      <div className="relative z-1">
        <Link
          {...item.link}
          ref={coverRef}
          data-cover=""
          aria-label={label}
          className="af-thumb-art block aspect-(--card-art-ratio) w-full cursor-pointer"
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
          className="mx-auto mt-2 h-[3px] w-3/5"
        />
      </div>
      {open ? (
        <div
          {...previewProps}
          data-testid={`${id}:preview`}
          className="af-hover card-preview fixed top-0 left-0 z-100 w-[340px]"
        >
          <div className="relative aspect-(--card-art-ratio) bg-surface-alt">
            <Link
              {...item.link}
              tabIndex={-1}
              aria-hidden="true"
              className="block size-full"
            >
              <img
                src={item.image}
                alt=""
                decoding="async"
                className="size-full object-cover"
              />
            </Link>
            {item.mal?.trailerYoutubeId ? (
              <PromoVideo youtubeId={item.mal.trailerYoutubeId} />
            ) : null}
          </div>
          <div
            className="af-hover-body card-preview-body cursor-pointer hover:bg-surface-alt"
            data-testid={`${id}:body`}
            onClick={openDetails}
          >
            <div className="af-hover-actions">
              <Link
                {...item.link}
                aria-label={`Phát ${item.titleName}`}
                className="af-circle af-circle--play"
                onClick={(event) => event.stopPropagation()}
              >
                <Play aria-hidden="true" />
              </Link>
              <span className="af-spacer" />
              <DetailsButton
                name={item.titleName}
                testId={`${id}:details`}
                onOpen={openDetails}
              />
            </div>
            <h3 className="m-0 mb-2 text-xl/[1.25] font-bold">
              {item.titleName}
            </h3>
            <p className="m-0 mb-2 text-sm/[1.3] text-muted">
              {item.episodeLabel}
            </p>
            <ProgressBar
              item={item}
              testId={`${id}:preview:progress`}
              className="mb-2 h-1"
            />
            <p className="m-0 text-sm/[1.3] text-muted">{watchedText(item)}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
