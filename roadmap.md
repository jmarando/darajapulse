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
