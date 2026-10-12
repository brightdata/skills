# Data-feeds — patterns

## Verification checklist (shared across all Bright Data CLI skills)

Before claiming a pipeline run succeeded:

1. **JSON parses cleanly** (`jq . <output>` for json; line-by-line for ndjson).
2. **Record count matches expected.** Partial failures are silent — count explicitly.
3. **No top-level `error` key** on object-shaped outputs.
4. **No per-record `error` key** on array-shaped outputs.
5. **Core fields present** for what the user asked for. Fields differ per scraper; spot-check with `jq keys` on record 0.

## Sync timeout tuning and async runs

```bash
# Default: good for single products / profiles
bdata pipelines run <dataset_id> collect_by_url "<url>" -o out.json

# Long jobs: reviews, comment feeds, discover methods
bdata pipelines run <dataset_id> <method> "<url>" --timeout 1800 -o out.json

# Or set a session default
export BRIGHTDATA_POLLING_TIMEOUT=1800

# Or start async and come back later
bdata pipelines run <dataset_id> <method> "<url>" --async   # prints snapshot_id
bdata pipelines status <snapshot_id> --wait
bdata pipelines results <snapshot_id> -o out.json
```

## Batching many URLs on the same scraper

One `run` takes many URLs; each URL argument is one record:

```bash
xargs -a urls.txt bdata pipelines run <dataset_id> collect_by_url \
    --timeout 900 -o out.json
```

For very long lists, split into chunks and keep parallelism low:

```bash
mkdir -p out
split -l 50 urls.txt chunk_
ls chunk_* | xargs -n 1 -P 2 -I {} bash -c '
    xargs -a "$1" bdata pipelines run <dataset_id> collect_by_url \
        --timeout 1800 -o "out/$1.json" || echo "FAIL: $1" >&2
' _ {}
```

`-P 2`: keep parallelism LOW for pipelines. Each call triggers a server-side job; over-provisioning wastes quota and triggers rate limits.

## NDJSON verification (line-by-line parsing)

For `--format ndjson` output, each line must independently parse as JSON:

```bash
bad=0
while IFS= read -r line; do
    jq -e . <<<"$line" >/dev/null || { echo "BAD LINE"; bad=$((bad+1)); }
done < out.ndjson
echo "$bad malformed lines"
```

## Partial-failure detection

Partial failures are silent. Run this check after any batch:

```bash
for f in out/*.json; do
    # 1. Parseable?
    if ! jq . "$f" >/dev/null 2>&1; then
        echo "PARSE FAIL: $f"; continue
    fi
    # 2. Top-level error?
    if jq -e 'if type == "object" then has("error") else false end' "$f" >/dev/null; then
        echo "ERROR: $f → $(jq -r .error "$f")"; continue
    fi
    # 3. Per-record error in arrays?
    if jq -e 'if type == "array" then map(has("error")) | any else false end' "$f" >/dev/null; then
        echo "PARTIAL FAIL: $f"
    fi
done
```

## Scraper resolution workflow

When the user names a site or data type but you have no `dataset_id`:

```bash
# 1. Search (example query; use the user's site or data type)
bdata pipelines search "<site or data type>" --limit 20

# 2. Pick by domain and intent. Names can repeat, so compare dataset_id and domain.
#    Script-friendly form:
bdata pipelines search "<site or data type>" --json \
    | jq -r '.[] | "\(.dataset_id)\t\(.domain)\t\(.name)\t\(.collection_methods)"'

# 3. List methods, then read the chosen method's fields
bdata pipelines info <dataset_id>
bdata pipelines info <dataset_id> <method>
```

Pick the method by the input you have:

- Have item URLs → `collect_by_url` (one record per URL).
- Have a keyword, category URL or other seed → the matching `discover_by_*` method (many records per input, capped by `--limit-per-input`).

If nothing matches, try a broader query (data type instead of site), then `bdata pipelines refresh` to reload the cached scraper list. If still nothing, hand off to `scrape`.

## Input patterns

`info <dataset_id> <method>` prints the input fields, an example input and a ready-to-run command. Start from that command.

```bash
# URL args: one record per URL; other flags apply to every record
bdata pipelines run <dataset_id> collect_by_url "<url1>" "<url2>" --<field> <value>

# Methods without a url field take only flags
bdata pipelines run <dataset_id> <method> --<field> "<value>" --limit-per-input 5

# Per-record values, nested data or odd field names: JSON
bdata pipelines run <dataset_id> <method> --input '[{"url": "<url>", "<field>": "<value>"}]'
bdata pipelines run <dataset_id> <method> --input @records.json
```

- Values are converted by field type: numbers, `true`/`false` (a bare boolean flag means true), arrays as comma-separated values.
- Unknown or missing required fields fail before anything is triggered, so nothing is billed. The error lists the valid fields.
- Every returned record is billed. Start with one input and a small `--limit-per-input`.

## Legacy `curl` fallback (deprecated)

Only when CLI cannot be installed. Pipelines map to the `/datasets/v3/trigger` + `/datasets/v3/snapshot` endpoints; the polling loop is non-trivial. If this path is truly needed, check the git history for the old `scripts/datasets.sh` (removed in this revision) as a starting point. Prefer the CLI.
