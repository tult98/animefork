import { Inject, Injectable } from '@nestjs/common';
import type pg from 'pg';
import { PG_POOL } from '../database/migration-runner.ts';
import type { NameGuess } from './name-guesser.ts';

export const NAME_GUESS_STORE = Symbol('NameGuessStore');

export interface NameGuessStore {
  find(slug: string): Promise<NameGuess | undefined>;
  save(slug: string, guess: NameGuess, now: Date): Promise<void>;
}

@Injectable()
export class PostgresNameGuessStore implements NameGuessStore {
  private readonly pool: pg.Pool;

  constructor(@Inject(PG_POOL) pool: pg.Pool) {
    this.pool = pool;
  }

  async find(slug: string): Promise<NameGuess | undefined> {
    const { rows } = await this.pool.query<{ names: string[] }>(
      'select names from title_name_guesses where source_slug = $1',
      [slug],
    );
    const names = rows[0]?.names;
    if (names === undefined) return undefined;
    return names.length > 0 ? { known: true, names } : { known: false };
  }

  async save(slug: string, guess: NameGuess, now: Date): Promise<void> {
    await this.pool.query(
      `insert into title_name_guesses (source_slug, names, guessed_at)
       values ($1, $2::text[], $3)
       on conflict (source_slug) do update
         set names = excluded.names, guessed_at = excluded.guessed_at`,
      [slug, guess.known ? guess.names : [], now],
    );
  }
}
