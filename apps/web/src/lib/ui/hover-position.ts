export const HOVER_WIDTH = 340;
export const HOVER_MARGIN = 8;
const HOVER_LIFT = 32;

export interface Anchor {
  left: number;
  top: number;
  width: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export function hoverPosition(
  anchor: Anchor,
  viewport: Viewport,
  height = 0,
): { left: number; top: number } {
  const maxLeft = viewport.width - HOVER_WIDTH - HOVER_MARGIN;
  const left = Math.max(
    HOVER_MARGIN,
    Math.min(maxLeft, anchor.left + anchor.width / 2 - HOVER_WIDTH / 2),
  );
  const maxTop = viewport.height - height - HOVER_MARGIN;
  const top = Math.max(HOVER_MARGIN, Math.min(maxTop, anchor.top - HOVER_LIFT));
  return { left: Math.round(left), top: Math.round(top) };
}
