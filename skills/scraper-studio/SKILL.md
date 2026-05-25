---
name: scraper-studio
description: "Build and run AI-generated Bright Data scrapers from the terminal via `bdata scraper create` and `bdata scraper run`. Use this skill whenever the user wants to generate a scraper from a natural-language description, build a custom scraper without writing code, turn a URL + plain-English description into a reusable scraper, or run an existing Bright Data collector against a URL and get the data back. Triggers on phrases like 'build me a scraper for', 'create a scraper that extracts', 'generate a scraper from a description', 'turn this URL into a scraper', 'run this scraper on', 'run my collector', 'scraper studio', `scraper create`, `scraper run`, `collector_id`, `automate_template`, or `/dca/`. Covers the AI flow (template create → trigger AI generation → poll progress), the run flow (async + poll by default, `--sync` for fast pages), and the silent auto-fallback to the batch endpoint when a URL expands past the realtime page limit. Requires the Bright Data CLI."
---

# Bright Data — Scraper Studio

Build a scraper from natural language, then run it. Two commands live in this skill:

- **`bdata scraper create <url> <description>`** — describe what you want in plain English; Bright Data's AI Flow generates a scraper template and returns a `collector_id`.
- **`bdata scraper run <collector_id> <url>`** — run that collector (or any existing one from the Bright Data web UI) against a URL and get the extracted data back.

**The bridge between the two is `collector_id`.** It is printed by `create` and consumed by `run`. Always save it.

For pre-built scrapers on platforms like Amazon, LinkedIn, TikTok, Instagram, YouTube, Reddit, etc., **stop and use the [`data-feeds`](../data-feeds/SKILL.md) skill instead** — those scrapers already exist, are faster, cheaper, and more reliable than building a new one. Use Scraper Studio when no pre-built scraper covers the target site, or when the user wants a custom shape of output for an existing platform.

## Setup gate (run first)

```bash
if ! command -v bdata >/dev/null 2>&1; then
    echo "bdata CLI not installed — see bright-data-best-practices/references/cli-setup.md"
elif ! bdata zones >/dev/null 2>&1; then
    echo "bdata not authenticated — run: bdata login  (or: bdata login --device for SSH)"
fi
```

Halt and route to setup if either check fails. Both commands require an authenticated CLI.

## Pick your path

| Situation | Action |
|---|---|
| User describes data they want from a URL, no scraper exists yet | `bdata scraper create <url> "<description>"` → save the `collector_id` |
| User has a `collector_id` and wants data from a URL | `bdata scraper run <collector_id> <url>` (default async + poll) |
| Page is small and you want fast feedback (≤ ~50 s) | `bdata scraper run … --sync` |
| User uses brief / marketing terms: PDP, Discovery, Discovery + PDP, Search | see [references/four-scraper-types.md](references/four-scraper-types.md) to map to `create`/`run` |
| Site is a known platform (Amazon, LinkedIn, TikTok, …) | **stop — use `data-feeds` skill** |
| You want SERP / discovery, not extraction | **use `search` skill** |
| You want a one-off raw page fetch | **use `scrape` skill** |

---

## Action 1 — `scraper create`

Generate a scraper from a URL + plain-English description.

```bash
bdata scraper create <url> "<description>" [--name <name>] \
    [--deliver-webhook <url>] [--timeout <seconds>] \
    [--json | --pretty] [-o <path>] [--timing] [-k <api-key>]
```

The description is the most important input. A good description names every field you want and any conditions on how to find them. See [references/prompts.md](references/prompts.md) for examples of strong vs. weak descriptions.

```bash
# Minimal
bdata scraper create https://example.com/product/1 \
    "Extract title, price, currency, image URL, and availability \
     from this product page. If the price has a strike-through \
     original price, capture both as price and original_price."

# Save the full AI output for inspection
bdata scraper create https://example.com/product/1 \
    "Extract title, price, and image URL" \
    --name product-scraper-v1 \
    --pretty -o create.json
```

### What happens under the hood

`create` chains three Bright Data API calls — surface this to the user so they can debug from logs:

1. **`POST /dca/collector`** — creates an empty scraper template with a stub webhook delivery target (`https://example.com/webhook` by default). Returns a `collector_id` like `c_mp3tuab31lswoxvpws`.
2. **`POST /dca/collectors/{collector_id}/automate_template`** — triggers Bright Data's AI Flow with the description + URL.
3. **`GET .../automate_template/progress`** (polled) — waits for `status: "done"`. Generation typically takes **5–10 minutes** for moderately complex pages.

### Critical: hold the `collector_id`

Every failure path in `create` (AI trigger fails, polling times out, generation finishes with `status: "failed"`) **still leaves a partially-built collector** at the printed `collector_id`. Always tell the user the id is recoverable — they can:

