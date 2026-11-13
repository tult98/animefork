// @vitest-environment jsdom
import fetchMock from '@fetch-mock/vitest';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { mockHomeHtml } from '../../lib/titles/__mockData__/index.ts';
import {
  mockListingPage1Html,
  mockListingPage2Html,
  mockShortListingHtml,
} from '../../lib/titles/__mockData__/listing.ts';
import type { SortKey } from '../../lib/titles/airing-list.ts';
import { render, screen, waitFor, within } from '../../test/test-utils.tsx';
import { AiringThisSeason } from '../airing-this-season.tsx';

type Search = { sort: SortKey; page: number };

// The route keeps the sort and page in the URL. This holds them in state and reports each change.
function Page({
  initial = { sort: 'recent', page: 1 },
  onSearch,
}: {
  initial?: Search;
  onSearch: (next: Partial<Search>, options: { replace: boolean }) => void;
}) {
  const [search, setSearch] = useState(initial);
  return (
    <AiringThisSeason
      search={search}
      onSearch={(next, options) => {
        onSearch(next, options);
        setSearch((current) => ({ ...current, ...next }));
      }}
    />
  );
}

const firstPage = 'path:/danh-sach/all/all/autumn/2026/all/all/jp/';
const secondPage =
  'path:/danh-sach/all/all/autumn/2026/all/all/jp/trang-2.html';

