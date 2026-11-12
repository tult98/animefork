// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Pager } from '../pager.tsx';

const setup = (page: number, pageCount: number, disabled = false) => {
  const onPage = vi.fn();
  render(
    <Pager
      page={page}
      pageCount={pageCount}
      disabled={disabled}
      onPage={onPage}
    />,
  );
  return onPage;
};

describe('Pager', () => {
  it('has prev, next, one button per page and a summary', () => {
    setup(1, 2);
    const nav = screen.getByRole('navigation', { name: 'Phân trang' });
    expect(nav.querySelectorAll('button')).toHaveLength(4);
    expect(screen.getByTestId('listing:summary').textContent).toBe(
      'Trang 1 / 2',
    );
  });

  it('marks the current page and disables prev on the first page', () => {
    setup(1, 2);
    expect(
      screen
        .getByRole('button', { name: 'Trang 1' })
        .getAttribute('aria-current'),
    ).toBe('page');
    expect(
      screen
        .getByRole('button', { name: 'Trang 2' })
        .getAttribute('aria-current'),
    ).toBeNull();
    expect(screen.getByTestId('listing:prev')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('listing:next')).toHaveProperty(
      'disabled',
      false,
    );
  });

  it('disables next on the last page', () => {
    setup(2, 2);
    expect(screen.getByTestId('listing:prev')).toHaveProperty(
      'disabled',
      false,
    );
    expect(screen.getByTestId('listing:next')).toHaveProperty('disabled', true);
  });

  it('asks for the neighbouring page from prev and next', async () => {
    const onPage = setup(3, 5);
    await userEvent.click(screen.getByTestId('listing:next'));
    await userEvent.click(screen.getByTestId('listing:prev'));
    expect(onPage.mock.calls).toEqual([[4], [2]]);
  });

  it('asks for the page of a numbered button', async () => {
    const onPage = setup(1, 3);
    await userEvent.click(screen.getByTestId('listing:page:3'));
    expect(onPage).toHaveBeenCalledWith(3);
  });

  it('collapses a long range around the current page', () => {
    setup(10, 20);
    const shown = [...screen.getByRole('list').querySelectorAll('li')].map(
      (li) => li.textContent,
    );
    expect(shown).toEqual(['1', '…', '9', '10', '11', '…', '20']);
  });

  it('disables every control while the list loads', () => {
    setup(2, 3, true);
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveProperty('disabled', true);
    }
  });
});
