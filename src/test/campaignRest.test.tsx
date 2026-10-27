import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ChannelMix } from "@/components/report/ChannelMix";
import { TopPosts } from "@/components/report/TopPosts";
import { AgencyTeamPicker } from "@/components/AgencyTeamPicker";
import { pickTopPosts } from "@/lib/topPosts";
import type { ChannelRow } from "@/lib/channelMix";
import type { MetricSnapshot } from "@/lib/metrics";

// The picture is fetched by an edge function; a stand-in is enough to see where it goes.
vi.mock("@/components/PostThumb", () => ({
  PostThumb: ({ postId }: { postId?: string }) => <div data-testid="thumb" data-post={postId} />,
}));

const team = vi.hoisted(() => ({
  assigned: [] as { id: string; user_id: string; team_role: string }[],
  agency: [
    { id: "u1", full_name: "Wanjiku Kamau", email: "wanjiku@agency.test" },
    { id: "u2", full_name: "Brian Mwangi", email: "brian@agency.test" },
  ],
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: async () => ({ data: team.assigned }) }) }),
    rpc: async (name: string) => ({ data: name === "get_agency_team" ? team.agency : [] }),
  },
}));

describe("ChannelMix", () => {
  const rows: ChannelRow[] = [
    { key: "instagram", label: "Instagram", posts: 1, creators: 1, views: 4000, reach: 2720, followers: 8000, share: 0.69, reachEstimated: true },
    { key: "tiktok", label: "TikTok", posts: 3, creators: 2, views: 1800, reach: 1000, followers: 1500, share: 0.31, reachEstimated: false },
  ];

  it("lists each platform with its figures and its part of the views", () => {
    render(<ChannelMix rows={rows} loaded />);
    expect(screen.getByText("Channel mix")).toBeInTheDocument();
    expect(screen.getByText("Instagram")).toBeInTheDocument();
    expect(screen.getByText("1 post · 1 creator · 69% of views")).toBeInTheDocument();
    expect(screen.getByText("3 posts · 2 creators · 31% of views")).toBeInTheDocument();
    for (const figure of ["4K", "2.7K", "8K", "1.8K", "1K", "1.5K"]) expect(screen.getByText(figure)).toBeInTheDocument();
  });

  it("marks reach that was filled in, and says what est. means", () => {
    render(<ChannelMix rows={rows} loaded />);
    const reach = within(screen.getByText("2.7K").closest("div")!).getByText("Reach");
    expect(within(reach).getByText("est.")).toBeInTheDocument();
    expect(screen.getAllByText("est.")).toHaveLength(1);
    expect(screen.getByText(/est\. marks reach we fill in from views/)).toBeInTheDocument();
  });

  it("says how followers are counted", () => {
    render(<ChannelMix rows={[rows[1]]} loaded />);
    expect(screen.getByText(/Followers are counted under each creator's main platform/)).toBeInTheDocument();
    expect(screen.queryByText(/est\. marks reach/)).not.toBeInTheDocument();
  });

  it("shows dashes for views and reach until the numbers have loaded", () => {
    render(<ChannelMix rows={rows} loaded={false} />);
    expect(screen.getAllByText("—")).toHaveLength(4); // views and reach, for two platforms
    expect(screen.queryByText(/of views/)).not.toBeInTheDocument();
    expect(screen.getByText("8K")).toBeInTheDocument(); // followers don't depend on the readings
  });

  it("renders nothing when there are no posts", () => {
    const { container } = render(<ChannelMix rows={[]} loaded />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("TopPosts", () => {
  const person = (id: string, name: string, handle: string, platform: string) => ({
    id, post_url: `https://example.com/${id}`, platform, influencers: { full_name: name, handle },
  });
  const posts = [person("a", "Wanjiku Kamau", "@wanjiku.k", "tiktok"), person("b", "Amani Otieno", "amani.o", "instagram"), person("c", "Brian Mwangi", "brianm", "tiktok")];
  const base = { views: 0, likes: 0, comments: 0, shares: 0, saves: 0 };
  const metrics = (shares?: boolean) => new Map<string, MetricSnapshot>([
    ["a", { ...base, views: 1_200_000, likes: 12_000 }],
    ["b", { ...base, views: 400_000, likes: 80_000 }],
    ["c", { ...base, views: 300_000, shares: 20_000, saves: 20_000, ...(shares ? { estimated_fields: { shares: true } } : {}) }],
  ]);

  it("shows the three picks as links to the posts, each under its own heading", () => {
    render(<TopPosts picks={pickTopPosts(posts, metrics())} />);
    expect(screen.getByText("Top posts")).toBeInTheDocument();
    const tiles = screen.getAllByRole("link");
    expect(tiles.map((t) => t.getAttribute("href"))).toEqual(["https://example.com/a", "https://example.com/b", "https://example.com/c"]);
    expect(tiles.every((t) => t.getAttribute("target") === "_blank")).toBe(true);
    expect(within(tiles[0]).getByText("Most viewed")).toBeInTheDocument();
    expect(within(tiles[1]).getByText("Highest engagement")).toBeInTheDocument();
    expect(within(tiles[2]).getByText("Strongest intent")).toBeInTheDocument();
    expect(screen.getAllByTestId("thumb").map((t) => t.getAttribute("data-post"))).toEqual(["a", "b", "c"]);
  });

  it("names the creator and leads with the figure that won the pick", () => {
    render(<TopPosts picks={pickTopPosts(posts, metrics())} />);
    const [views, engagement, intent] = screen.getAllByRole("link");
    expect(within(views).getByText("Wanjiku Kamau")).toBeInTheDocument();
    expect(within(views).getByText("@wanjiku.k · TikTok")).toBeInTheDocument();
    expect(within(views).getByText("views")).toBeInTheDocument();
    expect(within(engagement).getByText("@amani.o · Instagram")).toBeInTheDocument();
    expect(within(engagement).getAllByText("20.0%")).toHaveLength(2); // the lead figure, and again in the list below it
    expect(within(engagement).getByText("engagement rate")).toBeInTheDocument();
    expect(within(intent).getByText("40K")).toBeInTheDocument();
    expect(within(intent).getByText("saves and shares")).toBeInTheDocument();
  });

  it("lists the post's figures", () => {
    render(<TopPosts picks={pickTopPosts(posts, metrics())} />);
    const tile = screen.getAllByRole("link")[0];
    const dl = tile.querySelector("dl")!;
    expect(within(dl).getAllByRole("term").map((t) => t.textContent)).toEqual(["Views", "Likes", "Comments", "Shares", "Saves", "Engagement"]);
    expect(within(dl).getAllByRole("definition").map((d) => d.textContent)).toEqual(["1.2M", "12K", "0", "0", "0", "1.0%"]);
  });

  it("marks the figures that were filled in", () => {
    render(<TopPosts picks={pickTopPosts(posts, metrics(true))} />);
    const [views, , intent] = screen.getAllByRole("link");
    expect(within(within(intent).getByText("Shares")).getByText("est.")).toBeInTheDocument();
    expect(within(within(intent).getByText("Engagement")).getByText("est.")).toBeInTheDocument();
    expect(within(within(intent).getByText("Views", { selector: "dt" })).queryByText("est.")).not.toBeInTheDocument();
    expect(within(views).queryByText("est.")).not.toBeInTheDocument();
  });

  it("renders nothing when there are no picks", () => {
    const { container } = render(<TopPosts picks={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("AgencyTeamPicker", () => {
  beforeEach(() => {
    team.assigned = [{ id: "r1", user_id: "u1", team_role: "lead" }];
  });

  it("keeps its boxed look, title and note by default", async () => {
    const { container } = render(<AgencyTeamPicker scope={{ type: "client", client_id: "k1" }} title="Who from the agency runs this account" />);
    expect(await screen.findByText("Wanjiku Kamau")).toBeInTheDocument();
    expect(screen.getByText("Who from the agency runs this account")).toBeInTheDocument();
    expect(screen.getByText(/clients never see this/)).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("border", "rounded-md");
  });

  it("leaves the box, title and note to the card around it in the panel look", async () => {
    const { container } = render(<AgencyTeamPicker scope={{ type: "campaign", campaign_id: "c1" }} title="Who's running this campaign" variant="panel" />);
    expect(await screen.findByText("Wanjiku Kamau")).toBeInTheDocument();
    expect(screen.queryByText("Who's running this campaign")).not.toBeInTheDocument();
    expect(screen.queryByText(/clients never see this/)).not.toBeInTheDocument();
    expect(container.firstElementChild).not.toHaveClass("border");
  });

  it("lists the team first, with initials, and the add row after it", async () => {
    render(<AgencyTeamPicker scope={{ type: "campaign", campaign_id: "c1" }} variant="panel" />);
    const name = await screen.findByText("Wanjiku Kamau");
    expect(screen.getByText("WK")).toBeInTheDocument();
    expect(screen.getByText("wanjiku@agency.test")).toBeInTheDocument();
    const assign = screen.getByRole("button", { name: "Assign" });
    expect(assign).toBeDisabled();
    expect(name.compareDocumentPosition(assign) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove teammate" })).toBeInTheDocument();
  });

  it("says when nobody is assigned yet", async () => {
    team.assigned = [];
    render(<AgencyTeamPicker scope={{ type: "campaign", campaign_id: "c1" }} variant="panel" />);
    expect(await screen.findByText("No teammates assigned yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assign" })).toBeInTheDocument();
  });
});
