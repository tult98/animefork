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
  open: (title: Title) => void;
}

const DetailsContext = createContext<Details | null>(null);

export function DetailsProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<Title | null>(null);
  const close = useCallback(() => setTitle(null), []);
  const value = useMemo<Details>(() => ({ open: setTitle }), []);
  return (
    <DetailsContext value={value}>
      {children}
      {title ? (
        <DetailsModal key={title.path} title={title} onClose={close} />
      ) : null}
    </DetailsContext>
  );
}

export function useDetails(): Details {
  const details = useContext(DetailsContext);
  if (!details) throw new Error('useDetails needs a DetailsProvider');
  return details;
}
