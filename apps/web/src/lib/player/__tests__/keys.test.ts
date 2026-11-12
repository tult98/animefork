import { describe, expect, it } from 'vitest';
import { playerKeyAction, type PlayerKeyAction } from '../keys.ts';

const press = (key: string, modifiers: object = {}) =>
  playerKeyAction({
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...modifiers,
  });

describe('playerKeyAction', () => {
  it.each<[string, PlayerKeyAction]>([
    [' ', { type: 'toggle' }],
    ['k', { type: 'toggle' }],
    ['ArrowLeft', { type: 'skip', delta: -5 }],
    ['ArrowRight', { type: 'skip', delta: 5 }],
    ['j', { type: 'skip', delta: -10 }],
    ['l', { type: 'skip', delta: 10 }],
    ['ArrowUp', { type: 'volume', delta: 0.1 }],
    ['ArrowDown', { type: 'volume', delta: -0.1 }],
    ['m', { type: 'mute' }],
    ['f', { type: 'fullscreen' }],
    ['Home', { type: 'seekFraction', fraction: 0 }],
    ['End', { type: 'seekFraction', fraction: 1 }],
    ['0', { type: 'seekFraction', fraction: 0 }],
    ['5', { type: 'seekFraction', fraction: 0.5 }],
    ['9', { type: 'seekFraction', fraction: 0.9 }],
  ])('maps %j', (key, action) => {
    expect(press(key)).toEqual(action);
  });

  it('maps every digit to its tenth', () => {
    for (let digit = 0; digit <= 9; digit++) {
      expect(press(String(digit))).toEqual({
        type: 'seekFraction',
        fraction: digit / 10,
      });
    }
  });

  it('reads letters in either case', () => {
    expect(press('K')).toEqual({ type: 'toggle' });
    expect(press('F')).toEqual({ type: 'fullscreen' });
  });

  it.each(['ctrlKey', 'metaKey', 'altKey'])(
    'ignores every binding while %s is held',
    (modifier) => {
      for (const key of [
        ' ',
        'k',
        'ArrowLeft',
        'j',
        'ArrowUp',
        'm',
        'f',
        '5',
        'Home',
      ]) {
        expect(press(key, { [modifier]: true })).toBeUndefined();
      }
    },
  );

  it.each(['a', 'Enter', 'Escape', 'Tab', 'toString', '__proto__', '10'])(
    'leaves %j unbound',
    (key) => {
      expect(press(key)).toBeUndefined();
    },
  );
});
