import { useRef, useState } from 'react';

// The ref closes the gap before `pending` re-renders, so a fast double click cannot send twice.
export function useSubmitOnce() {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const run = async (action: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      await action();
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  return { pending, run };
}
