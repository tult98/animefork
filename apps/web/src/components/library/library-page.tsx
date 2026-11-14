import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import {
  countsOf,
  sectionsOf,
  type LibraryTitle,
} from '../../lib/library/model.ts';
import { DISLIKED, HISTORY, LIKED } from '../../lib/library/section.ts';
import { useLibrary } from '../../lib/library/use-library.ts';
import { useLibraryActions } from '../../lib/library/use-library-actions.ts';
import { useSession } from '../../lib/auth/session.ts';
import { toContinueItem } from '../../lib/titles/shelves.ts';
import { useContinueRows } from '../../lib/watch-progress/use-continue-rows.ts';
import { ErrorScreen } from '../error-screen.tsx';
import { SHIMMER } from '../ui/shimmer.ts';
import { ListVideo, ThumbsDown, ThumbsUp } from '../ui/icons.ts';
import { HistoryCard } from './history-card.tsx';
import { LibraryCard } from './library-card.tsx';

const GRID_CLASS =
  'grid grid-cols-[repeat(auto-fill,minmax(236px,1fr))] gap-x-(--space-md) gap-y-(--space-xl)';

const EMPTY = {
  history: ['Chưa có lịch sử xem', 'Các tập bạn xem sẽ hiện ở đây.'],
  liked: [
    'Chưa thích tiêu đề nào',
    'Nhấn nút thích trên một tiêu đề để thích nó.',
  ],
  disliked: [
    'Chưa có tiêu đề không thích',
    'Các tiêu đề bạn không thích được liệt kê ở đây.',
  ],
  playlist: [
    'Danh sách này đang trống',
    'Lưu một tiêu đề vào danh sách này từ thẻ của nó.',
  ],
} as const;

function SideItem({
  id,
  label,
  count,
  current,
  icon,
  onSelect,
}: {
  id: string;
  label: string;
  count: number | undefined;
  current: boolean;
  icon: ReactNode;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      data-testid={`library:nav:${id}`}
      aria-current={current ? 'page' : undefined}
      onClick={() => onSelect(id)}
      className="flex min-h-12 w-full cursor-pointer items-center gap-(--space-md) rounded-md border-0 bg-transparent px-(--space-md) text-left text-base/[1.3] text-ink hover:bg-pill-active aria-[current=page]:bg-pill-active aria-[current=page]:font-semibold"
    >
      <span aria-hidden="true" className="flex size-[22px] flex-none">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <i className="text-[13px] text-muted not-italic">{count}</i>
    </button>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div
      data-testid="library:empty"
      className="flex max-w-[480px] flex-col items-start gap-2 rounded-lg border border-border-strong bg-surface p-8 text-left"
    >
      <h2 className="m-0 text-xl/[1.4] font-semibold">{title}</h2>
      <p className="m-0 text-muted">{body}</p>
    </div>
  );
}

function Skeleton() {
  return (
    <div
      data-testid="library:loading"
      aria-busy="true"
      aria-label="Đang tải"
      className={GRID_CLASS}
    >
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className={`aspect-video rounded-lg ${SHIMMER}`} />
      ))}
    </div>
  );
}

export interface LibraryPageProps {
  section: string;
  onSection: (section: string) => void;
}

