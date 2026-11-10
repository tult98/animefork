import { describe, expect, test } from 'vitest';

import { arrayBufferToBase64, base64ToArrayBuffer } from './base64';

const allBytes = Uint8Array.from({ length: 256 }, (_, i) => i);
const oneMegabyte = Uint8Array.from(
  { length: 1024 * 1024 + 3 },
  (_, i) => (i * 31 + (i >> 8)) & 255,
);

describe('arrayBufferToBase64', () => {
  test('normal', () => {
    expect(
      arrayBufferToBase64(new Uint8Array([1, 3213, 534, 654, 768]).buffer),
    ).toBe('AY0WjgA=');
  });

  test.each([
    [[], ''],
    [[0], 'AA=='],
    [[0, 255], 'AP8='],
    [[255, 254, 253], '//79'],
    [[104, 105], 'aGk='],
  ])('vector %j', (bytes, base64) => {
    expect(arrayBufferToBase64(new Uint8Array(bytes).buffer)).toBe(base64);
    expect(new Uint8Array(base64ToArrayBuffer(base64))).toEqual(
      new Uint8Array(bytes),
    );
  });

  test('all 256 byte values', () => {
    expect(arrayBufferToBase64(allBytes.buffer)).toBe(
      Buffer.from(allBytes).toString('base64'),
    );
  });

  test('1 MB buffer matches Buffer and round-trips', () => {
    const encoded = arrayBufferToBase64(oneMegabyte.buffer);
    expect(encoded).toBe(Buffer.from(oneMegabyte).toString('base64'));
    expect(new Uint8Array(base64ToArrayBuffer(encoded))).toEqual(oneMegabyte);
  });
});

describe('base64ToArrayBuffer', () => {
  test('normal', () => {
    expect(base64ToArrayBuffer('AY0WjgA=')).toEqual(
      new Uint8Array([1, 3213, 534, 654, 768]).buffer,
    );
  });
});
