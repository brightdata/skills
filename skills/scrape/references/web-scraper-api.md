# Web Scraper API - the popular scrapers and how to call them

Answers the question "which ready scraper covers these fields, and how do I call it".

Bright Data maintains these scrapers. Each call runs live against the site, so nothing here is stored data.

## Contents

- The table is a cache, not the catalogue
- The input is not always a URL
- 25 ready scrapers, grouped by platform (the Facebook name trap lives there)
- How to call a scraper
- Learning inputs and outputs without spending credits

## The table is a cache, not the catalogue

The table below is bundled so the common cases cost zero discovery calls. It is not the whole library. A name that fails falls back to a live search:

| Looking for | Call |
|---|---|
| The pipelines the CLI ships | `bdata pipelines list` |
| One scraper by id, schema included | `curl -H "Authorization: Bearer $BRIGHTDATA_API_KEY" "https://api.brightdata.com/datasets/v3/scrapers?dataset_id=<gd_ id>"` |
| Every scraper for one site | `curl -H "Authorization: Bearer $BRIGHTDATA_API_KEY" "https://api.brightdata.com/datasets/v3/scrapers?domain=<domain>"` |
| Everything in one call, schema included | `node ../scripts/find-scraper.mjs <gd_ id>`, or `node ../scripts/find-scraper.mjs <name or domain> --schema` |

The live catalogue is `GET https://api.brightdata.com/datasets/v3/scrapers`. It lists only real scrapers, 1006 of them on 2026-09-06, each with its variants: typed inputs and a control-panel link on every variant, output descriptions and a sample input on most (every bundled row has one). It needs the API key header. Without it the call returns 401, even though it is a free read. It takes exactly two filters: `?dataset_id=` returns one row and `?domain=` returns every scraper whose domain is exactly that string. The filter is exact and case-sensitive, so `chatgpt.com` returns its row and `Chatgpt.com` returns an empty array, and 274 of the 1006 rows spell their domain with a leading `www.`, so a domain lookup is one or two GETs, bare first, then with `www.`. Any other parameter is a 400.

Unfiltered, the answer is 4.2 to 4.9 MB and takes 5.5 to 17 seconds, so the script caches it locally for 24 hours and `--refresh` refetches it. The cache holds the catalogue only, nothing derived from the key. A warm cache serves a name search hit with no network call, so it does not check the key; a miss refetches once to confirm. `--refresh` refetches and does check the key.

The script takes a `gd_` id, a domain (anything containing a dot), or part of a scraper name. An id is one GET with `?dataset_id=`; a domain one or two GETs with `?domain=`, both spellings, and a domain that matches neither is a no-match with no fall-through to the bulk read; a name is a search of the cached catalogue. An id always prints the schema. A name or domain query lists matches only, and says nothing about whether a row can be triggered, until `--schema` is added; `--variant` and `--sample` imply it. The trigger verdict, including "marketplace dataset, not a scraper", comes with the schema. Exit codes: 0 listed or ready to trigger, 1 no result or not a scraper, 2 auth or network.

The CLI's own usage messages print `brightdata`, which is the same binary as `bdata`.

If a bundled `dataset_id` is rejected as unknown, do not retry it and do not guess a replacement. Run `node ../scripts/find-scraper.mjs <the rejected id>`. An id the catalogue does not carry gets one empty-body probe, which still finds the scrapers the catalogue omits and still answers "marketplace dataset, not a scraper" for a download, required fields certain, outputs unlisted. Then search by name.

## The input is not always a URL

One scraper carries several doors, called variants, and each door has its own required inputs. The catalogue lists them under `scrapers.<variant>`, and the Discovery column of the table below names every bundled scraper's discovery doors. Verified example, one id, two doors, catalogue and empty-body probe agreeing on 2026-09-06 (the keyword door has a required field, so that probe is safe):

