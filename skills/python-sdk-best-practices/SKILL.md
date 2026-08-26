---
name: python-sdk-best-practices
description: |
  Web data extraction and discovery using the Bright Data Python SDK.
  Use when user asks to "scrape", "get data from", "extract", "search for",
  or "find" information from websites. Also use when user mentions specific
  platforms like Amazon, LinkedIn, Instagram, Facebook, TikTok, YouTube,
  Reddit, Pinterest, Zillow, Crunchbase, or DigiKey, or asks for "bulk data",
  "historical data", or "dataset". Covers scraping, searching, datasets,
  and browser automation.
metadata:
  author: brightdata
  version: "1.0"
---

# Bright Data SDK

Access web data through a unified Python SDK. One client, eight service categories: platform scraping, platform search, web search (SERP), AI-powered discovery, datasets, web unlocking, browser automation, and scraper studio.

Always use the client as a context manager. In synchronous environments (scripts, notebooks, Claude Code), use `SyncBrightDataClient`. In async environments, use `BrightDataClient`. Both use the same method names — the sync client wraps calls automatically. Note: the sync client currently has limited platform coverage — see the sync compatibility note in `references/scrapers.md` for details. For unsupported platforms or the datasets API, use the async client (`BrightDataClient`).

## Service Selection (decide first, then look up the specific method)

Use this decision tree to pick the right service BEFORE reaching for any specific method. Most routing failures come from skipping this step and pattern-matching on user keywords instead.

```
Have a URL?
  ├── On a supported platform (Amazon, LinkedIn, Facebook, Instagram, YouTube,
  │   TikTok, Reddit, ChatGPT, Perplexity, Pinterest, DigiKey)?
  │     → Platform scraping: client.scrape.<platform>.<method>(url=...)
  │
  ├── Generic page (not on any supported platform)?
  │     → Web unlocker: client.scrape_url(url=...)
  │
  └── Need login / JavaScript / click-scroll-fill / CAPTCHA / multi-step navigation?
        → Browser API: client.browser.get_connect_url() (then connect with Playwright)

No URL?
  ├── Want entities matching natural-language criteria
  │   ("find AI startups in Berlin", "competitors of Acme Corp", "people who worked at X")?
  │     → Discover: client.discover(query=..., intent=...)
  │
  ├── Want web pages / articles / search-result links
  │   ("search Google for X", "find pages about Y")?
  │     → SERP: client.search.google(query=...) [or .bing / .yandex]
  │
  ├── Want to search WITHIN a specific platform
  │   ("find products on Amazon", "TikTok videos by hashtag", "Pinterest pins about recipes")?
  │     → Platform search: client.search.<platform>.<method>(...)
  │
  └── Want bulk historical data at scale
      ("all LinkedIn companies in tech", "historical Amazon prices", "every Zillow listing in Texas")?
        → Datasets: client.datasets.<name>(filter=...) (then .download(snapshot_id))
```

Edge cases:
- URL on supported platform BUT user explicitly mentions login/click/scroll/JS → Browser API (the interaction trumps the platform).
- URL on supported platform BUT scraper returns 403/blocked → fall back to `client.scrape_url()` (web unlocker).
- "Find/research/who are X" with a URL alongside (e.g., "find competitors of acme.com") → still Discover; the URL is context, not the scrape target.

## Method Names: Verify Before Asserting

Before claiming any platform method exists, doesn't exist, or asserting a platform isn't supported, you MUST consult `references/scrapers.md` first. Past evals show the model has hallucinated method names (e.g., `client.scrape.linkedin.people` — does NOT exist; use `.profiles`) and falsely claimed platforms unsupported (e.g., Pinterest is supported via both `client.scrape.pinterest` and `client.search.pinterest`).

**Rule:** load `references/scrapers.md` before naming any specific platform method. The reference file lists every platform, every method signature, and the sync/async availability matrix. Verify, don't assume. If you've already loaded `references/scrapers.md` in this session, consult what's in context — no need to reload.

