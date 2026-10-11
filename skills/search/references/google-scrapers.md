# Google scrapers - the verticals that are their own dataset

Answers the question "which Google surface has its own pre-built scraper, and how do I trigger it".

Each entry below is a Web Scraper API dataset, not a SERP mode. SERP returns about 10 results in one call, a couple of seconds end to end. These return the full set as a job. SERP hands back a broad parsed payload you pick fields out of - a dataset job hands back that scraper's fixed schema already assembled. The trigger, poll, download mechanics live in the `scrape` skill's `references/web-scraper-api.md` and are not repeated here.

## Contents

- The catalogue
- What "confirmed" means in that table
- Top 100 Google results - the one to know
- Shopping - the only one with a CLI pipeline
- Maps - find places here, records in the scrape skill
- Flights and Hotels
- Images - a scraper exists, SERP stays the fast path
- The same surfaces through SERP instead
- Free moves, no credits

## The catalogue

| Scraper | dataset_id | CLI pipeline | Confirmed |
|---|---|---|---|
| Google SERP 100 results | `gd_mfz5x93lmsjjjylob` | none | catalogue 2026-09-06 with full schema, live trigger, and docs |
| Google Shopping | `gd_ltppk50q18kdw67omz` | `google_shopping` | catalogue 2026-09-06, CLI map |
| Google Shopping products search US | `gd_m31f2k0d2m1bah4f3b` | none | catalogue 2026-09-06 |
| Google Local Finder - find places from a query | `gd_mhkrfnjw1a9qwkj64b` | none | probe verified 2026-08-26 and 2026-09-06, absent from the catalogue |
| Google Maps reviews | see the `scrape` skill | `google_maps_reviews` | full row lives in that skill's `references/web-scraper-api.md` |
| Google AI Mode search | see `answer-engines.md` | none | full row lives there |
| Google Flights | `gd_mhng7wen1rw0a3gvpf` | none | catalogue 2026-09-06 with full schema, probes 2026-08-26 and 2026-09-06 |
| Google Hotels | `gd_mg3gjfmg12tc2n5d4d` | none | catalogue 2026-09-06 with full schema, probes 2026-08-26 and 2026-09-06 |
| Google Images | `gd_m0cda3zn1y9cr8l8yr` | none | catalogue 2026-09-06, probe verified 2026-09-06 |

`GET /datasets/v3/scrapers?domain=google.com` returns ten scrapers on 2026-09-06: the eight above plus Google Maps full information and Google Maps Images. Google News, `gd_lnsxoxzi1omrwnka5r`, is absent from the catalogue yet triggers, one of the 56 such scrapers the 2026-09-06 census of `GET /datasets/list` found, and it is out of scope here. Run the domain query before telling a user that a Google surface has no dataset at all.

The whole family is documented at docs.brightdata.com/datasets/scrapers/google/introduction. That page gives two endpoints for all of them, and they cover the answer engines in `answer-engines.md` as well:

| Endpoint | Shape | Limit |
|---|---|---|
| `POST https://api.brightdata.com/datasets/v3/scrape` | synchronous, result in the response | up to 20 inputs |
| `POST https://api.brightdata.com/datasets/v3/trigger` | asynchronous, returns a `snapshot_id` | up to 5,000 inputs |

Only the asynchronous path is verified live here. Use `/scrape` for a couple of inputs when latency matters and `/trigger` for bulk, and say the sync path is unverified from here rather than promising it.

## What "confirmed" means in that table

Three checks, all free and read-only:

| Check | Call |
|---|---|
| The id is a real scraper, with its input contract | one call: `node ../../scrape/scripts/find-scraper.mjs <gd_ id>` - one GET, `/datasets/v3/scrapers?dataset_id=<id>`, every variant's typed inputs, outputs, sample input and trigger line. On a machine without node, `curl -H "Authorization: Bearer $BRIGHTDATA_API_KEY" "https://api.brightdata.com/datasets/v3/scrapers?dataset_id=<id>"` |
| The id has an output schema | the same answer's `output_fields`. `GET https://api.brightdata.com/datasets/<dataset_id>/metadata` answers, with the same active field set, for an id that is in both `/datasets/list` and the catalogue; it is 404 for every catalogue-only id; for a list-only row it is usually 404 (771 of 807 on 2026-09-06) |
| The CLI binds a pipeline to it | the `DATASET_IDS` map inside `@brightdata/cli` |

The catalogue lists only real scrapers, 1006 on 2026-09-06, so a hit means the id is a ready scraper with a published schema. It carries no ownership or subscription marker, and whether every account can run every one of them is not verified here.

