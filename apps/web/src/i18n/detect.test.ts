import { describe, expect, it } from 'vitest';
import { detectLocale } from './detect.ts';

const none = { search: '', stored: null, languages: [] as string[] };

describe('detectLocale', () => {
  it('defaults to vi with no signal', () => {
    expect(detectLocale(none)).toBe('vi');
  });

  it('prefers ?lang= over storage and the browser', () => {
    expect(
      detectLocale({ search: '?lang=en', stored: 'vi', languages: ['vi'] }),
    ).toBe('en');
  });

  it('prefers storage over the browser languages', () => {
    expect(detectLocale({ ...none, stored: 'en', languages: ['vi-VN'] })).toBe(
      'en',
    );
  });

  it('uses the first supported browser language and matches regional tags', () => {
    expect(detectLocale({ ...none, languages: ['fr-FR', 'EN-us', 'vi'] })).toBe(
      'en',
    );
  });

  it('ignores unsupported values at every step', () => {
    expect(
      detectLocale({ search: '?lang=xx', stored: 'zz', languages: ['fr'] }),
    ).toBe('vi');
  });

  it('falls through an unsupported ?lang= to storage', () => {
    expect(
      detectLocale({ search: '?lang=xx', stored: 'en', languages: [] }),
    ).toBe('en');
  });
});
