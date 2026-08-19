export const CANONICAL_APP_ORIGIN = "https://darajapulse.com";

export const authRedirectUrl = (path: "/reset-password" | "/auth") =>
  `${CANONICAL_APP_ORIGIN}${path}`;
/** True when the app is loaded on the root (non tenant-scoped) production host. */
export const isRootHost = () => {
  const h = window.location.hostname.toLowerCase();
  return h === "darajapulse.com" || h === "www.darajapulse.com";
};

/**
 * If the signed-in user belongs to a tenant workspace, returns the absolute URL
 * of that workspace (e.g. https://pesalink.darajapulse.com/app). Otherwise null.
 */
export const workspaceRedirect = async (
  rpc: (fn: "get_my_workspace_subdomain") => Promise<{ data: any; error: any }>,
  path = "/app",
): Promise<string | null> => {
  if (!isRootHost()) return null;
  try {
    const { data, error } = await rpc("get_my_workspace_subdomain");
    if (error || !data || typeof data !== "string") return null;
    return `https://${data}.darajapulse.com${path}`;
  } catch {
    return null;
  }
};