Absent from the catalogue is a signature, not a verdict. Fifty-six scrapers that trigger are absent from it, found by a census of every `GET /datasets/list` row on 2026-09-06, and Google Local Finder `gd_mhkrfnjw1a9qwkj64b` is one of them: `?dataset_id=` returns an empty array for it, and the one empty-body probe the script sends after that empty answer is what finds it, naming `url` and `search_keyword`, required fields certain, outputs unlisted. So read "not in the catalogue, probe names required fields" as a real scraper the catalogue omits, never as "wrong". If an id is rejected as unknown, do not retry it and do not guess a replacement. Look it up in the control panel scraper page instead.

## Top 100 Google results - the one to know

Dataset id `gd_mfz5x93lmsjjjylob`. Google removed the `num=100` parameter, so no single request returns 100 rows any more - this job walks the pages instead and hands back one result set. About 10 results per page, so pages 1 to 10 is the top 100.

This exact id does not appear in `GET /datasets/list` and its metadata endpoint returns 404, verified, yet the scrapers catalogue carries it with a full schema: `?dataset_id=gd_mfz5x93lmsjjjylob` returns the row, `url` the only required input and fourteen optional ones, 2026-09-06. That pairing is normal for a scraper the catalogue carries and the list does not, and it is not a retirement signal. The scraper is documented at docs.brightdata.com/scraping-automation/serp-api/get-top-100-google-results, and it works on trigger.

This runs as a Web Scraper API job. Three REST calls: a trigger that returns a `snapshot_id`, a progress poll, then a snapshot download.

```
POST https://api.brightdata.com/datasets/v3/trigger?dataset_id=gd_mfz5x93lmsjjjylob&include_errors=true
     Authorization: Bearer $BRIGHTDATA_API_KEY
     Content-Type: application/json
     [{"url":"https://www.google.com/","keyword":"pizza","language":"en","country":"US","start_page":1,"end_page":10}]

GET  https://api.brightdata.com/datasets/v3/progress/<snapshot_id>    poll until it reports ready
GET  https://api.brightdata.com/datasets/v3/snapshot/<snapshot_id>?format=json
```

| Input | Required | Meaning |
|---|---|---|
| `url` | **yes, the only one** | the search domain, e.g. `https://www.google.com/`. Verified by the empty-body probe |
| `keyword` | no | the query |
| `language` | no | ISO 639-1, e.g. `en`, `de` |
| `country` | no | ISO 3166-1, e.g. `US`, `DE` |
| `start_page`, `end_page` | no | first and last page. `1` to `10` is the top 100 |
| `collapse_aio` | no | hide or show the AI Overview |
| `brd_mobile` | no | mobile results |
| `udm_web` | no | Web tab results. Cannot be combined with `tbm` |
| `include_paginated_html` | no | include the raw HTML |

The schema also accepts `uule`, `tbs`, `tbm`, `nfpr` and `index`.

The docs page marks nothing required and does not list `url`. The live probe and the catalogue both name `url` as the only required field, so trust them. Send the others anyway, because a bare domain with no keyword is not a useful job.

After a REST trigger, one CLI call polls to completion:

```
bdata status <snapshot_id> --wait
```

Anything about cost belongs to the `billing` skill.

## Shopping - the only one with a CLI pipeline

`google_shopping` is in the CLI's shipped pipeline list, verified with `bdata pipelines list`, and the CLI binds it to `gd_ltppk50q18kdw67omz`, the same id the docs give.

```
bdata pipelines google_shopping <url> --pretty
```

The pipeline takes a URL, not a keyword. Its usage line prints `<url>` only, and its default branch sends the first argument as the `url` field, so a bare keyword is submitted as a URL and no keyword search happens.

Google Shopping products search US (`gd_m31f2k0d2m1bah4f3b`) also takes `url` only, so neither Shopping path accepts a bare keyword. For a keyword ask, use SERP with `udm=28`. That second dataset has no CLI pipeline and is triggered over REST with the same trigger, poll, download shape as the top-100 job above. Both ids are visible in the platform catalogue for this key.

## Maps - find places here, records in the scrape skill

Finding places from a query is **Google Local Finder**, `gd_mhkrfnjw1a9qwkj64b`. Probe verified 2026-08-26 and again 2026-09-06: it requires both `url` and `search_keyword`, and it also accepts `uule`, `gl` and `se`. It is absent from the scrapers catalogue, so the probe is its only free schema source, required fields certain, outputs unlisted. It has no CLI pipeline, so trigger the dataset.

Google Maps reviews is in the top-25 table in the `scrape` skill's `references/web-scraper-api.md`, with its id, its pipeline and its optional `days_limit` and `sort_by`. Its extra CLI argument `days_limit` sits in the block below that table. Use that row. It is not repeated here.

