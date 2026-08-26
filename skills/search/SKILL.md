---
name: search
description: 'Use when the task starts from a search query instead of a known URL: Google, Bing, Yandex or another search engine results, vertical result pages such as news, images, shopping, travel or maps, AI Mode, SERP API, "top 100 results", keyword rank tracking, or what ChatGPT, Gemini, Perplexity, Copilot or another answer engine answers about a brand. Not one known page (use fetch), not records from a known place like Google Maps reviews or LinkedIn profiles (use scrape), not cost or credits (use billing), not auth failures (use agent-onboarding).'
---

# Bright Data - Search

One name for everything that starts from a search query: Google, Bing and the other engines, the Google verticals, and the answer engines. **The user never has to name a product.** Pick one, do the work, and state the choice in one line the user can override with one word.

The line that decides: a query that **returns a results list** is this skill. Pulling records **from a known place**, like Google Maps reviews or a LinkedIn profile, is `scrape`. One known URL is `fetch`.

A SERP page asked for as raw HTML with no URL is still this skill - that is the REST path with `brd_json` left off the search URL, because the CLI always returns parsed results for Google. With a URL, it is `fetch`.

## The fork - now versus volume

| The ask | Path | What it is |
|---|---|---|
| No volume word. **The default.** | **SERP API** | Structured JSON in one synchronous call, a couple of seconds end to end. About 10 results per request. |
| "Top 100", "all the results", a rank report past page one | **Web Scraper API - top 100 Google results** | A Web Scraper API dataset job. Trigger, poll, download. Not instant. One request for 100 results, against ten SERP requests for the same depth. |
| "daily", "weekly", "track this keyword" | **SERP or the top-100 job, on a timer** | Recurring and only the top ten matters -> SERP plus a cron the agent writes. Recurring and the user wants all results and their ranks -> the top-100 job on a timer. Answer-engine tracking is a dataset job plus a cron, see [references/answer-engines.md](references/answer-engines.md). |
| "top 5", "the first 3", any number under ten | **SERP API** | The normal fast path, then truncate the list to what was asked. |

A volume word always means **more** than the default 10, never fewer. "Top 5" is not a smaller or cheaper job, it is this same one call with a shorter answer, so never route it anywhere else and never treat it as a reason to change product.

Route silently, defaulting to SERP.

A single agentic query can also run through the MCP server's search_engine tool - the `brightdata-mcp` skill covers that surface.

## Rank tracking - pick depth first

A top-ten snapshot on a timer is SERP plus a cron the agent writes. A full rank report every run is the top-100 dataset job on a timer, one request per run instead of ten.

## Example - the fast path

The ask: *"what does Google show in the US for best crm for startups?"*

1. Starts from a query, not a URL. Stay in this skill.
2. No volume word, no "100". Fast path.

```
bdata search "best crm for startups" --zone cli_unlocker --country us --pretty
```

`--zone cli_unlocker` is not decoration. A zone only has to resolve, and passing it explicitly beats every other source, which makes the call immune to a stale `default_zone_serp` that otherwise fails every call with `Status: 400` and `zone "<name>" not found`. Use whatever unlocker zone `bdata zones --json` shows on the account.

Then state the choice:

> Ten live Google results through SERP API. Say `top 100` for the deeper set, which runs as a job and takes longer.

## Answer engines belong here

What ChatGPT Search, Gemini Search, Perplexity or Bing Copilot answer about a brand is still a query in and an answer out. Each is its own pre-built scraper, so each runs as a dataset job, same shape as the top-100 path. All five engines' ids are bundled in the reference file, and none of them appears in the live catalogue, so the bundled rows are the only machine-readable source - read them there instead of searching.

When Bright Data's announced AI search ships as a product, it becomes one more option inside this skill.

## KYC

None for normal SERP use. Send the user to brightdata.com/cp/kyc only if a call is actually refused for that reason.

## Read next

- Read [references/serp.md](references/serp.md) before the first call, when the ask is a live results list from Google, Bing or Yandex, when the ask is Google Images, which has no scraper of its own, when a zone error blocks the call, or when the same query has to repeat on a timer.
- Read [references/google-scrapers.md](references/google-scrapers.md) when the ask names a Google vertical or wants depth past page one: top 100 results, Shopping, Maps, Hotels or Flights.
- Read [references/answer-engines.md](references/answer-engines.md) when the query targets ChatGPT, Perplexity, Gemini, Google AI Mode or Copilot.
- **The general trigger, poll, download mechanics:** the `scrape` skill's `references/web-scraper-api.md`. Not repeated here.
- **A refused call:** the `agent-onboarding` skill for "No API key found", 401, 407 and a missing `cli_unlocker` or `cli_browser`. A stale or missing serp zone is different: logging in again does not clear it, so fix it in [references/serp.md](references/serp.md)'s zone section. The `billing` skill for cost and credits.

## Red flags - stop if you catch yourself doing one of these

- Promising 100 results at SERP speed, or calling the top-100 job instant
- Reaching for the top-100 job when the user never asked for volume
- Sending a results-list ask to `scrape`, or handling a records-from-a-known-place ask here
- Switching product because the job repeats. Depth picks the product, "daily" is only the scheduler
- Guessing a `dataset_id` instead of looking it up live
- Sending the user to KYC before a call is actually refused
