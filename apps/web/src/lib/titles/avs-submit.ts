import {
  AVS_RATINGS_PATH,
  MAX_RATINGS_PER_SUBMIT,
  type AvsSubmission,
} from '../../../../api/src/art/contract.ts';
import { titleWatchLink } from './link.ts';
import type { HomeShelves } from './shelves.ts';

// The cards the page already loaded carry the AVS score and voter count; only the stale ones are worth sending.
export function avsSubmissions(
  shelves: HomeShelves,
  stale: Iterable<string>,
): AvsSubmission[] {
  const wanted = new Set(stale);
  const bySlug = new Map<string, AvsSubmission>();
  for (const shelf of shelves) {
    if (shelf.kind === 'continue') continue;
    for (const title of shelf.items) {
      const slug = titleWatchLink(title).params.slug;
      if (!wanted.has(slug) || bySlug.has(slug)) continue;
      if (title.avsVoters === undefined) continue;
      bySlug.set(slug, {
        slug,
        score: title.rating,
        voters: title.avsVoters,
        ...(title.quality && { quality: title.quality }),
      });
    }
  }
  return [...bySlug.values()];
}

export async function submitAvs(
  base: string,
  items: AvsSubmission[],
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const url = `${base.replace(/\/+$/, '')}${AVS_RATINGS_PATH}`;
  for (let i = 0; i < items.length; i += MAX_RATINGS_PER_SUBMIT) {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        items: items.slice(i, i + MAX_RATINGS_PER_SUBMIT),
      }),
    });
    if (!res.ok) throw new Error(`avs submit answered ${res.status}`);
  }
}
