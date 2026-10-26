import { useLayoutEffect } from "react";

/**
 * Switches the page to the console theme (the dashboards' neutral palette)
 * while the calling component is mounted. The class goes on <html> so dialogs,
 * menus and toasts rendered in portals use the same palette.
 */
export function useConsoleTheme() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add("console");
    return () => root.classList.remove("console");
  }, []);
}
