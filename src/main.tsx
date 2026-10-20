import { createRoot } from "react-dom/client";
import "@fontsource/geist-sans/300.css";
import "@fontsource/geist-sans/400.css";
import "@fontsource/geist-sans/500.css";
import "@fontsource/geist-sans/600.css";
import "@fontsource/geist-sans/700.css";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import App from "./App.tsx";
import { initPwa } from "./lib/pwa";
import "./index.css";

initPwa();

// Pages load on demand, so after a deploy an open tab can ask for a chunk that no
// longer exists. Reload once to pick up the new build instead of breaking.
window.addEventListener("vite:preloadError", () => {
  try {
    const last = Number(sessionStorage.getItem("chunk-reload-at") || 0);
    if (Date.now() - last < 10_000) return;
    sessionStorage.setItem("chunk-reload-at", String(Date.now()));
  } catch {
    /* storage unavailable: reload anyway */
  }
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(<App />);
