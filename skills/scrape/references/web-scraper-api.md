# Web Scraper API - the popular scrapers and how to call them

Answers the question "which ready scraper covers these fields, and how do I call it".

Bright Data maintains these scrapers. Each call runs live against the site, so nothing here is stored data.

## Contents

- The table is a cache, not the catalogue
- The input is not always a URL
- Top 25 scrapers, grouped by platform (the Facebook name trap lives there)
- How to call a scraper
- Learning inputs and outputs without spending credits

## The table is a cache, not the catalogue

The table below is bundled so the common cases cost zero discovery calls. It is not the whole library. A name that fails falls back to a live search:

| Looking for | Call |
|---|---|
| The pipelines the CLI ships | `bdata pipelines list` |
| The full library, thousands of scrapers | `curl -H "Authorization: Bearer $BRIGHTDATA_API_KEY" https://api.brightdata.com/datasets/list` |
| Everything in one call, schema included | `node ../scripts/find-scraper.mjs <name or gd_ id> --schema` |

The list endpoint needs the API key header. Without it the call returns 401, even though it is a free read.

The CLI's own usage messages print `brightdata`, which is the same binary as `bdata`.

If a bundled `dataset_id` is rejected as unknown, do not retry it and do not guess a replacement. Fall back to `curl -H "Authorization: Bearer $BRIGHTDATA_API_KEY" https://api.brightdata.com/datasets/list` and match on the scraper name.

Six of the 25 below have no CLI pipeline. For those the `dataset_id` is the only way to call them.

## The input is not always a URL

The ids bundled below are mostly the by-URL variants. Platforms also ship sibling scrapers keyed by username, hashtag, keyword, or category - separate catalogue rows with their own ids. A user who brings "posts for hashtag X" or "products for keyword Y" instead of a link is still served here: search the live list for the platform name and pick the variant whose name matches the input in hand.

Verified example, two doors (both by free empty-body probes):

| Scraper | dataset_id | Rejection names |
|---|---|---|
| Instagram - Posts | `gd_lk5ns7kz21pck8jpis` | `url` required |
| Tiktok posts by keyword | `gd_lilwhto81z415d9mdl` | `search_keyword` required |

Two catalogue cautions, both hit live: some rows are purchasable datasets, not scrapers, and a trigger answers "This dataset does not support collection" (route those to the marketplace reference). And the list carries internal rows (names with "[Internal use]", "[delete]", "test") - never pick one of those.

## Top 25 scrapers, grouped by platform

The 25 most-used scrapers, grouped by platform so one look answers "what can I get from this site". `#` is the usage rank, so lower numbers are the safer default when several fit. Input types are in brackets.

### YouTube

| # | Scraper | CLI pipeline | dataset_id | Required | Optional |
|---|---|---|---|---|---|
| 1 | Videos | `youtube_videos` | `gd_lk56epmy2i5g7lzu0k` | `url` (url) | `country` (text), `transcription_language` (text) |
| 22 | Comments | `youtube_comments` | `gd_lk9q0ew71spt1mxywf` | `url` (url) | `sort_by` (text) |
| 25 | Channels | `youtube_profiles` | `gd_lk538t2k2p1k3oos71` | `url` (url) | none |

### Facebook

| # | Scraper | CLI pipeline | dataset_id | Required | Optional |
|---|---|---|---|---|---|
| 2 | Pages posts by profile URL | none | `gd_lkaxegm826bjpoo9m5` | `url` (url) | `start_date` (text), `end_date` (text) |
| 8 | Posts by group URL | none | `gd_lz11l67o2cb3r0lkj3` | `url` (url) | `start_date` (text), `end_date` (text) |
| 11 | Comments | none | `gd_lkay758p1eanlolqw8` | `url` (url) | `comments_sort` (text) |

**The name trap lives here.** The CLI's `facebook_posts` pipeline is a FOURTH scraper, "Posts by post URL" (`gd_lyclm1571iy3mv57zw`) - one post's data from its direct link. It is NOT row 2's "Pages Posts by Profile URL". Similar names, different scrapers. Use the ids above, never guess from names.

### TikTok

| # | Scraper | CLI pipeline | dataset_id | Required | Optional |
|---|---|---|---|---|---|
| 3 | Posts | `tiktok_posts` | `gd_lu702nij2f790tmv9h` | `url` (url) | `country` (text) |
| 15 | Posts by profile | none | `gd_lj71gn6l68bz7y9hc` | `url` | `start_date`, `end_date` |
| 23 | Profiles | `tiktok_profiles` | `gd_l1villgoiiidt09ci` | `url` (url) | `country` (text) |

A newer "Fast API" variant of row 15 exists (`gd_m7n5v2gq296pex2f5m`), but it is not enabled on every account and its metadata endpoint returns 404. Prefer the id in the table. Row 15 shows field names without types because the trigger probe returns names only and this scraper has no metadata endpoint.

### Instagram

| # | Scraper | CLI pipeline | dataset_id | Required | Optional |
|---|---|---|---|---|---|
| 4 | Posts | `instagram_posts` | `gd_lk5ns7kz21pck8jpis` | `url` (url) | none |
| 5 | Profiles | `instagram_profiles` | `gd_l1vikfch901nx3by4` | `url` (url) | none |
| 10 | Reels | `instagram_reels` | `gd_lyclm20il4r5helnj` | `url` (url) | none |

