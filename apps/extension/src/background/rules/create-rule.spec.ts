import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

type Rule = { id?: number; condition: { urlFilter?: string } };

async function freshCreateRule() {
  vi.resetModules();
  return (await import('./create-rule')).createRule;
}

function stripIds(rules: Rule[]) {
  return rules.map(({ id, ...rest }) => {
    expect(typeof id).toBe('number');
    return rest;
  });
}

describe('createRule', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  test('rule set for a referrer is frozen', async () => {
    const createRule = await freshCreateRule();
    expect(
      stripIds(createRule('#key', 'https://example.com/path') as Rule[]),
    ).toMatchSnapshot();
  });

  test('only the first call adds the googleusercontent and rm-origin rules', async () => {
    const createRule = await freshCreateRule();
    const first = createRule('#a', 'https://a.example/') as Rule[];
    const second = createRule('#b', 'https://b.example/') as Rule[];
    expect(first.length - second.length).toBe(2);
    expect(first.some((r) => r.condition.urlFilter === '#rm-origin|')).toBe(
      true,
    );
    expect(second.some((r) => r.condition.urlFilter === '#rm-origin|')).toBe(
      false,
    );
  });

  test('ids are unique across calls', async () => {
    const createRule = await freshCreateRule();
    const ids = [
      ...(createRule('#a', 'https://a.example/') as Rule[]),
      ...(createRule('#b', 'https://b.example/') as Rule[]),
    ].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('url suffix conventions', async () => {
    const createRule = await freshCreateRule();
    const filters = (createRule('#k', 'https://e.com/') as Rule[]).map(
      (r) => r.condition.urlFilter,
    );
    expect(filters).toEqual(
      expect.arrayContaining([
        '#k|',
        '#k_extra|',
        '#ko|',
        '#k_extrao|',
        '#kro|',
        '#k_extraro|',
        '#k_uafirefox|',
        '#k_extra_uaachrome|',
      ]),
    );
  });
});
