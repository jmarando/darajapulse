import { useEffect, useReducer } from "react";
import { toast } from "sonner";
import { getInstallPrompt, subscribeInstallPrompt, takeInstallPrompt } from "@/lib/pwa";

const isStandalone = () =>
  !!window.matchMedia?.("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

// Safari on iPhone and iPad has no install prompt; people add the app from the share sheet.
const isAppleMobile = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function useInstallPrompt() {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => subscribeInstallPrompt(rerender), []);

  const canInstall = !isStandalone() && (!!getInstallPrompt() || isAppleMobile());
  const install = async () => {
    const prompt = takeInstallPrompt();
    if (prompt) {
      await prompt.prompt();
      return;
    }
    toast("Install Daraja Pulse", { description: "Tap the Share button, then “Add to Home Screen”." });
  };
  return { canInstall, install };
}
