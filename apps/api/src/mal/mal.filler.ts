import { Logger } from '@nestjs/common';
import type { TitleInput } from '../art/contract.ts';
import { describeError } from '../art/art.filler.ts';
import { fmt } from '../art/tmdb/jev.ts';
import { nameQueries } from '../art/tmdb/titles.ts';
import type { Clock } from '../common/clock.ts';
import type {
  EpisodeFiller,
  EpisodeTarget,
} from '../episodes/episode.filler.ts';
import type { MalCandidate, MalClient } from './mal.client.ts';
import type { MalFranchise } from './mal.franchise.ts';
import type { TrailerClient } from './trailer.client.ts';
import { jevCandidates, type MalJevVerdict, type MalJudge } from './mal.jev.ts';
import { matchMal, type MalMatch } from './mal.matcher.ts';
import { searchable, sourceQueries } from './mal.queries.ts';
import {
  MAL_MATCHER_VERSION,
  isMalSettled,
  type MalStatus,
} from './mal.retry.ts';
import type { MalMatchedBy, MalStore, StoredMal } from './mal.store.ts';
import type { NameGuessStore } from './name-guess.store.ts';
import type { MalNameGuesser } from './name-guesser.ts';

// MAL ids other slugs of the same display name already hold. The source gives a franchise's
// movies the series' name, so without this every movie lands on the series' entry.
export type TakenSource = () => Promise<number[]>;

export interface MalNameGuesses {
  guesser: MalNameGuesser;
  store: NameGuessStore;
}

// Single-flight lives in this process's memory, and the client already serializes calls to MAL.
export class MalFiller {
  private readonly logger = new Logger(MalFiller.name);
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly store: MalStore;
  private readonly client: MalClient;
  private readonly now: Clock;
  private readonly judge: MalJudge | null;
  private readonly episodes: EpisodeFiller | null;
  private readonly trailers: TrailerClient | null;
  private readonly franchise: MalFranchise | null;
  private readonly guesses: MalNameGuesses | null;

  constructor(
    store: MalStore,
    client: MalClient,
    now: Clock,
    judge: MalJudge | null = null,
    episodes: EpisodeFiller | null = null,
    trailers: TrailerClient | null = null,
    franchise: MalFranchise | null = null,
    guesses: MalNameGuesses | null = null,
  ) {
    this.store = store;
    this.client = client;
    this.now = now;
    this.judge = judge;
    this.episodes = episodes;
    this.trailers = trailers;
    this.franchise = franchise;
    this.guesses = guesses;
  }

  has(slug: string): boolean {
    return this.inFlight.has(slug);
  }

  fill(input: TitleInput, namesAt?: Date, taken?: TakenSource): Promise<void> {
    const existing = this.inFlight.get(input.slug);
    if (existing) return existing;
    const done = this.run(input, namesAt, taken)
      .catch((error: unknown) => {
        this.logger.error(
          `mal ${input.slug} could not be saved: ${describeError(error)}`,
        );
      })
      .finally(() => this.inFlight.delete(input.slug));
    this.inFlight.set(input.slug, done);
    return done;
  }

  // Schedules the episode list of each matched title that has none yet or is due a refresh.
  ensureEpisodes(rows: Iterable<StoredMal>): Promise<void> {
    if (!this.episodes) return Promise.resolve();
    const targets: EpisodeTarget[] = [];
    for (const row of rows) {
      if (row.status === 'ok' && row.malId !== null) {
        targets.push({ slug: row.slug, malId: row.malId, airing: row.airing });
      }
    }
    return this.episodes.ensure(targets);
  }

  async idle(): Promise<void> {
    while (this.inFlight.size > 0) {
      await Promise.all([...this.inFlight.values()]);
    }
    await this.episodes?.idle();
  }

  private async run(
    input: TitleInput,
    namesAt?: Date,
    taken?: TakenSource,
  ): Promise<void> {
    const current = (await this.store.find([input.slug])).get(input.slug);
    if (isMalSettled(current, this.now(), namesAt)) return;
    let saved: StoredMal | null = null;
    try {
      saved =
        current?.status === 'ok' && current.malId !== null
          ? await this.refresh(current)
          : await this.match(input, taken);
    } catch (error) {
      const reason = describeError(error);
      this.logger.warn(`mal ${input.slug} failed: ${reason}`);
      if (current?.status === 'ok') await this.store.touch(input.slug);
      else await this.saveMiss(input.slug, 'failed', reason);
    }
    // The MAL row is already stored, so the episode names can only add to it.
    if (saved?.malId != null) {
      await this.episodes?.fill({
        slug: saved.slug,
        malId: saved.malId,
        airing: saved.airing,
      });
    }
  }

  private async refresh(current: StoredMal): Promise<StoredMal | null> {
    if (current.malId === null) return null;
    const stats = await this.client.stats(current.malId);
    if (!stats) {
      await this.store.touch(current.slug);
      return null;
    }
    const trailer = await this.trailerFor(current.malId);
    const now = this.now();
    const row: StoredMal = {
      ...current,
      score: stats.score,
      voters: stats.voters,
      rank: stats.rank,
      popularity: stats.popularity,
      members: stats.members,
      airing: stats.airing,
      episodes: stats.episodes,
      startDate: stats.startDate,
      startSeason: stats.startSeason,
      trailerYoutubeId:
        trailer === undefined ? current.trailerYoutubeId : trailer,
      datesKnown: true,
      attemptedAt: now,
      fetchedAt: now,
    };
    await this.store.save(row);
    return row;
  }

