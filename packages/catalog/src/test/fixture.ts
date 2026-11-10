import { readFileSync } from 'node:fs';
import { expect } from 'vitest';
import { ParseError } from '../errors.ts';

const root = new URL('../../fixtures/', import.meta.url);

export function fixture(name: string): string {
  return readFileSync(new URL(name, root), 'utf8');
}

/** Breaks one piece of markup on purpose; fails loudly if the fixture no longer contains it. */
export function mutate(
  html: string,
  from: string | RegExp,
  to: string,
): string {
  const out = html.replace(from, to);
  expect(out, `fixture does not contain ${String(from)}`).not.toBe(html);
  return out;
}

export function parseErrorOf(run: () => unknown): ParseError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ParseError);
    return error as ParseError;
  }
  throw new Error('expected a ParseError, but the parser returned');
}
