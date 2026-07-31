// Shared audience-demographics aggregation.
// - Normalises each creator's age/gender/city breakdown to 100% before weighting
// - Creators with 0 followers fall back to the average follower weight of creators
//   that do have followers (so they aren't silently dropped)
// - Reports how many creators actually carry audience data

export type AudienceInfluencer = {
  follower_count?: number | null;
  audience_kenya_pct?: number | null;
  languages?: string[] | null;
  audience_age_breakdown?: Record<string, number> | null;
  audience_gender_breakdown?: Record<string, number> | null;
  audience_top_cities?: Array<{ city: string; pct: number }> | null;
};

export const AGE_BUCKETS = ["13-17", "18-24", "25-34", "35-44", "45-54", "55+"];
export const GENDERS = ["female", "male", "other"];

const normalise = (entries: Array<[string, number]>) => {
  const total = entries.reduce((a, [, v]) => a + (Number(v) || 0), 0);
  if (total <= 0) return null;
  return entries.map(([k, v]) => [k, ((Number(v) || 0) / total) * 100] as [string, number]);
};

const hasData = (i: AudienceInfluencer) =>
  !!normalise(AGE_BUCKETS.map(b => [b, Number(i.audience_age_breakdown?.[b] || 0)])) ||
  !!normalise(GENDERS.map(g => [g, Number(i.audience_gender_breakdown?.[g] || 0)])) ||
  ((i.audience_top_cities || []).length > 0);

export function buildAudience(list: AudienceInfluencer[]) {
  const creators = list.filter(Boolean);
  const followerValues = creators.map(c => Number(c.follower_count || 0));
  const withFollowers = followerValues.filter(f => f > 0);
  const avgFollowers = withFollowers.length
    ? withFollowers.reduce((a, b) => a + b, 0) / withFollowers.length
    : 1;

  const totalFollowers = followerValues.reduce((a, b) => a + b, 0);
  const creatorsWithData = creators.filter(hasData).length;

  // Effective weight: real followers, or the average for zero-follower creators
  const weights = creators.map(c => {
    const f = Number(c.follower_count || 0);
    return f > 0 ? f : avgFollowers;
  });

  const weightedAvg = (pick: (c: AudienceInfluencer) => number | null) => {
    let acc = 0;
    let wsum = 0;
    creators.forEach((c, idx) => {
      const v = pick(c);
      if (v == null) return;
      acc += weights[idx] * v;
      wsum += weights[idx];
    });
    return wsum > 0 ? acc / wsum : 0;
  };

  const weightedKE = weightedAvg(c => {
    const v = Number(c.audience_kenya_pct ?? NaN);
    return Number.isFinite(v) ? v : null;
  });

  const langs = new Set<string>();
  creators.forEach(c => (c.languages || []).forEach(l => langs.add(l)));

  const bucketed = (
    keys: string[],
    pick: (c: AudienceInfluencer) => Record<string, number> | null | undefined,
  ) => {
    const acc = new Map<string, number>(keys.map(k => [k, 0]));
    let wsum = 0;
    creators.forEach((c, idx) => {
      const norm = normalise(keys.map(k => [k, Number(pick(c)?.[k] || 0)]));
      if (!norm) return;
      wsum += weights[idx];
      norm.forEach(([k, v]) => acc.set(k, (acc.get(k) || 0) + weights[idx] * v));
    });
    return keys.map(k => ({ key: k, pct: wsum > 0 ? (acc.get(k) || 0) / wsum : 0 }));
  };

  const ages = bucketed(AGE_BUCKETS, c => c.audience_age_breakdown).map(x => ({
    bucket: x.key,
    pct: x.pct,
  }));
  const genders = bucketed(GENDERS, c => c.audience_gender_breakdown).map(x => ({
    gender: x.key,
    pct: x.pct,
  }));

  // Cities: normalise each creator's city list to 100% first, then weight
  const cityAcc = new Map<string, number>();
  let cityWsum = 0;
  creators.forEach((c, idx) => {
    const list = (c.audience_top_cities || []) as Array<{ city: string; pct: number }>;
    const norm = normalise(list.map(x => [x.city, Number(x.pct || 0)]));
    if (!norm) return;
    cityWsum += weights[idx];
    norm.forEach(([city, pct]) => cityAcc.set(city, (cityAcc.get(city) || 0) + weights[idx] * pct));
  });
  const cities = Array.from(cityAcc.entries())
    .map(([city, v]) => ({ city, pct: cityWsum > 0 ? v / cityWsum : 0 }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 6);

  return {
    totalFollowers,
    weightedKE,
    diaspora: Math.max(0, 100 - weightedKE),
    langs,
    ages,
    genders,
    cities,
    creatorCount: creators.length,
    creatorsWithData,
    zeroFollowerCount: creators.length - withFollowers.length,
  };
}
