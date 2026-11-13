export class ExtensionMissingError extends Error {
  readonly code = 'EXTENSION_MISSING';

  constructor() {
    super(
      'The Animefork Helper browser extension is not installed or not enabled.',
    );
    this.name = 'ExtensionMissingError';
  }
}

export class TransportNetworkError extends Error {
  readonly code = 'NETWORK';

  constructor(url: string, options?: ErrorOptions) {
    super(`Could not reach ${url}`, options);
    this.name = 'TransportNetworkError';
  }
}
