const MINUTE_MS = 60_000;

export const AUTH_ROUTE_LIMIT = { limit: 10, ttl: MINUTE_MS };

export const MAILS_PER_EMAIL_LIMIT = 3;
export const MAILS_PER_EMAIL_WINDOW_MS = 60 * MINUTE_MS;

export const PENDING_SIGNUPS_PER_EMAIL = 5;

export const SIGN_IN_FAILURE_LIMIT = 5;
export const SIGN_IN_FAILURE_WINDOW_MS = 15 * MINUTE_MS;

export class SlidingWindow {
  private readonly events = new Map<string, number[]>();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  private recent(key: string, now: Date): number[] {
    const since = now.getTime() - this.windowMs;
    const kept = (this.events.get(key) ?? []).filter((at) => at > since);
    if (kept.length > 0) this.events.set(key, kept);
    else this.events.delete(key);
    return kept;
  }

  isFull(key: string, now: Date): boolean {
    return this.recent(key, now).length >= this.limit;
  }

  retryAfterMs(key: string, now: Date): number {
    const recent = this.recent(key, now);
    const oldest = recent[recent.length - this.limit];
    if (oldest === undefined) return 0;
    return oldest + this.windowMs - now.getTime();
  }

  add(key: string, now: Date): void {
    this.events.set(key, [...this.recent(key, now), now.getTime()]);
  }

  take(key: string, now: Date): boolean {
    if (this.isFull(key, now)) return false;
    this.add(key, now);
    return true;
  }

  clear(key: string): void {
    this.events.delete(key);
  }

  prune(now: Date): void {
    for (const key of [...this.events.keys()]) this.recent(key, now);
  }
}
