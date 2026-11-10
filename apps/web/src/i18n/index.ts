import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { detectLocale, readStoredLocale, storeLocale } from './detect.ts';
import {
  DEFAULT_LOCALE,
  LOCALES,
  type LocaleCode,
  type Resources,
} from './locales.ts';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: Resources };
  }
}

async function ensureLoaded(code: LocaleCode): Promise<void> {
  if (i18n.hasResourceBundle(code, 'translation')) return;
  i18n.addResourceBundle(code, 'translation', await LOCALES[code].load());
}

export async function initI18n(): Promise<typeof i18n> {
  const lng = detectLocale({
    search: window.location.search,
    stored: readStoredLocale(),
    languages: navigator.languages,
  });
  // The default locale is the fallback, so it is always loaded alongside the active one.
  await i18n.use(initReactI18next).init({
    lng,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: Object.keys(LOCALES),
    resources: {},
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
  await Promise.all([ensureLoaded(DEFAULT_LOCALE), ensureLoaded(lng)]);
  // Bundles were added after init, so re-resolve the language before the first render.
  await i18n.changeLanguage(lng);
  document.documentElement.lang = lng;
  i18n.on('languageChanged', (code) => {
    document.documentElement.lang = code;
  });
  return i18n;
}

export async function setLocale(code: LocaleCode): Promise<void> {
  await ensureLoaded(code);
  await i18n.changeLanguage(code);
  storeLocale(code);
}

export function currentLocale(): LocaleCode {
  return i18n.resolvedLanguage as LocaleCode;
}

export { i18n };