**Known hallucinations** (these names do NOT exist in the SDK — the model has invented them in past evals):

| Hallucinated | Correct replacement |
|---|---|
| `client.scrape.linkedin.people(...)` | `client.scrape.linkedin.profiles(url=...)` |
| `client.scrape.instagram.users(...)` | `client.scrape.instagram.profiles(url=...)` |
| `client.list_datasets()` | `client.datasets.list()` |
| `asyncio.gather(*[client.scrape.X.<quick>(...) for ...])` | Trigger pattern — see Batch gotcha |

This list grows as new hallucinations are observed in evals. If you're tempted to write a method name that "feels right" but you haven't seen in `references/scrapers.md`, treat it as a likely hallucination — load the reference and verify.

## Useful Standalone Methods

Methods that don't belong to any specific workflow — easy to overlook because they're not tied to a platform or a routing decision. The model has hallucinated some of these (`client.list_datasets()` instead of `client.datasets.list()`); use the canonical names below.

| Method | What it does |
|---|---|
| `client.datasets.list()` | List all 310+ datasets at runtime. Do NOT use `dir()` or introspection — use this method. |
| `client.discover(query=, intent=)` | AI-ranked entity search (companies, people, products). See Service Selection above. |
| `client.scrape_url(url=...)` | Web unlocker for any URL. Use for sites without a dedicated platform scraper. |
| `client.browser.get_connect_url()` | CDP WebSocket URL for Playwright / Puppeteer / Selenium. |
| `client.list_zones()` | List active Bright Data zones. |
| `client.delete_zone(name)` | Remove a zone. |
| `client.test_connection()` | Verify the API token works. |
| `client.get_account_info()` | Usage, quotas, active zones. |

## How to Handle Requests

### Exploring capabilities

If the user wants to know what's available or asks "what can this do?", describe these 8 categories. Each follows the template: **Name** — what it does — example invocation — when to use.

1. **Platform scraping** — extract structured data from 11 supported platforms by URL. `client.scrape.<platform>.<method>(url=...)` (platforms: Amazon, LinkedIn, Facebook, Instagram, YouTube, TikTok, Reddit, ChatGPT, Perplexity, Pinterest, DigiKey). Use when the user has a URL on a supported platform and wants structured fields (price, profile data, post engagement, etc.).

2. **Platform search** — search within a specific platform by keyword/profile/filter. `client.search.<platform>.<method>(...)`. Use for "find products on Amazon by keyword", "discover TikTok videos by hashtag", "find Pinterest pins about recipes" — i.e., the user wants to search WITHIN a platform but doesn't have a specific URL.

3. **Web search (SERP)** — get structured search engine results (titles, links, snippets, rankings). `client.search.google(query=...)` (or `.bing` / `.yandex`). Use for "search Google for X", "find pages/articles about Y", "look up news on Z" — i.e., the user wants web pages, not entities.

4. **Discover (AI-powered)** — `client.discover(query=..., intent=...)` to find entities (companies, people, products, places) matching natural-language criteria. Use for "find AI startups in Berlin", "competitors of Acme Corp", "people who worked at Stripe", "research the SaaS pricing landscape" — i.e., the user wants a list of entities matching a description, not web pages.

5. **Datasets** — access 310+ pre-built datasets with historical/bulk data at scale. `client.datasets.<name>(filter=...)` (then `.download(snapshot_id)`). Use for "bulk LinkedIn company data", "historical Amazon prices for electronics", "all Zillow listings in Texas" — i.e., the user wants many records at once, not live data on one page.

6. **Web unlocker** — scrape any URL with anti-bot bypass for sites without a dedicated platform scraper. `client.scrape_url(url=...)`. Use when the URL is on a generic website (no dedicated scraper) or as fallback when a platform scraper returns 403/blocked.