- Open `https://brightdata.com/cp/scrapers/{collector_id}` to finish or inspect it in the web UI.
- Re-trigger generation programmatically against the same id.
- Delete it from the UI if they want a clean slate.

Never claim "create failed, start over" without surfacing the `collector_id` from the response.

### `--timeout` — default 600 s

AI generation can run 5–10 min for complex pages. If the page is simple, the default is plenty. For an elaborate description on a heavy site, raise it:

```bash
bdata scraper create https://complex-site.com/page \
    "Extract all 30 fields …" \
    --timeout 1200
```

On `Timeout after N seconds waiting for AI generation`, the `collector_id` is still printed. Re-check progress in the web UI rather than re-running `create` (which builds a new collector).

### `--deliver-webhook` — placeholder by default

The CLI sets a stub webhook (`https://example.com/webhook`). This satisfies the API contract but **does not deliver anything**. For CLI use, leave the stub — you'll fetch results synchronously via `scraper run`. The real delivery target can be reconfigured in the [Bright Data web UI](https://brightdata.com/cp/scrapers) if the user wants webhook delivery for production runs.

---

## Action 2 — `scraper run`

Execute a scraper against a URL.

```bash
bdata scraper run <collector_id> <url> [--sync [--sync-timeout 25-50]] \
    [--timeout <seconds>] [--name <name>] [--version <version>] \
    [--json | --pretty] [-o <path>] [--timing] [-k <api-key>]
```

### Choosing the run mode

```
                ┌─────────────────────────────────────────────────┐
                │ Expected to finish in ≤ ~50 seconds?            │
                └─────────────────────────────────────────────────┘
                 yes                                       no
                  │                                         │
                  ▼                                         ▼
       ┌──────────────────────┐                ┌────────────────────────┐
       │   --sync             │                │  default (no flag)     │
       │   /dca/crawl         │                │  trigger_immediate +   │
       │   one-shot, 25–50 s  │                │  poll get_result       │
       └──────────────────────┘                └────────────────────────┘
                  │
                  │  on 202 timeout: response_id is printed —
                  │  re-run WITHOUT --sync to poll for it
                  ▼
            (cleanly fall back to async)
```

| Mode | Endpoint | When to use |
|---|---|---|
| **Default (async + poll)** | `/dca/trigger_immediate` → poll `/dca/get_result` | Anything you expect to take more than ~50 s, anything paginated, anything you're not sure about. This is the safe default. |
| **`--sync`** | `/dca/crawl` | Single-page extractions you expect to complete in under 50 s. Faster path: one request, no polling. |

```bash
# Default — async + poll (recommended for most cases)
bdata scraper run c_mp3tuab31lswoxvpws https://www.amazon.com/dp/B08N5WRWNW

# Pretty-printed, saved to disk
bdata scraper run c_mp3tuab31lswoxvpws https://www.amazon.com/dp/B08N5WRWNW \
    --pretty -o product.json

# Sync mode for a fast page
bdata scraper run c_mp3tuab31lswoxvpws https://example.com/p/1 --sync

# Sync with a tighter server timeout
bdata scraper run c_mp3tuab31lswoxvpws https://example.com/p/1 \
    --sync --sync-timeout 30
```

### `--sync-timeout` is bounded to 25–50

Anything outside that range exits with `--sync-timeout must be between 25 and 50 seconds`. Default is 50. Use values < 50 only when you want to fail fast and fall back to async on slow pages.

### `--sync` timeout recovery

If `/dca/crawl` server-side times out, it returns 202 with `{"error":"crawl_results_timeout","response_id":"r_late_..."}`. The CLI surfaces the `response_id` and exits with a "Re-run without --sync" message. Do exactly that — drop `--sync` and re-run the same command; the default async path will poll `/dca/get_result` for the existing `response_id`. **Do not** treat sync timeout as a hard failure.

### Silent auto-fallback to batch (paginated / large pages)

When a single URL expands to more pages than the realtime job limit allows (paginated listings, infinite scroll, "all reviews" pages, etc.), the realtime endpoints return an error like:

```
Request generated 501 pages and exceeded realtime job limit of 51 pages
```

The CLI detects this and **automatically falls back** to the batch flow (`/dca/trigger` → poll `/dca/dataset`). A one-line notice is printed. No flag is needed. Batch jobs use a longer poll interval (10 s) and a longer default timeout (1 hour).

If the user only sees the notice and a long wait, that is expected — large jobs take time. Do not "fix" the fallback by switching APIs or restructuring the scraper; let it run.

### `--name` and `--version`

- `--name <name>` — tag this run in the Bright Data dashboard. Useful when you're scripting many runs and want to find one later.
- `--version <version>` — pin a specific scraper version (commonly `dev` when iterating in the web UI). Omit to use the latest published version.

---

## Full create-then-run workflow

