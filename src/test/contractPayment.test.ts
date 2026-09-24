import { describe, expect, it } from "vitest";
import { contractGrossForViews } from "@/lib/contractPayment";

describe("Royco Nano contract payment scale", () => {
  it.each([
    [999, 0], [1_000, 5_000], [4_999, 5_000], [5_000, 7_000],
    [10_000, 12_000], [20_000, 17_000], [30_000, 25_000], [50_000, 30_000],
    [70_000, 35_000], [100_000, 40_000], [200_000, 45_000], [300_000, 50_000],
    [500_000, 55_000], [600_000, 60_000], [700_000, 65_000], [800_000, 70_000],
    [900_000, 75_000], [1_500_000, 75_000],
  ])("maps %i views to KES %i", (views, gross) => {
    expect(contractGrossForViews(views)).toBe(gross);
  });
});