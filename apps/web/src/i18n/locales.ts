import type vi from './locales/vi.json';

export type Resources = typeof vi;

// Adding a locale is one JSON file in ./locales plus one entry here.
export const LOCALES = {
  vi: {
    name: 'Tiếng Việt',
    load: () => import('./locales/vi.json').then((m) => m.default),
  },
  en: {
    name: 'English',
    load: () => import('./locales/en.json').then((m) => m.default),
  },
} satisfies Record<string, { name: string; load: () => Promise<Resources> }>;

export type LocaleCode = keyof typeof LOCALES;

export const DEFAULT_LOCALE: LocaleCode = 'vi';
export const LOCALE_CODES = Object.keys(LOCALES) as LocaleCode[];

export function isLocale(value: unknown): value is LocaleCode {
  return typeof value === 'string' && Object.hasOwn(LOCALES, value);
}
