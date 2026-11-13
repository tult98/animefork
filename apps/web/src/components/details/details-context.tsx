import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Title } from '../../lib/titles/title.ts';
import { DetailsModal } from './details-modal.tsx';

interface Details {
  // An upcoming title has no watch page yet, so the modal leaves its play button out.
  open: (title: Title, options?: { upcoming?: boolean }) => void;
  isOpen: boolean;
}

const DetailsContext = createContext<Details | null>(null);

export function DetailsProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<{
    title: Title;
    upcoming: boolean;
  } | null>(null);
  const close = useCallback(() => setShown(null), []);
  const isOpen = shown !== null;
  const value = useMemo<Details>(
    () => ({
      open: (title, options) =>
        setShown({ title, upcoming: options?.upcoming ?? false }),
      isOpen,
    }),
    [isOpen],
  );
  return (
    <DetailsContext value={value}>
      {children}
      {shown ? (
        <DetailsModal
          key={shown.title.path}
          title={shown.title}
          upcoming={shown.upcoming}
          onClose={close}
        />
      ) : null}
    </DetailsContext>
  );
}

export function useDetails(): Details {
  const details = useContext(DetailsContext);
  if (!details) throw new Error('useDetails needs a DetailsProvider');
  return details;
}
