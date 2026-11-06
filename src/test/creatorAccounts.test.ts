import { describe, expect, it } from "vitest";
import {
  accountsOf,
  accountsToColumns,
  matchRoster,
  mergeAccounts,
  parseAccount,
  personNameKey,
  profileUrl,
  type CreatorAccount,
} from "@/lib/creatorAccounts";

const acct = (over: Partial<CreatorAccount> = {}): CreatorAccount => ({
  platform: "tiktok",
  handle: "janecooks",
  readable: true,
  followers: null,
  engagement: null,
  ...over,
});

describe("parseAccount: links say which platform they are", () => {
  it.each([
    ["https://www.tiktok.com/@JaneCooks?lang=en", "tiktok", "janecooks"],
    ["https://www.tiktok.com/@janecooks/video/7300000000000000000", "tiktok", "janecooks"],
    ["instagram.com/jane.cooks/", "instagram", "jane.cooks"],
    ["https://www.instagram.com/jane.cooks/reel/Cabc123/", "instagram", "jane.cooks"],
    ["https://web.facebook.com/janecooks", "facebook", "janecooks"],
    ["https://m.facebook.com/profile.php?id=1000123", "facebook", "1000123"],
    ["https://www.facebook.com/people/Jane-Cooks/1000123/", "facebook", "1000123"],
    ["https://x.com/JaneCooks", "twitter", "janecooks"],
    ["https://twitter.com/janecooks/status/1800000000000000000", "twitter", "janecooks"],
    ["https://www.youtube.com/@JaneCooks", "youtube", "janecooks"],
    ["https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv", "youtube", "UCabcdefghijklmnopqrstuv"],
    ["https://www.linkedin.com/in/jane-cooks/", "linkedin", "jane-cooks"],
    ["https://www.threads.net/@janecooks", "threads", "janecooks"],
    ["https://www.snapchat.com/add/janecooks", "snapchat", "janecooks"],
  ])("%s", (input, platform, handle) => {
    expect(parseAccount(input)).toEqual({ platform, handle, readable: true });
  });

  it("explains a short link, because it holds no handle", () => {
    expect(parseAccount("https://vm.tiktok.com/ZM8abc/")).toEqual({ platform: "tiktok", error: expect.stringMatching(/short link/i) });
  });

  it("explains a post link that doesn't name the account", () => {
    expect(parseAccount("https://www.instagram.com/reel/Cabc123/")).toEqual({ platform: "instagram", error: expect.stringMatching(/post/i) });
  });

  it("refuses a link from a site that isn't a platform", () => {
    expect(parseAccount("https://linktr.ee/janecooks")).toEqual({ error: expect.stringMatching(/isn't/i) });
  });
});

describe("parseAccount: plain text", () => {
  it("uses the platform it is told, without the @", () => {
    expect(parseAccount("@JaneCooks", "instagram")).toEqual({ platform: "instagram", handle: "janecooks", readable: true });
  });

  it("asks for a platform when nothing says which", () => {
    expect(parseAccount("@janecooks")).toEqual({ error: expect.stringMatching(/platform/i) });
  });

  it("reads a stored platform:handle entry", () => {
    expect(parseAccount("facebook:janecooks")).toEqual({ platform: "facebook", handle: "janecooks", readable: true });
  });

  it("does not mistake a link's https: for a platform", () => {
    expect(parseAccount("https://x.com/janecooks", "tiktok")).toMatchObject({ platform: "twitter", handle: "janecooks" });
  });

  it("keeps a name typed as it was, marked unreadable", () => {
    expect(parseAccount("Jane Cooks Kitchen", "facebook")).toEqual({ platform: "facebook", handle: "Jane Cooks Kitchen", readable: false });
  });

  it("keeps a handle with an emoji as typed, marked unreadable", () => {
    expect(parseAccount("online__bestie🌸", "tiktok")).toEqual({ platform: "tiktok", handle: "online__bestie🌸", readable: false });
  });

  it("doesn't take a handle with a stray slash for a link", () => {
    expect(parseAccount("jane.cooks/", "tiktok")).toEqual({ platform: "tiktok", handle: "jane.cooks", readable: true });
  });

  it("knows a platform's link without the https", () => {
    expect(parseAccount("vm.tiktok.com/ZM8abc/", "instagram")).toEqual({ platform: "tiktok", error: expect.stringMatching(/short link/i) });
    expect(parseAccount("twitter.com/jane_x", "tiktok")).toMatchObject({ platform: "twitter", handle: "jane_x" });
  });

  it("answers an empty box with an error", () => {
    expect(parseAccount("   ", "tiktok")).toEqual({ error: expect.any(String) });
  });
});

describe("accountsOf: reading a roster row", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    handle: "janecooks",
    primary_platform: "tiktok",
    alt_handles: [] as string[],
    follower_count: 12000,
    engagement_rate: 3.5,
    ...over,
  });

  it("puts the main account first with the row's own numbers", () => {
    expect(accountsOf(row())).toEqual([acct({ followers: 12000, engagement: 3.5 })]);
  });

  it("adds each other platform from alt_handles", () => {
    const accounts = accountsOf(row({ alt_handles: ["facebook:jane.fb", "instagram:jane.ig"] }));
    expect(accounts.map((a) => [a.platform, a.handle])).toEqual([
      ["tiktok", "janecooks"],
      ["instagram", "jane.ig"],
      ["facebook", "jane.fb"],
    ]);
  });

  it("drops an alt entry that repeats the main account", () => {
    expect(accountsOf(row({ alt_handles: ["tiktok:JaneCooks"] }))).toHaveLength(1);
  });

  it("keeps a second account on the same platform", () => {
    expect(accountsOf(row({ alt_handles: ["tiktok:jane_two"] })).map((a) => a.handle)).toEqual(["janecooks", "jane_two"]);
  });

  it("treats an entry with no platform as the main platform's", () => {
    expect(accountsOf(row({ alt_handles: ["jane_old"] }))[1]).toMatchObject({ platform: "tiktok", handle: "jane_old" });
  });

  it("reads other accounts' numbers from account_stats", () => {
    const accounts = accountsOf(row({
      alt_handles: ["instagram:jane.ig"],
      account_stats: { "instagram:jane.ig": { followers: 800, engagement_rate: 2 } },
    }));
    expect(accounts[1]).toMatchObject({ followers: 800, engagement: 2 });
  });

  it("believes a link's host over the stated platform", () => {
    expect(accountsOf(row({ handle: "https://www.instagram.com/jane.ig/", primary_platform: "tiktok" }))[0])
      .toMatchObject({ platform: "instagram", handle: "jane.ig", readable: true });
  });

  it("promotes a real handle over a name typed in the handle box, keeping the numbers", () => {
    expect(accountsOf(row({ handle: "Jane Cooks", alt_handles: ["tiktok:janecooks"] }))).toEqual([acct({ followers: 12000, engagement: 3.5 })]);
  });

  it("keeps a name when it is all we have for that platform", () => {
    expect(accountsOf(row({ alt_handles: ["facebook:Jane Cooks Kitchen"] }))[1])
      .toMatchObject({ platform: "facebook", handle: "Jane Cooks Kitchen", readable: false });
  });

  it("drops a name on a platform where a real handle exists", () => {
    const accounts = accountsOf(row({ alt_handles: ["facebook:jane.fb", "facebook:Jane Cooks Kitchen"] }));
    expect(accounts.filter((a) => a.platform === "facebook").map((a) => a.handle)).toEqual(["jane.fb"]);
  });

  it("keeps a stored link it can't read rather than losing it", () => {
    expect(accountsOf(row({ handle: "https://vm.tiktok.com/ZM8abc/" }))[0])
      .toMatchObject({ platform: "tiktok", handle: "https://vm.tiktok.com/ZM8abc/", readable: false });
  });

  it("answers no accounts for an empty row", () => {
    expect(accountsOf(row({ handle: "", alt_handles: [] }))).toEqual([]);
    expect(accountsOf({ handle: null, primary_platform: null, alt_handles: null })).toEqual([]);
  });
});

