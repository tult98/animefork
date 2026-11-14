import { Logger } from '@nestjs/common';
import {
  choice,
  noul,
  TypeSafeClient,
  type ContentValue,
  type TypeSafeClientConfig,
} from '@typesafe-ai/sdk';
import { z } from 'zod';
import type { JevConfig } from '../art.config.ts';
import {
  BaselineMatcher,
  CascadeMatcher,
  candidateKey,
  type Candidate,
  type MatchAnswer,
  type Matcher,
  type MatchQuestion,
} from './matcher.ts';

export const JEV_TIMEOUT_MS = 15_000;
const ALTERNATIVE_TITLE_CAP = 10;

const SOURCE_TITLE_NOTE =
  'The source title may be Vietnamese or a romanization of the Japanese title. ' +
  'When present, romaji is a Hepburn-style romanization of the original Japanese title, taken from the source site URL slug, so compare it with candidate original names and alternative titles. ' +
  'When present, otherNames are other known titles that the source site lists, such as an English, romaji or pinyin title. ';

const KIND_NOTE =
  'Each candidate is either a TV series or a movie. ' +
  'The source is a TV season unless its title, romaji or otherNames show it is a movie, a special, an OVA or a recap. ';

const MATCH_INSTRUCTIONS =
  'Pick the candidate that is the same anime and the same season as the source, or the same entry when the source is a movie, a special, an OVA or a recap. ' +
  SOURCE_TITLE_NOTE +
  KIND_NOTE +
  'Compare names, original names, alternative titles, first air date and episode count. ' +
  "A TV series candidate's firstAirDate and episodeCount describe the season with the source's season number. " +
  "A movie candidate's firstAirDate is its release date. " +
  'When the source is a movie, only the candidate for that same movie matches. ' +
  'A different season, a different movie, a special, a recap or a spin-off is a different show.';

export const ANY_MATCH_INSTRUCTIONS =
  'At least one candidate is the same anime and the same season as the source.';

const ANY_ENTRY_MATCH_INSTRUCTIONS =
  ANY_MATCH_INSTRUCTIONS +
  ' When the source is a movie, a special, an OVA or a recap, that means the candidate for that same entry.';

const SHOW_MATCH_INSTRUCTIONS =
  'Pick the candidate that is the same anime franchise as the source, ignoring which season, cour, arc or part the source is. ' +
  SOURCE_TITLE_NOTE +
  KIND_NOTE +
  'Compare names, original names, alternative titles and overview. ' +
  'When the source is a movie, a special, an OVA or a recap, only a candidate for that same entry counts, never the TV series of its franchise. ' +
  'A different franchise, or a movie, a special, a recap or a spin-off of another show, is not the same.';

const ANY_SHOW_INSTRUCTIONS =
  'At least one candidate is the same anime franchise as the source, whichever season it is. ' +
  'When the source is a movie, a special, an OVA or a recap, only a candidate for that same entry counts.';

const SIDE_ENTRY_INSTRUCTIONS =
  'The source is a movie, a special, an OVA or a recap, not a season of a TV series. ' +
  SOURCE_TITLE_NOTE;

const SIDE_ENTRY_WORDS = /\b(movie|film|special|ova|gekijouban)\b/i;
const MIN_SIDE_ENTRY_NOUL = 0.5;
const MAX_SHOW_YEARS_AFTER = 1;

export const ChoiceSchema = z.object({
  choice: z.string(),
  confidence: z.number(),
  probabilities: z.record(z.string(), z.number()),
});

export const NoulSchema = z.object({ noul: z.number() });

const AnswersSchema = z.object({
  match: ChoiceSchema,
  any_match: NoulSchema,
  show_match: ChoiceSchema,
  any_show: NoulSchema,
  side_entry: NoulSchema,
});

export interface JevVerdict {
  choice: Candidate;
  choiceProbability: number;
  confidence: number;
  noul: number;
  probabilities: Record<string, number>;
  showChoice: Candidate;
  showChoiceProbability: number;
  showConfidence: number;
  showNoul: number;
  showProbabilities: Record<string, number>;
  sideEntryNoul: number;
  sideEntry: boolean;
  accepted: boolean;
  answer: MatchAnswer;
}

export type JevThresholds = Pick<
  JevConfig,
  'minNoul' | 'minChoice' | 'minConfidence'
>;

