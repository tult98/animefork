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
import {
  jevCandidates,
  type MalJevVerdict,
  type MalJudge,
  type MalTieEntry,
} from './mal.jev.ts';
import { fitsYear, matchMal, type MalMatch } from './mal.matcher.ts';
import { searchable, sourceQueries } from './mal.queries.ts';
import {
  MAL_MATCHER_VERSION,
  isMalSettled,
  type MalStatus,
} from './mal.retry.ts';
import type {
  MalHolder,
  MalMatchedBy,
  MalStore,
  StoredMal,
} from './mal.store.ts';
import type { NameGuessStore } from './name-guess.store.ts';
import type { MalNameGuesser } from './name-guesser.ts';

// MAL ids other slugs of the same display name already hold. The source gives a franchise's
// movies the series' name, so without this every movie lands on the series' entry.
export type TakenSource = () => Promise<number[]>;

export type MalOutcome =
  // evicts: the slugs that held the id and lost it to this one in a tie-break.
  | { status: 'ok'; match: MalMatch; by: MalMatchedBy; evicts: string[] }
  | { status: 'none'; reason: string };

// winner: the slug that keeps the entry, or null when nobody moves.
export interface MalTie {
  winner: string | null;
  reason: string;
}

type Found = { match: MalMatch; by: MalMatchedBy } | { reason: string };

