import { isNotFound } from '@tanstack/react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route } from '../../../routes/design.tsx';
import { NAV_ITEMS } from '../../../nav.ts';

const beforeLoad = () =>
  (Route.options.beforeLoad as (() => void) | undefined)?.();

describe('design gallery guard', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is not linked from the navigation', () => {
    expect(NAV_ITEMS.map((item) => item.to)).not.toContain('/design');
  });

  it('lets the route load in development', () => {
    vi.stubEnv('DEV', true);
    expect(beforeLoad).not.toThrow();
  });

  it('answers not found when DEV is false, as in a production build', () => {
    vi.stubEnv('DEV', false);
    let thrown: unknown;
    try {
      beforeLoad();
    } catch (error) {
      thrown = error;
    }
    expect(isNotFound(thrown)).toBe(true);
  });
});
