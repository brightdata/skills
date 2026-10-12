---
name: price-comparison
description: >
  Shopping price comparison using Bright Data's web scraping infrastructure.
  Finds where a product is sold, for how much, and whether it's in stock —
  across Amazon, Walmart, eBay, Best Buy, Google Shopping, and any retailer
  URL — then ranks the offers into a single buy-recommendation table. Use this
  skill when the user wants to compare prices, find the cheapest place to buy
  something, do a price check, see "how much does X cost on Amazon vs Walmart",
  track an item's price, or decide where to buy a product. Handles product
  names, ASINs, and direct URLs, and is region-aware (country affects price,
  availability, and which retailers apply). This is consumer purchase-decision
  research — for analyzing a competitor's pricing *strategy*, use
  competitive-intel instead.
---

# Price Comparison

Find the best place to actually buy a product — lowest price, in stock, from a
reputable seller — using live retailer data, not stale training knowledge.
Combines the Bright Data CLI (`bdata`) for collection with a normalization +
ranking layer to deliver a single cited comparison table and a clear buy
recommendation.

**Never quote prices from training knowledge.** Prices and stock change hourly.
Always pull live data first, then compare. If a source fails, say so — never
fill a price gap with a guess.

## Prerequisites

1. Bright Data CLI installed:
   ```bash
   curl -fsSL https://cli.brightdata.com/install.sh | bash
   ```
2. One-time login completed:
   ```bash
   bdata login    # or: bdata login --device  (SSH / headless)
   ```

Verify before collecting:
```bash
if ! command -v bdata >/dev/null 2>&1; then
    echo "bdata CLI not installed — see skills/bright-data-best-practices/references/cli-setup.md"
elif ! bdata zones >/dev/null 2>&1; then
    echo "bdata not authenticated — run: bdata login"
fi
```

Halt and route to setup if either check fails.

## Core Workflow

1. **Clarify scope** — *What* product (name, ASIN, or URL)? *Which* retailers
   (default: Amazon + Google Shopping)? *Which* country/region (default: US —
   it changes price, currency, availability, and which retailers apply)? What
   matters beyond price (reviews, shipping/Prime, new vs refurbished)?
2. **Resolve, then collect** — If you only have a product name, use a
   retailer's `discover_by_*` scraper and `bdata search --type shopping` to
   resolve it to concrete product URLs/offers, *then* pull each retailer's
   structured data. Parallelize independent calls.
3. **Normalize** — Collapse every result into the single offer schema in
   [references/output-and-pricing.md](references/output-and-pricing.md) before
   comparing. Convert all prices to one currency and note the rate + date used.
4. **Rank & flag** — Sort by total landed cost (price + shipping). Flag
   out-of-stock, refurbished/used, and third-party-seller offers — a lower
   price that's unavailable or used is not the winner by default.
5. **Deliver** — Produce the comparison table (Output A), then the explicit
   "Best buy" recommendation. Every report names the cheapest *in-stock* option
   and any meaningful trade-offs.

## Data Collection Rules

- **Resolve names to URLs first.** You rarely have clean URLs up front. Use
  a retailer's keyword discovery scraper and
  `bdata search "<product>" --type shopping --json` to find the exact items,
  *then* feed those URLs to product pipelines.
- **Prefer pipelines over scraping for supported retailers.** Amazon, Walmart,
  eBay, Best Buy, Google Shopping all have pre-built scrapers that return
  clean price/availability/rating JSON. Never `bdata scrape amazon.com` — Amazon
  blocks scrapers; the pipeline bypasses that reliably.
- **Look up scrapers, never guess them.** `bdata pipelines search`, then
  `bdata pipelines info <dataset_id> <method>`, then `bdata pipelines run`.
  Never guess a `dataset_id` or field names. Full workflow: the
  `brightdata-cli` skill,
  [pipelines reference](../brightdata-cli/references/pipelines.md).
- **Always pass `--json`** when you need to parse or compare output.
- **Be cost-efficient** — a standard comparison is ~3–8 `bdata` calls, not 50.
  Pull the offers the user asked about, not every seller on the page.
