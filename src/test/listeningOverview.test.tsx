import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ListeningOverview from "@/components/listening/ListeningOverview";
import { dayPeriod, lastDays, periodLabel, previousPeriod, type ListeningMention, type ListeningTopic } from "@/lib/listening";

const period = lastDays(30);
const before = previousPeriod(period);

const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3600_000).toISOString();

const topic = (id: string, kind: ListeningTopic["kind"], label: string, extra: Partial<ListeningTopic> = {}): ListeningTopic => ({
  id, client_id: "c1", kind, label, query: label, exclude_terms: [], active: true, last_scanned_at: at(1), last_note: null,
  created_at: "2026-10-01T00:00:00Z", ...extra,
});

let n = 0;
const mention = (topic_id: string, extra: Partial<ListeningMention> = {}): ListeningMention => ({
  id: `m${++n}`, topic_id, source: "tiktok", url: `https://x/${n}`, title: `Post ${n}`, snippet: null, author: "@someone",
  reach: 1_000, shares: 10, published_at: at(2), found_at: at(2), sentiment: "positive", sentiment_score: 0.6, theme: "quality", ...extra,
});

const brand = topic("b", "brand", "Nuru Coffee");
const rival = topic("r", "competitor", "Java House");

const defaultMentions = [mention("b"), mention("b"), mention("b"), mention("r"), mention("r")];

const renderPage = (props: Partial<React.ComponentProps<typeof ListeningOverview>> = {}) => {
  const mentions = props.mentions ?? defaultMentions;
  return render(
    <MemoryRouter initialEntries={["/app/listening?tab=overview&brand=c1"]}>
      <ListeningOverview
        brandName="Nuru Coffee"
        topics={[brand, rival]}
        mentions={mentions}
        previousMentions={[]}
        period={period}
        rangeLabel={periodLabel(period)}
        compare
        hasAnyPosts={mentions.length > 0}
        onResetPeriod={() => {}}
        creditsToday={120}
        showCredits
        onAddKeywords={() => {}}
        {...props}
      />
    </MemoryRouter>,
  );
};

const panel = (title: string) => within(screen.getByText(title).closest("section") as HTMLElement);

