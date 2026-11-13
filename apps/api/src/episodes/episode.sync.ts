import type { EpisodeSiteClient } from './episode.client.ts';
import type { EpisodeListClient } from './jikan.client.ts';
import type { EpisodeTranslators } from './episode.translate.ts';
import type { EpisodeStore, StoredEpisode } from './episode.store.ts';

export interface SyncOptions {
  store: EpisodeStore;
  // Jikan reads the list, MAL's episode page reads each synopsis.
  lists: EpisodeListClient;
  site: EpisodeSiteClient;
  // Null stores the English text and leaves the Vietnamese columns empty.
  translators: EpisodeTranslators | null;
  log: (line: string) => void;
  dryRun?: boolean;
  // Most episodes to fetch or translate in this run, across all shows.
  limit?: number;
}

export interface SyncTotals {
  shows: number;
  listed: number;
  synopsesFetched: number;
  translated: number;
  failed: number;
}

const needsWork = (row: StoredEpisode) =>
  !row.synopsisFetched ||
  row.titleVi === null ||
  (row.synopsis !== null && row.synopsisVi === null);

export async function syncEpisodes(
  malIds: number[],
  options: SyncOptions,
): Promise<SyncTotals> {
  const { store, lists, site, translators, log, dryRun = false } = options;
  let budget = options.limit ?? Infinity;
  const totals: SyncTotals = {
    shows: 0,
    listed: 0,
    synopsesFetched: 0,
    translated: 0,
    failed: 0,
  };
  if (!translators) {
    log(
      'DEEPSEEK_API_KEY is not set: storing English only, title_vi and synopsis_vi stay empty',
    );
  }

  for (const malId of malIds) {
    if (budget <= 0) break;
    const listed = await lists.list(malId);
    if (!listed) {
      log(`mal ${malId}: no episode list on Jikan, skipped`);
      continue;
    }
    totals.shows += 1;
    totals.listed += listed.length;
    if (!dryRun) await store.saveListed(malId, listed);
    const stored = dryRun ? new Map() : await store.find(malId);
    log(`mal ${malId}: ${listed.length} episodes listed`);

    for (const episode of listed) {
      if (budget <= 0) break;
      let row: StoredEpisode = stored.get(episode.number) ?? {
        malId,
        number: episode.number,
        title: episode.title,
        titleVi: null,
        synopsis: null,
        synopsisVi: null,
        synopsisFetched: false,
      };
      if (!needsWork(row)) continue;
      budget -= 1;
      const tag = `mal ${malId} ep ${episode.number}`;
      try {
        if (!row.synopsisFetched) {
          const synopsis = await site.synopsis(malId, episode.number);
          totals.synopsesFetched += 1;
          if (!dryRun)
            await store.saveSynopsis(malId, episode.number, synopsis);
          row = { ...row, synopsis, synopsisFetched: true };
          log(
            `${tag}: "${episode.title}", ${synopsis ? `synopsis ${synopsis.length} chars` : 'no synopsis yet'}`,
          );
        }
        if (translators && !dryRun) {
          const fields: { titleVi?: string; synopsisVi?: string } = {};
          if (row.titleVi === null) {
            fields.titleVi = await translators.title.translate(row.title);
          }
          if (row.synopsis !== null && row.synopsisVi === null) {
            fields.synopsisVi = await translators.synopsis.translate(
              row.synopsis,
            );
          }
          if (fields.titleVi || fields.synopsisVi) {
            await store.saveTranslation(malId, episode.number, fields);
            totals.translated += 1;
          }
        }
      } catch (error) {
        totals.failed += 1;
        log(
          `${tag}: failed, ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
  return totals;
}
