const COMPLETED_RATIO = 0.9;
const COMPLETED_REMAINING_S = 90;

export function clampPosition(positionS: number, durationS: number): number {
  return Math.min(positionS, durationS);
}

// Players report the last seconds unreliably, so an episode counts as watched before the credits finish.
export function isCompleted(positionS: number, durationS: number): boolean {
  return (
    positionS / durationS >= COMPLETED_RATIO ||
    durationS - positionS < COMPLETED_REMAINING_S
  );
}

export interface WatchProgressRow {
  userId: string;
  slug: string;
  episodeId: string;
  positionS: number;
  durationS: number;
  completed: boolean;
  titleName: string;
  image: string;
  episodeLabel: string;
  seasonSlug: string | null;
  updatedAt: Date;
}
