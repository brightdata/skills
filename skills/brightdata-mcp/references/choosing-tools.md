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

Records from a site you can name go to a pre-built scraper:
`search_scrapers`, then `get_scraper_details`, then `run_scraper`.

Page content goes to `scrape_as_markdown`.

Raw unlocked HTML through `scrape_as_html` is the last resort.

## Routing table

| The job | Tool | Why |
|---|---|---|
| An Amazon listing, a LinkedIn profile, a TikTok post, any named site | `search_scrapers` → `get_scraper_details` → `run_scraper` | 1,200+ pre-built scrapers. Parsed fields, stable schema, no selector to break |
| Many records from one dataset by criteria, LinkedIn only | `search_dataset` | Finds many records by filter, though `dataset_id` is a fixed 3 value enum, all LinkedIn, and anything else fails validation. `run_scraper` collects fresh records by URL |
| The readable content of an arbitrary page | `scrape_as_markdown` | Unlocks the page and strips it to clean markdown |
| Several arbitrary pages at once | `scrape_batch` | One call, results per URL |
| What is on the web about X | `search_engine` | Google, Bing, or Yandex SERP, parsed JSON for Google |
| Structured JSON out of a page with no ready scraper | `extract`, Local only | Scrapes to markdown, then asks the client's model for JSON. Remote has no `extract`, so use `scrape_as_markdown` there and parse the result yourself |
| A page that needs clicking, typing, or scrolling first | `scraping_browser_*` | Real remote browser with an ARIA snapshot |
| The DOM itself, tags and attributes and all | `scrape_as_html` | Only when the markup is the thing you need |
| What ChatGPT or Perplexity answers to a prompt | `chatgpt_ai_insights`, `perplexity_ai_insights` | For GEO and LLM visibility checks |
| A question about Bright Data itself, which product or plan fits | `ask_brightdata_assistant` | Answers questions about Bright Data products instead of fetching a page. Not a scraping tool |

## Why raw unlock is last

`scrape_as_html` and `scrape_as_markdown` both fetch the page through Bright
Data's Fetch API. They are excellent at getting a blocked page open and bad at handing
you records. Reaching for them first on a known site means the agent pays to
unlock the page, burns context on a wall of markup, then parses a layout the
site changes without notice. A pre-built scraper for that site already returns
the fields and handles anti-bot. Use raw HTML only when the markup is the
answer: a meta tag, a JSON-LD block, an embedded script payload.

## The tool inventory

With no `groups` or `tools` filter, every tool is on. Remote (the hosted
service at `mcp.brightdata.com`) has 31 tools and Local (the self-hosted
`@brightdata/mcp` package) has 32. The only difference is `extract`, which is
Local only.

**Search and pages, 7.** `search_engine`, `search_engine_batch`,
`scrape_as_markdown`, `scrape_batch`, `scrape_as_html`, `extract` (Local only),
`session_stats`.

**Pre-built scrapers, 6.** `search_scrapers`, `get_scraper_details`,
`run_scraper`, `get_scraper_progress`, `get_scraper_results`,
`refresh_scrapers`. One flow covers every site in the catalog, so there is no
tool per site.

**Datasets, 2.** `list_dataset_fields`, `search_dataset`.

**AI answers, 2.** `chatgpt_ai_insights`, `perplexity_ai_insights`.

**Assistant, 1.** `ask_brightdata_assistant`.

**Browser, 14.** `scraping_browser_` plus `navigate`, `go_back`, `go_forward`,
`snapshot`, `click_ref`, `type_ref`, `fill_form`, `screenshot`, `get_text`,
`get_html`, `scroll`, `scroll_to_ref`, `wait_for_ref`, `network_requests`.

There are no `web_data_*` tools any more: the pre-built scrapers replaced them.
An old config that still names one in `tools=` or `TOOLS` is accepted and turns
on the six scraper tools instead.

## Tools with a prerequisite

`run_scraper` needs a `dataset_id` and a method from `search_scrapers`, and an
input shaped like the `sample_input` that `get_scraper_details` returns. Never
guess a `dataset_id` or a field name. Call `search_scrapers` once per site and
reuse the `dataset_id`.

`extract` is Local only, and it asks the client for a model completion through
MCP sampling. Clients that do not implement sampling fail with `No active
session available for sampling`. Prefer a pre-built scraper or
`scrape_as_markdown` plus your own parsing when you do not control the client.
On Remote that is not a preference but the only route, since the tool is not
registered there at all.

`search_dataset` needs valid field names. Call `list_dataset_fields` first. Both
currently accept only the three LinkedIn dataset ids named in their descriptions.

`scraping_browser_click_ref`, `type_ref`, and `wait_for_ref` take a ref from
`scraping_browser_snapshot`, so snapshot first.

## Limits worth knowing

`scrape_batch` and `search_engine_batch` take at most 10 URLs or queries on
Remote and at most 5 on Local.

`run_scraper` waits up to 45 seconds. If the run is still going it returns a
`snapshot_id` with status `running`: poll `get_scraper_progress`, then call
`get_scraper_results`. `collect_by_url` returns one record per input,
`discover_by_*` methods return up to `limit_per_input` records per input
(default 10), and every record is billed. Records with an `error` field explain
inputs that failed.

`search_dataset` returns at most 10 records per call, the cap its `size`
parameter enforces, and it is marked read only, so it finds records and never
writes any. Paginate with `search_after` rather than asking for a bigger page. A
record it returns can also carry fields that `list_dataset_fields` never reports,
`timestamp` among them in a live response, because the field lister drops every
metadata entry marked inactive. Treat its output as the filterable fields, not
as the full shape of a record.

Unlocking a big page to hand-parse it is the expensive path in both credits and
tokens.
