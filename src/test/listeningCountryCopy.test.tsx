import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ListeningKeywords from "@/components/listening/ListeningKeywords";
import ListeningOverview from "@/components/listening/ListeningOverview";
import ListeningPage from "@/components/listening/ListeningPage";
import { lastDays, periodLabel } from "@/lib/listening";
import { LISTENING_COUNTRIES, type ListeningCountry } from "../../supabase/functions/_shared/listening-country";

// The Listening page names the news sites and the languages of the brand's own country. Invented brands only.

const mocks = vi.hoisted(() => ({ tables: {} as Record<string, unknown> }));
vi.mock("@/integrations/supabase/client", () => {
  const from = (table: string) => {
    // Every filter hands back the same chain, and awaiting it gives the table's rows.
    const chain: Record<string, unknown> = {};
    for (const name of ["select", "eq", "gte", "order", "range", "maybeSingle"]) chain[name] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: mocks.tables[table] ?? null, error: null }).then(resolve);
    return chain;
  };
  return { supabase: { from, rpc: async () => ({ data: 0, error: null }), functions: { invoke: vi.fn() } } };
});
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" }, isAgency: true, isSuperAdmin: false }) }));

const keywords = { clientId: "c1", brandName: "Nile Crisps", topics: [], creditsToday: null, showCredits: false, canEditAlerts: false, onChanged: () => {} };
const period = lastDays(30);
const overview = (country?: ListeningCountry) =>
  render(
    <MemoryRouter>
      <ListeningOverview
        brandName="Nile Crisps" topics={[]} mentions={[]} previousMentions={[]} period={period} rangeLabel={periodLabel(period)}
        compare hasAnyPosts={false} onResetPeriod={() => {}} creditsToday={null} showCredits={false} onAddKeywords={() => {}}
        country={country}
      />
    </MemoryRouter>,
  );

beforeEach(() => {
  mocks.tables = {};
});

describe("Listening copy by the brand's country", () => {
  it("names Kenyan news sites and Kenya's languages for a Kenyan brand, as before", () => {
    render(<ListeningKeywords {...keywords} />);
    expect(screen.getByText(/Kenyan news sites and blogs are checked every hour/)).toBeInTheDocument();
    expect(screen.getByText(/in English, Kiswahili or Sheng, and sets aside/)).toBeInTheDocument();
  });

  it("names Ugandan news sites and Uganda's languages for a Ugandan brand", () => {
    render(<ListeningKeywords {...keywords} country={LISTENING_COUNTRIES.UG} />);
    expect(screen.getByText(/Ugandan news sites and blogs are checked every hour/)).toBeInTheDocument();
    expect(screen.getByText(/in English, Luganda, Swahili or other Ugandan languages, and sets aside/)).toBeInTheDocument();
    expect(screen.queryByText(/Kenyan|Sheng/)).toBeNull();
  });

  it("names the brand's country's news sites before listening starts", () => {
    const { unmount } = overview();
    expect(screen.getByText(/Kenyan news sites and blogs every day/)).toBeInTheDocument();
    unmount();
    overview(LISTENING_COUNTRIES.UG);
    expect(screen.getByText(/Ugandan news sites and blogs every day/)).toBeInTheDocument();
  });

  it("takes the country from the brand the page shows", async () => {
    mocks.tables = { clients: [{ id: "c1", name: "Nile Crisps", country: "Uganda" }], listening_topics: [], listening_mentions: [] };
    render(<MemoryRouter initialEntries={["/app/listening"]}><ListeningPage /></MemoryRouter>);
    expect(await screen.findByText(/Ugandan news sites and blogs every day/)).toBeInTheDocument();
  });
});
