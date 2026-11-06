import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ContractSign from "@/components/ContractSign";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/publicClient", () => ({ publicSupabase: { rpc } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("loading the creator agreement", () => {
  beforeEach(() => rpc.mockReset());
  afterEach(cleanup);

  it("shows a retryable error instead of silently hiding the signing card", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "database unavailable" } });
    render(<ContractSign token="brief-token-0001" creatorName="Test Creator" />);

    expect(await screen.findByRole("heading", { name: /agreement unavailable/i })).toBeInTheDocument();
    expect(screen.getByText(/couldn't load your agreement/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
