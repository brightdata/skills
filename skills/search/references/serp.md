# SERP API - the fast path from a query to a results list

Answers the question "how do I get live search results in one synchronous call, and why did the zone fail".

SERP returns about 10 results per request in one synchronous call, a couple of seconds end to end. Anything that needs more depth, a Google vertical with its own dataset, or an answer engine is a job instead. Those live in two sibling files:

- `google-scrapers.md` for the top 100, Shopping, Maps, Hotels and Flights
- `answer-engines.md` for ChatGPT, Perplexity, Gemini, Copilot and Google AI Mode

## Contents

- The fast path - CLI
- What comes back - the organic array
- Zones - one has to resolve, and a stale config value can block it
- The fast path - REST
- Engines
- Google verticals and query parameters
- Rank tracking - the agent writes the timer
- Free moves, no credits

## The fast path - CLI

```
bdata search "<query>" --engine google --country us --language en --type web --page 0 --pretty
```

Every flag is optional, `--zone` included. The rule is not that you have to pass a zone, it is that **a zone has to resolve**: the flag beats the environment variable, which beats the config key, which falls back to the unlocker zone. The section below has the full order and the one thing that breaks it. Defaults: `--engine google`, `--type web`, `--page 0`.

| Flag | Values |
|---|---|
| `--engine` | `google`, `bing`, `yandex` |
| `--type` | `web`, `news`, `images`, `shopping` |
| `--country` | ISO country code, e.g. `us`, `de` |
| `--language` | ISO language code, e.g. `en`, `fr` |
| `--page` | Results page, **0-indexed** |
| `--device` | `desktop`, `mobile` |
| `--zone` | Zone name. The first step of the resolution order below |
| `--timing` | Add request timing to the output |
| `-o` | Write the result to a file |
| `--json` | Force JSON output |
| `--pretty` | Pretty-print the output |

What two of those flags really send:

- `--country` and `--language` become `gl` and `hl` on google, `cc` and `setLang` on bing, and are silently ignored on yandex.
- `--device mobile` sets a parameter. `--device desktop` sets none, so it does the same thing as leaving the flag off.

The CLI's own usage text prints `brightdata`, which is the same binary as `bdata`.

## What comes back - the organic array

Parsed SERP JSON puts the results in an **`organic` array**. Each entry carries `rank`, `global_rank`, `title`, `link` and `description`. `rank` is the position inside the organic array. `global_rank` is the position on the page counting non-organic blocks, so for a rank report read `global_rank`.

```json
{"organic": [
  {"rank": 1, "global_rank": 3, "title": "Best CRM for Startups in 2026",
   "link": "https://www.example.com/best-crm",
   "description": "We scored 14 tools on price, setup time and support.",
   "display_link": "50+ comments · 2 months ago"}
]}
```

**Cite `link`, never `display_link`.** `link` is the real URL and the only field to quote, follow or hand back to the user. `display_link` is the grey line Google prints under a title, which is sometimes the domain and just as often something like `50+ comments · 2 months ago`. It is display text, not an address, so a citation or a follow-up fetch built from it is broken or invented. For a question about position, read `global_rank` rather than counting positions in the array.

## Zones - one has to resolve, and a stale config value can block it

The CLI resolves the zone in this order:

1. The `--zone` flag
2. The `BRIGHTDATA_SERP_ZONE` environment variable
3. The config key `default_zone_serp`
4. The `BRIGHTDATA_UNLOCKER_ZONE` environment variable
5. The config key `default_zone_unlocker`

With none of the five it stops with a failure line containing `No zone specified.` It never auto-discovers a zone and it never creates one. Note: none of these environment variables appear in `bdata search --help` - the runtime error message is the only place the CLI names them.

A fresh install is not the problem. Source-verified: the shipped `DEFAULTS` carry only `default_format` and `api_url`, so there is no `default_zone_serp` out of the box, and `login` writes only `default_zone_unlocker` next to the `cli_unlocker` and `cli_browser` zones it creates. On a truly fresh machine step 3 finds nothing, the order falls through to the unlocker zone, and `bdata search` works.

The break is a stale config value. The CLI never validates the zone it reads: it does not check that the name still exists before sending the request. So one leftover `default_zone_serp` naming a zone that was never created, or one that was deleted, ends the resolution order at step 3 because the value is truthy. The unlocker fallback in steps 4 and 5 never runs, and every `bdata search` comes back `Status: 400` with `zone "<name>" not found`. The usual leftover is `cli_serp` from an earlier experiment.

Detect it with `bdata config get default_zone_serp`, then check whatever name it returns against `bdata zones --json`. Two healthy answers and one broken one:

- **The name is in the zone list.** The config is fine. Change nothing and make the call.
- **The key is unset.** Also fine. The order falls through to the unlocker zone, which serves SERP. Judge this by the printed text, not the exit code: `config get` prints `is not set` and exits 1 for this healthy case.
- **The name is not in the zone list.** This is the stale value described above, and the remedy table below fixes it.

An `unblocker`-type zone does serve SERP requests. Verified live: `bdata search --zone cli_unlocker --json "test"` returned full parsed SERP JSON. The fallback is legitimate, so the usual repair is one config line and no new zone.

The remedy, in order:

| Step | Move |
|---|---|
| 1. Check what exists | `bdata zones --json` and read the names and types |
| 2. Point the config at a zone that exists | `bdata config set default_zone_serp <zone>`, using a real unlocker zone from your own `bdata zones --json` output, usually `cli_unlocker` |
| Cleaner alternative to step 2 | create a dedicated serp-type zone with `POST https://api.brightdata.com/zone`, Bearer auth, body `{"zone":{"name":"serp_live","type":"serp"},"plan":{"type":"unblocker","serp":true}}`, then `bdata config set default_zone_serp serp_live` |
| Either way | `--zone` on the call beats the config, so passing it explicitly fixes a single call without touching config |

In that body `plan.type` must be `unblocker` with `serp` set to true. There is no `serp` plan type.

## The fast path - REST

One synchronous POST. The search itself is an ordinary search URL inside the body.

```
POST https://api.brightdata.com/request
     Authorization: Bearer $BRIGHTDATA_API_KEY
     Content-Type: application/json
     {
       "zone": "<your serp zone>",
       "url": "https://www.google.com/search?q=pizza&hl=en&gl=us&brd_json=1",
       "format": "raw"
     }
```

The body needs a zone. Use a serp-type zone, or the `unblocker`-type zone the CLI falls back to, which serves SERP as well. The section above has both.

`format` stays `"raw"` on every SERP call. It describes the transport, not the shape of the payload, and `brd_json=1` in the search URL is the only lever that turns the result into parsed JSON.

| Output wanted | How |
|---|---|
| Parsed JSON | keep `"format": "raw"` in the body and add `brd_json=1` to the search URL |
| Raw HTML | keep `"format": "raw"` in the body and leave `brd_json` off the URL |

Rows below are docs only.

| Output wanted | How |
|---|---|
| Organic results plus Top Stories, smallest payload | `"data_format": "parsed_light"` in the body |
| Markdown | `"data_format": "markdown"` in the body |

## Engines

The CLI's `--engine` flag covers google (the default), bing and yandex. For anything else, use the REST call and put that engine's own search URL in `url`.

Rows below are docs only.

| Engine | Reach it by |
|---|---|
| DuckDuckGo, Baidu, Yahoo, Naver | REST only, with that engine's own search URL in `url` |

## Google verticals and query parameters

Everything below goes in the search URL, not in the JSON body.

| Vertical | How to select it |
|---|---|
| Web | default, nothing to add |
| News | `tbm=nws` (CLI `--type news`) |
| Images | `udm=2` when you build the URL yourself. The CLI's `--type images` still sends the old `tbm=isch` |
| Shopping | `udm=28` (CLI `--type shopping`) |

Maps, Hotels and Flights are reachable from a SERP call too, by putting a Google URL in the request, but only Maps has a URL you can build from the ask: `google.com/maps/search/<query>/`. Hotels and Flights need an opaque entity id or a base64 `tfs` blob, so they are reachable this way only when the user already holds such a URL. Otherwise use the scraper in `google-scrapers.md`, which returns far more anyway.

Rows below are docs only.

| Vertical | How to select it |
|---|---|
| Videos | `tbm=vid` |
| Short videos | `udm=39` |
| Local and places | `tbm=lcl` or `udm=1` |
| Jobs | `ibp=htl;jobs` |
| Trends | a `trends.google.com` URL |
| Reviews | a `google.com/reviews` URL |
| Lens | a `lens.google.com` URL |

| Parameter | Meaning |
|---|---|
| `gl` | two-letter country code for the country of search |
| `hl` | two-letter language code for the page language |
| `uule` | encoded location, or `lat,lon,radius` coordinates (BETA) |
| `start` | result offset, for paging |
| `brd_mobile` | `0` desktop, `1` mobile, or `ios`, `iphone`, `ipad`, `ios_tablet`, `android`, `android_tablet` |
| `brd_json` | `1` returns parsed JSON instead of raw HTML |

`num` is deprecated and no longer returns more results. That is the whole reason the top-100 dataset job exists, and it is in `google-scrapers.md`.

AI Mode has its own scraper, in `answer-engines.md`.

## Rank tracking - the agent writes the timer

SERP has no scheduler. Write the schedule into the user's project. One workflow, one keyword, every morning:

```yaml
# .github/workflows/rank.yml
name: rank
on:
  schedule:
    - cron: "0 6 * * *"
jobs:
  track:
    runs-on: ubuntu-latest
    steps:
      - run: npm install -g @brightdata/cli
      - run: bdata search "best crm for startups" --zone cli_unlocker --country us --json -o "rank-$(date +%F).json"
        env:
          BRIGHTDATA_API_KEY: ${{ secrets.BRIGHTDATA_API_KEY }}
      - uses: actions/upload-artifact@v4
        with:
          name: rank-${{ github.run_id }}
          path: rank-*.json
```

`--zone cli_unlocker` is on that line because a fresh runner has no config, so the zone must be passed explicitly. The upload step is there because the runner disk is discarded when the job ends, so a file left behind is lost.

A plain `crontab` line calling the same `bdata search` command does the same job on a machine that is always on, and the same `--zone` applies there. Store the key as a secret or an environment variable, never in the committed file.

## Free moves, no credits

| Question | Free move |
|---|---|
| What flags does the search command take? | `bdata search --help`. Bare `bdata search` prints only `error: missing required argument 'query'`, with no usage line |
| Which zone should the REST body name? | `bdata zones --json` lists the account's zones with their type |
| What inputs does a dataset scraper require? | the empty-body probe in the `scrape` skill's `references/web-scraper-api.md`. It works on the datasets in the two sibling files too |