export function createJevClient(
  config: Pick<JevConfig, 'apiKey' | 'model'>,
  overrides: Omit<TypeSafeClientConfig, 'apiKey'> = {},
): TypeSafeClient {
  return new TypeSafeClient({
    apiKey: config.apiKey,
    defaultModel: config.model,
    timeout: JEV_TIMEOUT_MS,
    ...overrides,
  });
}

function describeCandidate(c: Candidate): string {
  const names =
    c.originalName === c.name ? c.name : `${c.name} / ${c.originalName}`;
  if (c.kind === 'movie') {
    const released = c.firstAirDate
      ? `released ${c.firstAirDate}`
      : 'release date unknown';
    return `Movie: ${names}, ${released}`;
  }
  const aired = c.firstAirDate
    ? `first aired ${c.firstAirDate}`
    : 'air date unknown';
  const episodes =
    c.episodeCount !== undefined
      ? `${c.episodeCount} episodes`
      : 'episode count unknown';
  return `TV series: ${names}, ${aired}, ${episodes}`;
}

export const fmt = (n: number) => n.toFixed(2);

export function jevState(question: MatchQuestion): {
  [key: string]: ContentValue;
} {
  return {
    source: {
      title: question.sourceTitle,
      ...(question.romaji !== undefined && { romaji: question.romaji }),
      ...(question.otherNames !== undefined &&
        question.otherNames.length > 0 && { otherNames: question.otherNames }),
      season: question.season,
      ...(question.year !== undefined && { year: question.year }),
      ...(question.episodeCount !== undefined && {
        episodeCount: question.episodeCount,
      }),
    },
    candidates: question.candidates.map((c) => ({
      id: candidateKey(c),
      kind: c.kind === 'movie' ? 'movie' : 'tv series',
      title: c.name,
      originalTitle: c.originalName,
      alternativeTitles: c.alternativeTitles.slice(0, ALTERNATIVE_TITLE_CAP),
      ...(c.firstAirDate !== undefined && { firstAirDate: c.firstAirDate }),
      ...(c.episodeCount !== undefined && { episodeCount: c.episodeCount }),
      ...(c.overview !== undefined && { overview: c.overview }),
    })),
  };
}

export function jevQuestions(question: MatchQuestion) {
  const options = () =>
    Object.fromEntries(
      question.candidates.map((c) => [candidateKey(c), describeCandidate(c)]),
    );
  return {
    match: choice(MATCH_INSTRUCTIONS, options()),
    any_match: noul(ANY_ENTRY_MATCH_INSTRUCTIONS),
    show_match: choice(SHOW_MATCH_INSTRUCTIONS, options()),
    any_show: noul(ANY_SHOW_INSTRUCTIONS),
    side_entry: noul(SIDE_ENTRY_INSTRUCTIONS),
  };
}

export function chosenCandidate<T extends { id: number }>(
  candidates: readonly T[],
  raw: string,
  key: (c: T) => string = (c) => String(c.id),
): T {
  const chosen = candidates.find((c) => key(c) === raw);
  if (!chosen) throw new Error(`Jev chose ${raw}, which is not a candidate`);
  return chosen;
}

export const formatProbabilities = (probabilities: Record<string, number>) =>
  Object.entries(probabilities)
    .map(([id, p]) => `${id}:${fmt(p)}`)
    .join(',');

export function acceptsChoice(
  thresholds: JevThresholds,
  noul: number,
  probability: number,
  confidence: number,
): boolean {
  return (
    noul >= thresholds.minNoul &&
    probability >= thresholds.minChoice &&
    confidence >= thresholds.minConfidence
  );
}

function namesSideEntry(question: MatchQuestion): boolean {
  return SIDE_ENTRY_WORDS.test(
    `${question.slug.replace(/-/g, ' ')} ${question.sourceTitle}`,
  );
}

function firstYear(date: string | undefined): number | undefined {
  const year = date ? Number.parseInt(date.slice(0, 4), 10) : NaN;
  return Number.isNaN(year) ? undefined : year;
}

export function startsLongAfter(
  showFirstAirDate: string | null | undefined,
  year: number | null | undefined,
): boolean {
  const aired = firstYear(showFirstAirDate ?? undefined);
  return (
    year != null && aired !== undefined && aired - year > MAX_SHOW_YEARS_AFTER
  );
}

function airedLongAfter(c: Candidate, year: number | undefined): boolean {
  return c.kind === 'tv' && startsLongAfter(c.showFirstAirDate, year);
}

export class JevMatcher implements Matcher {
  private readonly logger = new Logger(JevMatcher.name);
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

