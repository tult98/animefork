// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { failing, type FixtureOverride } from '../../test/fixture-fetch.ts';
import { renderApp } from '../../test/render-app.tsx';

describe('the error screen', () => {
  it('shows for a fixture that fails validation, not garbage', async () => {
    await renderApp('/', { fixtures: 'invalid-title' });
    await screen.findByTestId('error-screen');
    expect(screen.queryByTestId('shelf:new-episodes')).toBeNull();
    expect(document.body.textContent).not.toContain('NaN');
  });

  it('shows when the source is unreachable and retry reaches it again', async () => {
    let reachable = false;
    const gated: FixtureOverride = (url) =>
      reachable ? undefined : failing('/fixtures/default/index.html', 503)(url);
    await renderApp('/', { overrides: [gated] });
    await screen.findByTestId('error-screen');

    reachable = true;
    await userEvent.click(screen.getByTestId('error:retry'));
    await screen.findByTestId('shelf:new-episodes');
    await waitFor(() =>
      expect(screen.queryByTestId('error-screen')).toBeNull(),
    );
  });
});
