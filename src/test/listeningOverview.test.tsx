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

describe("ListeningOverview", () => {
  it("leads with the conversation, the finding, coverage and the breakdowns", () => {
    renderPage();
    for (const title of ["The conversation", "Coverage", "Mood over time", "Share of voice", "Where it's happening", "What people talk about", "Most seen in this period"]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(screen.getByText("Nuru Coffee is leading")).toBeInTheDocument();
    expect(screen.getByText("Nothing needs attention")).toBeInTheDocument();
    expect(screen.getByText("Watching")).toBeInTheDocument();
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
    expect(screen.getByText("The conversation")).toBeInTheDocument();
  });

  it("leaves the morning view out for a period that ended yesterday, whose posts stop before this morning's", () => {
    const yesterday = new Date(Date.now() - 86_400_000);
    renderPage({ period: dayPeriod(yesterday, yesterday) });
    expect(screen.queryByText("Morning view")).not.toBeInTheDocument();
    expect(screen.getByText("The conversation")).toBeInTheDocument();
  });
});