| Scraper | dataset_id | Variant | Required | Optional |
|---|---|---|---|---|
| TikTok - Posts | `gd_lu702nij2f790tmv9h` | `collect_by_url` | `url` (url) | `discovery_input` (object), `country` (text) |
| TikTok - Posts | `gd_lu702nij2f790tmv9h` | `discover_by_keyword` | `search_keyword` (text) | `num_of_posts` (number), `posts_to_not_include` (array), `country` (text) |

A discovery door triggers with `&type=discover_new&discover_by=<suffix>` on the trigger URL, the suffix being the variant name without `discover_by_`, and it enforces that door's `input_schema`.

```
POST https://api.brightdata.com/datasets/v3/trigger?dataset_id=gd_lu702nij2f790tmv9h&type=discover_new&discover_by=keyword
     Content-Type: application/json
     [{"search_keyword":"#artist","country":""}]
```

That body is a real trigger, billed per record. `node ../scripts/find-scraper.mjs gd_lu702nij2f790tmv9h --variant keyword` prints that door alone, trigger line included, and `--sample` prints the catalogue's sample input as a paste-ready body.

Older discovery scrapers that were separate catalogue rows with their own ids still exist. Some still trigger, but the catalogue no longer carries them, and the script's probe fallback is what still finds them. Prefer the door on the current id.

Two catalogue cautions, both verified 2026-09-06. First, `GET /datasets/list` carries 1755 rows and the scrapers catalogue 1006. A row in the list that the catalogue does not carry is a download for sale (749, a trigger answers "This dataset does not support collection", route those to the marketplace reference), one of the 56 live scrapers the catalogue omits, which the probe finds, or a row that is not ready yet (2). Counts as of 2026-09-06. Second, the list carries rows whose names mark them as internal or test entries. The scrapers catalogue carries none of those, and the script's name search skips any that appear.

## 25 ready scrapers, grouped by platform

Twenty-five ready scrapers, grouped by platform so one look answers "what can I get from this site". Every cell but the label and the pipeline name is the catalogue's own `collect_by_url` schema, `discovery_input` included, rendered by `skill-audit/tools/scraper-table.mjs`. Input types are in brackets. The Discovery column lists the scraper's other doors as the suffix after `discover_by_`.

<!-- generated: skill-audit/tools/scraper-table.mjs, source GET /datasets/v3/scrapers, 2026-09-06, regenerate, do not edit by hand -->

### YouTube

| Scraper | CLI pipeline | dataset_id | Required | Optional | Discovery |
|---|---|---|---|---|---|
| Videos | `youtube_videos` | `gd_lk56epmy2i5g7lzu0k` | `url` (url) | `discovery_input` (object), `subscribers` (number), `country` (text), `transcription_language` (text) | keyword, url, search_filters, hashtag, explore, podcast_url |
| Comments | `youtube_comments` | `gd_lk9q0ew71spt1mxywf` | `url` (url) | `load_replies` (number), `num_of_comments` (number), `sort_by` (text) | none |
| Channels | `youtube_profiles` | `gd_lk538t2k2p1k3oos71` | `url` (url) | `discovery_input` (object) | keyword |

### Facebook

| Scraper | CLI pipeline | dataset_id | Required | Optional | Discovery |
|---|---|---|---|---|---|
| Pages posts by profile URL | none | `gd_lkaxegm826bjpoo9m5` | `url` (url) | `num_of_posts` (number), `posts_to_not_include` (array), `start_date` (text), `end_date` (text), `include_profile_data` (boolean), `country` (text) | none |
| Posts by group URL | none | `gd_lz11l67o2cb3r0lkj3` | `url` (url) | `num_of_posts` (number), `posts_to_not_include` (array), `start_date` (text), `end_date` (text), `user_to_not_include` (array) | none |
| Comments | none | `gd_lkay758p1eanlolqw8` | `url` (url) | `get_all_replies` (boolean), `limit_records` (number), `comments_sort` (text) | none |

### TikTok

| Scraper | CLI pipeline | dataset_id | Required | Optional | Discovery |
|---|---|---|---|---|---|
| Posts | `tiktok_posts` | `gd_lu702nij2f790tmv9h` | `url` (url) | `discovery_input` (object), `country` (text) | profile_url, keyword, url |
| Profiles | `tiktok_profiles` | `gd_l1villgoiiidt09ci` | `url` (url) | `discovery_input` (object), `country` (text) | search_url |

