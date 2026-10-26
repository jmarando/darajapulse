import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReportOverview } from "@/components/report/ReportOverview";
import type { ReportPost } from "@/lib/reportInsights";

const NOW = Date.parse("2026-10-23T09:00:00Z");
const at = (hoursAgo: number) => new Date(NOW - hoursAgo * 3600_000).toISOString();
const post = (id: string, platform: string, creator: string, views: number, hoursAgo: number): ReportPost => ({
  id,
  platform,
  influencer_id: creator,
  creator,
  history: [{ captured_at: at(hoursAgo + 24 * 10), views: Math.round(views * 0.6) }, { captured_at: at(hoursAgo), views }],
});

const posts = [
  post("a", "tiktok", "Amani Eats", 2_000_000, 2),
  post("b", "facebook", "Baraka Cooks", 3_000_000, 2),
  post("c", "tiktok", "Chebet Kitchen", 500_000, 2),
  post("d", "instagram", "Dalia", 300_000, 24 * 7),
];

describe("ReportOverview", () => {
  it("shows the agency the paused refresh, stale platforms and the headline story", () => {
    render(
      <ReportOverview
        posts={posts}
        totals={{ likes: 800_000, comments: 25_000, shares: 16_000 }}
        creators={4}
        roster={4}
        audience={{ measured: 0, creators: 4 }}
        view="agency"
        campaignStatus="draft"
        now={NOW}
      />,
    );
    expect(screen.getByText("Data health")).toBeInTheDocument();
    expect(screen.getByText("Scheduled refresh is paused")).toBeInTheDocument();
    expect(screen.getByText("Instagram figures are 7 days old")).toBeInTheDocument();
    expect(screen.getByText("How the views add up")).toBeInTheDocument();
    expect(screen.getByText("Pattern found")).toBeInTheDocument();
    // Headline, waterfall total and the weekly readout all carry the same figure.
    expect(screen.getAllByText("5.8M")).toHaveLength(3);
    expect(screen.getByText("3 of 4 posts read in the last 36 hours")).toBeInTheDocument();
  });

  it("never tells a client about internal refresh settings", () => {
    render(<ReportOverview posts={posts} totals={{ likes: 1, comments: 1, shares: 1 }} creators={4} view="client" campaignStatus="draft" now={NOW} />);
    expect(screen.getByText("About these numbers")).toBeInTheDocument();
    expect(screen.queryByText("Scheduled refresh is paused")).not.toBeInTheDocument();
  });

  it("renders nothing for a campaign without posts", () => {
    const { container } = render(<ReportOverview posts={[]} totals={{ likes: 0, comments: 0, shares: 0 }} creators={0} view="client" now={NOW} />);
    expect(container).toBeEmptyDOMElement();
  });
});
