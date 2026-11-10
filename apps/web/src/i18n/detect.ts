import { DEFAULT_LOCALE, isLocale, type LocaleCode } from './locales.ts';

export const STORAGE_KEY = 'animefork:lang';

interface Signals {
  search: string;
  stored: string | null;
  languages: readonly string[];
}

// Order: ?lang=, then the stored choice, then the browser languages, else the default.
export function detectLocale({
  search,
  stored,
  languages,
}: Signals): LocaleCode {
  const fromUrl = new URLSearchParams(search).get('lang');
  if (isLocale(fromUrl)) return fromUrl;
  if (isLocale(stored)) return stored;
  for (const tag of languages) {
    // 'vi-VN' matches 'vi'.
    const primary = tag.toLowerCase().split('-')[0];
    if (isLocale(primary)) return primary;
  }
  return DEFAULT_LOCALE;
}

export function readStoredLocale(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeLocale(code: LocaleCode): void {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // Storage can be blocked (private mode); the choice then lasts for the session only.
  }
}
