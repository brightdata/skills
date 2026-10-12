# Data Source Selection Guide

This reference maps every competitive intelligence need to the specific `bdata` CLI command. Use this to decide which command to run for each piece of intelligence.

## Command Selection Rule

**Always prefer `bdata pipelines`** (structured JSON) **over `bdata scrape`** (raw markdown) when a pre-built scraper exists for the target platform. Pipelines return clean, structured data that's easier to analyze. Fall back to `bdata scrape` only when no scraper exists.

## Running a Pipeline

The tables below give a search query for each platform, not a fixed scraper. Look the scraper up, check its inputs, then run it. Never guess a `dataset_id` or field names.

```bash
bdata pipelines search "<site or data type>"     # pick a dataset_id by name and domain
bdata pipelines info <dataset_id>                # list its methods
bdata pipelines info <dataset_id> <method>       # input fields and a ready-to-run command
bdata pipelines run <dataset_id> <method> "<url>" [--<field> <value>...]
```

`collect_by_url` returns one record per URL; `discover_by_*` methods return many records per input. Full workflow: the `brightdata-cli` skill, [pipelines reference](../../brightdata-cli/references/pipelines.md).

## Intelligence Need → Command Mapping

### Company & Business Intelligence

| Need | Primary Command | Fallback |
|------|----------------|----------|
| Company overview (funding, size, investors) | `bdata pipelines search "crunchbase company"` | `bdata scrape [url]/about` |
| Employee count & company details | `bdata pipelines search "linkedin company"` | `bdata pipelines search "crunchbase company"` |
| Financial data (public companies) | `bdata pipelines search "yahoo finance"` | `bdata pipelines search "crunchbase company"` |
| Company news & PR | `bdata search "[company] news" --json` | `bdata scrape [article-url]` |
| Company website / homepage | `bdata scrape [url]` | — |

### Pricing & Products

| Need | Primary Command | Fallback |
|------|----------------|----------|
| SaaS pricing pages | `bdata scrape [url]/pricing` | `bdata search "[company] pricing" --json` |
| Retailer product details (Amazon, Walmart, eBay, Etsy, Best Buy) | `bdata pipelines search "[retailer] product"` | `bdata scrape [url]` |
| Retailer product reviews | `bdata pipelines search "[retailer] reviews"` | `bdata scrape [url]` |
| Retailer search results by keyword | `bdata pipelines search "[retailer] product"`, then a `discover_by_*` method | `bdata search "[keyword] site:[retailer-domain]" --json` |
| Third-party pricing reviews | `bdata search "[company] pricing review" --json` | — |

### Reviews & Customer Sentiment

| Need | Primary Command | Fallback |
|------|----------------|----------|
| G2 reviews (SaaS) | `bdata scrape [g2-product-url]` | `bdata search "[product] site:g2.com" --json` → scrape result |
| Capterra reviews (SaaS) | `bdata scrape [capterra-product-url]` | `bdata search "[product] site:capterra.com" --json` → scrape result |
| Google Maps reviews (local) | `bdata pipelines search "google maps reviews"` | — |
| Google Play Store (apps) | `bdata pipelines search "google play"` | — |
| Apple App Store (apps) | `bdata pipelines search "apple app store"` | — |
| Trustpilot reviews | `bdata scrape [trustpilot-url]` | `bdata search "[company] site:trustpilot.com" --json` → scrape result |

### Hiring & Talent

| Need | Primary Command | Fallback |
|------|----------------|----------|
| Job listings | `bdata pipelines search "linkedin job listings"` | `bdata scrape [careers-url]` |
| Company LinkedIn page | `bdata pipelines search "linkedin company"` | `bdata search "[company] linkedin" --json` |
| Key people / leadership | `bdata pipelines search "linkedin profile"` | `bdata scrape [url]/team` |
| Careers page | `bdata scrape [url]/careers` | `bdata search "[company] careers" --json` → scrape result |

### Content & SEO

| Need | Primary Command | Fallback |
|------|----------------|----------|
| SERP rankings for keyword | `bdata search "[keyword]" --json` | — |
| Indexed page count | `bdata search "site:[domain]" --json` | — |
| Blog / content pages | `bdata scrape [url]/blog` | `bdata search "site:[domain] blog" --json` |
| Individual articles | `bdata scrape [article-url]` | — |
| News search | `bdata search "[topic]" --json --type news` | `bdata search "[topic] news" --json` |

