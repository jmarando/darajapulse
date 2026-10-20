import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import InstallAppButton from "@/components/InstallAppButton";
import { initPwa } from "@/lib/pwa";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const installPromptEvent = () => {
  const event = new Event("beforeinstallprompt", { cancelable: true }) as InstallPromptEvent;
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome: "accepted" });
  return event;
};

const installButton = () => screen.queryByRole("button", { name: /install app/i });

// The saved prompt is module state, so these run in order.
describe("Install app button", () => {
  beforeAll(() => initPwa());

  it("stays hidden until the browser offers installation", () => {
    render(<InstallAppButton />);
    expect(installButton()).toBeNull();
  });

  it("shows the browser's install prompt once, then hides", async () => {
    render(<InstallAppButton />);
    const event = installPromptEvent();
    act(() => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);

    await act(async () => {
      fireEvent.click(installButton()!);
    });
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(installButton()).toBeNull();
  });

  it("hides once the app is installed", () => {
    render(<InstallAppButton />);
    act(() => {
      window.dispatchEvent(installPromptEvent());
    });
    expect(installButton()).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(installButton()).toBeNull();
  });
});