  async match(question: MatchQuestion): Promise<MatchAnswer> {
    return (await this.ask(question)).answer;
  }

  async ask(question: MatchQuestion): Promise<JevVerdict> {
    const result = await this.client.systemOne({
      model: this.model,
      state: jevState(question),
      questions: jevQuestions(question),
    });
    const answers = AnswersSchema.parse(result.answers);
    const chosen = chosenCandidate(
      question.candidates,
      answers.match.choice,
      candidateKey,
    );
    const showChosen = chosenCandidate(
      question.candidates,
      answers.show_match.choice,
      candidateKey,
    );
    const choiceProbability =
      answers.match.probabilities[answers.match.choice] ?? 0;
    const showChoiceProbability =
      answers.show_match.probabilities[answers.show_match.choice] ?? 0;
    const { confidence } = answers.match;
    const showConfidence = answers.show_match.confidence;
    const anyMatch = answers.any_match.noul;
    const anyShow = answers.any_show.noul;
    const sideEntryNoul = answers.side_entry.noul;
    const sideEntry =
      question.sideEntry === true ||
      sideEntryNoul >= MIN_SIDE_ENTRY_NOUL ||
      namesSideEntry(question);
    const fitsSourceKind = (c: Candidate) =>
      sideEntry ? c.kind === 'movie' : c.kind === 'tv';
    const seasonAccepted =
      fitsSourceKind(chosen) &&
      acceptsChoice(this.thresholds, anyMatch, choiceProbability, confidence);
    const showAccepted =
      fitsSourceKind(showChosen) &&
      !airedLongAfter(showChosen, question.year) &&
      acceptsChoice(
        this.thresholds,
        anyShow,
        showChoiceProbability,
        showConfidence,
      );
    const seasonProbability = Math.min(anyMatch, choiceProbability);
    const showProbability = Math.min(anyShow, showChoiceProbability);
    const verdict = seasonAccepted
      ? 'accept season'
      : showAccepted
        ? 'accept show'
        : 'reject';

    this.logger.log(
      `jev ${question.slug}: side entry ${sideEntry} noul=${fmt(sideEntryNoul)}; ` +
        `season choice ${candidateKey(chosen)} p=${fmt(choiceProbability)} ` +
        `confidence=${fmt(confidence)} noul=${fmt(anyMatch)} ` +
        `probabilities=${formatProbabilities(answers.match.probabilities)}; ` +
        `show choice ${candidateKey(showChosen)} p=${fmt(showChoiceProbability)} ` +
        `confidence=${fmt(showConfidence)} noul=${fmt(anyShow)} ` +
        `probabilities=${formatProbabilities(answers.show_match.probabilities)} -> ${verdict}`,
    );

    const answer: MatchAnswer = seasonAccepted
      ? {
          choice: chosen.id,
          kind: chosen.kind,
          probability: seasonProbability,
          episodeOffset: 0,
          by: 'jev',
          scope: 'season',
          sideEntry,
        }
      : showAccepted
        ? {
            choice: showChosen.id,
            kind: showChosen.kind,
            probability: showProbability,
            by: 'jev',
            scope: 'show',
            sideEntry,
          }
        : {
            choice: null,
            kind: 'tv',
            probability: seasonProbability,
            showProbability,
            by: 'jev',
            scope: 'season',
            sideEntry,
          };

    return {
      choice: chosen,
      choiceProbability,
      confidence,
      noul: anyMatch,
      probabilities: answers.match.probabilities,
      showChoice: showChosen,
      showChoiceProbability,
      showConfidence,
      showNoul: anyShow,
      showProbabilities: answers.show_match.probabilities,
      sideEntryNoul,
      sideEntry,
      accepted: seasonAccepted || showAccepted,
      answer,
    };
  }
}

export function createMatcher(
  jev: (Pick<JevConfig, 'apiKey' | 'model'> & JevThresholds) | undefined,
  logger: Pick<Logger, 'log'> = new Logger('ArtMatcher'),
  overrides: Omit<TypeSafeClientConfig, 'apiKey'> = {},
): Matcher {
  const baseline = new BaselineMatcher();
  if (!jev) {
    logger.log('Jev matcher is off: TYPESAFE_API_KEY is not set');
    return baseline;
  }
  logger.log(`Jev matcher is on (model ${jev.model})`);
  return new CascadeMatcher(
    baseline,
    new JevMatcher(createJevClient(jev, overrides), jev.model, jev),
  );
}
