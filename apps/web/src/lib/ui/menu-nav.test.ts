import { describe, expect, it } from 'vitest';
import { nextMenuIndex } from './menu-nav.ts';

describe('nextMenuIndex', () => {
  it('moves down and up by one', () => {
    expect(nextMenuIndex(1, 5, 'ArrowDown')).toBe(2);
    expect(nextMenuIndex(1, 5, 'ArrowUp')).toBe(0);
  });
  it('wraps at both ends', () => {
    expect(nextMenuIndex(4, 5, 'ArrowDown')).toBe(0);
    expect(nextMenuIndex(0, 5, 'ArrowUp')).toBe(4);
  });
  it('jumps to the first and last option', () => {
    expect(nextMenuIndex(2, 5, 'Home')).toBe(0);
    expect(nextMenuIndex(2, 5, 'End')).toBe(4);
  });
  it('starts from an end when nothing is focused', () => {
    expect(nextMenuIndex(-1, 5, 'ArrowDown')).toBe(0);
    expect(nextMenuIndex(-1, 5, 'ArrowUp')).toBe(4);
  });
  it('has nowhere to go without options', () => {
    expect(nextMenuIndex(-1, 0, 'ArrowDown')).toBe(-1);
  });
});
