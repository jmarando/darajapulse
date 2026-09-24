export const contractGrossForViews = (views: number) => {
  if (views >= 900_000) return 75_000;
  if (views >= 800_000) return 70_000;
  if (views >= 700_000) return 65_000;
  if (views >= 600_000) return 60_000;
  if (views >= 500_000) return 55_000;
  if (views >= 300_000) return 50_000;
  if (views >= 200_000) return 45_000;
  if (views >= 100_000) return 40_000;
  if (views >= 70_000) return 35_000;
  if (views >= 50_000) return 30_000;
  if (views >= 30_000) return 25_000;
  if (views >= 20_000) return 17_000;
  if (views >= 10_000) return 12_000;
  if (views >= 5_000) return 7_000;
  if (views >= 1_000) return 5_000;
  return 0;
};