import { Logger } from '@nestjs/common';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { loadJevConfig } from '../art/art.config.ts';
import type { TitleInput } from '../art/contract.ts';
import { createJevClient, fmt } from '../art/tmdb/jev.ts';
import { seasonMarker } from '../art/tmdb/titles.ts';
import { EnvError } from '../config/app.config.ts';
import { createMalClient, type MalCandidate } from '../mal/mal.client.ts';
import { loadMalConfig } from '../mal/mal.config.ts';
import {
  jevCandidates,
  MalJevJudge,
  type MalJevVerdict,
} from '../mal/mal.jev.ts';
import { matchMal, type MalMatch } from '../mal/mal.matcher.ts';
import { sourceQueries } from '../mal/mal.queries.ts';

const STATUSES = ['none', 'ok', 'all'] as const;
type StatusFilter = (typeof STATUSES)[number];
const DEFAULT_LIMIT = 50;
const REQUIRED_ENV = ['DATABASE_URL', 'MAL_CLIENT_ID', 'TYPESAFE_API_KEY'];

export interface SourceRow {
  source_slug: string;
  status: string;
  mal_id: number | null;
  source_name: string;
  source_year: number | null;
  source_episode_count: number | null;
  other_names: string[] | null;
}

export function evalInput(
  row: Omit<SourceRow, 'status' | 'mal_id'>,
): TitleInput {
  return {
    slug: row.source_slug,
    name: row.source_name,
    seasonName: seasonMarker(row.source_name),
    year: row.source_year ?? undefined,
    episodeCount: row.source_episode_count ?? undefined,
    ...(row.other_names !== null &&
      row.other_names.length > 0 && { otherNames: row.other_names }),
  };
}

export interface EvalOutcome {
  stored: { status: string; malId: number | null };
  scored: MalMatch | null;
  jev: MalJevVerdict | Error | null;
}

export const COLUMNS = [
  ['slug', 40],
  ['stored', 14],
  ['score', 16],
  ['jev choice', 34],
  ['jev', 30],
  ['agree', 5],
] as const;

function agreement({ scored, jev }: EvalOutcome): string {
  if (!jev || jev instanceof Error) return '-';
  const jevId = jev.accepted ? jev.choice.id : null;
  return jevId === (scored?.candidate.id ?? null) ? 'yes' : 'no';
}

export function evalCells(slug: string, outcome: EvalOutcome): string[] {
  const { stored, scored, jev } = outcome;
  const storedCell = `${stored.status}${stored.malId === null ? '' : ` ${stored.malId}`}`;
  const scoreCell = scored
    ? `ok ${scored.candidate.id} ${fmt(scored.score)}`
    : 'reject';
  const jevCells =
    jev === null
      ? ['', 'skipped: no candidates']
      : jev instanceof Error
        ? ['', `error: ${jev.message}`]
        : [
            `${jev.choice.id} ${jev.choice.title}`,
            `${jev.accepted ? 'accept' : 'reject'} p=${fmt(jev.probability)} noul=${fmt(jev.noul)} conf=${fmt(jev.confidence)}`,
          ];
  return [slug, storedCell, scoreCell, ...jevCells, agreement(outcome)];
}

function clip(text: string, width: number): string {
  return text.length > width ? `${text.slice(0, width - 1)}~` : text;
}

export function formatRow(cells: string[]): string {
  return cells
    .map((cell, i) => {
      const width = COLUMNS[i]?.[1] ?? 20;
      return clip(cell, width).padEnd(width);
    })
    .join(' ')
    .trimEnd();
}

function fail(message: string): never {
  console.error(`eval-mal: ${message}`);
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

async function main(): Promise<void> {
  const { status, limit } = readFlags();
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    fail(
      `set ${missing.join(' and ')} (for example in apps/api/.env) and run again`,
    );
  }
  let mal;
  let jevConfig;
  try {
    mal = loadMalConfig(process.env);
    jevConfig = loadJevConfig(process.env);
  } catch (error) {
    if (error instanceof EnvError) fail(error.message);
    throw error;
  }
  if (!mal || !jevConfig) fail('set MAL_CLIENT_ID and TYPESAFE_API_KEY');

  Logger.overrideLogger(['error', 'warn']);
  const client = createMalClient({
    clientId: mal.clientId,
    baseUrl: mal.baseUrl,
  });
  const judge = new MalJevJudge(
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
      `select m.source_slug, m.status, m.mal_id,
              a.source_name, a.source_year, a.source_episode_count,
              n.names as other_names
         from title_mal m
         join title_art a on a.source_slug = m.source_slug
         left join title_names n on n.source_slug = m.source_slug
        where a.source_name is not null and ($1 = 'all' or m.status = $1)
        order by m.attempted_at desc
        limit $2`,
      [status, limit],
    );
    console.log(
      `eval-mal: ${rows.length} row(s), status ${status}, model ${jevConfig.model}, ` +
        `thresholds noul>=${jevConfig.minNoul} p>=${jevConfig.minChoice} conf>=${jevConfig.minConfidence}, ` +
        'no TMDB alias queries',
    );
    console.log(formatRow(COLUMNS.map(([name]) => name)));

    for (const row of rows) {
      const input = evalInput(row);
      const stored = { status: row.status, malId: row.mal_id };
      const pages: MalCandidate[][] = [];
      let scored: MalMatch | null = null;
      try {
        for (const query of sourceQueries(input)) {
          const results = await client.search(query);
          pages.push(results);
          scored = matchMal(input, results, input.otherNames);
          if (scored) break;
        }
      } catch (error) {
        console.log(
          formatRow([
            row.source_slug,
            stored.status,
            `mal error: ${error instanceof Error ? error.message : String(error)}`,
          ]),
        );
        continue;
      }
      const candidates = jevCandidates(pages);
      const jev =
        candidates.length === 0
          ? null
          : await judge
              .ask(input, candidates)
              .catch((error: unknown) =>
                error instanceof Error ? error : new Error(String(error)),
              );
      console.log(
        formatRow(evalCells(row.source_slug, { stored, scored, jev })),
      );
    }
  } finally {
    await pool.end();
  }
}

if (import.meta.main) await main();
