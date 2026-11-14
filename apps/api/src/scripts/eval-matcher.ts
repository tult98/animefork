import { Logger } from '@nestjs/common';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { loadArtConfig } from '../art/art.config.ts';
import { EnvError } from '../config/app.config.ts';
import { createJevClient, JevMatcher } from '../art/tmdb/jev.ts';
import { BaselineMatcher, decide } from '../art/tmdb/matcher.ts';
import { effectiveScope, gatherCandidates } from '../art/tmdb/sync.ts';
import { createTmdbClient } from '../art/tmdb/tmdb.ts';
import { seasonMarker } from '../art/tmdb/titles.ts';

const STATUSES = ['no_match', 'matched', 'all'] as const;
type StatusFilter = (typeof STATUSES)[number];
const DEFAULT_LIMIT = 50;

interface SourceRow {
  source_slug: string;
  status: string;
  source_name: string;
  source_year: number | null;
  source_episode_count: number | null;
}

function fail(message: string): never {
  console.error(`eval-matcher: ${message}`);
  process.exit(1);
}

function readFlags(): { status: StatusFilter; limit: number } {
  const { values } = parseArgs({
    options: {
      status: { type: 'string', default: 'all' },
      limit: { type: 'string', default: String(DEFAULT_LIMIT) },
    },
  });
  const status = values.status as StatusFilter;
  if (!STATUSES.includes(status)) {
    fail(`--status must be one of ${STATUSES.join(', ')}`);
  }
  const limit = Number(values.limit);
  if (!Number.isInteger(limit) || limit < 1) {
    fail('--limit must be a positive integer');
  }
  return { status, limit };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function clip(text: string, width: number): string {
  return text.length > width ? `${text.slice(0, width - 1)}~` : text;
}

const COLUMNS = [
  ['slug', 32],
  ['source name', 32],
  ['stored', 8],
  ['baseline', 14],
  ['jev choice', 32],
  ['scope', 6],
  ['noul s/show', 11],
  ['p', 5],
  ['conf', 5],
  ['verdict', 30],
] as const;

function printRow(cells: string[]): void {
  console.log(
    cells
      .map((cell, i) =>
        clip(cell, COLUMNS[i]?.[1] ?? 20).padEnd(COLUMNS[i]?.[1] ?? 20),
      )
      .join(' ')
      .trimEnd(),
  );
}

async function main(): Promise<void> {
  const { status, limit } = readFlags();
  const missing = ['DATABASE_URL', 'TYPESAFE_API_KEY'].filter(
    (name) => !process.env[name]?.trim(),
  );
  if (missing.length > 0) {
    fail(
      `set ${missing.join(' and ')} (for example in apps/api/.env) and run again`,
    );
  }
  let config;
  try {
    config = loadArtConfig(process.env);
  } catch (error) {
    if (error instanceof EnvError) fail(error.message);
    throw error;
  }
  const jevConfig = config.jev;
  if (!jevConfig) fail('set TYPESAFE_API_KEY and run again');

  Logger.overrideLogger(['error', 'warn']);
  const tmdb = createTmdbClient({
    apiKey: config.tmdbApiKey,
    baseUrl: config.tmdbApiBase,
  });
  const baseline = new BaselineMatcher();
  const jev = new JevMatcher(
    createJevClient(jevConfig),
    jevConfig.model,
    jevConfig,
  );
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    options: '-c default_transaction_read_only=on',
  });

  try {
    const { rows } = await pool.query<SourceRow>(
      `select source_slug, status, source_name, source_year, source_episode_count
         from title_art
        where source_name is not null and ($1 = 'all' or status = $1)
        order by attempted_at desc
        limit $2`,
      [status, limit],
    );
    console.log(
      `eval-matcher: ${rows.length} row(s), status ${status}, model ${jevConfig.model}, ` +
        `thresholds noul>=${jevConfig.minNoul} p>=${jevConfig.minChoice} conf>=${jevConfig.minConfidence}`,
    );
    printRow(COLUMNS.map(([name]) => name));

    for (const row of rows) {
      const input = {
        slug: row.source_slug,
        name: row.source_name,
        seasonName: seasonMarker(row.source_name),
        year: row.source_year ?? undefined,
        episodeCount: row.source_episode_count ?? undefined,
      };
      const lead = [row.source_slug, row.source_name, row.status];
      let gathered;
      try {
        gathered = await gatherCandidates(input, tmdb);
      } catch (error) {
        printRow([
          ...lead,
          '',
          '',
          '',
          '',
          '',
          '',
          `tmdb error: ${errorText(error)}`,
        ]);
        continue;
      }
      if (!gathered || gathered.question.candidates.length === 0) {
        printRow([...lead, 'no results', '', '', '', '', '', 'skipped']);
        continue;
      }
      const { question } = gathered;
      const base = await baseline.match(question);
      const baseCell = `${base.probability.toFixed(2)} ${decide(base) === null ? 'miss' : 'match'}`;
      try {
        const verdict = await jev.ask(question);
        const accepted = decide(verdict.answer);
        const showScope = verdict.answer.scope === 'show' && accepted !== null;
        const chosen = question.candidates.find(
          (c) => c.id === (showScope ? verdict.showChoiceId : verdict.choiceId),
        );
        const baseScope =
          decide(base) === null
            ? null
            : effectiveScope(
                base,
                base.choice ?? 0,
                gathered.details,
                gathered.season,
              );
        const scope =
          baseScope ??
          (accepted === null
            ? '-'
            : effectiveScope(
                verdict.answer,
                accepted,
                gathered.details,
                gathered.season,
              ));
        printRow([
          ...lead,
          baseCell,
          chosen ? `${chosen.id} ${chosen.name}` : String(verdict.choiceId),
          scope,
          `${verdict.noul.toFixed(2)}/${verdict.showNoul.toFixed(2)}`,
          (showScope
            ? verdict.showChoiceProbability
            : verdict.choiceProbability
          ).toFixed(2),
          (showScope ? verdict.showConfidence : verdict.confidence).toFixed(2),
          accepted === null ? 'reject' : 'accept',
        ]);
      } catch (error) {
        printRow([
          ...lead,
          baseCell,
          '',
          '',
          '',
          '',
          '',
          `jev error: ${errorText(error)}`,
        ]);
      }
    }
  } finally {
    await pool.end();
  }
}

await main();
