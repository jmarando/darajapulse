# Roadmap

## Regionalisation (done)
- [x] Schema: countries/cities reference tables; country_code on influencers (+city), discovery_creators, campaigns; indexes
- [x] Backfill: campaigns KE/TZ, creators KE (11 TZ), discovery KE — cities left blank
- [x] reporting_publications returns creator country/city + campaign country
- [x] Shared geo source of truth (src/lib/geo.ts)
- [x] Creators list: country/city filters + location on cards, profile editing
- [x] Discovery: country/city filters applied in the database query
- [x] Reports: country/city filters, chips, URL context, country breakdown table + chart, location in By influencer
- [x] Exports: By country sheet + country/city columns
- [x] Campaign roster: country filter chips + location under each creator
- [x] QA: typecheck clean, Reports verified live (Kenya 112 creators / Tanzania 10)

## Follow-ups (not blocking)
- City values for roster creators are blank; Discovery cities are free text (neighbourhoods, spelling variants) and not normalised against the cities table.

## Discovery expansion — Kenya, Uganda, Tanzania (done 17 Sep)
- [x] Country playbooks (cities, hashtags, keywords, bio signals, niches) in _shared/discovery-countries.ts
- [x] discovery-harvest: TikTok hashtag + keyword + follow graph, Instagram hashtag; credit cap per country; staff only; one country per run with hand-off
- [x] discovery_harvest_runs log + scraper_credit_log entries
- [x] discovery-seed is country-aware (country_code + ai_estimated source)
- [x] Discovery page: Harvest / AI suggest act on the selected country
- [ ] Tag niches on harvested rows (cheap Gemini batch from hashtags + bios)
- [ ] Spot-check Instagram country guesses (inferred_hashtag) before outreach
- [ ] Facebook / YouTube harvesting; contest entrants → verified discovery rows
- [ ] Optional weekly pg_cron harvest (~1,000 credits/week)
