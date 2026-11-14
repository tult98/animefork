// @vitest-environment jsdom
import fetchMock from '@fetch-mock/vitest';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  mockSearchHtml,
  mockSearchNoCardsHtml,
} from '../../lib/titles/__mockData__/listing.ts';
import { render, screen } from '../../test/test-utils.tsx';
import { SearchBox } from '../search-box.tsx';
import { SearchResults } from '../search-results.tsx';

describe('searching', () => {
  it('opens the results page for the text typed in the top bar', async () => {
    const { router } = render(<SearchBox />, { path: '/' });

    await userEvent.type(
      await screen.findByTestId('search:input'),
      'tsuki{Enter}',
    );

    expect(router.state.location.pathname).toBe('/search');
    expect(router.state.location.search).toEqual({ q: 'tsuki' });
  });

  it('shows the cards of the requested results page', async () => {
    fetchMock.get('path:/tim-kiem/tsuki/trang-2.html', mockSearchHtml);
    render(<SearchResults q="tsuki" page={2} onPage={() => {}} />, {
      path: '/',
    });
    await expect(fetchMock).toBeFetched('path:/tim-kiem/tsuki/trang-2.html');

    expect(screen.getByRole('heading')).toHaveTextContent(
      'Kết quả cho “tsuki”',
    );
    expect(screen.getByRole('button', { name: /^Phim 1,/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /^Phim 2,/ })).toBeVisible();
  });

  it('names the query when nothing matches', async () => {
    fetchMock.get('path:/tim-kiem/tsukii/trang-1.html', mockSearchNoCardsHtml);
    render(<SearchResults q="tsukii" page={1} onPage={() => {}} />, {
      path: '/',
    });
    await expect(fetchMock).toBeFetched('path:/tim-kiem/tsukii/trang-1.html');

    expect(screen.getByTestId('search:empty')).toHaveTextContent(
      'Không tìm thấy kết quả nào cho “tsukii”',
    );
  });
});
