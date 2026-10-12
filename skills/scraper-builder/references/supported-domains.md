# Pre-Built Scrapers — Supported Domains

Check this list before writing any custom scraping code. If the target domain is listed here, use the Web Scraper API or Python SDK platform-specific scraper instead of building a custom solution.

**This list is a curated subset.** Bright Data supports 100+ domains with pre-built scrapers. The tables below cover the most common ones, but the full list is dynamic and grows regularly. If you don't see a domain here, **always check the live dataset list** before falling back to a custom scraper.

---

## Discovering ALL Available Scrapers (Dynamic Lookup)

The tables below are a quick reference, but they may not include every scraper Bright Data offers. Before building a custom scraper for any domain, use these two methods to check for a pre-built solution:

### Method 1: Query the Dataset List API

This returns every available pre-built scraper with its `dataset_id` and name:

```bash
curl -H "Authorization: Bearer $BRIGHTDATA_API_KEY" \
     https://api.brightdata.com/datasets/list
```

```python
import requests
import os

response = requests.get(
    "https://api.brightdata.com/datasets/list",
    headers={"Authorization": f"Bearer {os.environ['BRIGHTDATA_API_KEY']}"}
)
datasets = response.json()

# Search for a specific domain
domain = "shopify"  # whatever site you're looking for
matches = [d for d in datasets if domain.lower() in d["name"].lower()]
for d in matches:
    print(f"  {d['id']}: {d['name']} ({d['size']:,} records)")
```

**Response format:**
```json
[
  {"id": "gd_l1vijqt9jfj7olije", "name": "Crunchbase companies information", "size": 2300000},
  {"id": "gd_l1vikfch901nx3by4", "name": "Instagram - Profiles", "size": 620000000}
]
```

Each item has:
- `id` — the `dataset_id` to use with the Web Scraper API (`/datasets/v3/scrape` or `/datasets/v3/trigger`)
- `name` — human-readable name describing the scraper
- `size` — number of records in the dataset

When you find a matching dataset, use its `id` as the `dataset_id` parameter in Web Scraper API calls.

### Method 2: Browse the Full Documentation

Fetch the complete Bright Data documentation index at:

```
https://docs.brightdata.com/llms.txt
```

This file lists all available documentation pages. Use it to discover scraper-specific docs, API references, and guides for any supported domain. Particularly useful for finding input/output schemas and supported parameters for specific scrapers.

### When to Use Dynamic Lookup

- **Always** when the target domain isn't in the Quick Lookup table below
- When you're unsure if a scraper exists for a specific data type on a known domain (e.g., "does Bright Data have an Amazon seller reviews scraper?")
- When the user asks about a niche or recently-added platform
- When building scrapers for sites in categories like real estate, travel, food delivery, job boards, or classifieds — Bright Data frequently adds new scrapers for these verticals

---

## Quick Lookup

| Domain | Has Pre-Built Scraper? | Approach |
|--------|----------------------|----------|
| Amazon | Yes | SDK: `client.scrape.amazon.*` or CLI: `bdata pipelines search "amazon"` |
| LinkedIn | Yes | SDK: `client.scrape.linkedin.*` or CLI: `bdata pipelines search "linkedin"` |
| Instagram | Yes | SDK: `client.scrape.instagram.*` or CLI: `bdata pipelines search "instagram"` |
| Facebook | Yes | SDK: `client.scrape.facebook.*` or CLI: `bdata pipelines search "facebook"` |
| TikTok | Yes | SDK: `client.scrape.tiktok.*` or CLI: `bdata pipelines search "tiktok"` |
| YouTube | Yes | SDK: `client.scrape.youtube.*` or CLI: `bdata pipelines search "youtube"` |
| Twitter/X | Yes | CLI: `bdata pipelines search "x posts"` |
| Reddit | Yes | SDK: `client.scrape.reddit.*` or CLI: `bdata pipelines search "reddit posts"` |
| Walmart | Yes | CLI: `bdata pipelines search "walmart"` |
| eBay | Yes | CLI: `bdata pipelines search "ebay"` |
| Best Buy | Yes | CLI: `bdata pipelines search "best buy products"` |
| Home Depot | Yes | CLI: `bdata pipelines search "home depot us"` |
| Etsy | Yes | CLI: `bdata pipelines search "etsy"` |
| Zara | Yes | CLI: `bdata pipelines search "zara products"` |
| Google Maps | Yes | CLI: `bdata pipelines search "google maps reviews"` |
| Google Shopping | Yes | CLI: `bdata pipelines search "google shopping"` |
| Google Play Store | Yes | CLI: `bdata pipelines search "google play store"` |
| Apple App Store | Yes | CLI: `bdata pipelines search "apple app store"` |
| Crunchbase | Yes | CLI: `bdata pipelines search "crunchbase company"` |
| ZoomInfo | Yes | CLI: `bdata pipelines search "zoominfo"` |
| Zillow | Yes | CLI: `bdata pipelines search "zillow properties listing"` |
| Booking.com | Yes | CLI: `bdata pipelines search "booking hotel listings"` |
| Yahoo Finance | Yes | CLI: `bdata pipelines search "yahoo finance business"` |
| GitHub | Yes | CLI: `bdata pipelines search "github repository file"` |
| Any other site | No | Use Web Unlocker or Browser API (custom scraper) |

