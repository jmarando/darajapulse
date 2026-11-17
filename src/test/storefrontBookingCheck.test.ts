import { describe, expect, it } from "vitest";
import { checkFiles, priceBooking, readCreate, type CreateInput } from "@/lib/storefrontBooking";
import { kissSpots, leaderboard, sponsorship } from "./fixtures/bookingItems";

const today = "2026-11-17";
const fees = { audio: 50000, banner: 15000, print: 12000 };
const ready = { pesapal: true, bank: true };
const offered = [kissSpots, leaderboard, sponsorship];

const valid = {
  agency_slug: "radioafrica",
  lines: [
    { id: kissSpots.id, option: "6–9 AM", qty: 10, start: "2026-11-20", end: "2026-11-24" },
    { id: leaderboard.id, option: null, qty: 1, budget: 15000, target: "kenya", start: "2026-11-20", end: "2026-11-30" },
  ],
  quote_lines: [],
  materials: { audio: { mode: "make" } },
  kit: { headline: "Fresh bread daily" },
  buyer: { name: "Wanjiku Kamau", email: "Wanjiku@Example.com", company: "Wanjiku Foods" },
  method: "bank",
  files: [],
};

const read = (raw: unknown): CreateInput => {
  const r = readCreate(raw);
  if (r.ok === false) throw new Error(r.error);
  return r.value;
};

describe("reading a booking request", () => {
  it("drops bots quietly", () => {
    expect(readCreate({ ...valid, website: "x" })).toEqual({ ok: false, error: "spam", spam: true });
  });
  it("needs a name, an email, a line and a way to pay", () => {
    expect(readCreate({ ...valid, buyer: { ...valid.buyer, name: " " } })).toMatchObject({ ok: false, error: "Add your name." });
    expect(readCreate({ ...valid, buyer: { ...valid.buyer, email: "nope" } })).toMatchObject({ ok: false, error: "Add a valid email address." });
    expect(readCreate({ ...valid, lines: [] })).toMatchObject({ ok: false, error: "Pick at least one thing to book." });
    expect(readCreate({ ...valid, method: "cash" })).toMatchObject({ ok: false, error: "Choose how to pay." });
  });
  it("tidies what it keeps", () => {
    const v = read(valid);
    expect(v.buyer.email).toBe("wanjiku@example.com");
    expect(v.lines).toHaveLength(2);
  });
});

describe("pricing a whole booking", () => {
  it("refuses a listing that's no longer offered", () => {
    const input = read({ ...valid, lines: [{ id: "00000000-0000-4000-8000-000000000099", option: null, qty: 1, start: "2026-11-20" }] });
    expect(priceBooking(input, offered, fees, ready, today))
      .toEqual({ ok: false, error: "Something in your plan is no longer offered. Refresh the page and pick again." });
  });
  it("adds the production fee and VAT, and asks later for what wasn't given", () => {
    const ok = priceBooking(read(valid), offered, fees, ready, today);
    expect(ok).toMatchObject({
      ok: true,
      value: { makes: ["audio"], totals: { media: 365000, production: 50000, vat: 66400, total: 481400 }, start: "2026-11-20", end: "2026-11-30" },
    });
    if (!ok.ok) return;
    expect(Object.keys(ok.value.materials)).toEqual(["audio", "banner"]);
    expect(ok.value.materials.banner).toEqual({ mode: "later" });
  });
  it("refuses a way to pay the house hasn't set up", () => {
    expect(priceBooking(read({ ...valid, method: "pesapal" }), offered, fees, { pesapal: false, bank: true }, today))
      .toEqual({ ok: false, error: "That way to pay isn't available for this booking." });
  });
  it("sends very large bookings to the team", () => {
    const huge = read({ ...valid, materials: {}, lines: [{ id: leaderboard.id, option: null, qty: 1, budget: 4_400_000, start: "2026-11-20", end: "2026-11-30" }] });
    expect(priceBooking(huge, offered, fees, ready, today))
      .toEqual({ ok: false, error: "Bookings above KES 5,000,000 go through the team: send this one as a request instead." });
  });
});

describe("checking files", () => {
  it("takes only the usual ad files, up to 25 MB, for something in the booking", () => {
    expect(checkFiles([{ slot: "audio", name: "spot.exe", type: "application/x-msdownload", size: 10 }], ["audio"]))
      .toBe("\"spot.exe\" isn't a file type we take: use JPG, PNG, PDF, MP3, WAV or MP4.");
    expect(checkFiles([{ slot: "audio", name: "spot.mp3", type: "audio/mpeg", size: 30_000_000 }], ["audio"])).toBe("\"spot.mp3\" is over 25 MB.");
    expect(checkFiles([{ slot: "print", name: "a.pdf", type: "application/pdf", size: 10 }], ["audio"])).toBe("That file doesn't belong to anything in this booking.");
    expect(checkFiles([{ slot: "kit_logo", name: "logo.png", type: "image/png", size: 10 }], ["audio"])).toBeNull();
  });
});

describe("reading files the buyer uploaded", () => {
  it("keeps each file with its own path, dropping ones that aren't whole", async () => {
    const { readUploaded } = await import("@/lib/storefrontBooking");
    expect(readUploaded([
      { slot: "audio", name: "a.mp3", type: "audio/mpeg", size: 10, path: "x/BK-1/1-a.mp3" },
      { slot: "audio", name: "broken.mp3" },
      { slot: "banner", name: "b.png", type: "image/png", size: 20, path: "x/BK-1/2-b.png" },
    ])).toEqual([
      { slot: "audio", name: "a.mp3", type: "audio/mpeg", size: 10, path: "x/BK-1/1-a.mp3" },
      { slot: "banner", name: "b.png", type: "image/png", size: 20, path: "x/BK-1/2-b.png" },
    ]);
  });
});
