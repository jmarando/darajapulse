import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Single source of truth for countries and cities.
 * Values live in the `countries` / `cities` tables so new markets can be added
 * without touching code. Nothing in the app should hardcode a country list.
 */
export type Country = { code: string; name: string };
export type City = { country_code: string; name: string };

export const UNKNOWN = "__none__";
export const UNKNOWN_LABEL = "Not specified";

let cache: Promise<{ countries: Country[]; cities: City[] }> | null = null;

export const loadGeo = () => {
  if (!cache) {
    cache = (async () => {
      const [c, ci] = await Promise.all([
        supabase.from("countries").select("code,name").eq("is_active", true).order("sort_order"),
        supabase.from("cities").select("country_code,name").eq("is_active", true).order("name"),
      ]);
      return {
        countries: ((c.data as Country[]) ?? []),
        cities: ((ci.data as City[]) ?? []),
      };
    })();
  }
  return cache;
};

/** Countries + cities, loaded once per session and shared by every page. */
export const useGeo = () => {
  const [geo, setGeo] = useState<{ countries: Country[]; cities: City[] }>({ countries: [], cities: [] });
  useEffect(() => { let on = true; loadGeo().then((g) => on && setGeo(g)); return () => { on = false; }; }, []);

  const nameOf = (code?: string | null) =>
    !code ? UNKNOWN_LABEL : geo.countries.find((c) => c.code === code)?.name || code;

  /** Cities for a country; pass nothing for every city. */
  const citiesOf = (code?: string | null) =>
    (code && code !== UNKNOWN ? geo.cities.filter((c) => c.country_code === code) : geo.cities)
      .map((c) => c.name);

  return { ...geo, nameOf, citiesOf };
};

/** Options list for a Combobox, with an explicit "Not specified" entry. */
export const countryItems = (countries: Country[], includeUnknown = true) => [
  ...countries.map((c) => ({ id: c.code, label: c.name })),
  ...(includeUnknown ? [{ id: UNKNOWN, label: UNKNOWN_LABEL }] : []),
];

export const cityItems = (cities: string[], includeUnknown = true) => [
  ...[...new Set(cities)].sort().map((c) => ({ id: c, label: c })),
  ...(includeUnknown ? [{ id: UNKNOWN, label: UNKNOWN_LABEL }] : []),
];

/** True when a record's country/city matches the selected filter values. */
export const matchesGeo = (
  rec: { country?: string | null; city?: string | null },
  country: string,
  city: string,
  all: string,
) => {
  // UNKNOWN means "no value recorded".
  if (country !== all) {
    if (country === UNKNOWN ? !!rec.country : rec.country !== country) return false;
  }
  if (city !== all) {
    if (city === UNKNOWN ? !!rec.city : rec.city !== city) return false;
  }
  return true;
};
