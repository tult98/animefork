// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Dropdown } from '../dropdown.tsx';

const OPTIONS = {
  recent: 'Tập mới nhất',
  'rating-desc': 'Đánh giá: cao đến thấp',
  'rating-asc': 'Đánh giá: thấp đến cao',
  'views-desc': 'Xem nhiều nhất',
};
type Key = keyof typeof OPTIONS;

function Harness({
  initial = 'recent',
  disabled = false,
}: {
  initial?: Key;
  disabled?: boolean;
}) {
  const [value, setValue] = useState<Key>(initial);
  return (
    <Dropdown
      testId="sort"
      label="Sắp xếp"
      value={value}
      options={OPTIONS}
      disabled={disabled}
      onChange={setValue}
    />
  );
}

const trigger = () => screen.getByTestId('sort');
const option = (key: Key) => screen.getByTestId(`sort:option:${key}`);
const menu = () => screen.queryByRole('menu');

describe('Dropdown', () => {
  it('starts closed with menu semantics and a name made of label and value', () => {
    render(<Harness />);
    expect(trigger().getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(menu()).toBeNull();
    expect(screen.getByRole('button', { name: 'Sắp xếp Tập mới nhất' })).toBe(
      trigger(),
    );
  });

  it('opens on click and lists every option with the current one checked', async () => {
    render(<Harness />);
    await userEvent.click(trigger());
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(
      screen.getAllByRole('menuitemradio').map((item) => item.textContent),
    ).toEqual(Object.values(OPTIONS));
    expect(option('recent').getAttribute('aria-checked')).toBe('true');
    expect(option('recent').querySelector('svg')).not.toBeNull();
    expect(option('views-desc').getAttribute('aria-checked')).toBe('false');
    expect(option('views-desc').querySelector('svg')).toBeNull();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    render(<Harness />);
    await userEvent.click(trigger());
    await userEvent.keyboard('{Escape}');
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('closes on an outside click without changing the value', async () => {
    render(<Harness />);
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(menu()).toBeNull();
    expect(trigger().textContent).toBe('Tập mới nhất');
  });

  it('picks an option, closes, moves the check and refocuses the trigger', async () => {
    render(<Harness />);
    await userEvent.click(trigger());
    await userEvent.click(option('views-desc'));
    expect(menu()).toBeNull();
    expect(trigger().textContent).toBe('Xem nhiều nhất');
    expect(document.activeElement).toBe(trigger());

    await userEvent.click(trigger());
    expect(option('views-desc').getAttribute('aria-checked')).toBe('true');
    expect(option('recent').getAttribute('aria-checked')).toBe('false');
  });

  it('focuses the selected option on open and moves with the arrow keys', async () => {
    render(<Harness initial="rating-desc" />);
    await userEvent.click(trigger());
    expect(document.activeElement).toBe(option('rating-desc'));

    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(option('rating-asc'));
    await userEvent.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(option('rating-desc'));
    await userEvent.keyboard('{Home}');
    expect(document.activeElement).toBe(option('recent'));
    await userEvent.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(option('views-desc'));
    await userEvent.keyboard('{Home}{End}');
    expect(document.activeElement).toBe(option('views-desc'));

    await userEvent.keyboard('{Enter}');
    expect(menu()).toBeNull();
    expect(trigger().textContent).toBe('Xem nhiều nhất');
    expect(document.activeElement).toBe(trigger());
  });

  it('opens from the trigger with ArrowDown and closes on Tab', async () => {
    render(<Harness />);
    trigger().focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(menu()).not.toBeNull();
    await userEvent.keyboard('{Tab}');
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('stays disabled and closed', async () => {
    render(<Harness disabled />);
    expect(trigger()).toHaveProperty('disabled', true);
    await userEvent.click(trigger());
    expect(menu()).toBeNull();
  });
});
