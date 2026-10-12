# Data-feeds — worked examples

Every example starts with `search` and `info`. Search queries below are
only illustrations; use the user's site or data type. Copy `dataset_id`,
method and field names from the CLI output, never from these examples.

## Example 1: single URL

User says: "Get the structured data for this product page: `<url>`."

```bash
# 1. Find the scraper for the site and pick by domain
bdata pipelines search "<site> product"

# 2. Check methods and inputs
bdata pipelines info <dataset_id>
bdata pipelines info <dataset_id> collect_by_url

# 3. Run
bdata pipelines run <dataset_id> collect_by_url "<url>" \
    --format json --pretty -o product.json

# Verify
jq . product.json >/dev/null || { echo "parse fail"; exit 1; }
jq -e 'if type == "array" then map(has("error")) | any | not else (has("error") | not) end' \
    product.json >/dev/null || { echo "record error: $(jq -c '..|.error? // empty' product.json)"; exit 1; }
jq '.[0] | keys' product.json
```

## Example 2: many URLs in one run

Given `companies.txt` (one company page URL per line, all on the same
site). Each URL argument becomes one record, so one `run` covers the list:

```bash
bdata pipelines search "<site> company profile"
bdata pipelines info <dataset_id> collect_by_url

xargs -a companies.txt bdata pipelines run <dataset_id> collect_by_url \
    --timeout 900 -o companies.json

# Summarize
total=$(wc -l < companies.txt)
ok=$(jq '[.[] | select(has("error") | not)] | length' companies.json)
echo "Fetched $ok of $total companies"

# Partial-failure sweep
jq -r '.[] | select(has("error")) | .error' companies.json
```

For very long lists, split into chunks (for example `split -l 50`) and run
the chunks with a parallelism cap of 2. See `patterns.md`.

## Example 3: long job with `--async`

Reviews and large feeds can take 10+ minutes. Start the run, then come
back for the results:

```bash
bdata pipelines search "<site> reviews"
bdata pipelines info <dataset_id> <method>

bdata pipelines run <dataset_id> <method> "<url>" --async
# → prints snapshot_id

bdata pipelines status <snapshot_id>          # starting, running, ready, failed
bdata pipelines status <snapshot_id> --wait --timeout 1800
bdata pipelines results <snapshot_id> --format json -o reviews.json

# Verify count and schema
jq 'if type == "array" then length else 1 end' reviews.json
jq '.[0] | keys' reviews.json
```

Without `--async`, `--timeout 1800` on `run` does the same in one call.

## Example 4: discover by keyword (no URL)

User says: "Find job listings for 'data engineer' on `<site>`."

```bash
# 1. Find a scraper with a discover_by_* method
bdata pipelines search "<site> jobs"
bdata pipelines info <dataset_id>
# → pick the discover_by_* method that matches the input you have

# 2. Read its required fields
bdata pipelines info <dataset_id> <method>

# 3. Run with a small limit first (every record is billed)
bdata pipelines run <dataset_id> <method> --<field> "data engineer" \
    --limit-per-input 5 --format json --pretty -o jobs.json

jq 'length' jobs.json
jq '.[0] | keys' jobs.json
```

Use the method name exactly as `info` prints it, even if it looks
misspelled.

## Example 5: per-record values with `--input`

When each record needs different values, or a field holds nested data,
pass the records as JSON. Field names come from
`bdata pipelines info <dataset_id> <method>`:

```bash
cat > records.json <<'EOF'
[
  {"url": "<url1>", "<field>": "<value1>"},
  {"url": "<url2>", "<field>": "<value2>"}
]
EOF

bdata pipelines run <dataset_id> <method> --input @records.json \
    --format ndjson -o out.ndjson
```

A typo in a field name fails before anything is triggered, so nothing is
billed. The error lists the valid fields.
