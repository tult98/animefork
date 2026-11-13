import { NEW_EPISODES_PATH } from '../lib/titles/home.ts';
import { TitleListing, type TitleListingProps } from './title-listing.tsx';

const NEW_EPISODES_LIMIT = 200;

export function NewEpisodes({
  search,
  onSearch,
}: Pick<TitleListingProps, 'search' | 'onSearch'>) {
  return (
    <TitleListing
      heading="Mới cập nhật"
      emptyText="Chưa có phim nào mới cập nhật."
      sourcePath={NEW_EPISODES_PATH}
      newEpisode
      showCount={false}
      limit={NEW_EPISODES_LIMIT}
      search={search}
      onSearch={onSearch}
    />
  );
}
