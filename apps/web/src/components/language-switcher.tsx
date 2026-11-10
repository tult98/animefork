import { Select } from '@base-ui/react/select';
import { useTranslation } from 'react-i18next';
import { setLocale } from '../i18n/index.ts';
import {
  LOCALES,
  LOCALE_CODES,
  isLocale,
  type LocaleCode,
} from '../i18n/locales.ts';

const ITEMS = LOCALE_CODES.map((code) => ({
  value: code,
  label: LOCALES[code].name,
}));

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const current = i18n.resolvedLanguage as LocaleCode;

  return (
    <Select.Root
      items={ITEMS}
      value={current}
      onValueChange={(code) => {
        if (isLocale(code)) void setLocale(code);
      }}
    >
      <Select.Trigger
        data-testid="lang:switch"
        aria-label={t('lang.label')}
        className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-md border border-line px-3 text-sm text-ink-muted hover:text-ink"
      >
        <Select.Value />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner align="end" sideOffset={4} className="z-20">
          <Select.Popup className="rounded-md border border-line bg-surface p-1 shadow-card">
            <Select.List>
              {ITEMS.map((item) => (
                <Select.Item
                  key={item.value}
                  value={item.value}
                  data-testid={`lang:option:${item.value}`}
                  className="flex min-h-11 cursor-default items-center rounded px-3 text-sm text-ink-muted data-[highlighted]:bg-canvas data-[highlighted]:text-ink data-[selected]:text-ink"
                >
                  <Select.ItemText>{item.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
