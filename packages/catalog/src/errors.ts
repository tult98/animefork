export interface ParseErrorDetail {
  /** CSS selector that matched nothing or the wrong thing. */
  selector?: string;
  /** Dotted path of the field that failed validation, for example `carousel.3.image`. */
  field?: string;
  /** What was wrong, in plain words. */
  reason: string;
}

/** The upstream markup no longer matches what a parser expects. */
export class ParseError extends Error {
  readonly parser: string;
  readonly selector: string | undefined;
  readonly field: string | undefined;
  readonly reason: string;

  constructor(
    parser: string,
    detail: ParseErrorDetail,
    options?: ErrorOptions,
  ) {
    const where = [
      detail.selector === undefined ? undefined : `selector ${detail.selector}`,
      detail.field === undefined ? undefined : `field ${detail.field}`,
    ]
      .filter(Boolean)
      .join(', ');
    super(
      `${parser}: ${detail.reason}${where === '' ? '' : ` (${where})`}`,
      options,
    );
    this.name = 'ParseError';
    this.parser = parser;
    this.selector = detail.selector;
    this.field = detail.field;
    this.reason = detail.reason;
  }
}
