// @vitest-environment jsdom
import fetchMock from '@fetch-mock/vitest';
import userEvent from '@testing-library/user-event';
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';
import {
  mockSearchHtml,
  mockSearchNoCardsHtml,
} from '../../lib/titles/__mockData__/listing.ts';
import { routeTree } from '../../routeTree.gen.ts';
import { render, screen } from '../../test/test-utils.tsx';

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(<RouterProvider router={router} />);
}

describe('searching from the top bar', () => {
  it('requests the first page for the typed text and shows each card', async () => {
    fetchMock.get('path:/tim-kiem/tsuki/trang-1.html', mockSearchHtml);
    renderAt('/');

    await userEvent.type(
      await screen.findByTestId('search:input'),
      'tsuki{Enter}',
    );
    await expect(fetchMock).toBeFetched('path:/tim-kiem/tsuki/trang-1.html');

    expect(screen.getByRole('heading')).toHaveTextContent(
      'Kết quả cho “tsuki”',
    );
    expect(
      screen.getByRole('button', { name: /^Phim 1,/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Phim 2,/ }),
    ).toBeInTheDocument();
  });

  it('names the query when nothing matches', async () => {
    fetchMock.get('path:/tim-kiem/tsukii/trang-1.html', mockSearchNoCardsHtml);
    renderAt('/search?q=tsukii');
    await expect(fetchMock).toBeFetched('path:/tim-kiem/tsukii/trang-1.html');

    expect(screen.getByTestId('search:empty')).toHaveTextContent(
      'Không tìm thấy kết quả nào cho “tsukii”',
    );
  });

  it('requests the page in the URL', async () => {
    fetchMock.get('path:/tim-kiem/tsuki/trang-2.html', mockSearchHtml);
    renderAt('/search?q=tsuki&page=2');

    await expect(fetchMock).toBeFetched('path:/tim-kiem/tsuki/trang-2.html');
    expect(screen.getByTestId('search:input')).toHaveValue('tsuki');
  });
});
