// Canonical app URL helper.
// Invite / recovery links must never point at a Lovable preview host — they are
// sent to real users, so they must land on the production domain.

export const CANONICAL_APP_ORIGIN = "https://darajapulse.com";

function isAllowedHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === "darajapulse.com" || h.endsWith(".darajapulse.com");
}

/**
 * Returns a safe absolute app URL (defaults to `${origin}/app`).
 * Any non-darajapulse.com host (lovableproject.com, lovable.app, localhost, …)
 * is replaced with the canonical production origin, keeping the path.
 */
export function safeAppUrl(redirectTo?: string | null, fallbackPath = "/app"): string {
  let path = fallbackPath;
  if (redirectTo) {
    try {
      const u = new URL(String(redirectTo));
      if (isAllowedHost(u.hostname)) return u.toString().replace(/\/$/, "");
      path = u.pathname + u.search;
    } catch {
      if (String(redirectTo).startsWith("/")) path = String(redirectTo);
    }
  }
  if (!path || path === "/") path = fallbackPath;
  return `${CANONICAL_APP_ORIGIN}${path}`.replace(/\/$/, "");
}

/** The password-setup URL derived from an app URL. */
export function setupUrlFrom(appUrl: string): string {
  const u = new URL(appUrl);
  return `${u.origin}/reset-password`;
}
