import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { TopPosts } from "@/components/report/TopPosts";
import type { TopPick } from "@/lib/topPosts";

const thumb = vi.hoisted(() => vi.fn());
vi.mock("@/components/PostThumb", () => ({
  PostThumb: (props: { postId?: string | null }) => {
    thumb(props);
    return null;
  },
}));

const pick: TopPick = {
  kind: "views",
  post: { id: "p1", post_url: "https://example.test/p1", platform: "tiktok", influencers: { full_name: "Acme", handle: "acme" } },
  metrics: { views: 500, likes: 10, comments: null, shares: null, saves: null },
  interactions: 10,
  rate: 2,
  intent: 0,
};

describe("TopPosts", () => {
  const figure = (label: string) => within(screen.getByText(label).parentElement as HTMLElement);

  it("shows a dash, not 0, for a figure the platform did not report", () => {
    render(<TopPosts picks={[pick]} />);
    expect(figure("Shares").getByText("—")).toBeTruthy();
    expect(figure("Saves").getByText("—")).toBeTruthy();
    expect(figure("Likes").getByText("10")).toBeTruthy();
  });

  it("shows a dash for the engagement figure when no reactions were reported", () => {
    render(<TopPosts picks={[{ ...pick, interactions: 0, rate: 0, metrics: { views: 500, likes: null, comments: null, shares: null, saves: null } }]} />);
    expect(figure("Engagement").getByText("—")).toBeTruthy();
  });

  it("asks for a stored thumbnail by id only for campaign posts, not brand posts", () => {
    thumb.mockClear();
    render(<TopPosts picks={[pick]} brandPosts />);
    expect(thumb.mock.calls[0][0].postId).toBeNull();
    thumb.mockClear();
    render(<TopPosts picks={[pick]} />);
    expect(thumb.mock.calls[0][0].postId).toBe("p1");
  });
});