describe("accountsToColumns: writing back", () => {
  it("stores the first account as main and the rest as platform:handle", () => {
    expect(accountsToColumns([
      acct({ followers: 12000, engagement: 3.5 }),
      acct({ platform: "instagram", handle: "jane.ig", followers: 800 }),
      acct({ platform: "twitter", handle: "jane_x" }),
    ])).toEqual({
      handle: "janecooks",
      primary_platform: "tiktok",
      alt_handles: ["instagram:jane.ig", "twitter:jane_x"],
      follower_count: 12000,
      engagement_rate: 3.5,
      account_stats: { "instagram:jane.ig": { followers: 800, engagement_rate: null } },
    });
  });

  it("can't make a handle-only platform the main account, because primary_platform can't hold it", () => {
    const columns = accountsToColumns([
      acct({ platform: "linkedin", handle: "jane-li" }),
      acct({ platform: "instagram", handle: "jane.ig", followers: 800 }),
    ]);
    expect(columns).toMatchObject({ handle: "jane.ig", primary_platform: "instagram", alt_handles: ["linkedin:jane-li"], follower_count: 800 });
  });

  it("stores a creator who is only on a handle-only platform with no main account", () => {
    expect(accountsToColumns([acct({ platform: "linkedin", handle: "jane-li" })]))
      .toMatchObject({ handle: null, primary_platform: null, alt_handles: ["linkedin:jane-li"] });
  });

  it("comes back the same after a round trip", () => {
    const start = [
      acct({ followers: 12000, engagement: 3.5 }),
      acct({ platform: "instagram", handle: "jane.ig", followers: 800, engagement: 2 }),
      acct({ platform: "facebook", handle: "Jane Cooks Kitchen", readable: false }),
    ];
    expect(accountsOf(accountsToColumns(start))).toEqual(start);
  });
});

