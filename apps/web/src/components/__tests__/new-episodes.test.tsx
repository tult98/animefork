// @vitest-environment jsdom
import fetchMock from '@fetch-mock/vitest';
import { describe, expect, it } from 'vitest';
import {
  mockListingPage1Html,
  mockListingPage2Html,
} from '../../lib/titles/__mockData__/listing.ts';
import { render, screen, waitFor, within } from '../../test/test-utils.tsx';
import { NewEpisodes } from '../new-episodes.tsx';

const jpList = 'path:/danh-sach/all/all/all/all/all/all/jp/';

describe('the new episodes listing', () => {
  it('lists the jp source with a Tập mới badge and the episode on each card, and no count', async () => {
    fetchMock
      .get(jpList, mockListingPage1Html)
      .get(`${jpList}trang-2.html`, mockListingPage2Html);
    render(
      <NewEpisodes search={{ sort: 'recent', page: 1 }} onSearch={() => {}} />,
      { path: '/' },
    );
    await expect(fetchMock).toBeFetched(`${jpList}trang-2.html`);
    await waitFor(() =>
      expect(screen.getByTestId('listing:sort')).toBeEnabled(),
    );

    expect(screen.getByRole('heading')).toHaveTextContent('Mới cập nhật');
    expect(screen.queryByTestId('listing:count')).not.toBeInTheDocument();
    const items = within(screen.getByTestId('listing:grid')).getAllByRole(
      'listitem',
    );
    expect(items).toHaveLength(30);
    for (const item of items) {
      expect(item).toHaveTextContent('Tập mới');
    }
    expect(
      within(items[0]!).getByRole('button', { name: /^Phim 1,/ }),
    ).toHaveTextContent('Tập mới');
    expect(screen.getByTestId('listing:page:2')).toBeVisible();
  });

  it('fetches only the 7 pages the newest 200 titles need from a 10 page source', async () => {
    fetchMock
      .get(jpList, mockListingPage1Html.replace('của 2', 'của 10'))
      .get(
        'glob:*/danh-sach/all/all/all/all/all/all/jp/trang-*.html',
        mockListingPage2Html,
      );
    render(
      <NewEpisodes search={{ sort: 'recent', page: 1 }} onSearch={() => {}} />,
      { path: '/' },
    );
    await expect(fetchMock).toBeFetched(`${jpList}trang-7.html`);
    await waitFor(() =>
      expect(screen.getByTestId('listing:sort')).toBeEnabled(),
    );

    // The first page and pages 2 to 7.
    expect(fetchMock).toHaveFetchedTimes(7);
    expect(fetchMock).not.toHaveFetched(`${jpList}trang-8.html`);
    expect(screen.queryByTestId('listing:partial')).not.toBeInTheDocument();
    expect(screen.getByTestId('listing:page:2')).toBeVisible();
  });
});
