# `bdata pipelines` — flag reference

For `@brightdata/cli` 0.4.0 and later. Canonical reference:
[`../../brightdata-cli/references/pipelines.md`](../../brightdata-cli/references/pipelines.md).

## Subcommands

| Command | What it does |
|---|---|
| `bdata pipelines search <query...> [--limit n]` | Find scrapers by site or data type. Returns `dataset_id`, name, domain, `collection_methods`. |
| `bdata pipelines info <dataset_id>` | List the scraper's collection methods. |
| `bdata pipelines info <dataset_id> <method>` | Input fields, example input and a ready-to-run command for one method. |
| `bdata pipelines run <dataset_id> <method> [urls...] [--<field> <value>...]` | Trigger the scraper and wait for records. |
| `bdata pipelines status <snapshot_id> [--wait] [--timeout s]` | Check a run: starting, running, ready, failed. |
| `bdata pipelines results <snapshot_id> [--format ...]` | Download the records of a finished run. |
| `bdata pipelines refresh` | Reload the scraper list (cached for 24 hours). |

Removed in 0.4.0: the fixed types (`bdata pipelines <type> <url>`), `bdata pipelines list` and top-level `bdata status`. Replace them with `search` + `info` + `run` and `bdata pipelines status`.

Always run `search` and `info` before `run`. Never guess a `dataset_id`, method or field name. Use method names exactly as listed, including misspelled ones.

## `run` flags

| Flag | Values | Default | When to use |
|---|---|---|---|
| `[urls...]` | URLs | none | Each URL is one record. Only for methods with a `url` field. |
| `--<field> <value>` | per field type | none | One flag per input field from `info`. Applies to every record. Numbers, `true`/`false` (bare flag = true), arrays as comma-separated values. |
| `--input <json\|@file>` | JSON array of records | none | Different values per record, nested data, or odd field names. |
| `--limit-per-input <n>` | integer | `10` | `discover_by_*` only. Max records per input. Every record is billed, so start small. |
| `--async` | (flag) | off | Return a `snapshot_id` right away; fetch later with `status` and `results`. |
| `--format <fmt>` | `json`, `csv`, `ndjson`, `jsonl` | `json` | `json` for most; `ndjson` or `jsonl` for big result sets you'll stream-process line-by-line. `csv` for spreadsheet consumers. Also on `results`. |
| `--timeout <seconds>` | integer | `600` (or `$BRIGHTDATA_POLLING_TIMEOUT`) | Max seconds to wait for records. Raise to `1200`–`1800` for reviews, long feeds and discover methods. Also on `status --wait`. |
| `-o, --output <path>` | file path | stdout | Write to file. Recommended for any result > 1KB. |
| `--json` | (flag) | off | Force JSON output. `search` and `info` print tables in a terminal and JSON when piped or with `--json`. |
| `--pretty` | (flag) | off | Pretty-print JSON. |
| `--timing` | (flag) | off | Stderr timing breakdown. Debug only. |
| `-k, --api-key <key>` | API key | saved / env | Per-command override. |

Unknown fields and missing required fields fail before anything is triggered, so nothing is billed. The error lists the valid fields.

## Collection methods

| Method | Input | Output |
|---|---|---|
| `collect_by_url` | item URLs | one record per URL |
| `discover_by_*` (keyword, category URL, ...) | a seed per record | up to `--limit-per-input` records per input |

`info <dataset_id> <method>` is the source of truth for each method's fields.

## Timeout guidance

| Run type | Suggested `--timeout` |
|---|---|
| Single-item products / profiles | `600` (default) |
| Post / video feeds | `900`–`1200` |
| Reviews, comments, discover methods | `1200`–`1800` |
| Anything longer | `--async`, then `status --wait` |

`BRIGHTDATA_POLLING_TIMEOUT=1800 bdata pipelines run …` also works as an env-var default.
