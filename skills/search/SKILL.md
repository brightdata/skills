---
name: search
description: 'Use when the task starts from a search query instead of a known URL: Google, Bing, Yandex or another search engine results, vertical result pages such as news, images, shopping, travel or maps, AI Mode, SERP API, "top 100 results", keyword rank tracking, or what ChatGPT, Gemini, Perplexity, Copilot or another answer engine answers about a brand. Not one known page (use fetch), not records from a known place like Google Maps reviews or LinkedIn profiles (use scrape), not cost or credits (use billing), not auth failures (use agent-onboarding).'
---

# Bright Data - Search

One name for everything that starts from a search query: Google, Bing and the other engines, the Google verticals, and the answer engines. **The user never has to name a product.** Pick one, do the work, and state the choice in one line the user can override with one word.

The line that decides: a query that **returns a results list** is this skill. Pulling records **from a known place**, like Google Maps reviews or a LinkedIn profile, is `scrape`. One known URL is `fetch`.

A SERP page asked for as raw HTML with no URL is still this skill: use format `raw`. With a URL, it is `fetch`.

## The fork - now versus volume

| The ask | Path | What it is |
|---|---|---|
| No volume word. **The default.** | **SERP API** | Structured JSON in under a second. About 10 results per request. Synchronous. |
| "Top 100", "all the results", a rank report past page one | **Get top 100 Google results** | A Web Scraper API dataset job. Trigger, poll, download. Not instant. |
| "daily", "weekly", "track this keyword" | **The same path, on a timer** | Google rank tracking is SERP API plus a cron the agent writes. Answer-engine tracking is a dataset job plus a cron, see [references/answer-engines.md](references/answer-engines.md). |

Route silently, defaulting to SERP. Ask only when the ask names no engine, no vertical, no volume word, no latency word and no consumer signal. The question is one line: *"Ten results now, or a hundred as a job that takes longer?"*

## The top-100 path is a job, not a bigger call

Google removed the `num=100` parameter, so no single request returns 100 rows any more. Bright Data covers this with a dataset job that walks pages 1 to 10 and hands back one result set. It is asynchronous, so say so before starting it. A first-class option, never an instant one.

The trade is now versus volume: about 10 results this second, or 100 results as a job.

## Rank tracking is SERP on a timer

SERP has no built-in scheduler, so the agent writes the cron job or the GitHub Actions workflow in the user's project. A repeating job never changes which product runs.

## Example - the fast path

The ask: *"what does Google show in the US for best crm for startups?"*

1. Starts from a query, not a URL. Stay in this skill.
2. No volume word, no "100". Fast path.

```
bdata search "best crm for startups" --country us --pretty
```

Then state the choice:

> Ten live Google results through SERP API. Say `top 100` for the deeper set, which runs as a job and takes longer.

## Answer engines belong here

What ChatGPT Search, Gemini Search, Perplexity or Bing Copilot answer about a brand is still a query in and an answer out. Each is its own pre-built scraper, so each runs as a dataset job, same shape as the top-100 path.

When Bright Data's new AI search ships, it becomes one more option inside this skill. No reference file exists for it yet, and one is added when the product ships.

## KYC

None for normal SERP use. Send the user to brightdata.com/cp/kyc only if a call is actually refused for that reason.

## Read next

- Read [references/serp.md](references/serp.md) before the first call, when the ask is a live results list from Google, Bing or Yandex, when the ask is Google Images, which has no scraper of its own, when a zone error blocks the call, or when the same query has to repeat on a timer.
- Read [references/google-scrapers.md](references/google-scrapers.md) when the ask names a Google vertical or wants depth past page one: top 100 results, Shopping, Maps, Hotels or Flights.
- Read [references/answer-engines.md](references/answer-engines.md) when the query targets ChatGPT, Perplexity, Gemini, Google AI Mode or Copilot.
- **The general trigger, poll, download mechanics:** the `scrape` skill's `references/web-scraper-api.md`. Not repeated here.
- **A refused call:** the `agent-onboarding` skill for "No API key found", 401, 407 and a missing `cli_unlocker` or `cli_browser`. A stale or missing serp zone is different: logging in again does not clear it, so fix it in [references/serp.md](references/serp.md)'s zone section. The `billing` skill for cost and credits.

## Red flags - stop if you catch yourself doing one of these

- Promising 100 results in under a second, or calling the top-100 job instant
- Reaching for the top-100 job when the user never asked for volume
- Sending a results-list ask to `scrape`, or handling a records-from-a-known-place ask here
- Switching product because the job repeats. "daily" is a scheduler, not a different product
- Guessing a `dataset_id` instead of looking it up live
- Sending the user to KYC before a call is actually refused
