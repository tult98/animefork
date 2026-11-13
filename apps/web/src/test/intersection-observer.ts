import { act } from '@testing-library/react';

const live = new Set<StubIntersectionObserver>();

export class StubIntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds = [];
  private readonly callback: IntersectionObserverCallback;
  private readonly targets = new Set<Element>();

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    this.targets.add(target);
    live.add(this);
  }

  unobserve(target: Element) {
    this.targets.delete(target);
  }

  disconnect() {
    this.targets.clear();
    live.delete(this);
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  fire() {
    const entries = [...this.targets].map(
      (target) =>
        ({ target, isIntersecting: true }) as IntersectionObserverEntry,
    );
    if (entries.length > 0)
      this.callback(entries, this as unknown as IntersectionObserver);
  }
}

export function intersectAll() {
  act(() => {
    for (const observer of [...live]) observer.fire();
  });
}
