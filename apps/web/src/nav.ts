export const NAV_ITEMS = [
  { id: 'home', to: '/', label: 'Trang chủ', tabLabel: 'Trang chủ' },
  { id: 'browse', to: '/browse', label: 'Duyệt phim', tabLabel: 'Duyệt' },
  {
    id: 'schedule',
    to: '/schedule',
    label: 'Lịch chiếu',
    tabLabel: 'Lịch chiếu',
  },
  { id: 'rankings', to: '/rankings', label: 'Xếp hạng', tabLabel: 'Xếp hạng' },
  {
    id: 'my-list',
    to: '/my-list',
    label: 'Danh sách của tôi',
    tabLabel: 'Của tôi',
  },
] as const;