### Social Media

| Need | Primary Command | Fallback |
|------|----------------|----------|
| Instagram profile | `bdata pipelines search "instagram profile"` | — |
| Instagram posts | `bdata pipelines search "instagram posts"` | — |
| TikTok profile | `bdata pipelines search "tiktok profile"` | — |
| TikTok posts | `bdata pipelines search "tiktok posts"` | — |
| YouTube channel | `bdata pipelines search "youtube channel"` | — |
| YouTube video details | `bdata pipelines search "youtube videos"` | — |
| YouTube comments | `bdata pipelines search "youtube comments"` | — |
| X (Twitter) posts | `bdata pipelines search "x posts"` | — |
| Reddit posts | `bdata pipelines search "reddit posts"` | — |
| Facebook posts | `bdata pipelines search "facebook posts"` | — |
| Facebook reviews | `bdata pipelines search "facebook reviews"` | — |
| LinkedIn posts | `bdata pipelines search "linkedin posts"` | — |

### Competitor Discovery

| Need | Primary Command | Fallback |
|------|----------------|----------|
| Find competitors by category | `bdata search "[category] companies" --json` | `bdata search "best [category] tools" --json` |
| Find alternatives | `bdata search "[product] alternatives" --json` | `bdata scrape [g2-category-url]` |
| G2 category page | `bdata scrape [g2-category-url]` | `bdata search "[category] site:g2.com" --json` → scrape result |
| Market overview | `bdata search "[industry] market landscape" --json` | — |

## Finding URLs When You Don't Have Them

Often you'll know a competitor's name but not their specific URLs on platforms. Use this pattern:

```bash
# Find a company's Crunchbase page
bdata search "[company name] crunchbase" --json | jq -r '.organic[0].link'

# Find a company's LinkedIn page
bdata search "[company name] linkedin company" --json | jq -r '.organic[0].link'

# Find a company's G2 page
bdata search "[company name] site:g2.com" --json | jq -r '.organic[0].link'

# Find a company's careers page
bdata search "[company name] careers" --json | jq -r '.organic[0].link'
```

## Cost Efficiency Guidelines

| Analysis Type | Recommended `bdata` Calls | Estimated Cost |
|--------------|--------------------------|----------------|
| Quick Snapshot (1 competitor) | 3-5 calls | ~$0.01-$0.05 |
| Pricing Comparison (3 competitors) | 3-6 calls | ~$0.01-$0.05 |
| Review Intelligence (1 competitor) | 2-4 calls | ~$0.01-$0.05 |
| Hiring Signal Analysis | 2-3 calls | ~$0.01-$0.03 |
| Content & SEO Battle | 4-8 calls | ~$0.02-$0.08 |
| Market Landscape Map | 6-15 calls | ~$0.05-$0.15 |
| Full Battlecard (1 competitor) | 8-15 calls | ~$0.05-$0.15 |
| Multi-competitor deep dive (3+) | 15-30 calls | ~$0.10-$0.50 |

## Error Handling

| Error / Situation | What to Do |
|------------------|------------|
| Page returns empty or minimal content | Try the fallback command. If that fails too, note "Data unavailable — page may be gated or require authentication." |
| 403 / Access Denied | The page likely requires login. Note this and try alternative sources (e.g., search for third-party coverage). |
| Pipeline timeout | Use `--async` (prints a snapshot_id), then `bdata pipelines status <snapshot_id> --wait` and `bdata pipelines results <snapshot_id>`. |
| `bdata pipelines search` finds no scraper | Fall back to `bdata scrape [url]` for raw content. |
| No results from search | Broaden the search query. Try different query variations. |
| Rate limit exceeded | Wait briefly and retry, or use `--async` mode. |

## Chaining Commands

The CLI is pipe-friendly. Useful patterns:

```bash
# Search → extract first URL → scrape it
bdata search "[company] pricing" --json | jq -r '.organic[0].link' | xargs bdata scrape

# Get all organic result URLs from a search
bdata search "[query]" --json | jq -r '.organic[].link'

# Pipeline output to file for later analysis
bdata pipelines run <dataset_id> collect_by_url "[url]" -o competitor_data.json
```