Capture the `collector_id` cleanly with `jq`, then chain into `run`:

```bash
# 1. Create the scraper, save the AI output, extract the collector_id
bdata scraper create https://example.com/product/1 \
    "Extract title, price, currency, image URL, and availability" \
    --pretty -o create.json

# 2. Pull the collector_id (or copy from the human-readable summary)
COLLECTOR_ID=$(jq -r '.collector_id // .id' create.json)
echo "Built: $COLLECTOR_ID"

# 3. Run it on each URL you want extracted
for url in $(cat urls.txt); do
    bdata scraper run "$COLLECTOR_ID" "$url" --json -o "out/${url//[\/:.]/_}.json"
done
```

For more end-to-end recipes (batch run loops, error recovery, web-UI handoff), see [references/recipes.md](references/recipes.md).

---

## Common mistakes

1. **Inventing command names.** The commands are exactly `bdata scraper create` and `bdata scraper run`. There is no `bdata generate`, no `bdata scrape-batch`, no `bdata data`, no `bdata build`. If you're tempted to use one of those, you're hallucinating — run `bdata scraper --help` to verify.

2. **Re-running `create` after a timeout.** Generation creates a fresh collector every time. If polling times out, the half-built collector is still printed in the error output. Resume it in the web UI or wait and re-poll — don't burn another collector.

3. **Defaulting to `--sync` for everything.** Sync caps at 50 s server-side. Any paginated page or heavy SPA will time out. Default async is the right choice unless you specifically know the page is small.

4. **Skipping Scraper Studio for known platforms.** If the target is Amazon, LinkedIn, TikTok, Instagram, YouTube, Reddit, etc., the [`data-feeds`](../data-feeds/SKILL.md) skill exposes pre-built scrapers that are faster, cheaper, and more reliable. Only build a custom scraper when no pre-built one exists for the site, or when the user explicitly wants a custom output shape.

5. **Treating sync timeout as failure.** A `--sync` 202 timeout returns a valid `response_id` — the job is still running on the backend. Re-run the same command without `--sync` to pick it up.

6. **Throwing away `collector_id` / `response_id` on error.** The CLI prints them in every failure path on purpose. Both are recoverable via the API and the web UI. Always surface them to the user.

7. **Trying to disable the batch auto-fallback.** It has no flag. The fallback is the correct behavior when a URL expands past the realtime page limit. Let it run.

8. **Vague descriptions in `create`.** A description like "scrape the page" produces a generic scraper. Name every field, name conditions ("if there's a sale price, capture both"), name disambiguators ("the price near the title, not in the recommendations sidebar"). See [references/prompts.md](references/prompts.md).

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `bdata: command not found` | CLI not installed | See [`brightdata-cli`](../brightdata-cli/SKILL.md) for install. |
| `Invalid or expired API key` | Not logged in | `bdata login` (or `bdata login --device` for SSH). |
| `create` returns no `id` | API call failed before template was created | Check `--timing` output for the failing request; verify network and account status. |
| `Timeout after 600 seconds waiting for AI generation` | Page is complex; default poll exceeded | The `collector_id` is still printed. Open it in the web UI; or re-run with `--timeout 1200`. |
| `status: "failed"` from progress poll | AI Flow couldn't build the template | Improve the description — be more specific about fields and selectors. Try again with a cleaner URL (e.g. a canonical product page, not a search result). |
| `--sync` 202 with `crawl_results_timeout` | Page took > sync server cap | Re-run **without** `--sync` to poll `/dca/get_result` for the printed `response_id`. |
| `--sync-timeout must be between 25 and 50 seconds` | Out-of-range value | Use a value in `[25, 50]`. |
| `Request generated N pages and exceeded realtime job limit` | URL expanded too far | This is **handled automatically** — wait for the batch fallback notice and let it poll. |
| No data returned, just `[]` or `{}` | Selectors didn't match | The scraper template ran but extracted nothing. Open `https://brightdata.com/cp/scrapers/{collector_id}` to inspect/edit; or rebuild with a tighter description. |

---

## Reference files

- **[references/prompts.md](references/prompts.md)** — How to write a description for `scraper create` that the AI Flow can act on. Examples of strong vs. weak descriptions, field-listing patterns, and conditional rules.
- **[references/recipes.md](references/recipes.md)** — End-to-end recipes: capture `collector_id` from create, batch run a list of URLs, handle sync→async fallback, recover from a failed create, list scrapers from the dashboard.
- **[references/api-flow.md](references/api-flow.md)** — Exact REST endpoints, payloads, and status sentinels the CLI uses (`/dca/collector`, `/dca/collectors/{id}/automate_template`, `/dca/trigger_immediate`, `/dca/get_result`, `/dca/crawl`, `/dca/trigger`, `/dca/dataset`). Read this when debugging unexpected CLI output or when the user wants to hit the API directly.
