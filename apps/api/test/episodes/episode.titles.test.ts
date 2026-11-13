import { describe, expect, it, vi } from 'vitest';
import type { OverviewTranslator } from '../../src/art/translator.ts';
import { createEpisodeTranslators } from '../../src/episodes/episode.translate.ts';
import { EpisodeFiller } from '../../src/episodes/episode.filler.ts';
import { MemoryEpisodeStore } from '../../src/episodes/episode.store.ts';

const titles = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    title: `Title ${i + 1}`,
    titleAlt: null,
    aired: null,
  }));

const reply = (content: string) =>
  Response.json({
    choices: [{ finish_reason: 'stop', message: { content } }],
  });

const makeTranslator = (fetchImpl: unknown) =>
  createEpisodeTranslators({
    apiKey: 'k',
    baseUrl: 'https://deepseek.test',
    model: 'm',
    fetch: fetchImpl as typeof fetch,
    retryDelayMs: 1,
  } as Parameters<typeof createEpisodeTranslators>[0]).title;

// A fake DeepSeek. A batch request holds <title n="N"> items and a single one holds one <title> item.
function deepSeek(batchAnswer?: (n: number) => Response) {
  const sent: { items: string[] }[] = [];
  const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      messages: { content: string }[];
    };
    const user = body.messages[1]?.content ?? '';
    const items = [
      ...user.matchAll(/<title[^>]*>\n([\s\S]*?)\n<\/title>/g),
    ].map((m) => m[1] ?? '');
    sent.push({ items });
    if (user.includes('<title n=')) {
      return (
        batchAnswer?.(items.length) ??
        reply(JSON.stringify(items.map((t) => `vi ${t}`)))
      );
    }
    return reply(`vi ${items[0]}`);
  });
  const translator = makeTranslator(fetchImpl);
  return { translator, sent, fetchImpl };
}

function setup(
  list: (malId: number) => Promise<ReturnType<typeof titles> | null>,
  translator: OverviewTranslator,
) {
  const store = new MemoryEpisodeStore();
  const filler = new EpisodeFiller(
    store,
    { list },
    { title: translator },
    () => new Date('2026-01-01T00:00:00Z'),
  );
  const target = (malId: number) => ({
    slug: `show-${malId}`,
    malId,
    airing: null,
  });
  return { store, filler, target };
}

const vi_ = (store: MemoryEpisodeStore, malId: number) =>
  [...store.rows.values()].filter((r) => r.malId === malId && r.titleVi);

describe('episode title translation', () => {
  it('translates 120 titles in 3 requests of at most 50 and stores all of them', async () => {
    const { translator, sent } = deepSeek();
    const { store, filler, target } = setup(
      async () => titles(120),
      translator,
    );

    await filler.fill(target(1));
    await filler.idle();

    expect(sent.map((s) => s.items.length)).toEqual([50, 50, 20]);
    expect(vi_(store, 1)).toHaveLength(120);
    expect(store.rows.get('1:51')?.titleVi).toBe('vi Title 51');
  });

  it('asks for each title alone when a batch answer has the wrong count, and stores every title', async () => {
    const { translator, sent } = deepSeek(() => reply('["only one"]'));
    const { store, filler, target } = setup(async () => titles(3), translator);

    await filler.fill(target(1));
    await filler.idle();

    expect(sent.map((s) => s.items.length)).toEqual([3, 1, 1, 1]);
    expect(vi_(store, 1).map((r) => r.titleVi)).toEqual([
      'vi Title 1',
      'vi Title 2',
      'vi Title 3',
    ]);
  });

  it('starts and stores another show list while the first show is still translating', async () => {
    let unblock: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (unblock = resolve));
    const events: string[] = [];
    const inner = deepSeek();
    const translator = {
      translateMany: async (texts: string[]) => {
        if (!events.includes('one-translating')) events.push('one-translating');
        await gate;
        return inner.translator.translateMany!(texts);
      },
      translate: inner.translator.translate.bind(inner.translator),
    } as unknown as OverviewTranslator;
    const { store, filler, target } = setup(async (malId) => {
      events.push(`list-${malId}`);
      return titles(2);
    }, translator);

    await filler.fill(target(1));
    await vi.waitFor(() => expect(events).toContain('one-translating'));
    await filler.fill(target(2));

    expect(events).toEqual(['list-1', 'one-translating', 'list-2']);
    expect(store.rows.get('2:1')?.title).toBe('Title 1');
    expect(vi_(store, 1)).toHaveLength(0);
    unblock();
    await filler.idle();
    expect(vi_(store, 1)).toHaveLength(2);
  });

  it('keeps the list and an ok attempt when the translator is down, and a later fill translates the rest', async () => {
    const down = vi.fn(async () => new Response('down', { status: 503 }));
    const bad = makeTranslator(down);
    const first = setup(async () => titles(3), bad);

    await first.filler.fill(first.target(1));
    await first.filler.idle();

    expect(first.store.rows.size).toBe(3);
    expect(vi_(first.store, 1)).toHaveLength(0);
    expect(first.store.attempts.get(1)?.status).toBe('ok');

    const { translator, sent } = deepSeek();
    const later = new EpisodeFiller(
      first.store,
      { list: async () => titles(3) },
      { title: translator },
      () => new Date('2026-01-03T00:00:00Z'),
    );
    await later.fill(first.target(1));
    await later.idle();

    expect(sent.map((s) => s.items.length)).toEqual([3]);
    expect(vi_(first.store, 1)).toHaveLength(3);
  });
});