7. **Browser API** — connect to a remote browser via CDP (Chrome DevTools Protocol) for real-browser interaction. `client.browser.get_connect_url()` (then connect with Playwright/Puppeteer). Use for login flows, JavaScript-heavy single-page apps, click/scroll/fill interactions, CAPTCHA — i.e., anything requiring a real browser session. Most expensive option; use only when simpler methods can't accomplish the task.

8. **Scraper Studio** — run pre-built or custom scraping templates configured in the Bright Data dashboard. `client.scraper_studio.run(collector="c_xxx", input={...})`. Use when the user provides a collector ID for a template not covered by platform scrapers.

Offer to load the relevant reference file for details on any category.

### Data extraction from a specific URL

The user has a URL and wants structured data from it.

If the URL is from a supported platform (Amazon, LinkedIn, Facebook, Instagram, YouTube, TikTok, Reddit, ChatGPT, Perplexity, Pinterest, DigiKey — see `references/scrapers.md` for the full list and available methods):
- Use `client.scrape.<platform>.<method>(url=...)`
- Read `references/scrapers.md` for available methods per platform

If the URL is from an unsupported platform or a generic website:
- Use `client.scrape_url(url=...)` for raw page data with anti-bot bypass
- Read `references/advanced.md` for web unlocker options

If the user has MULTIPLE URLs (batch):
- Use BrightDataClient and trigger methods (`_trigger` suffix) to avoid sequential blocking
- Fire all triggers first, then collect results with `job.wait()` and `job.to_result()`
- Read `references/advanced.md` for batch execution patterns

### Research or discovery without a specific URL

The user wants to find information but doesn't have a starting URL.

For web search results (links, snippets, rankings):
- Use `client.search.google(query=...)`, `client.search.bing(query=...)`, or `client.search.yandex(query=...)`
- Read `references/search.md` for available search engines and parameters

For platform-specific search (find products on Amazon, profiles on LinkedIn, videos on YouTube, etc.):
- Use `client.search.<platform>.<method>(...)`
- Read `references/scrapers.md` — search methods are listed under each platform

For deeper discovery (find companies, people, or entities matching criteria):
- Use `client.discover(query=..., intent=...)`
- The Discover API requires an intent phrase, not just keywords
- Read `references/search.md` for discover API details

### Bulk or historical data needs

The user asks for "bulk data", "historical data", "database", "list of", or wants data at scale without scraping individual pages.

- Use `client.datasets.list()` at runtime to discover available datasets
- Read `references/datasets-overview.md` for dataset categories and usage patterns
- Create a filtered snapshot: `snapshot_id = client.datasets.<name>(filter={...})`
- Download data: `data = client.datasets.<name>.download(snapshot_id)` (default format is jsonl; also supports json, csv)
- Snapshots take time to build — download blocks until ready (up to 5 minutes)

### Multi-step research workflow

The user has a broad research goal (e.g., "research competitors in Berlin").

Step 1: Find sources
- `client.discover(query=..., intent=...)` for entity-level discovery
- OR `client.search.google(query=...)` for web search results

Step 2: Extract data from discovered sources
- `client.scrape.<platform>.<method>(url=...)` on each discovered URL
- Use trigger methods for batch processing if many URLs

Step 3: Optionally enrich with bulk data
- Check `client.datasets` for historical context on the entities found

### Interactive web tasks

The user needs login, clicking, scrolling, form filling, or JavaScript execution.

- Use `client.browser.get_connect_url()` to get a CDP WebSocket URL
- Connect with Playwright, Puppeteer, or another CDP client
- This is the most expensive option — only use when simpler methods cannot accomplish the task
- Read `references/advanced.md` for browser API details

### Scraper Studio templates

The user wants to use a pre-built or custom scraping template.

- Use `client.scraper_studio.run(collector="c_xxx", input={...})`
- Requires a collector ID — the user must provide this or know which template to use
- Read `references/advanced.md` for scraper studio details

## Gotchas

### Browser API is a last resort, not a default

**Default:** For pages on a supported platform (Amazon products, LinkedIn profiles, Instagram posts/reels, etc.) → use the platform scraper.

