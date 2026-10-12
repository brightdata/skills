---
name: data-feeds
description: Extract structured data from thousands of pre-built Bright Data scrapers (e-commerce, social, jobs, maps, real estate and more) via the Bright Data CLI (`bdata pipelines search`, `info`, `run`). Use when the user wants clean JSON from a known site rather than raw HTML. Hands off to `scrape` when no scraper fits and to `search` when target URLs must be discovered first. Requires the Bright Data CLI 0.4.0+; proactively guides install + login if missing.
---

# Bright Data — Data Feeds (Pipelines)

Extract structured data via `bdata pipelines`: search for a pre-built scraper, check its inputs, run it, get clean JSON. No scraping logic. If no scraper fits, hand off to `scrape`. To find target URLs first, hand off to `search`.

## Setup gate (run first)

```bash
if ! command -v bdata >/dev/null 2>&1; then
    echo "bdata CLI not installed — see bright-data-best-practices/references/cli-setup.md"
elif ! bdata zones >/dev/null 2>&1; then
    echo "bdata not authenticated — run: bdata login  (or: bdata login --device for SSH)"
fi
```

Halt and route to `skills/bright-data-best-practices/references/cli-setup.md` if either check fails.

## Workflow (always search, then info, then run)

Requires CLI 0.4.0 or later. The fixed pipeline types (`bdata pipelines <type> <url>`), `bdata pipelines list` and top-level `bdata status` were removed. Never guess a `dataset_id`, method or field name: look them up every time.

```bash
# 1. Find a scraper by site or data type
bdata pipelines search <site or data type> [--limit n]

# 2. List its collection methods
bdata pipelines info <dataset_id>

# 3. Show one method's input fields, example input and a ready-to-run command
bdata pipelines info <dataset_id> <method>

# 4. Run it
bdata pipelines run <dataset_id> <method> <url> [--<field> <value>...]
```

- `search` returns `dataset_id`, name, domain and `collection_methods`. Two scrapers can share a name, so pick by `dataset_id` and domain.
- `collect_by_url` returns one record per input URL. `discover_by_*` methods (keyword, category URL, ...) return up to `--limit-per-input` records per input (default 10).
- Use method names exactly as listed, including misspelled ones.

Full command reference: [`../brightdata-cli/references/pipelines.md`](../brightdata-cli/references/pipelines.md).

## Pick your path

| Situation | Action |
|---|---|
| Know the site + have URL(s) | `search` for the scraper, `info`, then `run ... collect_by_url <url>...` |
| Don't know which scraper fits | `bdata pipelines search <site or data type>` and compare results |
| Input is a keyword, category or other non-URL field | use a `discover_by_*` method; `info <dataset_id> <method>` shows the fields |
| Multiple URLs on the same scraper | pass them all to one `run` (each URL = one record) |
| Different values per record or nested input | `--input '<json>'` or `--input @records.json` |
| Long job (reviews, big feeds, discover methods) | `--async`, then `status --wait` and `results`; or raise `--timeout 1800` |
| No scraper fits the site | **stop, hand off to `scrape`** |
| Need to find URLs first | **hand off to `search`** |

## Action

Core commands:

```bash
# Find the scraper and its inputs (example query; use the user's site)
bdata pipelines search "<site or data type>"
bdata pipelines info <dataset_id>
bdata pipelines info <dataset_id> collect_by_url

# One record per URL; other --<field> flags apply to every record
bdata pipelines run <dataset_id> collect_by_url "<url1>" "<url2>" \
    --format json --pretty -o out.json

# Discover method: no URL, fields as flags, keep the limit small (every record is billed)
bdata pipelines run <dataset_id> <discover_method> --<field> "<value>" \
    --limit-per-input 5 -o out.json

# Per-record values or nested data as JSON
bdata pipelines run <dataset_id> <method> --input @records.json -o out.json

# Long job: start async, come back later
bdata pipelines run <dataset_id> <method> "<url>" --async   # prints snapshot_id
bdata pipelines status <snapshot_id> --wait
bdata pipelines results <snapshot_id> --format ndjson -o out.ndjson

# Script-friendly: JSON from search when piped or with --json
bdata pipelines search "<site or data type>" --json | jq -r '.[] | "\(.dataset_id) \(.domain) \(.name)"'
```

Unknown or missing required fields fail before anything is triggered, so nothing is billed; the error lists the valid fields.

Full flag reference: [`references/flags.md`](references/flags.md).

## Verification gate

1. **JSON parses cleanly:** `jq . <output>` returns 0 (or for `--format ndjson`, each line parses).
2. **Record count matches expected.** `collect_by_url` usually returns one record per URL, *but* review, post and comment scrapers and `discover_by_*` methods return arrays sized by what the site shows (capped by `--limit-per-input`). Always check:
   ```bash
   jq 'length' out.json                       # top-level array count
   # OR
   jq 'if type == "array" then length else 1 end' out.json
   ```
3. **No top-level error:**
   ```bash
   jq -e 'if type == "object" then has("error") | not else true end' out.json \
       || { echo "pipeline reported error"; exit 1; }
   ```
4. **No per-record error:** for array results, ensure no record has an `error` field:
   ```bash
   jq -e 'if type == "array" then map(has("error")) | any | not else true end' out.json \
       || echo "WARN: one or more records have error fields"
   ```
   Partial failures are silent — this check is non-optional.
5. **Core fields present.** Fields differ per scraper; spot-check with `jq '.[0] | keys'` on the first record and compare with what the user asked for.
6. **On failure:** read any record `error` field (often a URL of the wrong type for the method), re-check `bdata pipelines info <dataset_id> <method>`, then double `--timeout` (or use `--async`) and retry once. If it still fails, `bdata scrape <url>` returns the page as Markdown as a fallback.

## Red flags

- Guessing a `dataset_id`, method or field name instead of running `search` and `info` first.
- Using removed commands: `bdata pipelines <type> <url>`, `bdata pipelines list`, `bdata status`. They exit with a hint; use `search` + `info` + `run` and `bdata pipelines status <snapshot_id>`.
- Using `bdata scrape` on a site that has a pre-built scraper. Loses structure and costs more time.
- Looping `bdata pipelines run` once per URL when one `run` accepts many URLs. If you must loop, cap parallelism at 2 to 3.
- Large `--limit-per-input` on `discover_by_*` methods. Every record is billed; start with one input and a small limit.
- Claiming success without the record-count + per-record error check. Partial failures are silent in pipeline output.
- "Fixing" a misspelled method name. Use it exactly as `info` lists it.
- Using a tight `--timeout` on runs that legitimately take 5 to 15 minutes. Default 600s suits small inputs; raise it or use `--async` for long ones.

## References

- [`../brightdata-cli/references/pipelines.md`](../brightdata-cli/references/pipelines.md): canonical `bdata pipelines` reference.
- [`references/flags.md`](references/flags.md): `search`, `info`, `run`, `status`, `results` flags and timeout guidance.
- [`references/patterns.md`](references/patterns.md): scraper resolution workflow, input patterns, async runs, batching, partial-failure detection, legacy `curl` fallback, shared verification checklist.
- [`references/examples.md`](references/examples.md): (1) single URL, (2) many URLs in one run, (3) long job with `--async`, (4) discover by keyword, (5) per-record JSON input.
