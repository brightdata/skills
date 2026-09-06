# Answer engines - what ChatGPT, Perplexity, Gemini and Copilot say

Answers the question "which answer engine has a scraper today, what does it take, and which dataset id is safe to use".

A prompt goes in and one written answer comes back with its citations. Query in, answer out, so it belongs to this skill. Each engine is its own pre-built scraper, so each runs as a Web Scraper API job. The trigger, poll, download mechanics live in the `scrape` skill's `references/web-scraper-api.md` and are not repeated here.

## What exists today

Six engines are listed in the official library at docs.brightdata.com/datasets/scrapers/scrapers-library/ai-scrapers.

| Engine | dataset_id | Required | Optional | Status |
|---|---|---|---|---|
| ChatGPT | `gd_m7aof0k82r803d5bjm` | `url`, `prompt` | `country`, `index`, `require_sources`, `additional_prompt`, `web_search`, `geolocation` | catalogue 2026-09-06, probe verified 2026-08-26 |
| Google AI Mode | `gd_mcswdt6z2elth3zqr2` | `url`, `prompt` | `index`, `country`, `hl` | catalogue 2026-09-06, probe verified 2026-08-26 |
| Perplexity | `gd_m7dhdot1vw9a7gc1n` | `url`, `prompt` | `country`, `index`, `export_markdown_file`, `additional_prompt` | catalogue 2026-09-06, probe verified 2026-08-26 |
| Gemini | `gd_mbz66arm2mf9cu856y` | `url`, `prompt` | `country`, `index` | catalogue 2026-09-06, probe verified 2026-08-26 |
| Copilot | `gd_m7di5jy6s9geokz8w` | `url`, `prompt` | `country`, `index` | catalogue 2026-09-06, probe verified 2026-08-26 |

All five are in the scrapers catalogue, `GET https://api.brightdata.com/datasets/v3/scrapers`, each with a full typed schema, verified 2026-09-06, and all five answered the free empty-body trigger probe on 2026-08-26 by naming `url` and `prompt`. None of the five appears in `GET /datasets/list`, and metadata returns 404 for all of them. That is the normal signature of a scraper the catalogue carries and the list does not, and it is not a retirement signal. The catalogue is the machine-reachable source for these ids: `node ../../scrape/scripts/find-scraper.mjs <gd_ id>`, or the engine's domain with `--schema`. Never guess an id from a name.

Google AI Mode is also a Google surface, so `google-scrapers.md` points here for it. This row is the one place in these skills its id is written down.

## Refreshing an id

The docs print two of the five ids: ChatGPT's, in its introduction page example, and Google AI Mode's, in the Google scrapers introduction table. The other three came from each scraper's control panel page (the API Request Builder tab). When a bundled id is rejected, a person refreshes it from the same page:

| Engine | Page |
|---|---|
| ChatGPT | brightdata.com/cp/scrapers/browse?domain=chatgpt.com |
| Perplexity | brightdata.com/cp/scrapers/browse?domain=perplexity.ai |
| Gemini | brightdata.com/cp/scrapers/browse?domain=gemini.google.com |
| Copilot | brightdata.com/cp/scrapers/browse?domain=copilot.microsoft.com |
| Google AI Mode | brightdata.com/cp/scrapers/browse?domain=google.com |

The catalogue is the other lookup, and it is one call: `node ../../scrape/scripts/find-scraper.mjs <domain> --schema`, or the bare `gd_` id, which prints the schema without the flag. A domain query is one or two GETs with `?domain=`, exact and case-sensitive, bare first, then with `www.`. `chatgpt.com`, `perplexity.ai`, `gemini.google.com` and `copilot.microsoft.com` each return one row on 2026-09-06; `google.com` returns every scraper whose domain is exactly `google.com` (ten on 2026-09-06), and subdomains such as `gemini.google.com` and `maps.google.com` are their own domains, so query AI Mode by id. On a machine without node, `curl -H "Authorization: Bearer $BRIGHTDATA_API_KEY" "https://api.brightdata.com/datasets/v3/scrapers?domain=chatgpt.com"`. `GET /datasets/list` is the wrong lookup here: it carries none of the five ids, only marketplace answer-engine rows, Meta AI Search and Deepseek Search, which answer "does not support collection" on trigger. So an empty result there, or a marketplace-only one, is not proof the scraper is missing.

## Inputs

The catalogue's `input_schema` gives name, type and required flag for every input and carries no descriptions. The rows below are its ChatGPT schema, read 2026-09-06, with meanings from the one public input list, at docs.brightdata.com/datasets/scrapers/chatgpt/introduction, where the docs give one.

