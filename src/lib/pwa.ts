// Installable app support. Registers the service worker on the production domain
// only (never inside the Lovable editor preview) and keeps the browser's install
// prompt so the app can offer its own "Install app" button.

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export const getInstallPrompt = () => deferredPrompt;

/** Hands out the saved prompt once; browsers only allow each prompt to be shown once. */
export function takeInstallPrompt() {
  const prompt = deferredPrompt;
  deferredPrompt = null;
  notify();
  return prompt;
}

export function subscribeInstallPrompt(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const PRODUCTION_HOST = /(^|\.)darajapulse\.com$/;
const LOCAL_HOSTS = ["localhost", "127.0.0.1"];

export function initPwa() {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Keep it for the in-app button instead of Chrome's own mini-infobar, which
    // would otherwise pop up for prospects on the marketing pages.
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });

  const host = window.location.hostname;
  const allowedHost = PRODUCTION_HOST.test(host) || (import.meta.env.PROD && LOCAL_HOSTS.includes(host));
  if (!allowedHost || !("serviceWorker" in navigator) || window.self !== window.top) return;
  const register = () =>
    navigator.serviceWorker.register("/sw.js").catch((error) => console.warn("Service worker registration failed", error));
  // Wait for the page to finish loading so the worker doesn't compete with first paint.
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
