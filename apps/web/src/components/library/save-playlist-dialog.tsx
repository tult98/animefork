import { useEffect, useId, useRef, useState } from 'react';
import { MAX_PLAYLIST_NAME_LENGTH } from '../../../../api/src/library/contract.ts';
import { useLibraryActions } from '../../lib/library/use-library-actions.ts';
import { useTitleLibrary } from '../../lib/library/use-title-library.ts';
import type { Title } from '../../lib/titles/title.ts';
import { Plus, X } from '../ui/icons.ts';

interface SavePlaylistDialogProps {
  title: Title;
  onClose: () => void;
}

// A native modal, so it stacks over the details modal in the top layer and Escape closes only this one.
export function SavePlaylistDialog({
  title,
  onClose,
}: SavePlaylistDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const actions = useLibraryActions();
  const { playlists } = useTitleLibrary(title);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameId = useId();
  const errorId = useId();
  const trimmed = name.trim();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const toggle = async (id: string, inPlaylist: boolean) => {
    setError(null);
    const result = await actions.setInPlaylist(id, title, inPlaylist);
    if (!result.ok) setError('Không cập nhật được danh sách. Hãy thử lại.');
  };

  const create = async () => {
    setBusy(true);
    setNameError(null);
    setError(null);
    const created = await actions.createPlaylist(trimmed);
    if (!created.ok) {
      setBusy(false);
      if (created.reason === 'nameTaken') {
        setNameError('Bạn đã có danh sách với tên này.');
      } else {
        setError('Không tạo được danh sách. Hãy thử lại.');
      }
      return;
    }
    const added = await actions.setInPlaylist(created.playlist.id, title, true);
    setBusy(false);
    if (!added.ok) setError('Đã tạo danh sách nhưng chưa thêm được tiêu đề.');
    setCreating(false);
    setName('');
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${nameId}-heading`}
      data-testid="save-playlist"
      className="save-dialog"
      onClose={(event) => {
        // React bubbles close through the component tree, and the details modal's own onClose would unmount it.
        event.stopPropagation();
        onClose();
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) ref.current?.close();
      }}
    >
      <div className="flex items-center justify-between pt-4 pr-2 pl-6">
        <h2
          id={`${nameId}-heading`}
          className="m-0 text-xl/[1.4] font-semibold"
        >
          Lưu vào danh sách
        </h2>
        <button
          type="button"
          className="af-iconbtn"
          aria-label="Đóng"
          data-testid="save-playlist:close"
          onClick={() => ref.current?.close()}
        >
          <X aria-hidden="true" />
        </button>
      </div>
      <div className="save-list">
        {playlists.map((playlist) => (
          <label key={playlist.id} className="save-row">
            <input
              type="checkbox"
              checked={playlist.has}
              onChange={(event) =>
                void toggle(playlist.id, event.currentTarget.checked)
              }
            />
            <span>{playlist.name}</span>
          </label>
        ))}
      </div>
      {error ? (
        <p role="alert" className="m-0 px-6 pb-2 text-sm/[1.4] text-error">
          {error}
        </p>
      ) : null}
      <div className="px-6 pt-2 pb-6">
        {creating ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (trimmed && !busy) void create();
            }}
          >
            <div>
              <div
                className={`af-field af-field--fluid${nameError ? ' af-field--error' : ''}`}
              >
                <input
                  id={nameId}
                  className="af-input"
                  placeholder=" "
                  value={name}
                  maxLength={MAX_PLAYLIST_NAME_LENGTH}
                  autoFocus
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={nameError ? errorId : undefined}
                  onChange={(event) => {
                    setName(event.target.value);
                    setNameError(null);
                  }}
                />
                <label htmlFor={nameId}>Tên danh sách</label>
              </div>
              {nameError ? (
                <p id={errorId} role="alert" className="af-field-msg">
                  {nameError}
                </p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="af-pill af-pill--outline"
                onClick={() => {
                  setCreating(false);
                  setName('');
                  setNameError(null);
                }}
              >
                Hủy
              </button>
              <button
                type="submit"
                className="af-pill af-pill--brand disabled:cursor-default disabled:opacity-40"
                disabled={!trimmed || busy}
              >
                Tạo
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className="af-pill af-pill--quiet w-full"
            onClick={() => setCreating(true)}
          >
            <Plus aria-hidden="true" className="fill-none stroke-current" />
            Danh sách mới
          </button>
        )}
      </div>
    </dialog>
  );
}
