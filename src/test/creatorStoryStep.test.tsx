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
});
