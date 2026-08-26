# Answer engines - what ChatGPT, Perplexity, Gemini and Copilot say

Answers the question "which answer engine has a scraper today, what does it take, and which dataset id is safe to use".

A prompt goes in and one written answer comes back with its citations. Query in, answer out, so it belongs to this skill. Each engine is its own pre-built scraper, so each runs as a Web Scraper API job. The trigger, poll, download mechanics live in the `scrape` skill's `references/web-scraper-api.md` and are not repeated here.

## What exists today

Six engines are listed in the official library at docs.brightdata.com/datasets/scrapers/scrapers-library/ai-scrapers.

| Engine | dataset_id | Required inputs | Status |
|---|---|---|---|
| ChatGPT | `gd_m7aof0k82r803d5bjm` | see Inputs below | probe verified 2026-08-26 |
| Google AI Mode | `gd_mcswdt6z2elth3zqr2` | see Inputs below | probe verified 2026-08-26 |
| Perplexity | `gd_m7dhdot1vw9a7gc1n` | `url`, `prompt` (optional `country`, `additional_prompt`) | probe verified 2026-08-26 |
| Gemini | `gd_mbz66arm2mf9cu856y` | `url`, `prompt` | probe verified 2026-08-26 |
| Copilot | `gd_m7di5jy6s9geokz8w` | `url`, `prompt` (optional `country`) | probe verified 2026-08-26 |

None of the five ids appears in `GET /datasets/list`, and metadata returns 404 for all of them. All five still answered the free empty-body trigger probe by naming their required inputs, so they are real and triggerable - the signature means "invisible to the discovery endpoints", not "wrong". These bundled rows are the only machine-reachable source for those ids, so when one is rejected, refresh it from the control panel page below rather than searching the catalogue. Never guess an id from a name.

Google AI Mode is also a Google surface, so `google-scrapers.md` points here for it. This row is the one place its id is written down.

## Refreshing an id

The ids above came from each scraper's control panel page (the API Request Builder tab), because the docs print none of them. When a bundled id is rejected, a person refreshes it from the same page:

| Engine | Page |
|---|---|
| ChatGPT | brightdata.com/cp/scrapers/browse?domain=chatgpt.com |
| Perplexity | brightdata.com/cp/scrapers/browse?domain=perplexity.ai |
| Gemini | brightdata.com/cp/scrapers/browse?domain=gemini.google.com |
| Copilot | brightdata.com/cp/scrapers/browse?domain=copilot.microsoft.com |
| Google AI Mode | brightdata.com/cp/scrapers/browse?domain=google.com |

The catalogue is the other lookup. One call does it: `node ../../scrape/scripts/find-scraper.mjs <name or gd_ id> --schema` - it filters junk rows and returns the input contract. On a machine without node, fall back to `curl -H "Authorization: Bearer $BRIGHTDATA_API_KEY" https://api.brightdata.com/datasets/list`. Either way the list carries only marketplace answer-engine rows, Meta AI Search and Deepseek Search, which cannot be triggered. So an empty result there, or a marketplace-only one, is not proof the scraper is missing.

## Inputs

ChatGPT is the one engine with a full public input list, at docs.brightdata.com/datasets/scrapers/chatgpt/introduction. The rows below are that list checked against the live probe echo on 2026-08-26.

| Input | Required | Meaning |
|---|---|---|
| `url` | yes | the engine's own address |
| `prompt` | yes | the question, up to 4,096 characters |
| `web_search` | no | allow or disable live web search. Docs only, it does not appear in the live probe echo |
| `additional_prompt` | no | a follow-up turn in the same session |
| `geolocation` | no | the country the session runs from - the live probe names `geolocation`, not `country` |

That table describes ChatGPT only. Google AI Mode is its own contract: it requires `url` and `prompt`, and optionally takes `country` and `hl`, probe verified 2026-08-26.

Perplexity, Gemini and Copilot were probe-verified live on 2026-08-26: all three require `url` and `prompt`, Perplexity also accepts `country` and `additional_prompt`, Copilot also accepts `country`. The control panel examples show an `index` field too - that is input-array bookkeeping, not a required field. One docs-only difference worth knowing: Gemini decides internally whether to search the web, so prompt wording is the only lever there.

Each engine ships in a limited set of countries. The lists are CSV files at github.com/brightdata/answer-engines-country-codes, one per engine. The repository is public and carries seven CSVs: chatgpt, copilot, gemini, perplexity, google_aimode, meta and grok.

Learn any engine's real input list for free with the empty-body probe in the `scrape` skill's `references/web-scraper-api.md`.

## How to call one

The `/datasets/v3/scrape` and `/datasets/v3/trigger` pair covers this family too, with the shapes and input limits in the table in `google-scrapers.md`, where only the asynchronous trigger path is verified live, so promise that one.

```
POST https://api.brightdata.com/datasets/v3/trigger?dataset_id=<id>&include_errors=true
     Authorization: Bearer $BRIGHTDATA_API_KEY
     Content-Type: application/json
     [{"url":"https://chatgpt.com/","prompt":"what is the best crm for startups"}]
```

Then poll and download, or let the CLI wait. The one-line CLI poll is in `google-scrapers.md`, in its top-100 call section.

Useful ChatGPT output fields, docs only: `answer_text`, `model`, `web_search_triggered`, `citations` with title, url and position, `search_sources`, and `prompt_sent_at`.

## No CLI pipeline, two SDK methods

The CLI ships no pipeline for any answer engine, verified with `bdata pipelines list`. The dataset id is the only way to call them from the CLI.

The `@brightdata/sdk` JavaScript client has `client.scrape.chatGPT.search()` and `client.scrape.perplexity.search()`. No SDK method is published for Gemini, Copilot or Google AI Mode, so those are REST for now.

Tracking answers over time is the same pattern as rank tracking. The agent writes the schedule, as `serp.md` describes. The product does not change because the job repeats.

## AI Overview is not AI Mode

On a plain SERP call the AI answer is the AI Overview block, not AI Mode. The top-100 job's `collapse_aio` input hides or shows that block, and it is described in `google-scrapers.md`. For AI Mode itself, use its scraper.

## Free moves, no credits

| Question | Free move |
|---|---|
| Does this engine have a scraper? | the library page at docs.brightdata.com/datasets/scrapers/scrapers-library/ai-scrapers |
| What is its dataset id? | its control panel page above, API Request Builder tab |
| Is it available in this country? | the CSV for that engine in the public repo at github.com/brightdata/answer-engines-country-codes, which carries seven of them |

The catalogue check and the empty-body input probe are the same two free moves as for the Google scrapers, and they are listed in `google-scrapers.md`.
