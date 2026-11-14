import { useNavigate } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import type { RatingState } from '../../lib/library/model.ts';
import { useLibraryActions } from '../../lib/library/use-library-actions.ts';
import { useTitleLibrary } from '../../lib/library/use-title-library.ts';
import type { Title } from '../../lib/titles/title.ts';
import { Check, Plus, ThumbsDown, ThumbsUp } from '../ui/icons.ts';
import { SavePlaylistDialog } from './save-playlist-dialog.tsx';

export function titleStatus(rating: RatingState, savedNames: string[]): string {
  const parts: string[] = [];
  if (savedNames.length > 0) parts.push(`Đã lưu vào ${savedNames.join(', ')}`);
  if (rating === 'like') parts.push('Bạn đã thích tiêu đề này');
  if (rating === 'dislike') parts.push('Bạn đã không thích tiêu đề này');
  return parts.join('. ');
}

// A live region has to exist before its text changes, so the line stays mounted when empty.
export function TitleStatus({ title }: { title: Title }) {
  const { rating, playlists } = useTitleLibrary(title);
  const saved = playlists.filter((playlist) => playlist.has);
  return (
    <p
      aria-live="polite"
      data-testid="title:status"
      className="m-0 min-h-10 text-sm/[1.4] text-muted"
    >
      {titleStatus(
        rating,
        saved.map((playlist) => playlist.name),
      )}
    </p>
  );
}

interface TitleActionsProps {
  title: Title;
  // The hover card holds its preview open while the dialog is up.
  onDialogChange?: (open: boolean) => void;
}

// Renders its circle buttons as siblings, so the caller's row lays them out.
export function TitleActions({ title, onDialogChange }: TitleActionsProps) {
  const navigate = useNavigate();
  const actions = useLibraryActions();
  const { pending, rating, playlists } = useTitleLibrary(title);
  const [dialog, setDialog] = useState(false);
  const saveRef = useRef<HTMLButtonElement>(null);
  const saved = playlists.some((playlist) => playlist.has);
  const saveLabel = saved ? 'Đã lưu. Sửa danh sách' : 'Lưu vào danh sách';

  const guarded =
    (run: () => void) => (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (actions.requiresSignIn) {
        void navigate({ to: '/sign-in' });
        return;
      }
      run();
    };

  const rate = (next: 'like' | 'dislike') =>
    guarded(() => {
      void actions.setRating(title, rating === next ? 'none' : next);
    });

  const setDialogOpen = (open: boolean) => {
    setDialog(open);
    onDialogChange?.(open);
  };

  return (
    <>
      <button
        ref={saveRef}
        type="button"
        className="af-circle"
        aria-label={saveLabel}
        title={saveLabel}
        aria-haspopup="dialog"
        aria-pressed={saved}
        disabled={pending}
        data-testid="title:save"
        onClick={guarded(() => setDialogOpen(true))}
      >
        {saved ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
      </button>
      <button
        type="button"
        className="af-circle af-rate"
        aria-label="Thích"
        title="Thích"
        aria-pressed={rating === 'like'}
        disabled={pending}
        data-testid="title:like"
        onClick={rate('like')}
      >
        <ThumbsUp aria-hidden="true" />
      </button>
      <button
        type="button"
        className="af-circle af-rate"
        aria-label="Không thích"
        title="Không thích"
        aria-pressed={rating === 'dislike'}
        disabled={pending}
        data-testid="title:dislike"
        onClick={rate('dislike')}
      >
        <ThumbsDown aria-hidden="true" />
      </button>
      {dialog ? (
        <SavePlaylistDialog
          title={title}
          onClose={() => {
            setDialogOpen(false);
            saveRef.current?.focus();
          }}
        />
      ) : null}
    </>
  );
}