### Instagram

| Scraper | CLI pipeline | dataset_id | Required | Optional | Discovery |
|---|---|---|---|---|---|
| Posts | `instagram_posts` | `gd_lk5ns7kz21pck8jpis` | `url` (url) | `discovery_input` (object), `country` (text) | url |
| Profiles | `instagram_profiles` | `gd_l1vikfch901nx3by4` | `url` (url) | none | user_name |
| Reels | `instagram_reels` | `gd_lyclm20il4r5helnj` | `url` (url) | `posts_count` (number), `followers` (number), `following` (number), `country_code` (country), `views` (number), `video_play_count` (number) | url, url_all_reels |

### LinkedIn

| Scraper | CLI pipeline | dataset_id | Required | Optional | Discovery |
|---|---|---|---|---|---|
| Person profile | `linkedin_person_profile` | `gd_l1viktl72bvl7bjuj0` | `url` (url) | none | none |
| Posts | `linkedin_posts` | `gd_lyy3tktm25m4avu764` | `url` (url) | `num_connections` (number) | url, profile_url, company_url |
| Job listings | `linkedin_job_listings` | `gd_lpfll7v5hcqtkxl6l` | `url` (url) | `discovery_input` (object) | keyword, url |
| Company info | `linkedin_company_profile` | `gd_l1vikfnt1wgvvqz95w` | `url` (url) | none | none |

### Amazon

| Scraper | CLI pipeline | dataset_id | Required | Optional | Discovery |
|---|---|---|---|---|---|
| Products | `amazon_product` | `gd_l7q7dkf244hwjntr0` | `url` (url) | `asin` (text), `origin_url` (url), `zipcode` (text), `language` (text), `all_variations` (boolean) | keyword, category_url, best_sellers_url, upc |
| Reviews | `amazon_product_reviews` | `gd_le8e811kzy4ggddlq` | `url` (url) | `reviews_to_not_include` (array), `max_reviews` (number), `variation_specific` (boolean) | none |

### Reddit

| Scraper | CLI pipeline | dataset_id | Required | Optional | Discovery |
|---|---|---|---|---|---|
| Posts | `reddit_posts` | `gd_lvz8ah06191smkebj4` | `url` (url) | none | subreddit_url, keyword, author_url |
| Comments | none | `gd_lvzdpsdlw09j6t702` | `url` (url) | `days_back` (number), `load_all_replies` (boolean), `comment_limit` (number), `sort_by` (text) | none |

### Other retail and listings

| Scraper | CLI pipeline | dataset_id | Required | Optional | Discovery |
|---|---|---|---|---|---|
| Walmart - products | `walmart_product` | `gd_l95fol7l1ru6rlo116` | `url` (url) | `all_variations` (boolean), `zipcode` (text), `store_id` (number) | category_url, keyword, sku |
| Free People - products | none | `gd_mm1zqyo61zzvsb9ux` | `url` (url) | `all_variations` (boolean) | sitemap |
| Zillow - property listings | `zillow_properties_listing` | `gd_lfqkr8wm13ixtbd8f5` | `url` (url) | none | url, input_filters |
| Google Maps - reviews | `google_maps_reviews` | `gd_luzfs1dn2oa0teb81` | `url` (url) | `days_limit` (number), `sort_by` (text) | none |
| X - posts | `x_posts` | `gd_lwxkxvnf1cynvib9co` | `url` (url) | `country` (text) | profile_url, profiles_array |
| X - profiles | none | `gd_lwxmeb2u1cniijd7t4` | `url` (url) | `max_number_of_posts` (number) | user_name |

Six of the 25 rows have no CLI pipeline. For those the `dataset_id` is the only way to call them.

<!-- end generated: skill-audit/tools/scraper-table.mjs, regenerate, do not edit by hand -->

