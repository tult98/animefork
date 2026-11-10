export interface ScrollMetrics {
  scrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
}

export const SCROLL_STEP = 0.9;

export function scrollEdges({
  scrollLeft,
  clientWidth,
  scrollWidth,
}: ScrollMetrics) {
  return {
    atStart: scrollLeft <= 1,
    atEnd: scrollLeft + clientWidth >= scrollWidth - 1,
  };
}

export function scrollDistance(clientWidth: number, direction: -1 | 1) {
  return direction * clientWidth * SCROLL_STEP;
}
