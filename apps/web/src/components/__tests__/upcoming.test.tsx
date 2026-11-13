// @vitest-environment jsdom
import fetchMock from '@fetch-mock/vitest';
import { describe, expect, it } from 'vitest';
import { mockUpcomingHtml } from '../../lib/titles/__mockData__/listing.ts';
import { render, screen, waitFor, within } from '../../test/test-utils.tsx';
import { Upcoming } from '../upcoming.tsx';

describe('the upcoming listing', () => {
  it('shows each card under Sắp chiếu with a countdown, or the year when only the year is known', async () => {
    fetchMock.get('path:/anime-sap-chieu/', mockUpcomingHtml);
    render(
      <Upcoming search={{ sort: 'recent', page: 1 }} onSearch={() => {}} />,
      { path: '/' },
    );
    await expect(fetchMock).toBeFetched('path:/anime-sap-chieu/');
    await waitFor(() =>
      expect(screen.getByTestId('listing:sort')).toBeEnabled(),
    );

    expect(screen.getByRole('heading')).toHaveTextContent('Sắp ra mắt');
    expect(screen.getByTestId('listing:count')).toHaveTextContent('2 phim');
    const [soon, later] = within(
      screen.getByTestId('listing:grid'),
    ).getAllByRole('listitem');
    expect(soon).toHaveTextContent('Sắp chiếu');
    expect(within(soon!).getByTestId('card:countdown')).toHaveTextContent(
      'Hôm nay',
    );
    expect(later).toHaveTextContent('Sắp chiếu');
    expect(within(later!).getByTestId('card:countdown')).toHaveTextContent(
      '2099',
    );
  });
});
