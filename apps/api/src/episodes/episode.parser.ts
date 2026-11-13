// MAL has no episode API this service may use, so these read the two public HTML pages.
export interface ListedEpisode {
  number: number;
  title: string;
  titleAlt: string | null;
  // ISO date, or null when MAL lists none or one this parser does not know.
  aired: string | null;
}

export const LIST_PAGE_SIZE = 100;

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function decodeEntities(text: string): string {
  return text.replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi,
    (all, dec, hex, name) => {
      if (name) return ENTITIES[name.toLowerCase()] ?? all;
      const code = dec ? Number(dec) : parseInt(hex, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all;
    },
  );
}

const stripTags = (html: string) => html.replace(/<[^>]*>/g, '');
const clean = (html: string) =>
  decodeEntities(stripTags(html)).replace(/\s+/g, ' ').trim();

const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];

// MAL writes "Oct 3, 2026", sometimes with "(JST)" after it. A partial date is not a date.
export function parseAired(text: string): string | null {
  const match = /^([A-Za-z]{3})[a-z]*\.? (\d{1,2}), (\d{4})/.exec(text.trim());
  const month = MONTHS.indexOf(match?.[1]?.toLowerCase() ?? '');
  if (!match || month < 0) return null;
  const day = Number(match[2]);
  const date = new Date(Date.UTC(Number(match[3]), month, day));
  if (date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

function cell(row: string, name: string): string | null {
  const match = new RegExp(
    `<td[^>]*class="${name}[^"]*"[^>]*>([\\s\\S]*?)</td>`,
  ).exec(row);
  return match?.[1] ?? null;
}

export function parseEpisodeList(html: string): ListedEpisode[] {
  const episodes: ListedEpisode[] = [];
  for (const row of html.split('<tr class="episode-list-data">').slice(1)) {
    const number = Number(
      /class="episode-number[^"]*"[^>]*data-raw="(\d+)"/.exec(row)?.[1],
    );
    const titleCell = cell(row, 'episode-title');
    const title = clean(
      /<a [^>]*>([\s\S]*?)<\/a>/.exec(titleCell ?? '')?.[1] ?? '',
    );
    if (!Number.isInteger(number) || number < 1 || !title) continue;
    const alt = clean(
      /<span[^>]*>([\s\S]*?)<\/span>/.exec(titleCell ?? '')?.[1] ?? '',
    );
    episodes.push({
      number,
      title,
      titleAlt: alt || null,
      aired: parseAired(clean(cell(row, 'episode-aired') ?? '')),
    });
  }
  return episodes;
}

const SYNOPSIS_HEADING = '<h2 class="fw-b">Synopsis</h2>';
// MAL appends credit and arc lines to the text, which are not part of the story.
const NOISE_LINE = /^(?:\(Source:.*\)|\[Written by .*\])$/i;
const BOLD_LINE = /^<b>[^<]*<\/b>(?:\s*\(\d+\/\d+\))?$/i;

// Returns null when the episode has no synopsis yet.
export function parseSynopsis(html: string): string | null {
  const start = html.indexOf(SYNOPSIS_HEADING);
  if (start < 0) return null;
  const body = html.slice(start + SYNOPSIS_HEADING.length);
  const end = body.indexOf('</div>');
  const block = end < 0 ? body : body.slice(0, end);
  if (block.includes('badresult') || /<div/i.test(block)) return null;
  const lines = block
    .replace(/<br\s*\/?>/gi, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => !BOLD_LINE.test(line))
    .map((line) => clean(line))
    .filter((line) => !NOISE_LINE.test(line));
  const text = lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text || null;
}
