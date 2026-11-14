import { Logger } from '@nestjs/common';
import {
  choice,
  noul,
  type ContentValue,
  type TypeSafeClient,
  type TypeSafeClientConfig,
} from '@typesafe-ai/sdk';
import { z } from 'zod';
import type { JevConfig } from '../art/art.config.ts';
import type { TitleInput } from '../art/contract.ts';
import {
  acceptsChoice,
  ANY_MATCH_INSTRUCTIONS,
  ChoiceSchema,
  chosenCandidate,
  createJevClient,
  fmt,
  formatProbabilities,
  NoulSchema,
  type JevThresholds,
} from '../art/tmdb/jev.ts';
import { distinctRomaji } from '../art/tmdb/titles.ts';
import type { MalCandidate } from './mal.client.ts';
import { isShow, wantedSeason } from './mal.matcher.ts';
import type { MalHolder } from './mal.store.ts';

export const MAX_JEV_CANDIDATES = 20;
const SYNONYM_CAP = 10;

const MATCH_INSTRUCTIONS =
  'Pick the candidate that is the same anime and the same season as the source. ' +
  'The source title may be Vietnamese or a romanization of the Japanese title. ' +
  'When present, romaji is a Hepburn-style romanization of the original Japanese title, taken from the source site URL slug, so compare it with the MyAnimeList titles and synonyms of each candidate. ' +
  'When present, otherNames are other known titles of the same franchise that the source site lists, such as an English, romaji or pinyin title; they name the show, not the season. ' +
  'MyAnimeList lists each season as its own entry, so pick the entry for the same season as the source. ' +
  'Compare titles, English titles, synonyms, start date, episode count and media type. ' +
  'A movie, a special, a recap or a spin-off is a different show. ' +
  'While a show is currently airing, the source episode count may be only the episodes aired so far, so a source count lower than the candidate total is not a mismatch.';

const FRANCHISE_MATCH_INSTRUCTIONS =
  'The source site gives every entry of this franchise the same title, the series name, so the title says only which franchise it is. ' +
  'The romaji, taken from the source site URL slug, names this particular entry: a movie, a special, a TV special or a season, possibly in Vietnamese or with its movie number. ' +
  'Pick the MyAnimeList candidate that is that entry. ' +
  'Movies, specials and TV specials are valid answers. ' +
  'Compare the romaji with each candidate title, English title and synonyms; translate a Vietnamese subtitle before comparing. ' +
  'A number in the subtitle is not necessarily the movie number.';

const FRANCHISE_ANY_MATCH_INSTRUCTIONS =
  'At least one candidate is the same entry the source romaji names.';

const TIE_BREAK_INSTRUCTIONS =
  'Several source titles were matched to the same MyAnimeList entry, and at most one of them is that entry. ' +
  'Pick the source title that is the same anime, the same season and the same kind of entry (a TV series, a movie or a special) as the MyAnimeList entry. ' +
  'The slug words come from the source site URL. They are often a romanization of the Japanese title, and may name the season, a movie or a movie number. ' +
  "The display name may be Vietnamese, and the source can give a franchise's movies the series' display name, so trust the slug words when the two disagree. " +
  'Compare the entry start date with each source year, and the entry episode count with each source episode count.';

const TIE_BREAK_ANY_INSTRUCTIONS =
  'At least one source title is the same anime, the same season and the same kind of entry as the MyAnimeList entry.';

const AnswersSchema = z.object({ match: ChoiceSchema, any_match: NoulSchema });

export type MalTieEntry = Pick<
  MalCandidate,
  'id' | 'title' | 'english' | 'mediaType' | 'startDate' | 'year' | 'episodes'
>;

export interface MalTieVerdict {
  slug: string;
  probability: number;
  confidence: number;
  noul: number;
  accepted: boolean;
}

export interface MalJevVerdict {
  choice: MalCandidate;
  probability: number;
  confidence: number;
  noul: number;
  probabilities: Record<string, number>;
  accepted: boolean;
  score: number;
}

export interface MalJudge {
  ask(input: TitleInput, candidates: MalCandidate[]): Promise<MalJevVerdict>;
  // Picks the movie or special a same-named slug is, among the entries MAL relates to its franchise.
  askFranchise(
    input: TitleInput,
    candidates: MalCandidate[],
  ): Promise<MalJevVerdict>;
  // Picks which of the slugs matched to one MAL entry is that entry, when Jev is sure enough.
  askTieBreak(entry: MalTieEntry, sources: MalHolder[]): Promise<MalTieVerdict>;
}

