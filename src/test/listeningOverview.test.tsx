import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ListeningOverview from "@/components/listening/ListeningOverview";
import type { ListeningMention, ListeningTopic } from "@/lib/listening";

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

const renderPage = (props: Partial<React.ComponentProps<typeof ListeningOverview>> = {}) =>
  render(
    <MemoryRouter initialEntries={["/app/listening?tab=overview&brand=c1"]}>
      <ListeningOverview
        brandName="Nuru Coffee"
        topics={[brand, rival]}
        mentions={[mention("b"), mention("b"), mention("b"), mention("r"), mention("r")]}
        creditsToday={120}
        showCredits
        onAddKeywords={() => {}}
        {...props}
      />
    </MemoryRouter>,
  );

describe("ListeningOverview", () => {
  it("leads with the conversation, the finding, coverage and the breakdowns", () => {
    renderPage();
    for (const title of ["The conversation", "Coverage", "Mood over time", "Share of voice", "Where it's happening", "What people talk about", "Most seen this month"]) {
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
});
