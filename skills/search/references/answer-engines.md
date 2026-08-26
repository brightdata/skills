# Answer engines - what ChatGPT, Perplexity, Gemini and Copilot say

Answers the question "which answer engine has a scraper today, what does it take, and which dataset id is safe to use".

A prompt goes in and one written answer comes back with its citations. Query in, answer out, so it belongs to this skill. Each engine is its own pre-built scraper, so each runs as a Web Scraper API job. The trigger, poll, download mechanics live in the `scrape` skill's `references/web-scraper-api.md` and are not repeated here.

## What exists today

Six engines are listed in the official library at docs.brightdata.com/datasets/scrapers/scrapers-library/ai-scrapers.

| Engine | dataset_id | Status |
|---|---|---|
| ChatGPT | `gd_m7aof0k82r803d5bjm` | docs only, not verified live |
| Google AI Mode | `gd_mcswdt6z2elth3zqr2` | docs only, not verified live |
| Perplexity | not published | listed in the library, no id published |
| Gemini | not published | listed in the library, no id published |
| Copilot | not published | listed in the library, no id published |
| Grok | not published | the library lists it as currently unavailable |

"Confirmed" has one definition for this skill, the three checks in `google-scrapers.md`, and it is not restated here. Both published ids were run through them and neither passes: neither appears in `GET /datasets/list` and metadata returns 404 for both, which is why both read as docs only, not verified live. That is the same signature as the top-100 id in that file, which triggers fine, so read that label as "this id cannot be confirmed from here", not as "wrong". Never guess an id from a name.

Google AI Mode is also a Google surface, so `google-scrapers.md` points here for it. This row is the one place its id is written down.

## Getting an id when the docs do not print one

Perplexity, Gemini and Copilot have no public id. The docs say the id is on that scraper's Web Scraper API page, under the API Request Builder tab. One page per engine:

| Engine | Page |
|---|---|
| ChatGPT | brightdata.com/cp/scrapers/browse?domain=chatgpt.com |
| Perplexity | brightdata.com/cp/scrapers/browse?domain=perplexity.ai |
| Gemini | brightdata.com/cp/scrapers/browse?domain=gemini.google.com |
| Copilot | brightdata.com/cp/scrapers/browse?domain=copilot.microsoft.com |
| Google AI Mode | brightdata.com/cp/scrapers/browse?domain=google.com |
| Grok | brightdata.com/cp/scrapers/browse?domain=grok.com |

`curl -H "Authorization: Bearer $BRIGHTDATA_API_KEY" https://api.brightdata.com/datasets/list` is the other lookup, but it did not carry any answer engine when checked, so do not treat an empty result there as proof the scraper is missing.

## Inputs

ChatGPT is the one engine with a full public input list, at docs.brightdata.com/datasets/scrapers/chatgpt/introduction. The rows below are docs only, not verified live.

| Input | Required | Meaning |
|---|---|---|
| `url` | yes | the engine's own address |
| `prompt` | yes | the question, up to 4,096 characters |
| `web_search` | no | allow or disable live web search |
| `additional_prompt` | no | a follow-up turn in the same session |
| `country` | no | the country the session runs from. Named on the library page for the family, not on the ChatGPT page |

The library page says the other engines take the same shape: `prompt`, `url`, `country`, `additional_prompt` and a follow-up. Two differences it calls out. Only ChatGPT and Grok expose `web_search`. Gemini decides internally whether to search, so prompt wording is the only lever there. Those rows are docs only, not verified live.

Each engine ships in a limited set of countries. The docs say the lists are CSV files at github.com/brightdata/answer-engines-country-codes, one per engine. That repository was not opened from here, so treat the path as a docs claim and check it before quoting a country list.

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

Useful ChatGPT output fields, docs only, not verified live: `answer_text`, `model`, `web_search_triggered`, `citations` with title, url and position, `search_sources`, and `prompt_sent_at`.

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
| Is it available in this country? | the CSV for that engine at github.com/brightdata/answer-engines-country-codes, a docs path that was not opened from here |

The catalogue check and the empty-body input probe are the same two free moves as for the Google scrapers, and they are listed in `google-scrapers.md`.
