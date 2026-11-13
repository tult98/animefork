import { Inject, Injectable } from '@nestjs/common';
import type pg from 'pg';
import { PG_POOL } from '../database/migration-runner.ts';

export const TITLE_NAMES_STORE = Symbol('TitleNamesStore');

export interface StoredNames {
  names: string[];
  updatedAt: Date;
}

export interface TitleNamesStore {
  find(slugs: string[]): Promise<Map<string, StoredNames>>;
  saveIfAbsent(slug: string, names: string[], now: Date): Promise<void>;
}

interface NamesRow {
  source_slug: string;
  names: string[];
  updated_at: Date;
}

@Injectable()
export class PostgresTitleNamesStore implements TitleNamesStore {
  private readonly pool: pg.Pool;

  constructor(@Inject(PG_POOL) pool: pg.Pool) {
    this.pool = pool;
  }

  async find(slugs: string[]): Promise<Map<string, StoredNames>> {
    const found = new Map<string, StoredNames>();
    if (slugs.length === 0) return found;
    const { rows } = await this.pool.query<NamesRow>(
      `select source_slug, names, updated_at
         from title_names where source_slug = any($1::text[])`,
      [slugs],
    );
    for (const row of rows) {
      found.set(row.source_slug, {
        names: row.names,
        updatedAt: row.updated_at,
      });
    }
    return found;
  }

  async saveIfAbsent(slug: string, names: string[], now: Date): Promise<void> {
    await this.pool.query(
      `insert into title_names (source_slug, names, updated_at)
       values ($1, $2::text[], $3)
       on conflict (source_slug) do nothing`,
      [slug, names, now],
    );
  }
}