CLI cells are search queries, not fixed scrapers. Pick a `dataset_id` from the results, check its inputs with `bdata pipelines info <dataset_id> <method>`, then `bdata pipelines run`. See the `brightdata-cli` skill, [pipelines reference](../../brightdata-cli/references/pipelines.md).

---

## E-Commerce Scrapers

### Amazon

| Data Type | CLI lookup | Python SDK | Dataset ID |
|-----------|--------------|------------|------------|
| Product details | `bdata pipelines search "amazon product"` | `client.scrape.amazon.products(url=...)` | `gd_l7q7dkf244hwjntr0` |
| Product reviews | `bdata pipelines search "amazon product reviews"` | `client.scrape.amazon.reviews(url=...)` | — |
| Seller info | — | `client.scrape.amazon.sellers(url=...)` | — |
| Product search | `bdata pipelines search "amazon product search"` | `client.scrape.amazon.products_search(keyword=...)` | — |

**Amazon-specific tips:**
- Use `x-unblock-zipcode` header with Web Unlocker to get location-specific pricing
- Product search accepts keywords + domain URL (e.g., `https://www.amazon.com`)
- Reviews scraper returns all reviews for a given product URL

### Walmart

| Data Type | CLI lookup | Dataset ID |
|-----------|--------------|------------|
| Product details | `bdata pipelines search "walmart product"` | — |
| Seller info | `bdata pipelines search "walmart seller"` | — |

### eBay

| Data Type | CLI lookup | Dataset ID |
|-----------|--------------|------------|
| Listing details | `bdata pipelines search "ebay"` | — |

### Other E-Commerce

| Platform | CLI lookup |
|----------|--------------|
| Best Buy | `bdata pipelines search "best buy products"` |
| Home Depot | `bdata pipelines search "home depot us"` |
| Etsy | `bdata pipelines search "etsy"` |
| Zara | `bdata pipelines search "zara products"` |
| Google Shopping | `bdata pipelines search "google shopping"` |

---

## Social Media Scrapers

### Instagram

| Data Type | CLI lookup | Python SDK |
|-----------|--------------|------------|
| Profile | `bdata pipelines search "instagram profiles"` | `client.scrape.instagram.profiles(url=...)` |
| Posts | `bdata pipelines search "instagram posts"` | `client.scrape.instagram.posts(url=...)` |
| Reels | `bdata pipelines search "instagram reels"` | `client.scrape.instagram.reels(url=...)` |
| Comments | `bdata pipelines search "instagram comments"` | `client.scrape.instagram.comments(url=...)` |
| Profile search | — | `client.scrape.instagram.profiles_search(user_name=...)` |
| Posts by user | — | `client.scrape.instagram.posts_search(url=..., num_of_posts=20)` |

### Facebook

| Data Type | CLI lookup | Python SDK |
|-----------|--------------|------------|
| Posts | `bdata pipelines search "facebook posts"` | `client.scrape.facebook.posts_by_profile(url=..., num_of_posts=10)` |
| Group posts | — | `client.scrape.facebook.posts_by_group(url=..., num_of_posts=10)` |
| Marketplace | `bdata pipelines search "facebook marketplace listings"` | — |
| Reviews | `bdata pipelines search "facebook company reviews"` | — |
| Events | `bdata pipelines search "facebook events"` | — |
| Reels | — | `client.scrape.facebook.reels(url=...)` |
| Comments | — | `client.scrape.facebook.comments(url=..., num_of_comments=20)` |

