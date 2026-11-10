import { load, type Cheerio, type CheerioAPI } from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { z } from 'zod';
import { ParseError } from '../errors.ts';

export type { CheerioAPI };
export type Sel = Cheerio<AnyNode>;

export function loadHtml(html: string): CheerioAPI {
  return load(html);
}

/** Collapses runs of whitespace, including the no-break spaces the site puts in descriptions. */
export function text(el: Sel): string {
  return el.text().replace(/\s+/g, ' ').trim();
}

export function orUndefined(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}

/** Upstream links are absolute and carry the site's domain, which changes. Only the path is stable. */
export function pathOf(href: string | undefined): string | undefined {
  if (href === undefined || href.trim() === '') return undefined;
  try {
    return new URL(href, 'http://base.invalid').pathname;
  } catch {
    return undefined;
  }
}

export function intOf(value: string | undefined): number | undefined {
  const digits = value?.match(/\d[\d,.]*/)?.[0]?.replace(/[,.]/g, '');
  return digits === undefined ? undefined : Number.parseInt(digits, 10);
}

export function requireElement(
  parser: string,
  $: CheerioAPI,
  selector: string,
): Sel {
  const found = $(selector).first();
  if (found.length === 0) {
    throw new ParseError(parser, {
      selector,
      reason: 'selector matched nothing',
    });
  }
  return found;
}

/** Maps a raw-field name to the selector that feeds it, so a failure names the markup to look at. */
export type FieldSelectors = Readonly<Record<string, string>>;

export function validate<S extends z.ZodType>(
  parser: string,
  schema: S,
  data: unknown,
  selectors: FieldSelectors = {},
): z.output<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const path = issue?.path ?? [];
  const leaf = [...path].reverse().find((k) => typeof k === 'string');
  throw new ParseError(
    parser,
    {
      field: path.join('.') || undefined,
      selector: leaf === undefined ? undefined : selectors[String(leaf)],
      reason: issue?.message ?? 'validation failed',
    },
    { cause: result.error },
  );
}