export function LibraryPage({ section, onSection }: LibraryPageProps) {
  const session = useSession();
  const library = useLibrary();
  const history = useContinueRows();
  const actions = useLibraryActions();

  if (session.state === 'signedOut') {
    return (
      <div data-testid="library:sign-in" className="px-(--pad) pt-(--space-xl)">
        <h1 className="text-title-lg">Danh sách của tôi</h1>
        <p className="mt-(--space-md) text-muted">
          Đăng nhập để xem lịch sử xem, các tiêu đề đã thích và danh sách của
          bạn.
        </p>
        <Link
          to="/sign-in"
          className="af-pill af-pill--brand mt-(--space-lg) inline-flex"
        >
          Đăng nhập
        </Link>
      </div>
    );
  }
  if (library.status === 'failed') {
    return <ErrorScreen error={library.error} onRetry={library.retry} />;
  }

  const ready = library.status === 'ready';
  const sections = ready ? sectionsOf(library.library) : undefined;
  const counts = ready ? countsOf(library.library) : undefined;
  const playlist = sections?.playlists.find(({ id }) => id === section);
  const active =
    section === LIKED || section === DISLIKED || playlist ? section : HISTORY;

  let heading = 'Lịch sử xem';
  let titles: LibraryTitle[] = [];
  let removeLabel = '';
  let empty: readonly [string, string] = EMPTY.history;
  let remove: (title: LibraryTitle) => void = () => {};
  if (active === LIKED) {
    heading = 'Đã thích';
    titles = sections?.liked ?? [];
    removeLabel = 'Bỏ thích';
    empty = EMPTY.liked;
    remove = (title) =>
      void actions.setRatingOf({ slug: title.slug, snapshot: title }, 'none');
  } else if (active === DISLIKED) {
    heading = 'Không thích';
    titles = sections?.disliked ?? [];
    removeLabel = 'Bỏ không thích';
    empty = EMPTY.disliked;
    remove = (title) =>
      void actions.setRatingOf({ slug: title.slug, snapshot: title }, 'none');
  } else if (playlist) {
    heading = playlist.name;
    titles = playlist.titles;
    removeLabel = 'Xóa khỏi danh sách';
    empty = EMPTY.playlist;
    remove = (title) =>
      void actions.setInPlaylistOf(
        playlist.id,
        { slug: title.slug, snapshot: title },
        false,
      );
  }

  const isHistory = active === HISTORY;
  const historyItems = history.rows?.map(toContinueItem);
  const loading = isHistory ? history.loading || !historyItems : !ready;
  const total = isHistory ? (historyItems?.length ?? 0) : titles.length;

  return (
    <div
      data-testid="library"
      className="flex flex-wrap items-start gap-10 px-(--pad) pt-(--space-xl) pb-16"
    >
      <nav
        aria-label="Thư viện"
        className="flex max-w-[280px] flex-[1_1_240px] flex-col gap-0.5"
      >
        <SideItem
          id={HISTORY}
          label="Lịch sử xem"
          count={history.rows?.length}
          current={active === HISTORY}
          icon={<ListVideo />}
          onSelect={onSection}
        />
        <SideItem
          id={LIKED}
          label="Đã thích"
          count={counts?.liked}
          current={active === LIKED}
          icon={<ThumbsUp />}
          onSelect={onSection}
        />
        <SideItem
          id={DISLIKED}
          label="Không thích"
          count={counts?.disliked}
          current={active === DISLIKED}
          icon={<ThumbsDown />}
          onSelect={onSection}
        />
        <div className="my-(--space-sm) h-px bg-border-strong" />
        <div className="px-(--space-md) pt-(--space-md) pb-(--space-sm) text-[13px]/[1.4] font-medium text-muted">
          Danh sách
        </div>
        {sections?.playlists.map(({ id, name }) => (
          <SideItem
            key={id}
            id={id}
            label={name}
            count={counts?.playlists[id]}
            current={active === id}
            icon={<ListVideo />}
            onSelect={onSection}
          />
        ))}
      </nav>
      <main className="min-w-0 flex-[999_1_560px]">
        <div className="mb-(--space-lg) flex flex-wrap items-baseline gap-(--space-md)">
          <h1 className="text-title-lg">{heading}</h1>
          {loading ? null : (
            <span data-testid="library:count" className="text-muted">
              {total} tiêu đề
            </span>
          )}
        </div>
        {loading ? (
          <Skeleton />
        ) : total === 0 ? (
          <Empty title={empty[0]} body={empty[1]} />
        ) : (
          <div role="list" data-testid="library:grid" className={GRID_CLASS}>
            {isHistory
              ? historyItems?.map((item) => (
                  <HistoryCard key={item.slug} item={item} />
                ))
              : titles.map((title) => (
                  <LibraryCard
                    key={title.slug}
                    title={title}
                    removeLabel={removeLabel}
                    onRemove={() => remove(title)}
                  />
                ))}
          </div>
        )}
      </main>
    </div>
  );
}
