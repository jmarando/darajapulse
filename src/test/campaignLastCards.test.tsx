import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { AddUpBars } from "@/components/report/ReportOverview";
import { EngagementMix } from "@/components/report/EngagementMix";
import { PostingCadence } from "@/components/report/PostingCadence";
import { CreatorLeaderboard } from "@/components/report/CreatorLeaderboard";
import { CostEfficiency } from "@/components/report/CostEfficiency";
import { AudienceCard } from "@/components/report/AudienceCard";
import { buildEngagementMix } from "@/lib/engagementMix";
import { buildCadence } from "@/lib/postingCadence";
import { buildLeaderboard } from "@/lib/creatorLeaderboard";
import { buildCostEfficiency } from "@/lib/costEfficiency";
import { buildAudience } from "@/lib/audience";

describe("AddUpBars", () => {
  const items = [{ key: "a", label: "Shares", views: 37_000, share: 0.07, estimated: true }, { key: "b", label: "Likes", views: 483_000, share: 0.84 }];

  it("names the unit in the tooltip, views unless told otherwise", () => {
    const { container, rerender } = render(<AddUpBars items={items} total={520_000} />);
    expect(container.querySelector('[title^="Shares:"]')).toHaveAttribute("title", "Shares: 37K views, 7% of the total");
    rerender(<AddUpBars items={items} total={520_000} unit="interactions" />);
    expect(container.querySelector('[title^="Shares:"]')).toHaveAttribute("title", "Shares: 37K interactions, 7% of the total");
  });

  it("tags a part that was filled in, and no other", () => {
    render(<AddUpBars items={items} total={520_000} />);
    expect(screen.getAllByText("est.")).toHaveLength(1);
    expect(within(screen.getByText("Shares")).getByText("est.")).toBeInTheDocument();
  });
});

