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
- Images has no scraper of its own
- The same surfaces through SERP instead
- Free moves, no credits

## The catalogue

| Scraper | dataset_id | CLI pipeline | Confirmed |
|---|---|---|---|
| Google SERP 100 results | `gd_mfz5x93lmsjjjylob` | none | live trigger, and docs |
| Google Shopping | `gd_ltppk50q18kdw67omz` | `google_shopping` | live list, live metadata, CLI map |
| Google Shopping products search US | `gd_m31f2k0d2m1bah4f3b` | none | live list, live metadata |
| Google Local Finder - find places from a query | `gd_mhkrfnjw1a9qwkj64b` | none | probe verified 2026-08-26 |
| Google Maps reviews | see the `scrape` skill | `google_maps_reviews` | full row lives in that skill's `references/web-scraper-api.md` |
| Google AI Mode search | see `answer-engines.md` | none | full row lives there |
| Google Flights | `gd_mhng7wen1rw0a3gvpf` | none | probe verified 2026-08-26 |
| Google Hotels | `gd_mg3gjfmg12tc2n5d4d` | none | probe verified 2026-08-26 |

The live catalogue carries more of the Google SERP family than this table documents, among them Google SERP and Google News. They are out of scope here, so list the catalogue before telling a user that a Google surface has no dataset at all.

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
| The id is visible in the platform catalogue for this key | one call: `node ../../scrape/scripts/find-scraper.mjs <name or gd_ id> --schema` - it filters junk rows and returns the input contract. On a machine without node, fall back to `curl -H "Authorization: Bearer $BRIGHTDATA_API_KEY" https://api.brightdata.com/datasets/list` |
| The id has an output schema | `GET https://api.brightdata.com/datasets/<dataset_id>/metadata` |
| The CLI binds a pipeline to it | the `DATASET_IDS` map inside `@brightdata/cli` |

That list has no ownership marker and it includes marketplace datasets, so a hit means the id is visible in the platform catalogue for this key, not that the account owns or is subscribed to it.

Absent from the catalogue plus a 404 from metadata is a signature, not a verdict. It means the id is published by Bright Data but is invisible to the discovery endpoints this key can see. That is the exact signature of `gd_mfz5x93lmsjjjylob`, which triggers fine anyway, and of the Flights and Hotels rows above, which answered the probe. So read it as "this id cannot be confirmed from the catalogue", never as "wrong". If one is rejected as unknown, do not retry it and do not guess a replacement. Look it up in the control panel scraper page instead.

## Top 100 Google results - the one to know

Dataset id `gd_mfz5x93lmsjjjylob`. Google removed the `num=100` parameter, so no single request returns 100 rows any more - this job walks the pages instead and hands back one result set. About 10 results per page, so pages 1 to 10 is the top 100.

This exact id does not appear in `GET /datasets/list`, verified, so that list cannot recover it, even though the same list does carry other Google SERP-family datasets. Its metadata endpoint returns 404 as well. It is verified live and documented at docs.brightdata.com/scraping-automation/serp-api/get-top-100-google-results, and it works on trigger even though the list omits it.

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

The docs page marks nothing required and does not list `url`. The live probe names `url` as the only required field, so trust the probe. Send the others anyway, because a bare domain with no keyword is not a useful job.

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

Finding places from a query is **Google Local Finder**, `gd_mhkrfnjw1a9qwkj64b`. Probe verified 2026-08-26: it requires both `url` and `search_keyword`, and it also accepts `uule`, `gl` and `se`. It has no CLI pipeline, so trigger the dataset.

Google Maps reviews is row 21 of the top-25 table in the `scrape` skill's `references/web-scraper-api.md`, with its id, its pipeline and its optional `sort_by`. Its extra CLI argument `days_limit` sits in the block below that table. Use that row. It is not repeated here.

"Google Maps full information", `gd_m8ebnr0q2qlklc02fz`, takes a known business URL, which is a records-from-a-known-place job - the `scrape` skill.

Pulling reviews from a place you already know is a records-from-a-known-place job, which is the `scrape` skill. Finding places from a query is this skill.

## Flights and Hotels

Both are probe verified 2026-08-26. Neither appears in `GET /datasets/list` and metadata returns 404 for both, which means invisible to the discovery endpoints, not wrong.

| Scraper | dataset_id | Note |
|---|---|---|
| Google Flights | `gd_mhng7wen1rw0a3gvpf` | routes, dates, prices. Its input URL carries a base64 `tfs` blob, so it cannot be built from a plain ask |
| Google Hotels | `gd_mg3gjfmg12tc2n5d4d` | rates and availability. Its input URL carries an opaque entity id, so it cannot be built from a plain ask |

Neither URL is constructible, so either the user already holds one or you get there from a search result. Their exact input field lists are not published on the overview page. Learn them with the empty-body probe in the `scrape` skill's `references/web-scraper-api.md`, which costs nothing.

## Images has no scraper of its own

Checked in the official Google Scraper API page and in the live dataset list. There is no Google Images scraper. The list does carry "Google Maps Images", which is place photos and not image search.

So Google Images is a SERP job, not a dataset job. Use `udm=2` in the search URL, as `serp.md` describes.

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
| Is this id visible in the platform catalogue for this key? | one call: `node ../../scrape/scripts/find-scraper.mjs <name or gd_ id> --schema` - it filters junk rows and returns the input contract. On a machine without node, fall back to `curl -H "Authorization: Bearer $BRIGHTDATA_API_KEY" https://api.brightdata.com/datasets/list`, which has no ownership marker and includes marketplace datasets |
| What does it return? | `GET https://api.brightdata.com/datasets/<dataset_id>/metadata` |
| What inputs does it require? | the empty-body probe in the `scrape` skill's `references/web-scraper-api.md` |
| Which pipelines ship with the CLI? | `bdata pipelines list` |