**Override:** User explicitly mentions one of the following → comply with the browser-API request (it IS the right tool):
login, sign-in, click, scroll, fill, type, JavaScript execution, CAPTCHA, screenshot, PDF generation, multi-step navigation.

**Counter-override:** User requests browser API for a page that does NOT need any of the above AND the URL is on a supported platform → DO NOT comply. Show the platform scraper code and explain the cost/speed difference (~10x cheaper, ~30s vs ~5min).

```python
# WRONG (browser when scraper would do):
cdp_url = client.browser.get_connect_url()
browser = await playwright.chromium.connect_over_cdp(cdp_url)
page = await browser.new_page()
await page.goto("https://amazon.com/dp/B09V3KXJPB")
# ↑ scraper is ~10x cheaper, ~30s vs ~5min, returns structured data not raw HTML

# RIGHT (use the platform scraper):
result = await client.scrape.amazon.products(url="https://amazon.com/dp/B09V3KXJPB")

# RIGHT — legitimate browser-API case (the user mentions login):
# User said "log into Amazon and check my recent orders"
cdp_url = client.browser.get_connect_url(country="us")
browser = await playwright.chromium.connect_over_cdp(cdp_url)
page = await browser.new_page()
await page.goto("https://amazon.com/login")
await page.fill("#ap_email", username)
# ... etc — browser is the right tool here.
```
- Datasets return HISTORICAL data, not live/real-time data. If the user needs current data, use platform scrapers or web unlocker instead.
- The Discover API requires an INTENT (natural language description of what you're looking for), not just a keyword. Rephrase bare keywords like "restaurants" into intent phrases like "find Italian restaurants with outdoor seating in downtown Austin."
- When a scraper returns 403 or is blocked, try `client.scrape_url()` (web unlocker) as fallback — it handles anti-bot protections.
- Always prefer the cheapest service that satisfies the request. Cost hierarchy (cheapest first): datasets → SERP → platform scrapers → web unlocker → discover → scraper studio → browser API.
- Always use the client as a context manager. Never create multiple client instances — reuse one client across all operations in a session.
- Each scraper supports 3 execution patterns: quick (blocks until result), trigger (returns job immediately), manual (trigger + status + fetch). Default to quick unless the user needs batch processing or non-blocking execution.
- Quick methods block for several minutes depending on platform and page complexity. Do NOT set short timeouts — the SDK defaults are calibrated per platform. Expect 2-10 minutes for most operations.
- The SDK auto-retries network errors and timeouts (3 retries, exponential backoff). Do NOT add your own retry logic on top — it will double-retry and waste API credits.
- Dataset operations return a `snapshot_id`, not data directly. Snapshots go through a lifecycle: scheduled → building → ready. Use `.download(snapshot_id)` which blocks until the snapshot is ready. Supported download formats: json, jsonl, csv.

### For batch operations (many URLs), use the trigger pattern

**Why:** Quick methods (e.g., `client.scrape.amazon.products`) block for 2-10 minutes each waiting for the scrape to complete. Even with the default 10 req/s rate limit, `asyncio.gather` of 200 quick calls = 200 × ~5 minutes / 10 (rate limit) = **~100 minutes of blocked execution**. The trigger pattern fires the request and returns a job; you collect results in parallel when they're ready.

```python
# WRONG (anti-pattern, even with rate_limit respected):
results = await asyncio.gather(*[
    client.scrape.amazon.products(url=u) for u in urls
])  # ↑ each call blocks ~5min; total ~100min for 200 URLs

# RIGHT (trigger pattern):
jobs = [await client.scrape.amazon.products_trigger(url=u) for u in urls]
for job in jobs:
    await job.wait(timeout=600)
results = [await job.to_result() for job in jobs]
# ↑ total time ≈ longest single scrape ≈ 5-10 min, regardless of N
```

Rate limit (10 req/s default) keeps the trigger fires sequential; the parallelism happens during the wait phase, which is just status polling and is cheap. Do NOT use `asyncio.gather` to fire triggers in parallel either — you'll hit the rate limiter.


- In synchronous environments (scripts, notebooks, Claude Code), use `SyncBrightDataClient`. In async environments, use `BrightDataClient`. Both use the SAME method names — the only difference is that async calls need `await`. Do NOT use `_sync` suffix methods with `SyncBrightDataClient`. Note: the sync client has limited platform coverage. Sync scraping supports: Amazon, LinkedIn, Instagram, Facebook, ChatGPT, Pinterest. Sync search supports: Google, Bing, Yandex, Amazon, LinkedIn, Instagram, ChatGPT, Pinterest. For TikTok, YouTube, Reddit, Perplexity, DigiKey scrapers/search and the datasets API, use the async client.
- Platform search methods (e.g., `client.search.amazon.products()`) are different from platform scrapers (e.g., `client.scrape.amazon.products()`). Search finds items by keyword. Scrape extracts data from a specific URL.

## Examples

### "Get me reviews for this Amazon product"

Use `client.scrape.amazon.reviews(url="<the_url>")`.
Returns structured review data: rating, text, date, reviewer name.
Quick method — blocks until complete (up to ~4 minutes).

### "Find AI startups in Berlin"

Step 1: `client.discover(query="AI startups in Berlin", intent="find technology companies")`
Returns a list of matching entities with URLs and metadata.

Step 2: For each result with a URL, optionally scrape deeper data:
`client.scrape.linkedin.companies(url=...)` or `client.scrape_url(url=...)`.

### "I need historical pricing data for electronics"

Step 1: `client.datasets.list()` to find relevant datasets.

Step 2: Create a filtered snapshot:
`snapshot_id = client.datasets.amazon_products(filter={"name": "category", "operator": "=", "value": "Electronics"}, records_limit=1000)`

Step 3: Download the data:
`data = client.datasets.amazon_products.download(snapshot_id)`

Note: Download blocks while the snapshot builds (up to 5 minutes). Default format is jsonl (also supports json, csv). This is historical/bulk data, not live prices. Returns a list of records.

## Troubleshooting

- **401 Unauthorized**: API token is invalid or expired. Check the token passed to the client constructor.
- **403 Forbidden / Blocked**: The target site blocked the request. Try `client.scrape_url()` (web unlocker) as fallback, or use a different scraper method.
- **Timeout**: Do not lower the timeout — increase it. Some operations take several minutes. Platform-specific defaults are already optimized.
- **"Dataset not found"**: Use `client.datasets.list()` to see available datasets. Dataset attribute names are snake_case (e.g., `amazon_products`, `linkedin_profiles`).
- **SSL/Proxy errors in sandboxed environments**: Pass `ssl_verify=False` to the client constructor to skip SSL verification, or use `ssl_ca_cert='/path/to/cert.pem'` for custom certificate handling.
- **Rate limit errors**: Reduce concurrency. Default limit is 10 requests/second. Use sequential calls or trigger methods for batch work.

## When to Load References

- Read `references/scrapers.md` when the user mentions **Amazon, LinkedIn, Facebook, Instagram, YouTube, TikTok, Reddit, ChatGPT, Perplexity, Pinterest, DigiKey** or other specific platforms — to see available scraper methods, search methods, and parameters for that platform.
- Read `references/search.md` when the user asks to **"find", "search", "discover", "research", "look up"** something without mentioning a specific platform — to see SERP engines and Discover API options.
- Read `references/datasets-overview.md` when the user asks for **"bulk data", "historical data", "database", "list of", "dataset"** or wants data at scale — to see dataset categories and how to discover specific datasets at runtime.
- Read `references/advanced.md` when the user needs **batch processing of multiple URLs, non-blocking execution, browser automation, JavaScript execution, login/session handling, custom scraping templates, or when simpler methods have failed** — to see execution patterns, batch workflows, Web Unlocker, Browser API, and Scraper Studio details.
