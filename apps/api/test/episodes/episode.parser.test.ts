import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSynopsis } from '../../src/episodes/episode.parser.ts';

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('parseSynopsis', () => {
  it('returns null for an episode with no synopsis yet', () => {
    expect(parseSynopsis(fixture('episode-empty.html'))).toBeNull();
  });

  it('keeps the story and drops the source credit and arc line', () => {
    const text = parseSynopsis(fixture('episode-synopsis.html'));
    expect(text).toMatch(/^In the ocean, Alvida/);
    expect(text).toContain("Alvida's pirates");
    expect(text).not.toMatch(/Source: Wikipedia|East Blue saga/);
  });
});
