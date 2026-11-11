import { useEffect, useRef } from 'react';
import { avsSubmissions, submitAvs } from './avs-submit.ts';
import type { HomeShelves } from './shelves.ts';

// Sends the AVS rating of stale titles once per session; a failed send is not retried until the next page load.
export function useAvsSubmit(
  shelves: HomeShelves,
  stale: readonly string[],
  apiBase: string | undefined,
): void {
  const sent = useRef(new Set<string>());

  useEffect(() => {
    if (!apiBase) return;
    const items = avsSubmissions(shelves, stale).filter(
      (item) => !sent.current.has(item.slug),
    );
    if (items.length === 0) return;
    for (const item of items) sent.current.add(item.slug);
    void submitAvs(apiBase, items).catch(() => undefined);
  }, [shelves, stale, apiBase]);
}
