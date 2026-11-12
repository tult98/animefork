export const FINISHED_LABEL = 'Đã xem xong';

const SECONDS_PER_MINUTE = 60;

// Whole minutes, and never 0 for a clip that has any length, so a short episode does not read "0 / 0".
export function formatWatched(positionS: number, durationS: number): string {
  const total = Math.max(1, Math.round(durationS / SECONDS_PER_MINUTE));
  const seen = Math.min(
    total,
    Math.max(0, Math.round(positionS / SECONDS_PER_MINUTE)),
  );
  return `${seen} / ${total} phút`;
}
