export class StreamUnavailableError extends Error {
  readonly code = 'STREAM_UNAVAILABLE';

  constructor(reason: string, options?: ErrorOptions) {
    super(reason, options);
    this.name = 'StreamUnavailableError';
  }
}
