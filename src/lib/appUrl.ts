export const CANONICAL_APP_ORIGIN = "https://darajapulse.com";

export const authRedirectUrl = (path: "/reset-password" | "/auth") =>
  `${CANONICAL_APP_ORIGIN}${path}`;