"Google Maps full information", `gd_m8ebnr0q2qlklc02fz`, takes a known business URL, which is a records-from-a-known-place job - the `scrape` skill. The catalogue also gives it a `discover_by_location` door, `country` and `keyword` required, `lat`, `long` and `zoom_level` optional, so it can find places from a query as well and hand back the full-information schema.

Pulling reviews from a place you already know is a records-from-a-known-place job, which is the `scrape` skill. Finding places from a query is this skill.

## Flights and Hotels

Both are in the scrapers catalogue with full schemas, 2026-09-06. Neither appears in `GET /datasets/list` and metadata returns 404 for both, the normal signature of a scraper the catalogue carries and the list does not.

Each has two kinds of door. `collect_by_url` takes a Google URL the user already holds, and that URL cannot be built from a plain ask. A discovery door takes plain inputs and runs the search itself, so a plain ask is possible after all.

| Scraper | dataset_id | `collect_by_url` | Discovery door |
|---|---|---|---|
| Google Flights | `gd_mhng7wen1rw0a3gvpf` | `url` (url), which carries a base64 `tfs` blob | `discover_by_input_filters`. Required: `origin` (text), `destination` (text), `trip_type` (text), `adults` (number). Optional: `departure` (date), `return` (date), `children` (number), `infants_in_seat` (number), `infants_on_lap` (number), `cabin` (text), `currency` (text), `language` (text), `country` (text) |
| Google Hotels | `gd_mg3gjfmg12tc2n5d4d` | `url` (url), which carries an opaque entity id, plus optional `country` (text) | `discover_by_search`. Required: `search_term` (text), `check_in_date` (date), `check_out_date` (date), `guest_number` (number). Optional: `country` (text), `currency` (text), `sort_by` (text), `accommodation_type` (text), `property_type` (array). A second door, `discover_by_filter_url`, takes a `google.com/travel/search` URL with optional `country` and `currency` |

A discovery door triggers with `&type=discover_new&discover_by=input_filters` (Flights) or `&discover_by=search` (Hotels) appended to the trigger URL. `node ../../scrape/scripts/find-scraper.mjs <gd_ id> --variant input_filters` prints the exact line, and `--sample` the catalogue's sample body.

## Images - a scraper exists, SERP stays the fast path

Google Images has a scraper of its own, `gd_m0cda3zn1y9cr8l8yr`, in the scrapers catalogue on 2026-09-06 with `collect_by_url` as its only door and `url` as its only input, and it answered the empty-body probe the same day by naming `url`. Its `url` is a Google image search URL with `udm=2`, the same URL the SERP path takes.

So Google Images is a SERP job when one synchronous page of results is enough, with `udm=2` in the search URL as `serp.md` describes, and a dataset job when the ask wants the scraper's assembled schema. The catalogue also carries "Google Maps Images", `gd_min8y25y1z5op1eska`, which is place photos and not image search.

## The same surfaces through SERP instead

Maps, Hotels and Flights are also reachable through one synchronous SERP call, by putting a Google URL in the request, but only the Maps URL can be built from the ask:

| Vertical | SERP URL to send |
|---|---|
| Maps | `google.com/maps/search/<query>/`, built straight from the query |
| Hotels | a `google.com/travel/hotels` URL, which needs an opaque entity id the user already holds |
| Flights | a `google.com/travel/flights` URL, which needs a base64 `tfs` blob the user already holds |

That is the fast and shallow path. The scrapers above are the slow and complete one. Pick by what the user asked for, and say which one you picked.

## Free moves, no credits

| Question | Free move |
|---|---|
| Is this id a real scraper, and what does it take? | one call: `node ../../scrape/scripts/find-scraper.mjs <gd_ id>`, or `<domain> --schema` - one GET, `/datasets/v3/scrapers?dataset_id=<id>`, or one or two with `?domain=`, both spellings; typed inputs, outputs, sample input and trigger line per variant. An id the catalogue omits gets one empty-body probe from the script, required fields certain, outputs unlisted. On a machine without node, `curl -H "Authorization: Bearer $BRIGHTDATA_API_KEY" "https://api.brightdata.com/datasets/v3/scrapers?domain=google.com"` lists every scraper whose domain is exactly `google.com` (ten on 2026-09-06); subdomains such as `gemini.google.com` and `maps.google.com` are their own domains |
| What does it return? | `output_fields` in the same answer. `GET https://api.brightdata.com/datasets/<dataset_id>/metadata` answers, with the same active field set, for an id that is in both `/datasets/list` and the catalogue; it is 404 for every catalogue-only id; for a list-only row it is usually 404 (771 of 807 on 2026-09-06). It adds nothing here |
| What inputs does it require, when the catalogue omits the id? | the empty-body probe in the `scrape` skill's `references/web-scraper-api.md`, with its zero-required-fields caution |
| Which pipelines ship with the CLI? | `bdata pipelines list` |