| Input | Required | Type | Meaning |
|---|---|---|---|
| `url` | yes | url | the engine's own address |
| `prompt` | yes | text | the question, up to 4,096 characters (docs) |
| `country` | no | country | in the catalogue next to `geolocation`; the 2026-08-26 probe echo named only `geolocation` |
| `index` | no | number | no description in the catalogue |
| `require_sources` | no | boolean | no description in the catalogue |
| `additional_prompt` | no | text | a follow-up turn in the same session (docs) |
| `web_search` | no | boolean | allow or disable live web search (docs). Absent from the 2026-08-26 probe echo, present in the catalogue |
| `geolocation` | no | text | the country the session runs from (docs) |

That table describes ChatGPT only. Google AI Mode is its own contract: it requires `url` and `prompt`, and optionally takes `index`, `country` and `hl`, catalogue 2026-09-06 and probe 2026-08-26.

Perplexity, Gemini and Copilot require `url` and `prompt`, probe verified 2026-08-26 and catalogue 2026-09-06. Perplexity also takes `country`, `index`, `export_markdown_file` and `additional_prompt`. Gemini and Copilot also take `country` and `index`. `index` is an optional number on all five. One docs-only difference worth knowing: Gemini decides internally whether to search the web, so prompt wording is the only lever there.

Each engine ships in a limited set of countries. The lists are CSV files at github.com/brightdata/answer-engines-country-codes, one per engine. The repository is public and carries seven CSVs: chatgpt, copilot, gemini, perplexity, google_aimode, meta and grok.

Learn any engine's full input list for free from the catalogue: `node ../../scrape/scripts/find-scraper.mjs <gd_ id>`, with `--sample` for a paste-ready trigger body. The empty-body probe in the `scrape` skill's `references/web-scraper-api.md` is the fallback for an id the catalogue omits, and none of these five is.

## How to call one

The `/datasets/v3/scrape` and `/datasets/v3/trigger` pair covers this family too, with the shapes and input limits in the table in `google-scrapers.md`, where only the asynchronous trigger path is verified live, so promise that one.

```
POST https://api.brightdata.com/datasets/v3/trigger?dataset_id=<id>&include_errors=true
     Authorization: Bearer $BRIGHTDATA_API_KEY
     Content-Type: application/json
     [{"url":"https://chatgpt.com/","prompt":"what is the best crm for startups"}]
```

Then poll and download, or let the CLI wait. The one-line CLI poll is in `google-scrapers.md`, in its top-100 call section.

Useful ChatGPT output fields, all six in the catalogue's `output_fields` on 2026-09-06: `answer_text`, `model`, `web_search_triggered`, `citations` (title, url and position per the docs), `search_sources`, and `prompt_sent_at`.

## No CLI pipeline, two SDK methods

The CLI ships no pipeline for any answer engine, verified with `bdata pipelines list`, and `pipelines` accepts no arbitrary dataset id. Calling an answer engine means REST with the dataset id, or the scrape skill's `scripts/trigger.mjs`.

The `@brightdata/sdk` JavaScript client has `client.scrape.chatGPT.search()` and `client.scrape.perplexity.search()`. No SDK method is published for Gemini, Copilot or Google AI Mode, so those are REST for now.

Tracking answers over time is the same pattern as rank tracking. The agent writes the schedule, as `serp.md` describes. The product does not change because the job repeats.

## AI Overview is not AI Mode

On a plain SERP call the AI answer is the AI Overview block, not AI Mode. The top-100 job's `collapse_aio` input hides or shows that block, and it is described in `google-scrapers.md`. For AI Mode itself, use its scraper.

## Free moves, no credits

| Question | Free move |
|---|---|
| Does this engine have a scraper? | `node ../../scrape/scripts/find-scraper.mjs <the engine's domain>` - one GET with `?domain=`, one row each for the four engine domains on 2026-09-06. The library page at docs.brightdata.com/datasets/scrapers/scrapers-library/ai-scrapers is the docs view |
| What is its dataset id? | the same call, or its control panel page above, API Request Builder tab |
| Is it available in this country? | the CSV for that engine in the public repo at github.com/brightdata/answer-engines-country-codes, which carries seven of them |

The catalogue check comes first and the empty-body probe is the fallback for an id the catalogue omits. They are the same two free moves as for the Google scrapers, and they are listed in `google-scrapers.md`.