describe("mergeAccounts", () => {
  it("adds what's new and leaves what's there alone", () => {
    const { accounts, added } = mergeAccounts(
      [acct({ followers: 100 })],
      [acct({ followers: 999 }), acct({ platform: "instagram", handle: "jane.ig", followers: 800 })],
    );
    expect(added).toBe(1);
    expect(accounts).toEqual([acct({ followers: 100 }), acct({ platform: "instagram", handle: "jane.ig", followers: 800 })]);
  });

  it("fills a number the existing account didn't have", () => {
    const { accounts, added } = mergeAccounts([acct({ followers: null })], [acct({ followers: 999 })]);
    expect(added).toBe(0);
    expect(accounts[0].followers).toBe(999);
  });
});

describe("matchRoster", () => {
  const roster = [
    { id: "a", full_name: "Jane Cooks", handle: "janecooks", primary_platform: "tiktok", alt_handles: ["instagram:jane.ig"], agency_id: "ag1" },
    { id: "b", full_name: "Brian Otieno", handle: "brian.o", primary_platform: "instagram", alt_handles: [], agency_id: "ag1" },
    { id: "c", full_name: "Mercy", handle: "other_agency", primary_platform: "tiktok", alt_handles: [], agency_id: "ag2" },
  ];

  it("finds a creator by any of their accounts", () => {
    const m = matchRoster([acct({ platform: "instagram", handle: "jane.ig" })], "Someone Else", roster);
    expect(m.exact?.id).toBe("a");
  });

  it("doesn't call the same handle on another platform a match", () => {
    expect(matchRoster([acct({ platform: "facebook", handle: "jane.ig" })], "Someone Else", roster).exact).toBeNull();
  });

  it("doesn't match on a name typed in place of a handle", () => {
    const rows = [{ id: "z", full_name: "Z", handle: "Jane Cooks", primary_platform: "tiktok", alt_handles: [], agency_id: "ag1" }];
    expect(matchRoster([acct({ handle: "Jane Cooks", readable: false })], "Other", rows).exact).toBeNull();
  });

  it("offers a same-named creator as a possible match", () => {
    const m = matchRoster([acct({ platform: "twitter", handle: "bo" })], "brian  OTIENO!", roster);
    expect(m.exact).toBeNull();
    expect(m.sameName.map((r) => r.id)).toEqual(["b"]);
  });

  it("only looks in the agency it's told", () => {
    const m = matchRoster([acct({ handle: "other_agency" })], "Mercy", roster, "ag1");
    expect(m.exact).toBeNull();
    expect(m.sameName).toEqual([]);
  });
});

describe("small helpers", () => {
  it("personNameKey ignores case, punctuation and anything past three words", () => {
    expect(personNameKey("  Dr. Jane  W. Cooks Kamau ")).toBe("dr jane w");
  });

  it("profileUrl builds each platform's link", () => {
    expect(profileUrl("tiktok", "jane")).toBe("https://www.tiktok.com/@jane");
    expect(profileUrl("twitter", "jane")).toBe("https://x.com/jane");
    expect(profileUrl("linkedin", "jane")).toBe("https://www.linkedin.com/in/jane");
  });

  it("profileUrl gives nothing for a name, which has no address", () => {
    expect(profileUrl("facebook", "Jane Cooks Kitchen")).toBeNull();
  });
});
