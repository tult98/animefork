export const NAV_ITEMS = [
  { id: 'home', to: '/', labelKey: 'nav.home' },
  { id: 'browse', to: '/browse', labelKey: 'nav.browse' },
  { id: 'schedule', to: '/schedule', labelKey: 'nav.schedule' },
  { id: 'rankings', to: '/rankings', labelKey: 'nav.rankings' },
  { id: 'my-list', to: '/my-list', labelKey: 'nav.myList' },
] as const;

export type NavItem = (typeof NAV_ITEMS)[number];
