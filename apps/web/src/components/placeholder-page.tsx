import { useTranslation } from 'react-i18next';
import { NAV_ITEMS, type NavItem } from '../nav.ts';

export function PlaceholderPage({ id }: { id: NavItem['id'] }) {
  const { t } = useTranslation();
  const item = NAV_ITEMS.find((nav) => nav.id === id)!;
  return (
    <section className="py-16" data-testid={`page:${id}`}>
      <h1 className="text-2xl font-semibold">{t(item.labelKey)}</h1>
      <p className="mt-2 text-ink-muted">{t('common.notBuilt')}</p>
    </section>
  );
}
