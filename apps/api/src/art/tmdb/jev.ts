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
  type Candidate,
  type MatchAnswer,
  type Matcher,
  type MatchQuestion,
} from './matcher.ts';

export const JEV_TIMEOUT_MS = 15_000;
const ALTERNATIVE_TITLE_CAP = 10;

const MATCH_INSTRUCTIONS =
  'Pick the candidate that is the same anime and the same season as the source. ' +
  'The source title may be Vietnamese or a romanization of the Japanese title. ' +
  'Compare names, original names, alternative titles, first air date and episode count. ' +
  "A candidate's firstAirDate and episodeCount describe the season with the source's season number. " +
  'A different season, a movie, a special, a recap or a spin-off is a different show.';

const ANY_MATCH_INSTRUCTIONS =
  'At least one candidate is the same anime and the same season as the source.';

const AnswersSchema = z.object({
  match: z.object({
    choice: z.string(),
    confidence: z.number(),
    probabilities: z.record(z.string(), z.number()),
  }),
  any_match: z.object({ noul: z.number() }),
});

export interface JevVerdict {
  choiceId: number;
  choiceProbability: number;
  confidence: number;
  noul: number;
  probabilities: Record<string, number>;
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
  const aired = c.firstAirDate
    ? `first aired ${c.firstAirDate}`
    : 'air date unknown';
  const episodes =
    c.episodeCount !== undefined
      ? `${c.episodeCount} episodes`
      : 'episode count unknown';
  return `${names}, ${aired}, ${episodes}`;
}

export function jevState(question: MatchQuestion): {
  [key: string]: ContentValue;
} {
  return {
    source: {
      title: question.sourceTitle,
      season: question.season,
      ...(question.year !== undefined && { year: question.year }),
      ...(question.episodeCount !== undefined && {
        episodeCount: question.episodeCount,
      }),
    },
    candidates: question.candidates.map((c) => ({
      id: c.id,
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
  return {
    match: choice(
      MATCH_INSTRUCTIONS,
      Object.fromEntries(
        question.candidates.map((c) => [String(c.id), describeCandidate(c)]),
      ),
    ),
    any_match: noul(ANY_MATCH_INSTRUCTIONS),
  };
}

const fmt = (n: number) => n.toFixed(2);

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
    const choiceId = Number(answers.match.choice);
    if (!question.candidates.some((c) => c.id === choiceId)) {
      throw new Error(
        `Jev chose ${answers.match.choice}, which is not a candidate`,
      );
    }
    const choiceProbability =
      answers.match.probabilities[answers.match.choice] ?? 0;
    const { confidence } = answers.match;
    const { noul: anyMatch } = answers.any_match;
    const { minNoul, minChoice, minConfidence } = this.thresholds;
    const accepted =
      anyMatch >= minNoul &&
      choiceProbability >= minChoice &&
      confidence >= minConfidence;
    const probability = Math.min(anyMatch, choiceProbability);
    const probabilities = answers.match.probabilities;

    this.logger.log(
      `jev ${question.slug}: choice ${choiceId} p=${fmt(choiceProbability)} ` +
        `confidence=${fmt(confidence)} noul=${fmt(anyMatch)} ` +
        `probabilities=${Object.entries(probabilities)
          .map(([id, p]) => `${id}:${fmt(p)}`)
          .join(',')} -> ${accepted ? 'accept' : 'reject'}`,
    );

    return {
      choiceId,
      choiceProbability,
      confidence,
      noul: anyMatch,
      probabilities,
      accepted,
      answer: accepted
        ? { choice: choiceId, probability, episodeOffset: 0, by: 'jev' }
        : { choice: null, probability, by: 'jev' },
    };
  }
}

export function createMatcher(
  jev: JevConfig | undefined,
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