describe('the listing of the airing season', () => {
  it('shows the first 30 of the 33 titles with the season count, and the rest on page 2', async () => {
    const onSearch = vi.fn();
    fetchMock
      .get('path:/', mockHomeHtml)
      .get(firstPage, mockListingPage1Html)
      .get(secondPage, mockListingPage2Html);
    render(<Page onSearch={onSearch} />, { path: '/' });
    await expect(fetchMock).toBeFetched(secondPage);
    await waitFor(() =>
      expect(screen.getByTestId('listing:sort')).toBeEnabled(),
    );

    expect(screen.getByRole('heading')).toHaveTextContent('Đang chiếu mùa này');
    expect(screen.getByTestId('listing:count')).toHaveTextContent(
      'Mùa thu 2026 · 33 phim',
    );
    expect(
      within(screen.getByTestId('listing:grid')).getAllByRole('listitem'),
    ).toHaveLength(30);
    expect(
      within(
        within(screen.getByTestId('listing:grid')).getAllByRole('listitem')[0]!,
      ).getByRole('button', {
        name: /^Phim 1,/,
      }),
    ).toBeVisible();
    expect(screen.getByTestId('listing:prev')).toBeDisabled();

    await userEvent.click(screen.getByTestId('listing:page:2'));

    expect(onSearch).toHaveBeenCalledWith({ page: 2 }, { replace: false });
    expect(
      within(screen.getByTestId('listing:grid')).getAllByRole('listitem'),
    ).toHaveLength(3);
    expect(screen.getByTestId('listing:page:2')).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByTestId('listing:next')).toBeDisabled();
  });

  it('sorts the whole list, not only the page, and goes back to page 1', async () => {
    const onSearch = vi.fn();
    fetchMock
      .get('path:/', mockHomeHtml)
      .get(firstPage, mockListingPage1Html)
      .get(secondPage, mockListingPage2Html);
    render(<Page initial={{ sort: 'recent', page: 2 }} onSearch={onSearch} />, {
      path: '/',
    });
    await expect(fetchMock).toBeFetched(secondPage);
    await waitFor(() =>
      expect(screen.getByTestId('listing:sort')).toBeEnabled(),
    );
    expect(
      within(screen.getByTestId('listing:grid')).getAllByRole('listitem')[0],
    ).toBeVisible();

    await userEvent.click(screen.getByTestId('listing:sort'));
    await userEvent.click(screen.getByTestId('listing:sort:option:views-desc'));

    expect(onSearch).toHaveBeenLastCalledWith(
      { sort: 'views-desc', page: 1 },
      { replace: true },
    );
    expect(screen.getByTestId('listing:sort')).toHaveTextContent(
      'Xem nhiều nhất',
    );
    expect(screen.getByTestId('listing:page:1')).toHaveAttribute(
      'aria-current',
      'page',
    );
    const items = within(screen.getByTestId('listing:grid')).getAllByRole(
      'listitem',
    );
    expect(
      within(items[0]!).getByRole('button', { name: /^Phim 31,/ }),
    ).toBeVisible();
    expect(
      within(items[1]!).getByRole('button', { name: /^Phim 5,/ }),
    ).toBeVisible();

    await userEvent.click(screen.getByTestId('listing:sort'));
    await userEvent.click(
      screen.getByTestId('listing:sort:option:rating-desc'),
    );

    expect(
      within(
        within(screen.getByTestId('listing:grid')).getAllByRole('listitem')[0]!,
      ).getByRole('button', {
        name: /^Phim 3,/,
      }),
    ).toBeVisible();
    expect(
      within(
        within(screen.getByTestId('listing:grid')).getAllByRole(
          'listitem',
        )[29]!,
      ).getByRole('button', {
        name: /^Phim 30,/,
      }),
    ).toBeVisible();
  });

  it('opens on the page it is given and clamps a page past the end to the last page', async () => {
    fetchMock
      .get('path:/', mockHomeHtml)
      .get(firstPage, mockListingPage1Html)
      .get(secondPage, mockListingPage2Html);
    render(<Page initial={{ sort: 'recent', page: 99 }} onSearch={vi.fn()} />, {
      path: '/',
    });
    await expect(fetchMock).toBeFetched(secondPage);
    await waitFor(() =>
      expect(screen.getByTestId('listing:sort')).toBeEnabled(),
    );

    expect(
      within(screen.getByTestId('listing:grid')).getAllByRole('listitem'),
    ).toHaveLength(3);
    expect(screen.getByTestId('listing:page:2')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('shows the first page at once but keeps sorting and paging off until every page has loaded', async () => {
    fetchMock
      .get('path:/', mockHomeHtml)
      .get(firstPage, mockListingPage1Html)
      .get(secondPage, mockListingPage2Html, { delay: 200 });
    render(<Page onSearch={vi.fn()} />, { path: '/' });

    expect(await screen.findAllByRole('listitem')).toHaveLength(30);
    expect(screen.getByTestId('listing:sort')).toBeDisabled();
    expect(screen.queryByTestId('listing:count')).not.toBeInTheDocument();
    expect(screen.queryByTestId('listing:pager')).not.toBeInTheDocument();

    await expect(fetchMock).toBeFetched(secondPage);
    await waitFor(() =>
      expect(screen.getByTestId('listing:sort')).toBeEnabled(),
    );
    expect(screen.getByTestId('listing:sort')).toBeEnabled();
    expect(screen.getByTestId('listing:count')).toHaveTextContent('33 phim');
    expect(screen.getByTestId('listing:next')).toBeEnabled();
  });

  it('shows a skeleton, not a partial grid, while a non-default sort waits for the last page', async () => {
    fetchMock
      .get('path:/', mockHomeHtml)
      .get(firstPage, mockListingPage1Html)
      .get(secondPage, mockListingPage2Html, { delay: 200 });
    render(
      <Page initial={{ sort: 'views-desc', page: 1 }} onSearch={vi.fn()} />,
      { path: '/' },
    );

    expect(await screen.findByTestId('listing:loading')).toBeVisible();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();

    await expect(fetchMock).toBeFetched(secondPage);
    await waitFor(() =>
      expect(screen.getByTestId('listing:sort')).toBeEnabled(),
    );
    expect(screen.queryByTestId('listing:loading')).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('listing:grid')).getAllByRole('listitem'),
    ).toHaveLength(30);
  });

  it('keeps the pages that loaded and says the list is incomplete when a later page fails', async () => {
    fetchMock
      .get('path:/', mockHomeHtml)
      .get(firstPage, mockListingPage1Html)
      .get(secondPage, 500);
    render(<Page onSearch={vi.fn()} />, { path: '/' });
    await expect(fetchMock).toBeFetched(secondPage);
    await waitFor(() =>
      expect(screen.getByTestId('listing:sort')).toBeEnabled(),
    );

    expect(screen.getByTestId('listing:partial')).toHaveTextContent(
      'Chưa tải hết danh sách.',
    );
    expect(screen.getByTestId('listing:count')).toHaveTextContent(
      'Mùa thu 2026 · 30 phim',
    );
    expect(
      within(screen.getByTestId('listing:grid')).getAllByRole('listitem'),
    ).toHaveLength(30);
    expect(screen.queryByTestId('error-screen')).not.toBeInTheDocument();
  });

  it('shows the error screen when the home page fails and loads the list after Retry', async () => {
    fetchMock
      .get('path:/', 503, { repeat: 1 })
      .get('path:/', mockHomeHtml)
      .get(firstPage, mockShortListingHtml);
    render(<Page onSearch={vi.fn()} />, { path: '/' });
    await expect(fetchMock).toBeFetched('path:/');
    expect(await screen.findByTestId('error-screen')).toBeVisible();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('error:retry'));

    expect(await screen.findAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByTestId('error-screen')).not.toBeInTheDocument();
  });

  it('says there are no airing titles when the home page names no season', async () => {
    fetchMock.get(
      'path:/',
      mockHomeHtml.replace('data-tag="anime-season"', 'data-tag="other"'),
    );
    render(<Page onSearch={vi.fn()} />, { path: '/' });
    await expect(fetchMock).toBeFetched('path:/');

    expect(await screen.findByTestId('listing:empty')).toHaveTextContent(
      'Chưa có phim nào đang chiếu.',
    );
    expect(screen.queryByTestId('listing:pager')).not.toBeInTheDocument();
  });
});
