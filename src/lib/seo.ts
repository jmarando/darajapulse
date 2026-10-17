// Per-route search metadata for the single-page app. index.html carries the
// homepage defaults for crawlers that don't run JavaScript; this keeps the
// title, description, canonical URL and robots directive right as routes change.
import { isRootHost } from "@/lib/appUrl";

export const SITE_URL = "https://darajapulse.com";

export const DEFAULT_DESCRIPTION =
  "Brief, sign, approve, measure and pay creators across TikTok, Instagram, YouTube, Facebook and X. 3,200+ creators in Kenya, Uganda and Tanzania.";

export type PageMeta = {
  title: string;
  description?: string;
  /** Path used for the canonical URL; only set for indexable pages. */
  path?: string;
  index?: boolean;
};

const PUBLIC_PAGES: Record<string, Omit<PageMeta, "path">> = {
  "/": {
    title: "Daraja Pulse | Influencer marketing platform for East Africa",
    description: DEFAULT_DESCRIPTION,
    index: true,
  },
  "/discovery": {
    title: "Discover 3,200+ creators in Kenya, Uganda and Tanzania | Daraja Pulse",
    description:
      "Search TikTok, Instagram, YouTube and Facebook creators in Kenya, Uganda and Tanzania by niche, city and engagement.",
    index: true,
  },
  "/terms": { title: "Terms of Service | Daraja Pulse", index: true },
  "/privacy": { title: "Privacy Policy | Daraja Pulse", index: true },
  "/data-deletion": { title: "Data deletion | Daraja Pulse", index: true },
};

/**
 * Only public marketing pages, Discovery and storefronts are indexable. The app,
 * portal, sign-in, private token links (briefs, reports, reviews, invoices),
 * landing experiments and unknown routes are not.
 */
export function metaForPath(pathname: string): PageMeta {
  const path = pathname.replace(/\/+$/, "") || "/";
  const page = PUBLIC_PAGES[path];
  if (page) return { ...page, path };
  if (/^\/shop\/[^/]+$/.test(path)) return { title: "Storefront | Daraja Pulse", path, index: true };
  if (path === "/auth" || path === "/reset-password") return { title: "Sign in | Daraja Pulse" };
  return { title: "Daraja Pulse" };
}

function setMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

/** Main domain only (and local builds, for audits): workspace subdomains and previews mirror it. */
const isIndexableHost = () => isRootHost() || ["localhost", "127.0.0.1"].includes(window.location.hostname);

export function applyPageMeta(meta: PageMeta) {
  const indexable = !!meta.index && isIndexableHost();
  setMeta("name", "robots", indexable ? "index, follow" : "noindex, nofollow");
  // Workspace subdomains keep their branded title (set by TenantProvider).
  if (!isIndexableHost()) return;

  const description = meta.description ?? DEFAULT_DESCRIPTION;
  document.title = meta.title;
  setMeta("name", "description", description);
  setMeta("property", "og:title", meta.title);
  setMeta("property", "og:description", description);
  setMeta("name", "twitter:title", meta.title);
  setMeta("name", "twitter:description", description);

  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!indexable) {
    canonical?.remove();
    return;
  }
  const url = meta.path && meta.path !== "/" ? `${SITE_URL}${meta.path}` : `${SITE_URL}/`;
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }
  canonical.href = url;
  setMeta("property", "og:url", url);
}
