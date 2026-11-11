const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;
const MONTH_DAYS = 30;
const YEAR_DAYS = 365;

export function formatCountdown(releasesAt: number, now: number): string {
  const days = Math.floor((releasesAt - now) / DAY_MS);
  if (days < 1) return 'Hôm nay';
  if (days < WEEK_DAYS) return `Còn ${days} ngày`;
  if (days < MONTH_DAYS) return `Còn ${Math.floor(days / WEEK_DAYS)} tuần`;
  if (days < YEAR_DAYS) return `Còn ${Math.floor(days / MONTH_DAYS)} tháng`;
  return String(new Date(releasesAt).getFullYear());
}

export function upcomingTag(
  title: { releasesAt?: number; year?: number },
  now: number,
): string | null {
  if (title.releasesAt !== undefined)
    return formatCountdown(title.releasesAt, now);
  return title.year === undefined ? null : String(title.year);
}