### LinkedIn

| # | Scraper | CLI pipeline | dataset_id | Required | Optional |
|---|---|---|---|---|---|
| 6 | Person profile | `linkedin_person_profile` | `gd_l1viktl72bvl7bjuj0` | `url` (url) | none |
| 9 | Posts | `linkedin_posts` | `gd_lyy3tktm25m4avu764` | `url` (url) | none |
| 13 | Job listings | `linkedin_job_listings` | `gd_lpfll7v5hcqtkxl6l` | `url` (url) | none |
| 19 | Company info | `linkedin_company_profile` | `gd_l1vikfnt1wgvvqz95w` | `url` (url) | none |

### Amazon

| # | Scraper | CLI pipeline | dataset_id | Required | Optional |
|---|---|---|---|---|---|
| 7 | Products | `amazon_product` | `gd_l7q7dkf244hwjntr0` | `url` (url) | `asin` (text), `zipcode` (text), `language` (text) |
| 20 | Reviews | `amazon_product_reviews` | `gd_le8e811kzy4ggddlq` | `url` (url) | none |

### Reddit

| # | Scraper | CLI pipeline | dataset_id | Required | Optional |
|---|---|---|---|---|---|
| 16 | Posts | `reddit_posts` | `gd_lvz8ah06191smkebj4` | `url` (url) | none |
| 18 | Comments | none | `gd_lvzdpsdlw09j6t702` | `url` (url) | `sort_by` (text) |

Reddit is a robots.txt-disallowed target, so calls can be refused until the account has KYC. Read the error, and see [web-unlocker.md](web-unlocker.md) for the KYC error codes.

### Other retail and listings

| # | Scraper | CLI pipeline | dataset_id | Required | Optional |
|---|---|---|---|---|---|
| 12 | Walmart - products | `walmart_product` | `gd_l95fol7l1ru6rlo116` | `url` (url) | `zipcode` (text) |
| 14 | Free People - products | none | `gd_mm1zqyo61zzvsb9ux` | `url` (url) | none |
| 17 | Zillow - property listings | `zillow_properties_listing` | `gd_lfqkr8wm13ixtbd8f5` | `url` (url) | none |
| 21 | Google Maps - reviews | `google_maps_reviews` | `gd_luzfs1dn2oa0teb81` | `url` (url) | `sort_by` (text) |
| 24 | X - posts | `x_posts` | `gd_lwxkxvnf1cynvib9co` | `url` (url) | none |
| - | X - profiles | none | `gd_lwxmeb2u1cniijd7t4` | `url` (url) | none |

X - profiles carries no usage rank because it is not one of the 25. It is bundled because a platform's presence in this table does not mean all its scrapers are listed, so when the row's object (posts, profiles, comments) does not match the ask, search the live catalogue instead of forcing the listed row.

Three pipelines take a second positional argument on the CLI that is not in the REST input list:

```
bdata pipelines amazon_product_reviews <url> [max_reviews]
bdata pipelines google_maps_reviews <url> [days_limit]
bdata pipelines youtube_comments <url> [num_comments]
```

Run any pipeline with no arguments to see its own usage line.

## How to call a scraper

Every REST call needs the header `Authorization: Bearer $BRIGHTDATA_API_KEY`.

**With a pipeline.** The CLI triggers the job, polls it, and prints the records.

```
bdata pipelines linkedin_company_profile https://www.linkedin.com/company/stripe
```

**Without a pipeline.** Three REST calls, because the API is asynchronous. A trigger returns an id, not data.

```
POST https://api.brightdata.com/datasets/v3/trigger?dataset_id=gd_lkaxegm826bjpoo9m5
     Content-Type: application/json
     [{"url":"https://www.facebook.com/nasa"}]
     returns {"snapshot_id":"sd_..."}

GET  https://api.brightdata.com/datasets/v3/progress/sd_...    poll until it reports ready
GET  https://api.brightdata.com/datasets/v3/snapshot/sd_...    the records
```

The body is always a JSON array. One object per input.

After a REST trigger, one CLI call polls to completion: `bdata status <snapshot_id> --wait`. The job id is the `snapshot_id` the trigger returned.

## Learning inputs and outputs without spending credits

| Question | Free move |
|---|---|
| What arguments does this pipeline take? | Run the pipeline with no parameters. The CLI prints its usage line. |
| What fields does this scraper require? | POST an empty body `[{}]` to the trigger endpoint. Required fields come back in the `errors` array. Optional fields come back inside the `line` key, as an empty-valued JSON object. The call is rejected before any work starts, so nothing is billed. |
| What comes back, and in what types? | `GET https://api.brightdata.com/datasets/<dataset_id>/metadata` returns every output field with its type. |

For the 25 rows above the inputs are already listed. Do not probe them again. Call metadata when you need the real output field names, and skip it only when the bundled row already answers the ask. The real names rarely match the words the user used, so metadata is what turns "follower count" into `followers` and "industry" into `industries`.

On Windows PowerShell 5.1, run the probe with `curl.exe` or node. `Invoke-WebRequest` hides the 400 response body.

Output schemas are not bundled in this file on purpose. Ask metadata for the one scraper being called.
