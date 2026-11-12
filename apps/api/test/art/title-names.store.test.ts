import { describe, expect, it } from 'vitest';
import { MemoryTitleNamesStore } from '../../src/art/title-names.store.ts';

describe('MemoryTitleNamesStore', () => {
  it('keeps the first names saved for a slug', async () => {
    const store = new MemoryTitleNamesStore();
    const first = new Date('2026-01-01T00:00:00Z');
    await store.saveIfAbsent('a-1', ['Soul Land'], first);
    await store.saveIfAbsent('a-1', ['Rewritten'], new Date());
    expect(await store.find(['a-1', 'missing'])).toEqual(
      new Map([['a-1', { names: ['Soul Land'], updatedAt: first }]]),
    );
  });

  it('hands out copies, so a caller cannot change what is stored', async () => {
    const store = new MemoryTitleNamesStore();
    await store.saveIfAbsent('a-1', ['Soul Land'], new Date());
    (await store.find(['a-1'])).get('a-1')?.names.push('Other');
    expect((await store.find(['a-1'])).get('a-1')?.names).toEqual([
      'Soul Land',
    ]);
  });
});
