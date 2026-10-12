# Pipelines: Scraper API from the CLI

`bdata pipelines` runs any of Bright Data's thousands of pre-built
scrapers and returns structured records. Nothing is hardcoded: the
scraper list comes from Bright Data's docs and is cached for 24 hours.
Requires CLI 0.4.0 or later.

## Workflow

Always look the scraper up first. Never guess a `dataset_id` or field
names.

```bash
# 1. Find a scraper by site or data type
bdata pipelines search <site or data type>

# 2. List its collection methods
bdata pipelines info <dataset_id>

# 3. Show one method's input fields, example input and a ready-to-run command
bdata pipelines info <dataset_id> <method>

# 4. Run it
bdata pipelines run <dataset_id> <method> <url> [--<field> <value>...]
```

- `search` returns `dataset_id`, name, domain and `collection_methods`.
  Two scrapers can share a name, so pick by `dataset_id` and domain.
- Methods: `collect_by_url` returns one record per input URL.
  `discover_by_*` methods (keyword, category URL, ...) return up to
  `--limit-per-input` records per input (default 10).
- Use method names exactly as listed, including misspelled ones such as
  `discover_by_cateogry_url`.

## Passing input

`run` takes one `--<field> <value>` flag per input field that `info`
lists for the method:

```bash
# One record per URL; the other flags apply to every record
bdata pipelines run <dataset_id> collect_by_url <url1> <url2> --<field> <value>

# Methods without a url field take only flags
bdata pipelines run <dataset_id> discover_by_keyword --keyword "<keyword>" \
  --limit-per-input 5

# Different values per record, nested data or odd field names: JSON
bdata pipelines run <dataset_id> <method> --input '[{"url": "<url>"}]'
bdata pipelines run <dataset_id> <method> --input @records.json
```

- Values are converted by field type: numbers, `true`/`false`
  (a bare boolean flag means true), arrays as comma-separated values.
- Unknown fields and missing required fields fail before anything is
  triggered, so a typo costs nothing. The error lists the valid fields.
- Every returned record is billed. Start with one input and keep
  `--limit-per-input` small for discover methods.

## Waiting and results

`run` waits for the records (up to `--timeout`, default 600 seconds or
`BRIGHTDATA_POLLING_TIMEOUT`). For long runs, start it and come back:

```bash
bdata pipelines run <dataset_id> <method> <url> --async   # prints snapshot_id
bdata pipelines status <snapshot_id>                      # starting, running, ready, failed
bdata pipelines status <snapshot_id> --wait
bdata pipelines results <snapshot_id>
```

Records with an `error` field explain inputs that failed, such as a URL
of the wrong type. If a run fails, `bdata scrape <url>` returns the page
as Markdown as a fallback.

## Output options

```bash
--format json|csv|ndjson|jsonl   # run and results (default: json)
-o <path>                        # write to file
--json / --pretty                # JSON output (raw / indented)
```

In a terminal, `search` and `info` print readable tables. Piped or with
`--json`, they print JSON for `jq`:

```bash
bdata pipelines search "<site or data type>" --json | jq -r '.[0].dataset_id'
```

## Removed in 0.4.0

The fixed types (`bdata pipelines amazon_product <url>` and the others),
`bdata pipelines list` and top-level `bdata status` are gone. They exit
with a hint to the new command. Replace a fixed type with `search` +
`info` + `run`.
