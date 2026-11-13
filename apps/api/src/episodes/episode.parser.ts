// MAL has no episode API this service may use, so this reads the public episode page for its synopsis.
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