  private async match(
    input: TitleInput,
    taken?: TakenSource,
  ): Promise<StoredMal | null> {
    const takenIds = new Set(taken ? await taken() : []);
    const pages: MalCandidate[][] = [];
    const asked: string[] = [];
    const search = async (query: string) => {
      asked.push(query);
      const results = (await this.client.search(query)).filter(
        (c) => !takenIds.has(c.id),
      );
      pages.push(results);
      return results;
    };
    const otherNames = input.otherNames ?? [];
    let found: MalMatch | null = null;
    for (const query of sourceQueries(input)) {
      found = matchMal(input, await search(query), otherNames);
      if (found) break;
    }
    let guessed: string[] = [];
    if (!found && otherNames.length === 0) {
      guessed = await this.guessNames(input);
      for (const query of nameQueries(guessed, asked, searchable)) {
        found = matchMal(input, await search(query), guessed);
        if (found) break;
      }
    }
    if (found) {
      return this.saveMatch(input.slug, found, 'score');
    }
    const candidates = jevCandidates(pages);
    let miss = 'no candidate cleared the match';
    if (this.judge && candidates.length > 0) {
      const verdict = await this.judge.ask(
        guessed.length > 0 ? { ...input, otherNames: guessed } : input,
        candidates,
      );
      if (verdict.accepted) {
        return this.saveMatch(
          input.slug,
          { candidate: verdict.choice, score: verdict.score },
          'jev',
        );
      }
      miss = `jev rejected: ${describeVerdict(verdict)}`;
    }
    if (this.judge && this.franchise && takenIds.size > 0) {
      const pool = await this.franchise.candidates([...takenIds]);
      if (pool.length > 0) {
        const verdict = await this.judge.askFranchise(
          guessed.length > 0 ? { ...input, otherNames: guessed } : input,
          pool,
        );
        if (verdict.accepted) {
          return this.saveMatch(
            input.slug,
            { candidate: verdict.choice, score: verdict.score },
            'franchise',
          );
        }
        miss = `franchise rejected: ${describeVerdict(verdict)}`;
      }
    }
    await this.saveMiss(input.slug, 'none', miss);
    return null;
  }

  private async guessNames(input: TitleInput): Promise<string[]> {
    if (!this.guesses) return [];
    const { guesser, store } = this.guesses;
    let guess = await store.find(input.slug);
    if (guess) return guess.known ? guess.names : [];
    try {
      guess = await guesser.guess({
        name: input.name,
        slug: input.slug,
        year: input.year,
      });
    } catch (error) {
      this.logger.warn(
        `mal ${input.slug} name guess failed: ${describeError(error)}`,
      );
      return [];
    }
    await store.save(input.slug, guess, this.now());
    return guess.known ? guess.names : [];
  }

  private async saveMatch(
    slug: string,
    { candidate, score }: MalMatch,
    by: MalMatchedBy,
  ): Promise<StoredMal> {
    const now = this.now();
    const row: StoredMal = {
      slug,
      status: 'ok',
      malId: candidate.id,
      score: candidate.score,
      voters: candidate.voters,
      rank: candidate.rank,
      popularity: candidate.popularity,
      members: candidate.members,
      airing: candidate.airing,
      episodes: candidate.episodes ?? null,
      startDate: candidate.startDate,
      startSeason: candidate.startSeason,
      trailerYoutubeId: (await this.trailerFor(candidate.id)) ?? null,
      datesKnown: true,
      matchedTitle: candidate.title,
      matchScore: Math.round(score * 1000) / 1000,
      matchedBy: by,
      matcherVersion: MAL_MATCHER_VERSION,
      reason: null,
      attemptedAt: now,
      fetchedAt: now,
    };
    await this.store.save(row);
    return row;
  }

  // undefined means the lookup failed, so a stored id must survive it.
  private async trailerFor(malId: number): Promise<string | null | undefined> {
    return this.trailers?.youtubeId(malId);
  }

  private async saveMiss(
    slug: string,
    status: Exclude<MalStatus, 'ok'>,
    reason: string,
  ): Promise<void> {
    await this.store.save({
      slug,
      status,
      malId: null,
      score: null,
      voters: null,
      rank: null,
      popularity: null,
      members: null,
      airing: null,
      episodes: null,
      startDate: null,
      startSeason: null,
      trailerYoutubeId: null,
      datesKnown: false,
      matchedTitle: null,
      matchScore: null,
      matchedBy: null,
      matcherVersion: MAL_MATCHER_VERSION,
      reason,
      attemptedAt: this.now(),
      fetchedAt: null,
    });
  }
}

const describeVerdict = (verdict: MalJevVerdict) =>
  `best ${verdict.choice.id} p=${fmt(verdict.probability)} noul=${fmt(verdict.noul)}`;
