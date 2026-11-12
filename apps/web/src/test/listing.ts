import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect } from 'vitest';
import { renderApp, type RenderedApp } from './render-app.tsx';

export const cards = () =>
  within(screen.getByTestId('listing:grid')).getAllByRole('listitem');

export const slugOf = (item: Element) =>
  item
    .querySelector('[data-testid^="card:/phim/"]')!
    .getAttribute('data-testid')!
    .replace(/^card:\/phim\/|\/$/g, '');

export const order = () => cards().map(slugOf);

export const current = () =>
  document.querySelector('[data-testid^="listing:page:"][aria-current="page"]')
    ?.textContent;

export const search = (router: RenderedApp['router']) =>
  router.state.location.search as Record<string, unknown>;

export async function pick(value: string) {
  await userEvent.click(screen.getByTestId('listing:sort'));
  await userEvent.click(screen.getByTestId(`listing:sort:option:${value}`));
}

export async function openListing(
  path: string,
  options?: Parameters<typeof renderApp>[1],
) {
  const app = await renderApp(path, options);
  await screen.findByTestId('listing:grid');
  await waitFor(() =>
    expect(screen.getByTestId('listing:sort').hasAttribute('disabled')).toBe(
      false,
    ),
  );
  return app;
}
