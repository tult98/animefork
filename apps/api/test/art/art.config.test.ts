import { describe, expect, it } from 'vitest';
import { loadArtConfig } from '../../src/art/art.config.ts';

const BASE = { TMDB_API_KEY: 'tmdb' };

describe('loadArtConfig', () => {
  it.each([{}, { TYPESAFE_API_KEY: '' }, { TYPESAFE_API_KEY: '  ' }])(
    'leaves Jev off without a TypeSafe key (%o)',
    (env) => {
      expect(loadArtConfig({ ...BASE, ...env }).jev).toBeUndefined();
    },
  );

  it('fills the Jev defaults when only the key is set', () => {
    expect(loadArtConfig({ ...BASE, TYPESAFE_API_KEY: 'ts' }).jev).toEqual({
      apiKey: 'ts',
      model: 'jev-latest',
      minNoul: 0.85,
      minChoice: 0.85,
      minConfidence: 0.5,
    });
  });

  it('treats blank tuning vars as unset', () => {
    expect(
      loadArtConfig({
        ...BASE,
        TYPESAFE_API_KEY: 'ts',
        JEV_MODEL: '',
        JEV_MIN_NOUL: '',
        JEV_MIN_CHOICE: '',
        JEV_MIN_CONFIDENCE: '',
      }).jev,
    ).toMatchObject({ model: 'jev-latest', minNoul: 0.85, minConfidence: 0.5 });
  });

  it('reads the model and thresholds', () => {
    expect(
      loadArtConfig({
        ...BASE,
        TYPESAFE_API_KEY: 'ts',
        JEV_MODEL: 'jev-1.13.0',
        JEV_MIN_NOUL: '0.9',
        JEV_MIN_CHOICE: '0.7',
        JEV_MIN_CONFIDENCE: '0',
      }).jev,
    ).toEqual({
      apiKey: 'ts',
      model: 'jev-1.13.0',
      minNoul: 0.9,
      minChoice: 0.7,
      minConfidence: 0,
    });
  });

  it.each(['1.5', '-0.1', 'high'])(
    'refuses a threshold of %s and names the variable',
    (value) => {
      expect(() =>
        loadArtConfig({ ...BASE, TYPESAFE_API_KEY: 'ts', JEV_MIN_NOUL: value }),
      ).toThrow('missing or invalid env: JEV_MIN_NOUL');
    },
  );
});

describe('loadArtConfig DeepSeek', () => {
  it.each([{}, { DEEPSEEK_API_KEY: '' }, { DEEPSEEK_API_KEY: '  ' }])(
    'leaves translation off without a DeepSeek key (%o)',
    (env) => {
      expect(loadArtConfig({ ...BASE, ...env }).deepseek).toBeUndefined();
    },
  );

  it('fills the public base and the default model when only the key is set', () => {
    expect(
      loadArtConfig({
        ...BASE,
        DEEPSEEK_API_KEY: 'ds',
        DEEPSEEK_API_BASE: '',
        DEEPSEEK_MODEL: '',
      }).deepseek,
    ).toEqual({
      apiKey: 'ds',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-flash',
    });
  });

  it('reads the base and model overrides', () => {
    expect(
      loadArtConfig({
        ...BASE,
        DEEPSEEK_API_KEY: 'ds',
        DEEPSEEK_API_BASE: 'http://127.0.0.1:9/stub',
        DEEPSEEK_MODEL: 'deepseek-v4-pro',
      }).deepseek,
    ).toEqual({
      apiKey: 'ds',
      baseUrl: 'http://127.0.0.1:9/stub',
      model: 'deepseek-v4-pro',
    });
  });

  it('refuses a base that is not a url and names the variable', () => {
    expect(() =>
      loadArtConfig({ ...BASE, DEEPSEEK_API_BASE: 'not a url' }),
    ).toThrow('missing or invalid env: DEEPSEEK_API_BASE');
  });
});
