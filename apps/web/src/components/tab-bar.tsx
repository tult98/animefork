import { Link } from '@tanstack/react-router';
import { NAV_ITEMS } from '../nav.ts';
import {
  Bookmark,
  CalendarDays,
  House,
  LayoutGrid,
  Trophy,
  type LucideIcon,
} from './ui/icons.ts';

const TAB_ICON: Record<(typeof NAV_ITEMS)[number]['id'], LucideIcon> = {
  home: House,
  browse: LayoutGrid,
  schedule: CalendarDays,
  rankings: Trophy,
  'my-list': Bookmark,
};

export function TabBar() {
  return (
    <nav
      aria-label="Điều hướng dưới"
      data-testid="tab-bar"
      className="sticky bottom-0 z-40 hidden h-16 border-t border-border-strong bg-surface max-desk:flex"
    >
      {NAV_ITEMS.map((item) => {
        const Icon = TAB_ICON[item.id];
        return (
          <Link
            key={item.id}
            to={item.to}
            data-testid={`tab:${item.id}`}
            activeOptions={{ exact: item.to === '/' }}
            className="relative flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 text-xs/[1.2] font-medium text-muted before:absolute before:inset-x-[22%] before:top-0 before:h-[3px] before:bg-brand before:opacity-0 before:content-[''] aria-[current=page]:text-ink aria-[current=page]:before:opacity-100"
          >
            <Icon aria-hidden="true" className="size-6" />
            {item.tabLabel}
          </Link>
        );
      })}
    </nav>
  );
}
