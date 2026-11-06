import { describe, expect, it } from "vitest";
import { parseCreatorList } from "@/lib/creatorList";

const accounts = (r: { accounts: { platform: string; handle: string }[] }) => r.accounts.map((a) => `${a.platform}:${a.handle}`);

describe("parseCreatorList: a free-form list", () => {
  it("reads one creator per line and skips blank lines", () => {
    const list = parseCreatorList("https://www.tiktok.com/@jane\n\n   \nhttps://www.instagram.com/brian.o/", "tiktok");
    expect(list.map(accounts)).toEqual([["tiktok:jane"], ["instagram:brian.o"]]);
  });

  it("keeps several links on a line together as one creator", () => {
    const [r] = parseCreatorList("Jane Cooks https://www.tiktok.com/@jane https://instagram.com/jane.ig/, https://x.com/jane_x", "tiktok");
    expect(r.name).toBe("Jane Cooks");
    expect(accounts(r)).toEqual(["tiktok:jane", "instagram:jane.ig", "twitter:jane_x"]);
  });

  it("reads a list of plain handles as the platform it's told", () => {
    const list = parseCreatorList("janecooks\n@brian.o", "instagram");
    expect(list.map(accounts)).toEqual([["instagram:janecooks"], ["instagram:brian.o"]]);
    expect(list[0].name).toBeNull();
  });

  it("takes a name and an @handle from one line", () => {
    const [r] = parseCreatorList("Jane Cooks - @janecooks", "tiktok");
    expect(r.name).toBe("Jane Cooks");
    expect(accounts(r)).toEqual(["tiktok:janecooks"]);
  });

  it("takes a name and a plain handle from separate cells", () => {
    const [r] = parseCreatorList("Jane Cooks\tjanecooks", "facebook");
    expect(r.name).toBe("Jane Cooks");
    expect(accounts(r)).toEqual(["facebook:janecooks"]);
  });

  it("reads platform:handle", () => {
    const [r] = parseCreatorList("Jane, tiktok:jane, ig:jane.ig, x:jane_x", "tiktok");
    expect(r.name).toBe("Jane");
    expect(accounts(r)).toEqual(["tiktok:jane", "instagram:jane.ig", "twitter:jane_x"]);
  });

  it("treats a line of several words as a name to look up", () => {
    const [r] = parseCreatorList("Mercy Wanjiru Kamau", "tiktok");
    expect(r.name).toBe("Mercy Wanjiru Kamau");
    expect(r.accounts).toEqual([]);
  });

  it("picks out an email and a phone number", () => {
    const [r] = parseCreatorList("Jane Cooks, jane@example.com, +254 700 000 000, @janecooks", "tiktok");
    expect(r).toMatchObject({ name: "Jane Cooks", email: "jane@example.com", phone: "254700000000" });
    expect(accounts(r)).toEqual(["tiktok:janecooks"]);
  });

  it("says when a link can't be read and keeps the rest of the line", () => {
    const [r] = parseCreatorList("Jane Cooks https://vm.tiktok.com/ZM8abc/ https://x.com/jane_x", "tiktok");
    expect(r.problem).toMatch(/short link/i);
    expect(accounts(r)).toEqual(["twitter:jane_x"]);
  });
});

describe("parseCreatorList: a pasted sheet with a header row", () => {
  it("reads columns by their headings and ignores the rest", () => {
    const list = parseCreatorList(
      "Name\tTikTok handle\tInstagram\tTikTok followers\tEmail\tPhone\tNotes\n" +
      "Jane Cooks\tjanecooks\tjane.ig\t12K\tjane@example.com\t254700000000\tgood\n" +
      "Brian O\t\thttps://www.instagram.com/brian.o/\t\t\t\t",
      "tiktok",
    );
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ name: "Jane Cooks", email: "jane@example.com", phone: "254700000000" });
    expect(list[0].accounts).toEqual([
      { platform: "tiktok", handle: "janecooks", readable: true, followers: 12000 },
      { platform: "instagram", handle: "jane.ig", readable: true, followers: null },
    ]);
    expect(list[1].name).toBe("Brian O");
    expect(accounts(list[1])).toEqual(["instagram:brian.o"]);
  });

  it("works with commas too", () => {
    const list = parseCreatorList("name,tiktok,x\nJane,janecooks,jane_x", "instagram");
    expect(list[0].name).toBe("Jane");
    expect(accounts(list[0])).toEqual(["tiktok:janecooks", "twitter:jane_x"]);
  });

  it("doesn't take an ordinary first line for headings", () => {
    const list = parseCreatorList("Jane Cooks, @janecooks\nBrian, @brian", "tiktok");
    expect(list).toHaveLength(2);
  });
});
