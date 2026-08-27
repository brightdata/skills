# Choosing the right MCP tool

Answers the question: the agent has a job and a screen full of Bright Data
tools. Which one should it call?

## Contents

- The default
- Routing table
- Why raw unlock is last
- The tool inventory
- Tools with a prerequisite
- Limits worth knowing

## The default

Records from a platform you can name go to a `web_data_*` scraper.

Page content goes to `scrape_as_markdown`.

Raw unlocked HTML through `scrape_as_html` is the last resort.

## Routing table

| The job | Tool | Why |
|---|---|---|
| An Amazon listing, a LinkedIn profile, a TikTok post, any named platform | `web_data_<platform>` | Parsed fields, stable schema, no selector to break |
| Many records from one dataset by criteria, LinkedIn only | `search_dataset` | Finds many records by filter, though `dataset_id` is a fixed 3 value enum, all LinkedIn, and anything else fails validation. `web_data_*` fetches one record by URL |
| The readable content of an arbitrary page | `scrape_as_markdown` | Unlocks the page and strips it to clean markdown |
| Up to 5 arbitrary pages at once | `scrape_batch` | One call, results settled per URL |
| What is on the web about X | `search_engine` | Google, Bing, or Yandex SERP, parsed JSON for Google |
| Ranked research where relevance matters | `discover` | AI ranked, takes an `intent` string and scores results |
| Structured JSON out of a page with no ready scraper | `extract`, Local only | Scrapes to markdown, then asks the client's model for JSON. Remote has no `extract`, so use `scrape_as_markdown` there and parse the result yourself |
| A page that needs clicking, typing, or scrolling first | `scraping_browser_*` | Real remote browser with an ARIA snapshot |
| The DOM itself, tags and attributes and all | `scrape_as_html` | Only when the markup is the thing you need |
| A question about Bright Data itself, which product or plan fits | `ask_brightdata_assistant`, Remote only | Answers questions about Bright Data products instead of fetching a page. Not a scraping tool |

## Why raw unlock is last

`scrape_as_html` and `scrape_as_markdown` both run the page through Web
Unlocker. They are excellent at getting a blocked page open and bad at handing
you records. Reaching for them first on a known platform means the agent pays to
unlock the page, burns context on a wall of markup, then parses a layout the
platform changes without notice. The `web_data_*` tool for that platform already
returns the fields, handles pagination and anti-bot, and bills per record
returned rather than per page fetched. Use raw HTML only when the markup is the
answer: a meta tag, a JSON-LD block, an embedded script payload.

## The tool inventory

Local (the self-hosted `@brightdata/mcp` package) v2.11.1, 74 tools. Remote
(the hosted service at `mcp.brightdata.com`) tracks its own release line. In Pro
mode both variants expose exactly 74 tools, but not the same 74, two names
differ each way.

**Core, 10.** `search_engine`, `search_engine_batch`, `scrape_as_markdown`,
`scrape_batch`, `scrape_as_html`, `extract` (Local only), `discover`,
`list_dataset_fields`, `search_dataset`, `session_stats`.

**Browser, 14.** `scraping_browser_` plus `navigate`, `go_back`, `go_forward`,
`snapshot`, `click_ref`, `type_ref`, `fill_form`, `screenshot`, `get_text`,
`get_html`, `scroll`, `scroll_to_ref`, `wait_for_ref`, `network_requests`.

**Ready scrapers, 50.** All named `web_data_<id>`:

- Retail: `amazon_product`, `amazon_product_reviews`, `amazon_product_search`,
  `walmart_product`, `walmart_seller`, `ebay_product`, `homedepot_products`,
  `zara_products`, `etsy_products`, `bestbuy_products`, `google_shopping`
- LinkedIn: `linkedin_person_profile`, `linkedin_company_profile`,
  `linkedin_job_listings`, `linkedin_posts`, `linkedin_people_search`
- Instagram: `instagram_profiles`, `instagram_posts`, `instagram_reels`,
  `instagram_comments`
- Facebook: `facebook_posts`, `facebook_marketplace_listings`,
  `facebook_company_reviews`, `facebook_events`
- TikTok: `tiktok_profiles`, `tiktok_posts`, `tiktok_shop`, `tiktok_comments`
- X, YouTube, Reddit: `x_posts`, `x_profile_posts`, `youtube_profiles`,
  `youtube_videos`, `youtube_comments`, `reddit_posts`, `reddit_comments`
- Business and places: `crunchbase_company`, `zoominfo_company_profile`,
  `google_maps_reviews`, `zillow_properties_listing`, `booking_hotel_listings`,
  `yahoo_finance_business`
- Apps, code, news: `google_play_store`, `apple_app_store`, `npm_package`,
  `pypi_package`, `github_repository_file`, `reuter_news`
- LLM visibility: `chatgpt_ai_insights`, `grok_ai_insights`,
  `perplexity_ai_insights`

**Remote only, 2.** `ask_brightdata_assistant`, which answers questions about
Bright Data products and also sits in Remote's free tier, and
`web_data_facebook_profiles`, a ready scraper with no Local counterpart. Neither
name appears in the Local source.

The five names the Remote tools page omits all exist in the Local source, and
they do not share one status. `search_dataset` and `list_dataset_fields` are on
Remote regardless, confirmed through `tools/list` with `pro=1` and a live call,
so the page is stale rather than the server being short.
`web_data_reddit_comments` is Local only, confirmed absent from Remote's Pro
`tools/list`. `web_data_reuter_news` and `scraping_browser_fill_form` stay
unverified on Remote, so call `tools/list` against your own endpoint before
relying on either.

## Tools with a prerequisite

`extract` is Local only, and it asks the client for a model completion through
MCP sampling. Clients that do not implement sampling fail with `No active
session available for sampling`. Prefer a `web_data_*` tool or
`scrape_as_markdown` plus your own parsing when you do not control the client.
On Remote that is not a preference but the only route, since the tool is not
registered there at all.

`search_dataset` needs valid field names. Call `list_dataset_fields` first. Both
currently accept only the three LinkedIn dataset ids named in their descriptions.

`scraping_browser_click_ref`, `type_ref`, and `wait_for_ref` take a ref from
`scraping_browser_snapshot`, so snapshot first.

## Limits worth knowing

`scrape_batch` takes at most 5 URLs. `search_engine_batch` takes at most 5
queries. `web_data_*` tools poll for up to `POLLING_TIMEOUT` seconds, default
600, which is longer than many clients wait, so expect client-side timeouts
before the tool gives up.

`search_dataset` returns at most 10 records per call, the cap its `size`
parameter enforces, and it is marked read only, so it finds records and never
writes any. Paginate with `search_after` rather than asking for a bigger page. A
record it returns can also carry fields that `list_dataset_fields` never reports,
`timestamp` among them in a live response, because the field lister drops every
metadata entry marked inactive. Treat its output as the filterable fields, not
as the full shape of a record.

On the free tier, base tools cost 1 credit per request and `web_data_*` tools
cost 1 credit per record returned. Unlocking a big page to hand-parse it is the
expensive path in both credits and tokens.
