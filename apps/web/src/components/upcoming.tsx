import { UPCOMING_PATH } from '../lib/titles/home.ts';
import { TitleListing, type TitleListingProps } from './title-listing.tsx';

export function Upcoming({
  search,
  onSearch,
}: Pick<TitleListingProps, 'search' | 'onSearch'>) {
  return (
    <TitleListing
      heading="Sắp ra mắt"
      emptyText="Chưa có phim nào sắp ra mắt."
      sourcePath={UPCOMING_PATH}
      upcoming
      search={search}
      onSearch={onSearch}
    />
  );
}
