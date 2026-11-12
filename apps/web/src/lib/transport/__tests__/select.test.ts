import { describe, expect, it } from 'vitest';
import { ExtensionTransport } from '../extension-transport.ts';
import { ReplayTransport } from '../replay-transport.ts';
import { createTransport, selectTransportKind } from '../select.ts';

describe('selectTransportKind', () => {
  it('defaults to the extension', () => {
    expect(selectTransportKind('', {})).toBe('extension');
  });

  it('uses the env when the query is silent', () => {
    expect(selectTransportKind('', { VITE_TRANSPORT: 'replay' })).toBe(
      'replay',
    );
  });

  it('lets the query override the env', () => {
    expect(
      selectTransportKind('?transport=extension', { VITE_TRANSPORT: 'replay' }),
    ).toBe('extension');
    expect(selectTransportKind('?transport=replay', {})).toBe('replay');
  });

  it('treats an unknown value as the extension', () => {
    expect(selectTransportKind('?transport=bogus', {})).toBe('extension');
  });
});

describe('createTransport', () => {
  it('builds the implementation the selection names', () => {
    expect(createTransport('?transport=replay', {})).toBeInstanceOf(
      ReplayTransport,
    );
    expect(createTransport('', {})).toBeInstanceOf(ExtensionTransport);
  });
});
