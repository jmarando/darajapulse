// Listings as the booking functions see them, shared by the booking tests.
import type { OfferedItem } from "@/lib/storefrontBooking";

export const item = (over: Partial<OfferedItem>): OfferedItem => ({
  id: "00000000-0000-4000-8000-000000000001", title: "Listing", kind: "ad_slot", platform: "radio", price_kes: null,
  price_unit: null, options: null, bookable: true, price_model: "unit", min_spend_kes: null, ad_format: null, ...over,
});

export const kissSpots = item({
  id: "00000000-0000-4000-8000-000000000011", title: "Kiss 100: Spot adverts", price_kes: 14000, price_unit: "spot",
  options: [{ label: "6–9 AM", price_kes: 35000 }, { label: "Run of station", price_kes: 14000 }], ad_format: "radio_spot",
});
export const leaderboard = item({
  id: "00000000-0000-4000-8000-000000000012", title: "The Star online: Leaderboard", platform: "web", price_kes: 300,
  price_unit: "1,000 views", price_model: "cpm", min_spend_kes: 15000, ad_format: "web_leaderboard",
});
export const starPrint = item({
  id: "00000000-0000-4000-8000-000000000013", title: "The Star newspaper: Display ad", platform: "print", price_kes: 60000,
  price_unit: "insertion", options: [{ label: "18 × 6", price_kes: 60000 }, { label: "Half page", price_kes: 130000 }],
  ad_format: "print_display",
});
export const sponsorship = item({
  id: "00000000-0000-4000-8000-000000000014", title: "Kiss 100: Show sponsorship", price_kes: 1500000, price_unit: "4 weeks",
  options: [{ label: "Breakfast show", price_kes: 1500000 }], bookable: false,
});