- **Parallelize** independent calls across multiple Bash tool calls in one
  response — don't wait for Amazon before starting Walmart.
- **Every price needs a source URL and a collection timestamp.** No
  unattributed or undated prices, ever.
- **Never fabricate a price or fill gaps.** If a retailer returns nothing,
  report it in "Gaps & caveats".

## Retailer Modules

Pick the retailers that fit the product and region. US electronics → Amazon +
Best Buy + Walmart + Google Shopping; marketplace/used → eBay; non-US → confirm
the local Amazon domain and add region-relevant retailers.

### Supported retailer: by product URL
```bash
bdata pipelines search "<retailer> product"        # pick the dataset_id for the right domain
bdata pipelines info <dataset_id> collect_by_url   # check required fields
bdata pipelines run <dataset_id> collect_by_url "<product-url>" -o <retailer>.json
```
One record per URL, with price, title, availability, rating and seller. Pass
several URLs from the same retailer in one `run`. Use the right retailer
domain for the region (for Amazon: `amazon.com`, `amazon.de`, `amazon.co.uk`, …).

### Discover by keyword (when you only have a name)
```bash
bdata pipelines info <dataset_id>                  # look for a discover_by_* method
bdata pipelines info <dataset_id> <method>         # see its input fields
bdata pipelines run <dataset_id> <method> --<field> "<product name>" --limit-per-input 5
```
Resolve the right product URL from the results, then run `collect_by_url` on
it. Every returned record is billed, so keep `--limit-per-input` small.

### Google Shopping — cross-retailer overview
```bash
bdata pipelines search "google shopping"
bdata pipelines run <dataset_id> collect_by_url "<google-shopping-product-url>" -o gshopping.json
```
Best for a fast multi-seller view once you have a Shopping product URL. To
*find* that URL (and a quick price spread) from a name, use SERP shopping:
```bash
bdata search "iPhone 17 Pro 256GB" --type shopping --country us --json
```

### Unknown / local retailer — scrape the page
```bash
bdata scrape "https://retailer.example/product-page"
```
Then extract price, currency, and stock from the markdown. Use this for local
retailers without a dedicated pipeline (e.g. regional electronics chains).

> **Never hardcode a scraper.** Pick the `dataset_id` from
> `bdata pipelines search` and the input fields from `bdata pipelines info`.
> Two scrapers can share a name, so check the domain. Missing or unknown
> fields fail before anything is billed.

## Region Handling

- **Country changes everything** — price, currency, stock, and which retailers
  exist. Always confirm the region before running; default US only if the user
  doesn't say.
- **Pass `--country <code>`** to `bdata search` for localized SERP/shopping
  results (e.g. `--country il` for Israel, `de`, `uk`).
- **Use the local Amazon domain** in product URLs. Many regions (e.g. Israel)
  buy via `amazon.com` with international shipping *and* via local chains —
  cover both and label shipping/import implications.
- **Normalize currencies** to one display currency, state the rate and the date
  you used, and keep each offer's original-currency price in the dataset.

## Output

Read [references/output-and-pricing.md](references/output-and-pricing.md) for:
- The **normalized offer record** schema (row shape for both the table and the
  dataset output).
- **Total-cost ranking** rules (price + shipping + import/tax where known;
  in-stock and condition gates before declaring a winner).
- **Currency normalization** conventions.
- **Output templates** — A (comparison table + recommendation), B (structured
  dataset), C (both).

## Output Quality Standards

1. **Every price has a source URL and a timestamp** — no undated, unattributed
   prices.
2. **Always show availability next to price** — a cheaper out-of-stock offer is
   not the winner. Flag refurbished/used/third-party explicitly.
3. **Name one "Best buy"** — the cheapest *in-stock, comparable-condition*
   option, with the runner-up and why someone might pick it instead.
4. **Be honest about gaps** — list retailers that returned nothing or were
   gated this run. Note when a price looks stale or is a "from" range.
5. **State currency and region** — "$ USD · region: US" or the rate used for
   conversions.
6. **Never estimate a missing price.** Report the gap; don't fill it.
