import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { ReportingWindow } from "@/components/report/ReportingWindow";
import { MetricStrip } from "@/components/report/MetricStrip";
import { TopPerformers } from "@/components/report/TopPerformers";
import { TrendCard } from "@/components/report/TrendCard";
import { buildMetricTiles } from "@/lib/metricTiles";
import type { PerformerRow } from "@/lib/topPerformers";

// recharts measures its container, which jsdom cannot do: stand in for it.
vi.mock("recharts", () => {
  const Nothing = () => null;
  return {
    ResponsiveContainer: ({ children }: { children?: ReactNode }) => <div data-testid="chart">{children}</div>,
    AreaChart: ({ children }: { children?: ReactNode }) => <svg>{children}</svg>,
    Area: Nothing, XAxis: Nothing, YAxis: Nothing, CartesianGrid: Nothing, Tooltip: Nothing, ReferenceDot: Nothing, Customized: Nothing,
  };
});

describe("ReportingWindow", () => {
  const now = new Date(2026, 6, 15, 15, 30); // Wednesday 15 July 2026

  it("marks all time as chosen when there is no range", () => {
    render(<ReportingWindow value={undefined} onChange={() => {}} now={now} />);
    expect(screen.getByRole("button", { name: "All time" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Last 7 days" })).toHaveAttribute("aria-pressed", "false");
  });

  it("picks a preset from today, and goes back to all time", () => {
    const onChange = vi.fn();
    render(<ReportingWindow value={undefined} onChange={onChange} now={now} />);
    fireEvent.click(screen.getByRole("button", { name: "Last 7 days" }));
    const range = onChange.mock.calls[0][0];
    expect(new Date(range.from).getDate()).toBe(9);
    expect(new Date(range.to).getDate()).toBe(15);
    fireEvent.click(screen.getByRole("button", { name: "All time" }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it("marks the preset that matches the current range", () => {
    render(<ReportingWindow value={{ from: new Date(2026, 6, 13), to: new Date(2026, 6, 15) }} onChange={() => {}} now={now} />);
    expect(screen.getByRole("button", { name: "This week" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "All time" })).toHaveAttribute("aria-pressed", "false");
  });

  it("shows a custom range on the date button", () => {
    render(<ReportingWindow value={{ from: new Date(2026, 6, 10), to: new Date(2026, 6, 15) }} onChange={() => {}} now={now} />);
    expect(screen.getByRole("button", { name: /10 Jul – 15 Jul 2026/ })).toBeInTheDocument();
  });
});

describe("MetricStrip", () => {
  const totals = { views: 27_700_000, likes: 2_000_000, comments: 35_000, shares: 74_000, saves: 120_000, reach: 18_800_000, er: 8.1 };

  it("shows each figure, which one drives the chart, and what is estimated", () => {
    const tiles = buildMetricTiles(totals, true, { shares: true, saves: false, reach: true });
    render(<MetricStrip tiles={tiles} active="views" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: /Views/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Likes/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("27.7M")).toBeInTheDocument();
    expect(screen.getAllByText("est.")).toHaveLength(3); // shares, reach, and engagement (it includes shares)
    expect(screen.getByText(/est\. marks figures we fill in/)).toBeInTheDocument();
  });

  it("switches the chart when a figure is chosen", () => {
    const onSelect = vi.fn();
    render(<MetricStrip tiles={buildMetricTiles(totals, true, { shares: false, saves: false, reach: false })} active="views" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Comments/ }));
    expect(onSelect).toHaveBeenCalledWith("comments");
    expect(screen.queryByText("est.")).not.toBeInTheDocument();
  });

  it("shows a dash, and says so, when a figure has not been reported", () => {
    const tiles = buildMetricTiles({ ...totals, saves: 0 }, true, { shares: false, saves: false, reach: false });
    render(<MetricStrip tiles={tiles} active="views" onSelect={() => {}} />);
    expect(screen.getAllByText("—")).toHaveLength(1);
    expect(screen.getByText(/A dash means/)).toBeInTheDocument();
  });
});

describe("TopPerformers", () => {
  const rows: PerformerRow[] = [
    { id: "1", name: "Baraka Cooks", handle: "baraka", posts: 4, views: 5_000_000, interactions: 500_000, rate: 10, likes: 400_000, comments: 10_000, sharesSaves: 90_000, share: 0.625 },
    { id: "2", name: "Amani Eats", handle: "amani.o", posts: 1, views: 2_000_000, interactions: 200_000, rate: 10, likes: 160_000, comments: 8_000, sharesSaves: 32_000, share: 0.25 },
  ];

  it("ranks the creators with their figures and share of the views", () => {
    render(<TopPerformers rows={rows} />);
    expect(screen.getByText("Top performers")).toBeInTheDocument();
    expect(screen.getByText("Baraka Cooks")).toBeInTheDocument();
    expect(screen.getByText(/@baraka · 4 posts · 63% of views/)).toBeInTheDocument();
    expect(screen.getByText(/@amani\.o · 1 post · 25% of views/)).toBeInTheDocument();
    expect(screen.getByText("5M")).toBeInTheDocument();
    expect(screen.getAllByText("10.0%")).toHaveLength(2);
  });

  it("says when interactions include estimated shares and saves", () => {
    const { rerender } = render(<TopPerformers rows={rows} />);
    expect(screen.queryByText(/estimated from views and likes/)).not.toBeInTheDocument();
    rerender(<TopPerformers rows={rows} estimated />);
    expect(screen.getByText(/estimated from views and likes/)).toBeInTheDocument();
  });

  it("renders nothing when there is nobody to rank", () => {
    const { container } = render(<TopPerformers rows={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("TrendCard", () => {
  const points = [
    { d: "6 Jul", v: 100, at: 1 },
    { d: "7 Jul", v: 150, at: 2 },
    { d: "8 Jul", v: 280, at: 3 },
  ];

  it("names the chart after the figure and the window, and shows the latest value", () => {
    render(<TrendCard label="Views" windowLabel="All time" points={points} />);
    expect(screen.getByText("Views over time")).toBeInTheDocument();
    expect(screen.getByText(/All time/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Views over time, from 100 on 6 Jul to 280 on 8 Jul/ })).toBeInTheDocument();
    expect(screen.getByText("280")).toBeInTheDocument();
  });

  it("explains a line that starts at the first reading", () => {
    render(<TrendCard label="Views" windowLabel="All time" points={points} startedAfterPosts firstReadingLabel="6 Jul" />);
    expect(screen.getByText(/Readings start on 6 Jul/)).toBeInTheDocument();
  });

  it("says the history is still loading instead of drawing a partial line", () => {
    render(<TrendCard label="Views" windowLabel="All time" points={points} loading />);
    expect(screen.getByText(/Loading the history/)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("says so when nothing has been measured yet", () => {
    render(<TrendCard label="Views" windowLabel="All time" points={[]} />);
    expect(screen.getByText(/No readings yet/)).toBeInTheDocument();
  });

  it("says when the figure in the chart is partly estimated", () => {
    render(<TrendCard label="Reach" windowLabel="All time" points={points} estimated />);
    expect(screen.getByText(/Partly estimated/)).toBeInTheDocument();
  });

  it("says nothing about estimates for a reported figure", () => {
    render(<TrendCard label="Views" windowLabel="All time" points={points} />);
    expect(screen.queryByText(/estimated/i)).not.toBeInTheDocument();
  });

  it("says the line is rough when the full history could not be loaded", () => {
    render(<TrendCard label="Views" windowLabel="All time" points={points} partial />);
    expect(screen.getByText(/full history could not be loaded/i)).toBeInTheDocument();
    expect(screen.getByText(/each post's latest figures/)).toBeInTheDocument();
    expect(screen.getByRole("img")).toBeInTheDocument();
  });

  it("does not claim nothing was measured when the history could not be loaded", () => {
    render(<TrendCard label="Views" windowLabel="All time" points={[]} partial />);
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
    expect(screen.queryByText(/No readings yet/)).not.toBeInTheDocument();
  });

  it("does not say nothing was measured early when the history is just missing", () => {
    render(<TrendCard label="Views" windowLabel="All time" points={points} partial startedAfterPosts firstReadingLabel="6 Jul" />);
    expect(screen.queryByText(/Readings start on/)).not.toBeInTheDocument();
  });

  it("leaves the rough-line note out while the history is still loading", () => {
    render(<TrendCard label="Views" windowLabel="All time" points={points} loading partial />);
    expect(screen.queryByText(/each post's latest figures/)).not.toBeInTheDocument();
  });
});