export type MalJevThresholds = JevThresholds &
  Pick<
    JevConfig,
    'malMinNoul' | 'malMinChoice' | 'franchiseMinChoice' | 'franchiseMinNoul'
  >;

export function jevCandidates(pages: MalCandidate[][]): MalCandidate[] {
  const seen = new Map<number, MalCandidate>();
  for (const c of pages.flat()) {
    if (isShow(c) && !seen.has(c.id)) seen.set(c.id, c);
  }
  return [...seen.values()].slice(0, MAX_JEV_CANDIDATES);
}

function describeCandidate(c: MalCandidate): string {
  const names =
    c.english && c.english !== c.title ? `${c.title} / ${c.english}` : c.title;
  const start = c.startDate ?? c.year;
  return [
    names,
    c.mediaType ?? 'media type unknown',
    start !== undefined ? `started ${start}` : 'start unknown',
    c.episodes !== undefined
      ? `${c.episodes} episodes`
      : 'episode count unknown',
    c.airing?.replaceAll('_', ' ') ?? 'airing status unknown',
  ].join(', ');
}

export function malJevState(
  input: TitleInput,
  candidates: MalCandidate[],
): { [key: string]: ContentValue } {
  const romaji = distinctRomaji(input.slug, input.name);
  return {
    source: {
      title: input.name,
      ...(romaji !== undefined && { romaji }),
      ...(input.otherNames !== undefined &&
        input.otherNames.length > 0 && { otherNames: input.otherNames }),
      season: wantedSeason(input),
      ...(input.year !== undefined && { year: input.year }),
      ...(input.episodeCount !== undefined && {
        episodeCount: input.episodeCount,
      }),
    },
    candidates: candidates.map((c) => ({
      id: c.id,
      title: c.title,
      ...(c.english !== undefined && { englishTitle: c.english }),
      synonyms: c.synonyms.slice(0, SYNONYM_CAP),
      ...(c.startDate !== null
        ? { startDate: c.startDate }
        : c.year !== undefined && { year: c.year }),
      ...(c.episodes !== undefined && { episodeCount: c.episodes }),
      ...(c.mediaType !== undefined && { mediaType: c.mediaType }),
      ...(c.airing !== null && { airingStatus: c.airing }),
    })),
  };
}

const options = (candidates: MalCandidate[]) =>
  Object.fromEntries(
    candidates.map((c) => [String(c.id), describeCandidate(c)]),
  );

export function malJevQuestions(candidates: MalCandidate[]) {
  return {
    match: choice(MATCH_INSTRUCTIONS, options(candidates)),
    any_match: noul(ANY_MATCH_INSTRUCTIONS),
  };
}

export function malFranchiseQuestions(candidates: MalCandidate[]) {
  return {
    match: choice(FRANCHISE_MATCH_INSTRUCTIONS, options(candidates)),
    any_match: noul(FRANCHISE_ANY_MATCH_INSTRUCTIONS),
  };
}

const slugWords = (slug: string) =>
  slug
    .replace(/-a\d+$/, '')
    .replace(/-+/g, ' ')
    .trim();

export function malTieState(
  entry: MalTieEntry,
  sources: MalHolder[],
): { [key: string]: ContentValue } {
  return {
    entry: {
      title: entry.title,
      ...(entry.english !== undefined && { englishTitle: entry.english }),
      ...(entry.mediaType !== undefined && { mediaType: entry.mediaType }),
      ...(entry.startDate !== null && { startDate: entry.startDate }),
      ...(entry.episodes !== undefined && { episodeCount: entry.episodes }),
    },
    sources: sources.map((s) => ({
      slug: s.slug,
      slugWords: slugWords(s.slug),
      ...(s.name !== null && { title: s.name }),
      ...(s.year !== null && { year: s.year }),
      ...(s.episodeCount !== null && { episodeCount: s.episodeCount }),
    })),
  };
}

function describeSource(s: MalHolder): string {
  return [
    `${s.name ?? 'no display name'} (${slugWords(s.slug)})`,
    s.year !== null ? `year ${s.year}` : 'year unknown',
    s.episodeCount !== null
      ? `${s.episodeCount} episodes`
      : 'episode count unknown',
  ].join(', ');
}

export function malTieQuestions(sources: MalHolder[]) {
  return {
    match: choice(
      TIE_BREAK_INSTRUCTIONS,
      Object.fromEntries(sources.map((s) => [s.slug, describeSource(s)])),
    ),
    any_match: noul(TIE_BREAK_ANY_INSTRUCTIONS),
  };
}

