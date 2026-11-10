import { describe, expect, it } from 'vitest';
import { LOCALES } from './locales.ts';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix + key;
    if (typeof value === 'string') out.set(path, value);
    else for (const [k, v] of flatten(value, `${path}.`)) out.set(k, v);
  }
  return out;
}

// `{{rating, number(...)}}` and `{{episode}}` both yield their variable name.
function variables(message: string): string[] {
  return [...message.matchAll(/\{\{\s*([\w.]+)/g)].map((m) => m[1]!).sort();
}

describe('locale catalogs', () => {
  it('keeps every locale in step with the vi source', async () => {
    const source = flatten(await LOCALES.vi.load());
    for (const [code, locale] of Object.entries(LOCALES)) {
      const other = flatten(await locale.load());
      expect([...other.keys()].sort(), `${code} keys`).toEqual(
        [...source.keys()].sort(),
      );
      for (const [key, message] of source) {
        expect(variables(other.get(key)!), `${code}: ${key} variables`).toEqual(
          variables(message),
        );
      }
    }
  });

  it('has no empty messages', async () => {
    for (const [code, locale] of Object.entries(LOCALES)) {
      for (const [key, message] of flatten(await locale.load())) {
        expect(message.trim(), `${code}: ${key}`).not.toBe('');
      }
    }
  });
});