// Each lost tie-break blocks one id and may cost a Jev question; a title that loses this many is a miss.
const MAX_TIE_BREAKS = 3;

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
          : await this.save(input.slug, await this.match(input, taken));
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
      mediaType: stats.mediaType,
      english: stats.english,
      synonyms: stats.synonyms,
      trailerYoutubeId:
        trailer === undefined ? current.trailerYoutubeId : trailer,
      datesKnown: true,
      attemptedAt: now,
      fetchedAt: now,
    };
    await this.store.save(row);
    return row;
  }

  // Runs the matcher without saving, so a caller can compare the result with the stored row.
  rematch(input: TitleInput, taken?: TakenSource): Promise<MalOutcome> {
    return this.match(input, taken);
  }

  async save(slug: string, outcome: MalOutcome): Promise<StoredMal | null> {
    if (outcome.status === 'none') {
      await this.saveMiss(slug, 'none', outcome.reason);
      return null;
    }
    const row = await this.saveMatch(slug, outcome.match, outcome.by);
    for (const holder of outcome.evicts) {
      await this.evict(holder, outcome.match.candidate.id, slug);
    }
    return row;
  }

  // What MAL says of an entry now, for a tie-break over a row stored before its facts were.
  async entry(malId: number): Promise<MalTieEntry | null> {
    return (await this.client.entry(malId))?.candidate ?? null;
  }

  // The year guard settles a tie on its own when only one slug starts near the entry; Jev settles the rest.
  async tieBreak(entry: MalTieEntry, sources: MalHolder[]): Promise<MalTie> {
    const near = sources.filter((s) =>
      fitsYear({ year: s.year ?? undefined }, entry),
    );
    const [only] = near;
    if (only && near.length === 1) {
      return {
        winner: only.slug,
        reason: `only ${only.slug} starts within a year of it`,
      };
    }
    if (!this.judge) return { winner: null, reason: 'Jev is off' };
    const verdict = await this.judge.askTieBreak(
      entry,
      near.length > 1 ? near : sources,
    );
    return {
      winner: verdict.accepted ? verdict.slug : null,
      reason: `jev best ${verdict.slug} p=${fmt(verdict.probability)} noul=${fmt(verdict.noul)}`,
    };
  }

  // Matcher version 0 makes the miss due at once, so the loser is matched again on its next lookup,
  // where the tie-break hands the id to the winner and the loser looks further.
  evict(slug: string, malId: number, winner: string): Promise<void> {
    return this.saveMiss(
      slug,
      'none',
      `lost MAL ${malId} to ${winner} in a tie-break`,
      0,
    );
  }

  // One MAL entry is one slug. When the winner is held by another slug, Jev settles which one it
  // is; a lost tie-break blocks the id and the match runs again on the same search results.
  private async match(
    input: TitleInput,
    taken?: TakenSource,
  ): Promise<MalOutcome> {
    const sameName = taken ? await taken() : [];
    const blocked = new Set(sameName);
    const searched = new Map<string, MalCandidate[]>();
    const lost: string[] = [];
    const miss = (reason: string): MalOutcome => ({
      status: 'none',
      reason:
        lost.length > 0
          ? `${reason} (lost ${lost.join(', ')} in a tie-break)`
          : reason,
    });
    for (let round = 0; round < MAX_TIE_BREAKS; round++) {
      const found = await this.find(input, sameName, blocked, searched);
      if ('reason' in found) return miss(found.reason);
      const { candidate } = found.match;
      const holders = await this.store.holders(candidate.id, input.slug);
      if (holders.length === 0) return { status: 'ok', ...found, evicts: [] };
      const held = `MAL ${candidate.id} is held by ${holders.map((h) => h.slug).join(', ')}`;
      const tie = await this.tieBreak(candidate, [
        {
          slug: input.slug,
          name: input.name,
          year: input.year ?? null,
          episodeCount: input.episodeCount ?? null,
        },
        ...holders,
      ]);
      if (tie.winner === null) {
        return miss(`${held}; the tie-break is unsure: ${tie.reason}`);
      }
      if (tie.winner === input.slug) {
        return { status: 'ok', ...found, evicts: holders.map((h) => h.slug) };
      }
      blocked.add(candidate.id);
      lost.push(`MAL ${candidate.id} to ${tie.winner}`);
    }
    return miss('every match was held by another slug');
  }

  private async find(
    input: TitleInput,
    sameName: number[],
    blocked: Set<number>,
    searched: Map<string, MalCandidate[]>,
  ): Promise<Found> {
    const open = (c: MalCandidate) => !blocked.has(c.id) && fitsYear(input, c);
    const pages: MalCandidate[][] = [];
    const asked: string[] = [];
    const search = async (query: string) => {
      asked.push(query);
      let results = searched.get(query);
      if (!results) {
        results = await this.client.search(query);
        searched.set(query, results);
      }
      const page = results.filter(open);
      pages.push(page);
      return page;
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
    if (found) return { match: found, by: 'score' };
    const judged =
      guessed.length > 0 ? { ...input, otherNames: guessed } : input;
    const candidates = jevCandidates(pages);
    let reason = 'no candidate cleared the match';
    if (this.judge && candidates.length > 0) {
      const verdict = await this.judge.ask(judged, candidates);
      if (verdict.accepted) {
        return {
          match: { candidate: verdict.choice, score: verdict.score },
          by: 'jev',
        };
      }
      reason = `jev rejected: ${describeVerdict(verdict)}`;
    }
    if (this.judge && this.franchise && sameName.length > 0) {
      const pool = (await this.franchise.candidates(sameName)).filter(open);
      if (pool.length > 0) {
        const verdict = await this.judge.askFranchise(judged, pool);
        if (verdict.accepted) {
          return {
            match: { candidate: verdict.choice, score: verdict.score },
            by: 'franchise',
          };
        }
        reason = `franchise rejected: ${describeVerdict(verdict)}`;
      }
    }
    return { reason };
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
      mediaType: candidate.mediaType ?? null,
      english: candidate.english ?? null,
      synonyms: candidate.synonyms,
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
    matcherVersion = MAL_MATCHER_VERSION,
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
      mediaType: null,
      english: null,
      synonyms: [],
      trailerYoutubeId: null,
      datesKnown: false,
      matchedTitle: null,
      matchScore: null,
      matchedBy: null,
      matcherVersion,
      reason,
      attemptedAt: this.now(),
      fetchedAt: null,
    });
  }
}

const describeVerdict = (verdict: MalJevVerdict) =>
  `best ${verdict.choice.id} p=${fmt(verdict.probability)} noul=${fmt(verdict.noul)}`;
