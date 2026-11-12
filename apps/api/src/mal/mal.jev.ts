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

export const MAX_JEV_CANDIDATES = 20;
const SYNONYM_CAP = 10;

const MATCH_INSTRUCTIONS =
  'Pick the candidate that is the same anime and the same season as the source. ' +
  'The source title may be Vietnamese or a romanization of the Japanese title. ' +
  'When present, romaji is a Hepburn-style romanization of the original Japanese title, taken from the source site URL slug, so compare it with the MyAnimeList titles and synonyms of each candidate. ' +
  'MyAnimeList lists each season as its own entry, so pick the entry for the same season as the source. ' +
  'Compare titles, English titles, synonyms, start date, episode count and media type. ' +
  'A movie, a special, a recap or a spin-off is a different show. ' +
  'While a show is currently airing, the source episode count may be only the episodes aired so far, so a source count lower than the candidate total is not a mismatch.';

const AnswersSchema = z.object({ match: ChoiceSchema, any_match: NoulSchema });

export interface MalJevVerdict {
  choice: MalCandidate;
  probability: number;
  confidence: number;
  noul: number;
  probabilities: Record<string, number>;
  accepted: boolean;
  // min(noul, choice probability), the number stored as the match score.
  score: number;
}

export interface MalJudge {
  ask(input: TitleInput, candidates: MalCandidate[]): Promise<MalJevVerdict>;
}

// What Jev sees: every show any search returned, first search first, each id once.
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

// No show-scope question: MAL lists one entry per season, so only a season answer is usable.
export function malJevQuestions(candidates: MalCandidate[]) {
  return {
    match: choice(
      MATCH_INSTRUCTIONS,
      Object.fromEntries(
        candidates.map((c) => [String(c.id), describeCandidate(c)]),
      ),
    ),
    any_match: noul(ANY_MATCH_INSTRUCTIONS),
  };
}

export class MalJevJudge implements MalJudge {
  private readonly logger = new Logger(MalJevJudge.name);
  private readonly client: TypeSafeClient;
  private readonly model: string;
  private readonly thresholds: JevThresholds;

  constructor(
    client: TypeSafeClient,
    model: string,
    thresholds: JevThresholds,
  ) {
    this.client = client;
    this.model = model;
    this.thresholds = thresholds;
  }

  async ask(
    input: TitleInput,
    candidates: MalCandidate[],
  ): Promise<MalJevVerdict> {
    const result = await this.client.systemOne({
      model: this.model,
      state: malJevState(input, candidates),
      questions: malJevQuestions(candidates),
    });
    const answers = AnswersSchema.parse(result.answers);
    const chosen = chosenCandidate(candidates, answers.match.choice);
    const probability = answers.match.probabilities[answers.match.choice] ?? 0;
    const { confidence, probabilities } = answers.match;
    const anyMatch = answers.any_match.noul;
    const accepted = acceptsChoice(
      this.thresholds,
      anyMatch,
      probability,
      confidence,
    );

    this.logger.log(
      `jev mal ${input.slug}: choice ${chosen.id} p=${fmt(probability)} ` +
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
