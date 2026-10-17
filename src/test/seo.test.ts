import { describe, expect, it } from "vitest";
import { metaForPath } from "@/lib/seo";

describe("metaForPath", () => {
  it("indexes the public marketing pages with their own canonical path", () => {
    expect(metaForPath("/")).toMatchObject({ index: true, path: "/" });
    expect(metaForPath("/discovery")).toMatchObject({ index: true, path: "/discovery" });
    expect(metaForPath("/discovery/")).toMatchObject({ index: true, path: "/discovery" });
    expect(metaForPath("/privacy").index).toBe(true);
  });

  it("indexes public storefronts but nothing below them", () => {
    expect(metaForPath("/shop/mediamax")).toMatchObject({ index: true, path: "/shop/mediamax" });
    expect(metaForPath("/shop/mediamax/extra").index).toBeFalsy();
  });

  it("never indexes the app, sign-in or private token links", () => {
    for (const path of [
      "/app", "/app/campaigns/123", "/portal", "/auth", "/reset-password",
      "/r/token", "/b/token", "/brief/token", "/d/token", "/m/token", "/p/token",
      "/invoice/token", "/pay/token", "/payments/token", "/c/token",
      "/acme/launch/report/token", "/landing/bento", "/no-such-page",
    ]) {
      expect(metaForPath(path).index, path).toBeFalsy();
    }
  });
});