describe("ListeningOverview", () => {
  it("shows the key metrics, sentiment, phrases, voices and the breakdowns", () => {
    renderPage();
    for (const title of [
      "Key metrics", "Sentiment score", "Sentiment over time", "Share of voice", "Sources", "Most popular phrases", "Top voices",
      "What people talk about", "Coverage", "Most seen in this period",
    ]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(screen.getByText("Nuru Coffee is leading")).toBeInTheDocument();
    expect(screen.getByText("Nothing needs attention")).toBeInTheDocument();
    expect(screen.getByText("Watching")).toBeInTheDocument();
  });

  it("compares each headline number with the period before", () => {
    renderPage({
      mentions: [
        mention("b", { author: "@a", reach: 1_000, shares: 10 }),
        mention("b", { author: "@b", reach: 1_000, shares: 10 }),
        mention("b", { author: "@c", reach: 1_000, shares: 10 }),
        mention("b", { author: "@d", reach: null, shares: 10 }),
      ],
      previousMentions: [
        mention("b", { author: "@a", reach: 2_000, shares: 25 }),
        mention("b", { author: "@a", reach: 2_000, shares: 25 }),
      ],
    });
    const tile = (label: string) => within(panel("Key metrics").getByText(label).closest("div") as HTMLElement);
    expect(tile("Mentions").getByText("4")).toBeInTheDocument();
    expect(tile("Mentions").getByText("+100%")).toBeInTheDocument();
    expect(tile("Views").getByText("3.0k")).toBeInTheDocument();
    expect(tile("Views").getByText("-25%")).toBeInTheDocument();
    expect(tile("Shares").getByText("-20%")).toBeInTheDocument();
    expect(tile("Creators").getByText("+300%")).toBeInTheDocument();
  });

  it("calls a number new when the period before had none, and hides the changes when not comparing", () => {
    const { unmount } = renderPage({ previousMentions: [] });
    expect(within(panel("Key metrics").getByText("Mentions").closest("div") as HTMLElement).getByText("New")).toBeInTheDocument();
    unmount();
    renderPage({ compare: false, previousMentions: [mention("b")] });
    expect(panel("Key metrics").queryByText(/%$/)).not.toBeInTheDocument();
    expect(panel("Key metrics").queryByText("New")).not.toBeInTheDocument();
  });

  it("gives the net sentiment, its change, the split and the verdict", () => {
    renderPage({
      mentions: [mention("b"), mention("b"), mention("b"), mention("b", { sentiment: "neutral" }), mention("r")],
      previousMentions: [mention("b"), mention("b", { sentiment: "negative" })],
    });
    const score = panel("Sentiment score");
    expect(score.getByText("+75")).toBeInTheDocument();
    expect(score.getByText("+75 pts")).toBeInTheDocument();
    expect(score.getByText("Mostly positive")).toBeInTheDocument();
    expect(score.getByRole("img", { name: "75% positive, 25% neutral, 0% negative" })).toBeInTheDocument();
  });

  it("names the most positive and the most negative day under the chart", () => {
    renderPage({
      mentions: [mention("b"), mention("b"), mention("b", { sentiment: "negative" })],
    });
    const chart = panel("Sentiment over time");
    expect(chart.getByText(/Most positive day/)).toHaveTextContent(/2 posts/);
    expect(chart.getByText(/Most negative day/)).toHaveTextContent(/1 post\b/);
  });

  it("lists the phrases and hashtags people use, against the period before", () => {
    renderPage({
      mentions: [
        mention("b", { snippet: "Masala chai magic #NuruMorning" }),
        mention("b", { snippet: "masala chai magic #nurumorning" }),
        mention("b", { snippet: "Masala chai magic! #NuruMorning" }),
      ],
      previousMentions: [mention("b", { snippet: "masala chai" })],
    });
    const phrases = panel("Most popular phrases");
    const row = (text: string) => within(phrases.getAllByText(text).at(-1)!.closest("li") as HTMLElement);
    expect(row("masala chai").getByText("+200%")).toBeInTheDocument();
    expect(row("chai magic").getByText("New")).toBeInTheDocument();
    expect(row("#nurumorning").getByText("New")).toBeInTheDocument();
  });

  it("ranks the top voices by views and links each to their most-seen post", () => {
    renderPage({
      mentions: [
        mention("b", { author: "@ama", reach: 50_000, url: "https://x/ama-big" }),
        mention("b", { author: "@ama", reach: 1_000 }),
        mention("b", { author: "@baraka", reach: 5_000 }),
      ],
    });
    const links = panel("Top voices").getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual([expect.stringContaining("@ama"), expect.stringContaining("@baraka")]);
    expect(links[0]).toHaveAttribute("href", "https://x/ama-big");
    expect(within(links[0]).getByText("51.0k views")).toBeInTheDocument();
  });

  it("asks for keywords before anything has been set up", () => {
    renderPage({ topics: [], mentions: [] });
    expect(screen.getByText("Start listening")).toBeInTheDocument();
  });

  it("says listening is on while the first sweep is still to return posts", () => {
    renderPage({ mentions: [] });
    expect(screen.getByText("Listening is on for Nuru Coffee")).toBeInTheDocument();
    expect(screen.getByText(/Nothing on-topic has come back yet/)).toBeInTheDocument();
  });

  it("surfaces a negative post instead of the all-clear", () => {
    renderPage({
      mentions: [
        mention("b"),
        mention("b", { title: "Refund trouble", sentiment: "negative", sentiment_score: -0.7, theme: "service", reach: 50_000 }),
        mention("r"),
      ],
    });
    expect(screen.getAllByText("Refund trouble").length).toBeGreaterThan(0);
    expect(screen.queryByText("Nothing needs attention")).not.toBeInTheDocument();
  });

  const morning = () => within(screen.getByText("Morning view").closest("section") as HTMLElement);

  it("opens with the morning view, and says Act for a negative post with 50,000 views", () => {
    const refund = mention("b", { title: "Refund trouble", sentiment: "negative", sentiment_score: -0.7, theme: "service", reach: 50_000 });
    renderPage({ mentions: [mention("b"), refund, mention("r")] });
    const card = morning();
    expect(card.getByText("Act")).toBeInTheDocument();
    expect(card.getByText("Needs you today")).toBeInTheDocument();
    expect(card.getByRole("link", { name: /Refund trouble/ })).toHaveAttribute("href", refund.url);
    expect(card.getByText("50k views · TikTok · 2 hours ago")).toBeInTheDocument();
  });

  it("says All clear when no negative post is spreading, and where the numbers come from", () => {
    renderPage();
    const card = morning();
    expect(card.getByText("All clear")).toBeInTheDocument();
    expect(card.queryByText("Needs you today")).not.toBeInTheDocument();
    expect(card.getByText(/Numbers come from the public posts/)).toBeInTheDocument();
  });

  it("says Not sure, with a dash for the mood, when nothing was posted in the last day", () => {
    renderPage({ mentions: [mention("b", { published_at: at(72), found_at: at(72) })] });
    const card = morning();
    expect(card.getByText("Not sure")).toBeInTheDocument();
    expect(card.getByText("No posts about Nuru Coffee in the last 24 hours.")).toBeInTheDocument();
    expect(within(card.getByText("Mood").parentElement as HTMLElement).getByText("—")).toBeInTheDocument();
  });

  it("names the platforms that report no views instead of reading them as 0", () => {
    renderPage({ mentions: [mention("b", { source: "instagram", sentiment: "negative", reach: null }), mention("b")] });
    const card = morning();
    expect(card.queryByText("Act")).not.toBeInTheDocument();
    expect(card.getByText(/Instagram posts report no views/)).toBeInTheDocument();
  });

  it("leaves the morning view out for a past period", () => {
    const { unmount } = renderPage();
    expect(screen.getByText("Morning view")).toBeInTheDocument();
    unmount();
    renderPage({ period: previousPeriod(lastDays(7)) });
    expect(screen.queryByText("Morning view")).not.toBeInTheDocument();
    expect(screen.getByText("Key metrics")).toBeInTheDocument();
  });

  it("leaves the morning view out for a period that ended yesterday, whose posts stop before this morning's", () => {
    const yesterday = new Date(Date.now() - 86_400_000);
    renderPage({ period: dayPeriod(yesterday, yesterday) });
    expect(screen.queryByText("Morning view")).not.toBeInTheDocument();
    expect(screen.getByText("Key metrics")).toBeInTheDocument();
  });
});
