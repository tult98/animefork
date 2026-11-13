import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  parseAired,
  parseEpisodeList,
  parseSynopsis,
} from '../../src/episodes/episode.parser.ts';

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('parseEpisodeList', () => {
  it('reads number, title, alternate title and air date from each row', () => {
    const [first, , third] = parseEpisodeList(fixture('list.html'));
    expect(first).toEqual({
      number: 1,
      title: 'The Battle Begins',
      titleAlt: 'Kaisen (開戦)',
      aired: '2026-10-03',
    });
    expect(third?.title).toBe('The Black Guardian');
  });

  it('decodes entities in titles', () => {
    const [first] = parseEpisodeList(fixture('list-long.html'));
    expect(first?.title).toBe(
      "I'm Luffy! The Man Who's Gonna Be King of the Pirates!",
    );
  });

  it('skips a row with no number or title', () => {
    expect(
      parseEpisodeList(
        '<tr class="episode-list-data"><td class="episode-number" data-raw="x">x</td></tr>',
      ),
    ).toEqual([]);
  });
});

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

describe('parseAired', () => {
  it('accepts a full date and rejects partial or impossible ones', () => {
    expect(parseAired('Oct 3, 2026(JST)')).toBe('2026-10-03');
    expect(parseAired('Oct 2026')).toBeNull();
    expect(parseAired('Feb 31, 2026')).toBeNull();
    expect(parseAired('')).toBeNull();
  });
});
