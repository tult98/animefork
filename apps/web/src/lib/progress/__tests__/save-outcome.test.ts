import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/request.ts';
import { toSaveOutcome } from '../save-outcome.ts';

const stored = {
  episodeId: '12',
  positionS: 10,
  durationS: 1400,
  completed: false,
};

describe('toSaveOutcome', () => {
  it('returns the stored row', async () => {
    expect(await toSaveOutcome(Promise.resolve(stored))).toEqual({
      kind: 'saved',
      row: stored,
    });
  });

  it('tells a 401 apart from other failures', async () => {
    expect(
      await toSaveOutcome(Promise.reject(new ApiError('/v1/x', 401))),
    ).toEqual({ kind: 'unauthorized' });
    expect(
      await toSaveOutcome(Promise.reject(new ApiError('/v1/x', 500))),
    ).toEqual({ kind: 'failed' });
    expect(
      await toSaveOutcome(Promise.reject(new TypeError('offline'))),
    ).toEqual({ kind: 'failed' });
  });

  it('fails on a body that is not a stored row', async () => {
    expect(await toSaveOutcome(Promise.resolve({ episodeId: 12 }))).toEqual({
      kind: 'failed',
    });
    expect(await toSaveOutcome(Promise.resolve(undefined))).toEqual({
      kind: 'failed',
    });
  });
});
