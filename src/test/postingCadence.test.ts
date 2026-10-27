import { describe, expect, it } from "vitest";
import { buildCadence, slotLabel } from "@/lib/postingCadence";

// Dates are built in local time, which is what the heatmap reads (the viewer's own day and hour).
const at = (month: number, day: number, hour: number, minute = 0) => new Date(2026, month - 1, day, hour, minute).toISOString();
const post = (id: string, posted_at: string | null, created_at: string | null = null) => ({ id, posted_at, created_at });
const reading = (views: number) => ({ views });

describe("buildCadence", () => {
  // 13 July 2026 is a Monday; 19 July is the Sunday after it.
  const posts = [
    post("a", at(7, 13, 18, 5)),
    post("b", at(7, 13, 18, 40)),
    post("c", at(7, 19, 8)),
    post("d", at(7, 14, 9)),
  ];
  const metrics = new Map([["a", reading(1000)], ["b", reading(500)], ["c", reading(200)], ["d", reading(50)]]);

  it("counts the posts and views in each weekday and hour, with Monday first", () => {
    const { cells } = buildCadence(posts, metrics);
    const cell = (day: number, hour: number) => cells.find((c) => c.day === day && c.hour === hour);
    expect(cell(0, 18)).toMatchObject({ posts: 2, views: 1500 });
    expect(cell(1, 9)).toMatchObject({ posts: 1, views: 50 });
    expect(cell(6, 8)).toMatchObject({ posts: 1, views: 200 });
    expect(cells).toHaveLength(3);
  });

  it("finds the slot that delivered the most views", () => {
    expect(buildCadence(posts, metrics).best).toMatchObject({ day: 0, hour: 18, views: 1500, posts: 2 });
  });

  it("keeps the first slot when two deliver the same views", () => {
    const tie = buildCadence([post("x", at(7, 14, 9)), post("y", at(7, 15, 10))], new Map([["x", reading(300)], ["y", reading(300)]]));
    expect(tie.best).toMatchObject({ day: 1, hour: 9 });
  });

  it("shades the busiest slot fully and gives every other slot with views at least a faint colour", () => {
    const { cells } = buildCadence(posts, metrics);
    const level = (day: number, hour: number) => cells.find((c) => c.day === day && c.hour === hour)!.level;
    expect(level(0, 18)).toBe(1);
    expect(level(6, 8)).toBeCloseTo(200 / 1500);
    expect(level(1, 9)).toBe(0.08); // 50 of 1,500 would be nearly invisible
  });

  it("uses the day the post was added when it has no publish date", () => {
    const { cells } = buildCadence([post("a", null, at(7, 15, 21))], new Map([["a", reading(10)]]));
    expect(cells).toEqual([expect.objectContaining({ day: 2, hour: 21, posts: 1, views: 10 })]);
  });

  it("skips posts with no date at all", () => {
    const { cells } = buildCadence([post("a", null, null), post("b", at(7, 13, 6))], new Map([["a", reading(5)], ["b", reading(7)]]));
    expect(cells).toHaveLength(1);
    expect(cells[0]).toMatchObject({ day: 0, hour: 6, views: 7 });
  });

  it("counts a post nobody has read yet, and has no peak while there are no views", () => {
    const { cells, best } = buildCadence([post("a", at(7, 13, 6))], new Map());
    expect(cells).toEqual([expect.objectContaining({ posts: 1, views: 0 })]);
    expect(best).toBeNull();
  });

  it("returns no cells when no post has a date", () => {
    expect(buildCadence([post("a", null, null)], new Map()).cells).toEqual([]);
    expect(buildCadence([], new Map()).cells).toEqual([]);
  });
});

describe("slotLabel", () => {
  it("writes the hour the way people say it", () => {
    expect([0, 3, 9, 12, 15, 18, 23].map(slotLabel)).toEqual(["12am", "3am", "9am", "12pm", "3pm", "6pm", "11pm"]);
  });
});
