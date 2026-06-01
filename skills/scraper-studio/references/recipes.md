# Scraper Studio — recipes

End-to-end shell recipes. All assume `bdata` is installed and authenticated (`bdata login`).

## Recipe 1 — create + run a single page

```bash
# 1. Build the scraper, save full AI output for inspection
bdata scraper create https://example.com/product/1 \
    "Extract title, price, currency, image URL, and availability \
     from this product page" \
    --name product-v1 \
    --pretty -o create.json

# 2. Pull the collector_id out of the response
COLLECTOR_ID=$(jq -r '.collector_id // .id' create.json)
test -n "$COLLECTOR_ID" || { echo "no collector_id"; exit 1; }
echo "Built scraper: $COLLECTOR_ID"

# 3. Run it
bdata scraper run "$COLLECTOR_ID" https://example.com/product/2 \
    --pretty -o product-2.json

# 4. Verify
jq 'keys' product-2.json
```

## Recipe 2 — fan out one collector over many URLs

```bash
# Assume you already have a collector_id from a previous create
COLLECTOR_ID="c_mp3tuab31lswoxvpws"
mkdir -p out

while IFS= read -r url; do
    [ -z "$url" ] && continue
    # Hash the URL so filenames are safe and unique
    hash=$(printf '%s' "$url" | md5sum | cut -c1-8)
    echo "[$hash] $url"
    bdata scraper run "$COLLECTOR_ID" "$url" \
        --json -o "out/${hash}.json" \
        || echo "  ! failed: $url" >> out/failures.log
done < urls.txt

echo "Done. $(ls out/*.json 2>/dev/null | wc -l) results, \
$(wc -l < out/failures.log 2>/dev/null || echo 0) failures."
```

Notes:
- Default async + poll mode (no `--sync`) is safest for batch.
- Run sequentially unless you've confirmed your account's concurrent-job limit. Bright Data jobs are server-side; the CLI doesn't parallelize them for you.
- For very large URL lists (100+), prefer the web UI's bulk input or the `/dca/trigger` batch endpoint directly — see [api-flow.md](api-flow.md).

## Recipe 3 — try sync, fall back to async on timeout

If you expect most pages to be fast but some to be slow, `--sync` gives you the speed for the common case and exits with a `response_id` you can pick up async-style for the slow ones.

```bash
COLLECTOR_ID="c_mp3tuab31lswoxvpws"
url="https://example.com/might-be-slow"

# Try sync first; capture exit code
if ! bdata scraper run "$COLLECTOR_ID" "$url" --sync \
        --pretty -o result.json 2> err.log; then
    # Pull the response_id from the error output
    response_id=$(grep -oE 'r_[a-zA-Z0-9]+' err.log | head -1)
    if [ -n "$response_id" ]; then
        echo "Sync timed out — polling async for $response_id"
        # Re-run without --sync; the CLI will poll get_result
        bdata scraper run "$COLLECTOR_ID" "$url" \
            --pretty -o result.json
    else
        echo "Sync failed for non-timeout reason:" >&2
        cat err.log >&2
        exit 1
    fi
fi

jq 'keys' result.json
```

## Recipe 4 — recover a half-built collector after a failed create

When `create` fails or times out, the `collector_id` is still printed. You have options:

```bash
# Option A: inspect / finish in the web UI
echo "Open: https://brightdata.com/cp/scrapers/$COLLECTOR_ID"

# Option B: just try running it as-is — sometimes partial generation
# is enough for the fields you need
bdata scraper run "$COLLECTOR_ID" https://example.com/page --pretty

# Option C: delete it (web UI) and rebuild with a sharper description
```

Do **not** re-run `bdata scraper create` against the same URL — that builds a *new* collector and leaves the half-built one orphaned in your dashboard.

## Recipe 5 — large paginated page (let the auto-fallback work)

```bash
# A search-results URL that may have thousands of items
bdata scraper run "$COLLECTOR_ID" \
    "https://example.com/search?q=widgets&page=1..N" \
    --pretty -o all-widgets.json
```

What to expect in the output:
- Default realtime trigger runs first.
- After ~one poll cycle, the CLI prints a one-line notice that it's falling back to the batch endpoint (because the URL expanded past the realtime page limit).
- Polling switches to a 10 s interval and a 1-hour default timeout.
- When the batch completes, the full dataset is printed / saved.

If you need a longer timeout: pass `--timeout 7200` (2 hours).

## Recipe 6 — pin a `dev` version while iterating in the web UI

```bash
# Edit the scraper in the dashboard, save as the dev version
# Then run the dev version from the CLI:
bdata scraper run "$COLLECTOR_ID" https://example.com/page \
    --version dev --name iteration-7 \
    --pretty
```

`--name` tags the run so you can find it later in the dashboard's run history.

## Recipe 7 — self-healing loop (run → inspect → heal → approve → re-run)

The agent is the detector AND the approver: run, inspect, heal, review the
preview, approve, re-run.

```bash
COLLECTOR_ID="c_mp3tuab31lswoxvpws"
URL="https://example.com/product/1"

# 1. Run and inspect
bdata scraper run "$COLLECTOR_ID" "$URL" --json -o out.json

# 2. If the data is wrong, heal (stops at the approval gate)
bdata scraper heal "$COLLECTOR_ID" \
    "Price returns null — the selector moved; capture price + currency." \
    --url "$URL" --pretty -o heal.json
# heal.json: status=awaiting_approval, preview_result shows the fix

# 3. Review preview_result, then approve (or --reject)
if [ "$(jq -r '.status' heal.json)" = "awaiting_approval" ]; then
    bdata scraper approve "$COLLECTOR_ID" --url "$URL" --pretty -o approve.json
fi

# 4. Verify the committed fix
eval "$(jq -r '.next_step' approve.json) --json -o out.json"
jq '{price, currency}' out.json
```

For a fully autonomous fix (no review), use `bdata scraper heal …
--auto-approve`.
