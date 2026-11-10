export class ExtensionMissingError extends Error {
  readonly code = 'EXTENSION_MISSING';

  constructor() {
    super(
      'The AnimeVsub Helper browser extension is not installed or not enabled.',
    );
    this.name = 'ExtensionMissingError';
  }
}

export class TransportStatusError extends Error {
  readonly code = 'BAD_STATUS';

  readonly status: number;
  readonly url: string;

  constructor(status: number, url: string) {
    super(`Source answered ${status} for ${url}`);
    this.name = 'TransportStatusError';
    this.status = status;
    this.url = url;
  }
}

export class TransportNetworkError extends Error {
  readonly code = 'NETWORK';

  constructor(url: string, options?: ErrorOptions) {
    super(`Could not reach ${url}`, options);
    this.name = 'TransportNetworkError';
  }
}

export function expectOk(res: { status: number }, url: string): void {
  if (res.status < 200 || res.status >= 300) {
    throw new TransportStatusError(res.status, url);
  }
}