**The name trap lives in the Facebook table.** The CLI's `facebook_posts` pipeline is a FOURTH Facebook scraper, "Facebook - Posts by post URL" (`gd_lyclm1571iy3mv57zw`) - one post's data from its direct link. It is NOT "Pages posts by profile URL". Similar names, different scrapers. Use the ids above, never guess from names.

TikTok has a second posts-by-profile scraper, "TikTok - Posts by Profile Fast API" (`gd_m7n5v2gq296pex2f5m`), with a full typed schema in the catalogue: `url` required, `start_date`, `end_date` and `num_of_posts` optional. Its metadata endpoint returns 404, which is normal for a scraper the catalogue carries and `/datasets/list` does not. Whether it is enabled on every account is not verified, so prefer the `discover_by_profile_url` door of the TikTok Posts row above. The older "Tiktok - posts by profile" id `gd_lj71gn6l68bz7y9hc` is absent from the catalogue, its metadata answers 404, and a trigger answers "This dataset does not support collection", the answer a download for sale gives, so it is not a scraper to run.

Reddit is a robots.txt-disallowed target, so calls can be refused until the account has KYC. Read the error, and see [web-unlocker.md](web-unlocker.md) for the KYC error codes.

X - profiles is in the table as the reminder that a platform's presence here does not mean all its scrapers are listed. When the row's object (posts, profiles, comments) does not match the ask, search the live catalogue instead of forcing the listed row.

Three pipelines take a second positional argument on the CLI:

```
bdata pipelines amazon_product_reviews <url> [max_reviews]
bdata pipelines google_maps_reviews <url> [days_limit]
bdata pipelines youtube_comments <url> [num_comments]
```

Each is one of the catalogue's optional inputs on that scraper, `max_reviews`, `days_limit` and `num_of_comments`, so the REST and CLI surfaces agree. Run any pipeline with no arguments to see its own usage line.

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
| What does this scraper take, and what comes back? | `node ../scripts/find-scraper.mjs <gd_ id>`, one GET on the catalogue, schema printed without any flag. Per variant: required and optional inputs with types, output fields, most with a description, the sample input, the trigger line and the control-panel link. `--variant <door>` narrows it to one door and `--sample` prints the sample input as a paste-ready trigger body. |
| The catalogue does not carry the id | The empty-body probe: `POST https://api.brightdata.com/datasets/v3/trigger?dataset_id=<id>` with body `[{}]`. Required fields come back in the `errors` array, some optional fields, the text-typed ones, come back inside the `line` key as an empty-valued JSON object, and a download answers "This dataset does not support collection". Required fields certain, outputs unlisted. The script sends this probe itself, once, and only after the catalogue answered empty. |

The probe is not universally free. Validation rejects `[{}]` only because a required field is missing, so a door with no required field passes it, and on an active account the probe can start a billed job. Six such doors exist in the catalogue on 2026-09-06, all of them discovery doors, Amazon products `discover_by_upc` and Walmart products `discover_by_sku` among them. That is why the catalogue comes first and the probe is the fallback, never the opening move.

The catalogue's `output_fields` are the scraper's active output fields, the same set `GET https://api.brightdata.com/datasets/<dataset_id>/metadata` returns (25 of 25 checked, 2026-09-06), so metadata is not needed for outputs. Metadata answers 404 for the 58 scrapers the catalogue carries and `/datasets/list` does not, the answer engines, Google SERP 100 Results, Google Flights and Google Hotel among them, so a 404 there is not a retirement signal.

For the 25 rows above the inputs are already listed. Do not probe them again. Read `output_fields` when you need the real output field names, and skip it only when the bundled row already answers the ask. The real names rarely match the words the user used, so `output_fields` is what turns "follower count" into `followers` and "industry" into `industries`.

The catalogue's `sample_output` is empty for most variants and changes between calls. Never cite it.

On Windows PowerShell 5.1, run the probe with `curl.exe` or node. `Invoke-WebRequest` hides the 400 response body.

Output schemas are not bundled in this file on purpose. Ask the catalogue for the one scraper being called.