export class MalJevJudge implements MalJudge {
  private readonly logger = new Logger(MalJevJudge.name);
  private readonly client: TypeSafeClient;
  private readonly model: string;
  private readonly thresholds: MalJevThresholds;

  constructor(
    client: TypeSafeClient,
    model: string,
    thresholds: MalJevThresholds,
  ) {
    this.client = client;
    this.model = model;
    this.thresholds = thresholds;
  }

  ask(input: TitleInput, candidates: MalCandidate[]): Promise<MalJevVerdict> {
    return this.judge(
      input,
      candidates,
      malJevQuestions(candidates),
      {
        minChoice: this.thresholds.malMinChoice,
        minNoul: this.thresholds.malMinNoul,
        minConfidence: this.thresholds.minConfidence,
      },
      'jev mal',
    );
  }

  askFranchise(
    input: TitleInput,
    candidates: MalCandidate[],
  ): Promise<MalJevVerdict> {
    return this.judge(
      input,
      candidates,
      malFranchiseQuestions(candidates),
      {
        minChoice: this.thresholds.franchiseMinChoice,
        minNoul: this.thresholds.franchiseMinNoul,
        minConfidence: this.thresholds.minConfidence,
      },
      'jev mal franchise',
    );
  }

  async askTieBreak(
    entry: MalTieEntry,
    sources: MalHolder[],
  ): Promise<MalTieVerdict> {
    const result = await this.client.systemOne({
      model: this.model,
      state: malTieState(entry, sources),
      questions: malTieQuestions(sources),
    });
    const answers = AnswersSchema.parse(result.answers);
    const slug = answers.match.choice;
    if (!sources.some((s) => s.slug === slug)) {
      throw new Error(`Jev chose ${slug}, which is not a source`);
    }
    const probability = answers.match.probabilities[slug] ?? 0;
    const { confidence } = answers.match;
    const anyMatch = answers.any_match.noul;
    const accepted = acceptsChoice(
      {
        minChoice: this.thresholds.malMinChoice,
        minNoul: this.thresholds.malMinNoul,
        minConfidence: this.thresholds.minConfidence,
      },
      anyMatch,
      probability,
      confidence,
    );
    this.logger.log(
      `jev mal tie-break ${entry.id}: choice ${slug} p=${fmt(probability)} ` +
        `confidence=${fmt(confidence)} noul=${fmt(anyMatch)} -> ${accepted ? 'accept' : 'reject'}`,
    );
    return { slug, probability, confidence, noul: anyMatch, accepted };
  }

  private async judge(
    input: TitleInput,
    candidates: MalCandidate[],
    questions: ReturnType<typeof malJevQuestions>,
    thresholds: JevThresholds,
    label: string,
  ): Promise<MalJevVerdict> {
    const result = await this.client.systemOne({
      model: this.model,
      state: malJevState(input, candidates),
      questions,
    });
    const answers = AnswersSchema.parse(result.answers);
    const chosen = chosenCandidate(candidates, answers.match.choice);
    const probability = answers.match.probabilities[answers.match.choice] ?? 0;
    const { confidence, probabilities } = answers.match;
    const anyMatch = answers.any_match.noul;
    const accepted = acceptsChoice(
      thresholds,
      anyMatch,
      probability,
      confidence,
    );

    this.logger.log(
      `${label} ${input.slug}: choice ${chosen.id} p=${fmt(probability)} ` +
        `confidence=${fmt(confidence)} noul=${fmt(anyMatch)} ` +
        `probabilities=${formatProbabilities(probabilities)} -> ${accepted ? 'accept' : 'reject'}`,
    );

    return {
      choice: chosen,
      probability,
      confidence,
      noul: anyMatch,
      probabilities,
      accepted,
      score: Math.min(anyMatch, probability),
    };
  }
}

export function createMalJudge(
  jev: JevConfig | undefined,
  logger: Pick<Logger, 'log'> = new Logger('MalJevJudge'),
  overrides: Omit<TypeSafeClientConfig, 'apiKey'> = {},
): MalJudge | null {
  if (!jev) {
    logger.log('MAL Jev matcher is off: TYPESAFE_API_KEY is not set');
    return null;
  }
  logger.log(`MAL Jev matcher is on (model ${jev.model})`);
  return new MalJevJudge(createJevClient(jev, overrides), jev.model, jev);
}
