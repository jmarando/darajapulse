import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CreatorStoryStep from "@/components/CreatorStoryStep";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/publicClient", () => ({ publicSupabase: { functions: { invoke } } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const file = () => new File([new Uint8Array(10)], "insights.png", { type: "image/png" });

describe("creator story step", () => {
  beforeEach(() => {
    invoke.mockReset();
    Object.defineProperty(window, "FileReader", {
      writable: true,
      value: class {
        result: string = "";
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        readAsDataURL() {
          this.result = "data:image/png;base64,iVBOR";
          this.onload?.();
        }
      },
    });
  });
  afterEach(cleanup);

  it("stays locked until the agreement is signed", () => {
    render(<CreatorStoryStep briefToken="brief-token-0001" locked />);
    expect(screen.getByText(/unlocks after you sign/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/screenshot/i)).toBeNull();
  });

  it("asks for the screenshot first", () => {
    render(<CreatorStoryStep briefToken="brief-token-0001" locked={false} />);
    fireEvent.click(screen.getByRole("button", { name: /send story screenshot/i }));
    expect(invoke).not.toHaveBeenCalled();
  });

  it("sends the screenshot with the brief token and shows what was read", async () => {
    invoke.mockResolvedValue({ data: { id: "s1", ai_reading: { reach: 4200, views: 5100, replies: 12, link_taps: 3 } }, error: null });
    render(<CreatorStoryStep briefToken="brief-token-0001" locked={false} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file()] } });
    fireEvent.click(screen.getByRole("button", { name: /send story screenshot/i }));
    await screen.findByText(/got it/i);
    expect(invoke).toHaveBeenCalledWith("submit-creator-story", expect.objectContaining({
      body: expect.objectContaining({ brief_token: "brief-token-0001", platform: "instagram" }),
    }));
    const body = (invoke.mock.calls[0][1] as { body: { image: string } }).body;
    expect(body.image).toMatch(/^data:image\/png;base64,/);
    expect(screen.getByText(/reach 4,200/i)).toBeInTheDocument();
  });

  it("ends what was read with a full stop before the team line", async () => {
    invoke.mockResolvedValue({ data: { id: "s1", ai_reading: { reach: 4200, views: 5100, replies: 12 } }, error: null });
    render(<CreatorStoryStep briefToken="brief-token-0001" locked={false} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file()] } });
    fireEvent.click(screen.getByRole("button", { name: /send story screenshot/i }));
    await screen.findByText(/got it/i);
    expect(screen.getByText("We read reach 4,200 · 5,100 views · 12 replies. The team will confirm it.")).toBeInTheDocument();
  });

  it("doesn't claim to have read numbers when the AI couldn't read the screenshot", async () => {
    invoke.mockResolvedValue({ data: { id: "s2", ai_reading: { error: "AI read failed (402)" } }, error: null });
    render(<CreatorStoryStep briefToken="brief-token-0001" locked={false} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file()] } });
    fireEvent.click(screen.getByRole("button", { name: /send story screenshot/i }));
    await screen.findByText(/got it/i);
    // The card's intro says "We read the numbers for you"; the line after sending must not start that way.
    expect(screen.queryByText(/^we read/i)).toBeNull();
    expect(screen.getByText(/^your screenshot is with the team/i)).toBeInTheDocument();
  });

  it("starts the story date at the creator's own clock, not UTC", () => {
    // A datetime-local input has no time zone: whatever it shows is read back as local time on send.
    const tz = process.env.TZ;
    process.env.TZ = "Africa/Nairobi";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-06T05:30:00Z"));
    try {
      render(<CreatorStoryStep briefToken="brief-token-0001" locked={false} />);
      const date = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
      expect(date.value).toBe("2026-11-06T08:30");
    } finally {
      vi.useRealTimers();
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    }
  });
});
