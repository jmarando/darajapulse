import { Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { fmtEngagement } from "@/lib/storefront";

// What the tenant hook reports for the address the page was opened on.
const tenantState = vi.hoisted(() => ({ value: { tenant: null as unknown, loading: false, scoped: false } }));

vi.mock("@/hooks/useTenant", () => ({ useTenant: () => tenantState.value }));
vi.mock("@/pages/landings/LandingDashboard", () => ({ default: () => <div>Pulse homepage</div> }));
vi.mock("@/pages/PublicStorefront", () => ({ default: ({ slug }: { slug?: string }) => <div>Storefront for {slug}</div> }));
vi.mock("@/components/PageFallback", () => ({ default: () => <div>Loading…</div> }));

import TenantHome from "@/components/TenantHome";

const workspace = (agency_kind: string) => ({
  kind: "agency", agency_kind, id: "a1", name: "Radio Africa Group", slug: "radioafrica",
});

const renderHome = () => render(<Suspense fallback={<div>Loading page…</div>}><TenantHome /></Suspense>);

describe("the front page", () => {
  beforeEach(() => { tenantState.value = { tenant: null, loading: false, scoped: false }; });

  it("opens a media house's own subdomain on its storefront", async () => {
    tenantState.value = { tenant: workspace("media_house"), loading: false, scoped: true };
    renderHome();
    expect(await screen.findByText("Storefront for radioafrica")).toBeInTheDocument();
    expect(screen.queryByText("Pulse homepage")).not.toBeInTheDocument();
  });

  it("keeps the homepage on an agency's subdomain", () => {
    tenantState.value = { tenant: workspace("agency"), loading: false, scoped: true };
    renderHome();
    expect(screen.getByText("Pulse homepage")).toBeInTheDocument();
  });

  it("keeps the homepage on the main domain", () => {
    renderHome();
    expect(screen.getByText("Pulse homepage")).toBeInTheDocument();
  });

  it("waits for the workspace before choosing, so the homepage never flashes on a subdomain", () => {
    tenantState.value = { tenant: null, loading: true, scoped: true };
    renderHome();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.queryByText("Pulse homepage")).not.toBeInTheDocument();
  });

  it("falls back to the homepage when a subdomain has no workspace", () => {
    tenantState.value = { tenant: null, loading: false, scoped: true };
    renderHome();
    expect(screen.getByText("Pulse homepage")).toBeInTheDocument();
  });
});

describe("a storefront card's engagement", () => {
  it("shows the rate when the platform gave one", () => {
    expect(fmtEngagement(3)).toBe("3.0%");
    expect(fmtEngagement("2.45")).toBe("2.5%");
  });

  it("shows a dash instead of 0.0% when nobody knows it", () => {
    expect(fmtEngagement(0)).toBe("—");
    expect(fmtEngagement(null)).toBe("—");
    expect(fmtEngagement(undefined)).toBe("—");
    expect(fmtEngagement("not a number")).toBe("—");
  });
});
