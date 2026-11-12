import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaveWatchProgressRequest } from '../../../../../api/src/watch-progress/contract.ts';
import type { SaveOutcome } from '../save-outcome.ts';
import { createSaver, SAVE_INTERVAL_MS, type Snapshot } from '../saver.ts';

const meta = {
  slug: 'show',
  episodeId: '12',
  titleName: 'Show',
  image: 'https://img.test/a.jpg',
  episodeLabel: 'Tập 1',
  seasonSlug: 'show',
};

function setup(initial: Snapshot | null = { positionS: 10, durationS: 1400 }) {
  let snapshot = initial;
  const sent: { body: SaveWatchProgressRequest; keepalive: boolean }[] = [];
  const gates: ((outcome: SaveOutcome) => void)[] = [];
  const row = {
    episodeId: '12',
    positionS: 10,
    durationS: 1400,
    completed: false,
  };
  const send = vi.fn(
    (body: SaveWatchProgressRequest, options: { keepalive: boolean }) => {
      sent.push({ body, keepalive: options.keepalive });
      return new Promise<SaveOutcome>((resolve) => gates.push(resolve));
    },
  );
  const onUnauthorized = vi.fn();
  const onSaved = vi.fn();
  const saver = createSaver({
    meta,
    read: () => snapshot,
    send,
    onSaved,
    onUnauthorized,
  });
  return {
    saver,
    sent,
    send,
    onUnauthorized,
    onSaved,
    row,
    settle: (kind: SaveOutcome['kind'] = 'saved') =>
      gates.shift()?.(kind === 'saved' ? { kind, row } : { kind }),
    at: (next: Snapshot | null) => (snapshot = next),
  };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

describe('the progress saver', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it('saves every 15 s of playing time and not while paused', async () => {
    const t = setup();
    t.saver.setPlaying(true);
    await vi.advanceTimersByTimeAsync(SAVE_INTERVAL_MS - 1);
    expect(t.send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(t.send).toHaveBeenCalledTimes(1);
    t.settle();
    await vi.advanceTimersByTimeAsync(SAVE_INTERVAL_MS);
    expect(t.send).toHaveBeenCalledTimes(2);
    t.settle();
    t.saver.setPlaying(false);
    await vi.advanceTimersByTimeAsync(SAVE_INTERVAL_MS * 3);
    expect(t.send).toHaveBeenCalledTimes(2);
  });

  it('sends the title details with the position', async () => {
    const t = setup({ positionS: 42.5, durationS: 1400 });
    t.saver.save();
    await flush();
    expect(t.sent[0]?.body).toEqual({
      ...meta,
      positionS: 42.5,
      durationS: 1400,
    });
  });

  it('keeps one save in flight and collapses the rest into the latest', async () => {
    const t = setup();
    t.saver.save();
    t.at({ positionS: 20, durationS: 1400 });
    t.saver.save();
    t.at({ positionS: 30, durationS: 1400 });
    t.saver.save();
    await flush();
    expect(t.sent.map((s) => s.body.positionS)).toEqual([10]);

    t.settle();
    await flush();
    expect(t.sent.map((s) => s.body.positionS)).toEqual([10, 30]);

    t.settle();
    await flush();
    expect(t.sent).toHaveLength(2);
  });

  it('hands the stored row to onSaved only for a saved outcome', async () => {
    const t = setup();
    t.saver.save();
    await flush();
    t.settle('failed');
    await flush();
    expect(t.onSaved).not.toHaveBeenCalled();
    t.saver.save();
    await flush();
    t.settle();
    await flush();
    expect(t.onSaved).toHaveBeenCalledExactlyOnceWith(t.row);
  });

  it('never sends an older position after a newer one', async () => {
    const t = setup();
    t.saver.save();
    await flush();
    t.settle('failed');
    await flush();
    t.at({ positionS: 50, durationS: 1400 });
    t.saver.save();
    await flush();
    t.settle();
    await flush();
    const positions = t.sent.map((s) => s.body.positionS);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('keeps the keepalive flag of a queued save', async () => {
    const t = setup();
    t.saver.save();
    t.saver.save({ keepalive: true });
    t.saver.save();
    await flush();
    t.settle();
    await flush();
    expect(t.sent.map((s) => s.keepalive)).toEqual([false, true]);
  });

  it.each([
    ['unknown', null],
    ['NaN', { positionS: 5, durationS: NaN }],
    ['zero', { positionS: 5, durationS: 0 }],
    ['infinite', { positionS: 5, durationS: Infinity }],
  ])('sends nothing while the duration is %s', async (_name, snapshot) => {
    const t = setup(snapshot);
    t.saver.save();
    t.saver.setPlaying(true);
    await vi.advanceTimersByTimeAsync(SAVE_INTERVAL_MS * 2);
    expect(t.send).not.toHaveBeenCalled();
  });

  it('clamps the position into the duration', async () => {
    const t = setup({ positionS: 1500, durationS: 1400 });
    t.saver.save();
    await flush();
    expect(t.sent[0]?.body.positionS).toBe(1400);
  });

  it('stops for good after a 401', async () => {
    const t = setup();
    t.saver.setPlaying(true);
    await vi.advanceTimersByTimeAsync(SAVE_INTERVAL_MS);
    t.saver.save();
    t.settle('unauthorized');
    await flush();
    expect(t.onUnauthorized).toHaveBeenCalledTimes(1);

    t.saver.save({ keepalive: true });
    t.saver.setPlaying(true);
    await vi.advanceTimersByTimeAsync(SAVE_INTERVAL_MS * 3);
    expect(t.send).toHaveBeenCalledTimes(1);
  });

  it('retries nothing after a failure but saves again on the next tick', async () => {
    const t = setup();
    t.saver.setPlaying(true);
    await vi.advanceTimersByTimeAsync(SAVE_INTERVAL_MS);
    t.settle('failed');
    await flush();
    expect(t.send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(SAVE_INTERVAL_MS);
    expect(t.send).toHaveBeenCalledTimes(2);
  });
});
