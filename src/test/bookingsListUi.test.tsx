import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import BookingsList from "@/components/storefront/BookingsList";
import { booking } from "./fixtures/bookingRows";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (name: string, options: unknown) => mocks.invoke(name, options) },
    from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
    storage: { from: () => ({ uploadToSignedUrl: vi.fn() }) },
  },
}));

beforeEach(() => vi.resetAllMocks());

describe("working a booking from the list", () => {
  it("shows the next step and confirms a transfer from the panel", async () => {
    const row = booking({ payment_claimed_ref: "FT123" });
    mocks.invoke.mockResolvedValue({ data: { booking: row, urls: {}, events: [] }, error: null });
    render(<BookingsList bookings={[row]} requests={[]} today="2026-11-17" onChanged={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Wanjiku Foods/ }));
    const received = await screen.findByRole("button", { name: "Mark as received" });
    fireEvent.change(screen.getByLabelText("Bank or M-Pesa reference"), { target: { value: "FT123 NCBA" } });
    fireEvent.click(received);
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("storefront-booking-house", { body: { action: "mark_paid", id: "b1", reference: "FT123 NCBA" } }));
  });

  it("lists the pill for each row", () => {
    render(<BookingsList bookings={[booking({ payment_claimed_ref: "FT123" })]} requests={[]} today="2026-11-17" onChanged={() => {}} />);
    expect(screen.getAllByText("Confirm payment").length).toBeGreaterThan(0);
  });
});