### TikTok

| Data Type | CLI lookup | Python SDK |
|-----------|--------------|------------|
| Profile | `bdata pipelines search "tiktok profiles"` | `client.scrape.tiktok.profiles(url=...)` |
| Posts/Videos | `bdata pipelines search "tiktok posts"` | — |
| Shop products | `bdata pipelines search "tiktok shop"` | — |
| Comments | `bdata pipelines search "tiktok comments"` | — |

### YouTube

| Data Type | CLI lookup | Python SDK |
|-----------|--------------|------------|
| Channel | `bdata pipelines search "youtube channel"` | `client.scrape.youtube.profiles(url=...)` |
| Videos | `bdata pipelines search "youtube videos"` | `client.scrape.youtube.videos(url=...)` |
| Comments | `bdata pipelines search "youtube comments"` | `client.scrape.youtube.comments(url=...)` |
| Video search | — | `client.scrape.youtube.videos_search(keyword=..., num_of_videos=10)` |

### Twitter/X

| Data Type | CLI lookup |
|-----------|--------------|
| Posts/Tweets | `bdata pipelines search "x posts"` |

### Reddit

| Data Type | CLI lookup | Python SDK |
|-----------|--------------|------------|
| Posts | `bdata pipelines search "reddit posts"` | `client.scrape.reddit.posts(url=...)` |

---

## Professional / Business Scrapers

### LinkedIn

| Data Type | CLI lookup | Python SDK |
|-----------|--------------|------------|
| Person profile | `bdata pipelines search "linkedin person profile"` | `client.scrape.linkedin.profiles(url=...)` |
| Company profile | `bdata pipelines search "linkedin company profile"` | `client.scrape.linkedin.companies(url=...)` |
| Job listings | `bdata pipelines search "linkedin job listings"` | — |
| Posts | `bdata pipelines search "linkedin posts"` | `client.scrape.linkedin.posts(url=...)` |
| People search | `bdata pipelines search "linkedin people search"` | `client.scrape.linkedin.profiles_search(keyword=..., location=...)` |
| Job search | — | `client.scrape.linkedin.jobs_search(keyword=..., location=...)` |
| Company search | — | `client.scrape.linkedin.companies_search(keyword=...)` |

### Other Business

| Platform | CLI lookup |
|----------|--------------|
| Crunchbase | `bdata pipelines search "crunchbase company"` |
| ZoomInfo | `bdata pipelines search "zoominfo"` |

---

## Other Scrapers

| Platform | Data Type | CLI lookup |
|----------|-----------|--------------|
| Zillow | Property listings | `bdata pipelines search "zillow properties listing"` |
| Booking.com | Hotel listings | `bdata pipelines search "booking hotel listings"` |
| Yahoo Finance | Company/stock data | `bdata pipelines search "yahoo finance business"` |
| GitHub | Repository files | `bdata pipelines search "github repository file"` |
| Google Maps | Business reviews | `bdata pipelines search "google maps reviews"` |
| Google Play | App details | `bdata pipelines search "google play store"` |
| Apple App Store | App details | `bdata pipelines search "apple app store"` |

---

## Using Pre-Built Scrapers for Bulk Operations

### Python SDK — Concurrent Batch

```python
import asyncio
from brightdata import BrightDataClient

async def bulk_scrape(urls: list[str]):
    async with BrightDataClient() as client:
        tasks = [client.scrape.amazon.products(url=u) for u in urls]
        results = await asyncio.gather(*tasks)
        return [r.data for r in results if r.success]
```

### Shell — Multiple URLs with Web Scraper API

```bash
# Direct API call with multiple inputs
bash scripts/fetch.sh gd_l7q7dkf244hwjntr0 '[{"url":"https://amazon.com/dp/B001"},{"url":"https://amazon.com/dp/B002"}]'
```

### REST API — Async Trigger for Large Batches

For 20+ URLs, use the async trigger endpoint:

```python
import requests

# Trigger
response = requests.post(
    "https://api.brightdata.com/datasets/v3/trigger",
    params={"dataset_id": "gd_l7q7dkf244hwjntr0", "format": "json"},
    headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
    json={"input": [{"url": u} for u in urls]}
)
snapshot_id = response.json()["snapshot_id"]

# Poll + Download (see Web Scraper API reference for full pattern)
```
