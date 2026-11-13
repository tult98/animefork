import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  parseAired,
  parseEpisodeList,
} from '../../src/episodes/episode.parser.ts';

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('parseEpisodeList', () => {
  it('reads number, title, alternate title and air date from each row', () => {
    const [first, , third] =
      parseEpisodeList(fixture('list-black-clover-2nd-season.html')) ?? [];
    expect(first).toEqual({
      number: 1,
      title: 'The Battle Begins',
      titleAlt: 'Kaisen (開戦)',
      aired: '2026-10-03',
    });
    expect(third?.title).toBe('The Black Guardian');
  });

  it('decodes entities in titles', () => {
    const list = parseEpisodeList(fixture('list-one-piece-offset-1100.html'));
    expect(list).toHaveLength(3);
    expect(list?.[0]?.title).toBe(
      "The Strongest Form of Humanity! The Seraphim's Powers!",
    );
    expect(list?.[2]?.title).toBe("Turn Back My Father! Bonney's Futile Wish!");
  });

  it('tells an empty listing from a page that is not the episode list', () => {
    expect(parseEpisodeList(fixture('list-no-episodes.html'))).toEqual([]);
    expect(parseEpisodeList(fixture('list-challenge.html'))).toBeNull();
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
