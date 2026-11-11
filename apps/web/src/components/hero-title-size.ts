export interface HeroTitleSize {
  desktop: number;
  phone: number;
}

// Tier edges were measured with the real long names: each tier keeps its longest name within
// three lines (desktop: 576px of text in the 640px body, phone: 326px at 390px wide). Past the
// last edge the floor size applies and the name wraps to more lines.
const TIERS: readonly (HeroTitleSize & { maxLength: number })[] = [
  { maxLength: 24, desktop: 56, phone: 36 },
  { maxLength: 48, desktop: 44, phone: 28 },
  { maxLength: 72, desktop: 36, phone: 22 },
  { maxLength: 96, desktop: 28, phone: 22 },
  { maxLength: Infinity, desktop: 28, phone: 22 },
];

export function heroTitleSize(name: string): HeroTitleSize {
  const length = [...name].length;
  const { desktop, phone } = TIERS.find((tier) => length <= tier.maxLength)!;
  return { desktop, phone };
}
