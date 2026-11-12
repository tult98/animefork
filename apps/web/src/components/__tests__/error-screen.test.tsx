// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { ExtensionMissingError } from '../../lib/transport/index.ts';
import { render, screen } from '../../test/test-utils.tsx';
import userEvent from '@testing-library/user-event';
import { ErrorScreen } from '../error-screen.tsx';

describe('ErrorScreen', () => {
  it('says the source is unreachable for a network failure', () => {
    render(<ErrorScreen error={new Error('boom')} onRetry={() => {}} />);
    expect(screen.getByRole('alert').textContent).toContain(
      'The source is unreachable',
    );
  });

  it('asks for the extension when it is missing', () => {
    render(
      <ErrorScreen error={new ExtensionMissingError()} onRetry={() => {}} />,
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'Extension required',
    );
  });

  it('calls onRetry when retry is clicked', async () => {
    const onRetry = vi.fn();
    render(<ErrorScreen error={new Error('boom')} onRetry={onRetry} />);
    await userEvent.click(screen.getByTestId('error:retry'));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