describe("EngagementMix", () => {
  const totals = { likes: 483_000, comments: 19_000, shares: 37_000, saves: 33_000 };

  it("shows each kind of interaction adding up to the total", () => {
    render(<EngagementMix mix={buildEngagementMix(totals, {})} />);
    expect(screen.getByText("What drove the engagement")).toBeInTheDocument();
    expect(screen.getByText("572K interactions, by kind")).toBeInTheDocument();
    for (const label of ["Likes", "Comments", "Shares", "Saves"]) expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText("+483K")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
  });

  it("leads with how much of it is saves and shares", () => {
    render(<EngagementMix mix={buildEngagementMix(totals, {})} />);
    expect(screen.getByText("12%")).toBeInTheDocument();
    expect(screen.getByText("saves and shares")).toBeInTheDocument();
    expect(screen.getByText(/Saves and shares are 12% of all interactions/)).toBeInTheDocument();
  });

  it("marks the figures that were filled in and says what est. means", () => {
    render(<EngagementMix mix={buildEngagementMix(totals, { shares: true })} />);
    expect(within(screen.getByText("Shares")).getByText("est.")).toBeInTheDocument();
    expect(screen.getByText(/est\. marks figures we fill in from views and likes/)).toBeInTheDocument();
  });

  it("says nothing about estimates when every figure was reported", () => {
    render(<EngagementMix mix={buildEngagementMix(totals, {})} />);
    expect(screen.queryByText("est.")).not.toBeInTheDocument();
    expect(screen.queryByText(/est\. marks figures/)).not.toBeInTheDocument();
  });

  it("renders nothing without interactions", () => {
    const { container } = render(<EngagementMix mix={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("PostingCadence", () => {
  const at = (day: number, hour: number) => new Date(2026, 6, day, hour).toISOString();
  const posts = [{ id: "a", posted_at: at(13, 18) }, { id: "b", posted_at: at(13, 18) }, { id: "c", posted_at: at(19, 8) }];
  const metrics = new Map([["a", { views: 1000 }], ["b", { views: 500 }], ["c", { views: 200 }]]);

  it("reads out the peak slot", () => {
    render(<PostingCadence cadence={buildCadence(posts, metrics)} />);
    expect(screen.getByText("When the posts went live")).toBeInTheDocument();
    expect(screen.getByText("Mon 6pm")).toBeInTheDocument();
    expect(screen.getByText(/peak slot · 1\.5K views/)).toBeInTheDocument();
  });

  it("draws a grid of weekdays by hours, with a plain summary for screen readers", () => {
    render(<PostingCadence cadence={buildCadence(posts, metrics)} />);
    const grid = screen.getByRole("img");
    expect(grid).toHaveAttribute("aria-label", "Views by weekday and hour of posting. The peak slot is Mon 6pm, with 1.5K views.");
    for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) expect(within(grid).getAllByText(day).length).toBeGreaterThan(0);
    for (const hour of ["12am", "3am", "6am", "9am", "12pm", "3pm", "6pm", "9pm"]) expect(within(grid).getAllByText(hour).length).toBeGreaterThan(0);
  });

  it("gives each slot with posts a tooltip", () => {
    const { container } = render(<PostingCadence cadence={buildCadence(posts, metrics)} />);
    expect(container.querySelector('[title="Mon 6pm · 2 posts · 1.5K views"]')).not.toBeNull();
    expect(container.querySelector('[title="Sun 8am · 1 post · 200 views"]')).not.toBeNull();
  });

  it("explains the shading", () => {
    render(<PostingCadence cadence={buildCadence(posts, metrics)} />);
    expect(screen.getByText("Fewer views")).toBeInTheDocument();
    expect(screen.getByText("More views")).toBeInTheDocument();
  });

  it("drops the peak readout when nothing has views yet", () => {
    render(<PostingCadence cadence={buildCadence([{ id: "a", posted_at: at(13, 18) }], new Map())} />);
    expect(screen.queryByText(/peak slot/)).not.toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", "Views by weekday and hour of posting.");
  });

  it("renders nothing when no post has a date", () => {
    const { container } = render(<PostingCadence cadence={buildCadence([{ id: "a", posted_at: null }], new Map())} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("CreatorLeaderboard", () => {
  const person = (id: string, name: string, handle: string, follower_count: number | null) => ({ id: `ci-${id}`, influencer_id: id, influencers: { full_name: name, handle, follower_count } });
  const stats = (views: number, extra: Partial<Record<"likes" | "comments" | "shares" | "saves" | "posts", number>> = {}) => ({ views, likes: 0, comments: 0, shares: 0, saves: 0, posts: 1, ...extra });
  const roster = [person("a", "Amani", "@amani.o", 100_000), person("b", "Baraka", "baraka", 2_000_000), person("c", "Chebet", "chebet.k", null)];
  const byInfluencer = new Map([
    ["a", stats(250_000, { likes: 20_000, posts: 2 })],
    ["b", stats(1_000_000, { likes: 60_000, comments: 4_000, shares: 6_000, saves: 10_000, posts: 3 })],
    ["c", stats(40_000, { likes: 1_000 })],
  ]);
  const rows = buildLeaderboard(roster, byInfluencer, 1_290_000);

  it("ranks the creators with their views, engagement rate and reach efficiency", () => {
    render(<CreatorLeaderboard rows={rows} />);
    expect(screen.getByText("Creator leaderboard")).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText("Baraka")).toBeInTheDocument();
    expect(within(items[1]).getByText("Amani")).toBeInTheDocument();
    expect(within(items[2]).getByText("Chebet")).toBeInTheDocument();
    expect(within(items[0]).getByText("@baraka · 3 posts · 78% of views")).toBeInTheDocument();
    expect(within(items[0]).getByText("1M")).toBeInTheDocument();
    expect(within(items[0]).getByText("8.0%")).toBeInTheDocument();
    expect(within(items[0]).getByText("50%")).toBeInTheDocument();
    expect(within(items[1]).getByText("250%")).toBeInTheDocument();
  });

  it("shows a dash for reach efficiency when the creator has no follower count", () => {
    render(<CreatorLeaderboard rows={rows} />);
    const chebet = screen.getAllByRole("listitem")[2];
    expect(within(within(chebet).getByText("Reach efficiency").closest("div")!).getByText("—")).toBeInTheDocument();
  });

  it("explains reach efficiency", () => {
    render(<CreatorLeaderboard rows={rows} />);
    expect(screen.getByText(/Reach efficiency is views divided by followers/)).toBeInTheDocument();
  });

  it("says when the engagement rate includes figures we filled in", () => {
    const { rerender } = render(<CreatorLeaderboard rows={rows} />);
    expect(screen.queryByText(/estimated from views and likes/)).not.toBeInTheDocument();
    rerender(<CreatorLeaderboard rows={rows} estimated />);
    expect(screen.getByText(/The engagement rate includes shares and saves estimated from views and likes/)).toBeInTheDocument();
  });

  it("renders nothing without creators", () => {
    const { container } = render(<CreatorLeaderboard rows={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("CostEfficiency", () => {
  const person = (id: string, name: string, handle: string, fee_kes: number | null) => ({ id: `ci-${id}`, influencer_id: id, fee_kes, influencers: { full_name: name, handle } });
  const stats = (views: number, extra: Partial<Record<"likes" | "comments" | "shares" | "saves" | "posts", number>> = {}) => ({ views, likes: 0, comments: 0, shares: 0, saves: 0, posts: 1, ...extra });
  const roster = [person("a", "Amani", "@amani.o", 80_000), person("b", "Baraka", "baraka", 120_000), person("c", "Chebet", "chebet.k", 0)];
  const byInfluencer = new Map([
    ["a", stats(400_000, { likes: 20_000, comments: 2_000, shares: 2_000, saves: 1_000 })],
    ["b", stats(2_400_000, { likes: 100_000 })],
    ["c", stats(0)],
  ]);
  const rows = buildCostEfficiency(roster, byInfluencer, 500_000);

  it("lists the cheapest creators first with what each cost and delivered", () => {
    render(<CostEfficiency rows={rows} />);
    expect(screen.getByText("Cost efficiency")).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]).getByText("Baraka")).toBeInTheDocument();
    expect(within(items[1]).getByText("Amani")).toBeInTheDocument();
    expect(within(items[1]).getByText("KES 80K")).toBeInTheDocument();
    expect(within(items[1]).getByText("400K")).toBeInTheDocument();
    expect(within(items[1]).getByText("KES 0.20")).toBeInTheDocument(); // cost per view
    expect(within(items[1]).getByText("KES 200")).toBeInTheDocument(); // per 1,000 views
    expect(within(items[1]).getByText("KES 3.20")).toBeInTheDocument(); // per interaction
  });

  it("uses plain names for the three costs", () => {
    render(<CostEfficiency rows={rows} />);
    const first = screen.getAllByRole("listitem")[0];
    for (const label of ["Fee", "Views", "Cost per view", "Per 1,000 views", "Per interaction"]) expect(within(first).getByText(label)).toBeInTheDocument();
  });

  it("shows dashes for a creator with no views", () => {
    render(<CostEfficiency rows={rows} />);
    const chebet = screen.getAllByRole("listitem")[2];
    expect(within(chebet).getAllByText("—")).toHaveLength(3);
  });

  it("marks a fee that was worked out from the budget and says how", () => {
    render(<CostEfficiency rows={rows} />);
    const chebet = screen.getAllByRole("listitem")[2];
    expect(within(within(chebet).getByText("Fee")).getByText("est.")).toBeInTheDocument();
    expect(screen.getAllByText("est.")).toHaveLength(1);
    expect(screen.getByText(/Fees marked est\. aren't recorded, so the budget is split evenly/)).toBeInTheDocument();
  });

  it("leaves the budget note out when every fee is recorded", () => {
    render(<CostEfficiency rows={rows.filter((r) => !r.feeFromBudget)} />);
    expect(screen.queryByText(/budget is split evenly/)).not.toBeInTheDocument();
  });

  it("says when the cost per interaction includes figures we filled in", () => {
    render(<CostEfficiency rows={rows} estimated />);
    expect(screen.getByText(/Cost per interaction counts shares and saves estimated from views and likes/)).toBeInTheDocument();
  });

  it("renders nothing without creators", () => {
    const { container } = render(<CostEfficiency rows={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("AudienceCard", () => {
  const creator = (extra: Record<string, unknown> = {}) => ({
    follower_count: 100_000,
    audience_kenya_pct: 80,
    languages: ["English", "Kiswahili"],
    audience_age_breakdown: { "18-24": 50, "25-34": 50 },
    audience_gender_breakdown: { female: 60, male: 40 },
    audience_top_cities: [{ city: "Nairobi", pct: 70 }, { city: "Mombasa", pct: 30 }],
    demo_source: "measured",
    ...extra,
  });

  it("says whether the audience was measured or estimated", () => {
    const { rerender } = render(<AudienceCard audience={buildAudience([creator(), creator()])} creators={2} />);
    expect(screen.getByText("Measured")).toBeInTheDocument();
    rerender(<AudienceCard audience={buildAudience([creator({ demo_source: "modelled" }), creator()])} creators={2} />);
    expect(screen.getByText("Estimated")).toBeInTheDocument();
  });

  it("explains how many creators it rests on", () => {
    render(<AudienceCard audience={buildAudience([creator({ demo_source: "modelled" }), creator(), creator({ follower_count: 0 })])} creators={3} />);
    expect(screen.getByText(/2 of 3 creators measured from their own account stats/)).toBeInTheDocument();
    expect(screen.getByText(/1 estimated from platform, category, location and audience size/)).toBeInTheDocument();
    expect(screen.getByText(/1 without follower counts weighted at the roster average/)).toBeInTheDocument();
  });

  it("splits the audience between Kenya and the rest of the world", () => {
    render(<AudienceCard audience={buildAudience([creator(), creator()])} creators={2} />);
    expect(screen.getByText("Who we reached")).toBeInTheDocument();
    expect(screen.getByText("Kenya")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("Diaspora and rest of world")).toBeInTheDocument();
    expect(screen.getByText("20%")).toBeInTheDocument();
  });

  it("shows the combined followers, the creators and the languages", () => {
    render(<AudienceCard audience={buildAudience([creator(), creator()])} creators={2} />);
    expect(screen.getByText("Combined followers")).toBeInTheDocument();
    expect(screen.getByText("200K")).toBeInTheDocument();
    expect(screen.getByText("English")).toBeInTheDocument();
    expect(screen.getByText("Kiswahili")).toBeInTheDocument();
  });

  it("lists the age groups, the genders and the top cities", () => {
    render(<AudienceCard audience={buildAudience([creator(), creator()])} creators={2} />);
    for (const heading of ["Age", "Gender", "Top cities"]) expect(screen.getByText(heading)).toBeInTheDocument();
    expect(screen.getByText("18-24")).toBeInTheDocument();
    expect(screen.getAllByText("50%")).toHaveLength(2);
    expect(screen.getByText("female")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("Nairobi")).toBeInTheDocument();
    expect(screen.getByText("70%")).toBeInTheDocument();
  });

  it("shows a dash instead of cities and languages when there are none", () => {
    render(<AudienceCard audience={buildAudience([creator({ languages: [], audience_top_cities: [] })])} creators={1} />);
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });
});
