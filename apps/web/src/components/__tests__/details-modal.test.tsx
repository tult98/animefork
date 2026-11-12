// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { failing } from '../../test/fixture-fetch.ts';
import { renderApp } from '../../test/render-app.tsx';

const KAMUI = 'ushiro-no-shoumen-kamui-san-a6084';

async function openDetails() {
  const app = await renderApp('/');
  const shelf = await screen.findByTestId('shelf:new-episodes');
  await userEvent.click(
    within(shelf)
      .getByTestId(`card:/phim/${KAMUI}/`)
      .querySelector('[data-cover]')!,
  );
  const modal = await screen.findByTestId('details');
  await within(modal).findByTestId('details:episode:81001');
  return { ...app, modal };
}

describe('the details modal', () => {
  it('opens from a card instead of navigating', async () => {
    const { router, modal } = await openDetails();
    expect(within(modal).getByRole('heading', { level: 2 }).textContent).toBe(
      'Ushiro no Shoumen Kamui-san',
    );
    expect(router.state.location.pathname).toBe('/');
    expect(within(modal).getByTestId('details:play').getAttribute('href')).toBe(
      `/watch/${KAMUI}`,
    );
  });

  it('closes from its close button', async () => {
    const { modal } = await openDetails();
    await userEvent.click(within(modal).getByTestId('details:close'));
    await waitFor(() => expect(screen.queryByTestId('details')).toBeNull());
  });

  it('closes on a click of the backdrop but not of the content', async () => {
    const { modal } = await openDetails();
    await userEvent.click(within(modal).getByTestId('details:episodes'));
    expect(screen.queryByTestId('details')).not.toBeNull();
    await userEvent.click(modal);
    await waitFor(() => expect(screen.queryByTestId('details')).toBeNull());
  });

  it('closes when the dialog reports it closed', async () => {
    const { modal } = await openDetails();
    fireEvent(modal, new Event('close'));
    await waitFor(() => expect(screen.queryByTestId('details')).toBeNull());
  });

  it('switches season and plays an episode', async () => {
    const { router, modal } = await openDetails();
    await userEvent.click(within(modal).getByTestId('details:season-button'));
    await userEvent.click(
      within(modal).getByTestId(
        'details:season:tonikaku-kawaii-2nd-season-a4476',
      ),
    );
    await waitFor(() =>
      expect(within(modal).queryByTestId('details:episode:81001')).toBeNull(),
    );
    const first = await within(
      within(modal).getByTestId('details:episodes'),
    ).findAllByRole('link');
    await userEvent.click(first[0]!);
    await waitFor(() =>
      expect(router.state.location.pathname).toMatch(
        /^\/watch\/tonikaku-kawaii-2nd-season-a4476\//,
      ),
    );
    expect(screen.queryByTestId('details')).toBeNull();
  });

  it('opens for an upcoming card whose watch page does not exist', async () => {
    const { router } = await renderApp('/', {
      overrides: [failing(/\/phim\/tsuki-no-sakamichi-a7001\//, 404)],
    });
    const shelf = await screen.findByTestId('shelf:upcoming');
    const cover = within(shelf)
      .getByTestId('card:/phim/tsuki-no-sakamichi-a7001/')
      .querySelector('[data-cover]')!;
    await userEvent.click(cover);
    const modal = await screen.findByTestId('details');
    expect(within(modal).getByRole('heading', { level: 2 }).textContent).toBe(
      'Tsuki no Sakamichi',
    );
    expect(router.state.location.pathname).toBe('/');
  });
});
