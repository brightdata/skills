# Bright Data MCP Tools Reference

Complete reference for all Bright Data MCP server tools, organized by category.

## Search and Scraping

### search_engine
Scrape search results from Google, Bing, or Yandex. Returns SERP results in JSON for Google and Markdown for Bing/Yandex. Supports pagination with the `cursor` parameter.

### scrape_as_markdown
Scrape a single webpage with advanced extraction and return Markdown. Uses Bright Data's unlocker to handle bot protection and CAPTCHA.

### search_engine_batch
Run up to 10 search queries in parallel. Returns JSON for Google results and Markdown for Bing/Yandex.

### scrape_batch
Scrape up to 10 webpages in one request and return an array of URL/content pairs in Markdown format.

### Advanced Scraping

| Tool | Description |
|------|-------------|
| `scrape_as_html` | Scrape a webpage and return raw HTML. Handles bot detection and CAPTCHA. |
| `extract` | Scrape a webpage as Markdown, then convert to structured JSON using AI. Accepts optional custom extraction prompt. |
| `session_stats` | Report how many times each tool has been called during the current MCP session. |
| `search_engine_batch` | Run up to 10 search queries in parallel. |
| `scrape_batch` | Scrape up to 10 webpages in one request. |

### Scraper Tools

Structured JSON from 1,200+ pre-built scrapers (Amazon, Walmart, LinkedIn, Instagram, TikTok, YouTube, Facebook, X, Reddit, Crunchbase, Zillow, Booking.com, Google Play, npm, PyPI, and more). The scraper list is refreshed daily.

| Tool | Description |
|------|-------------|
| `search_scrapers` | Find scrapers by site or data type (e.g. "amazon reviews", "linkedin.com"). Returns `dataset_id`, name, domain and `collection_methods`. |
| `get_scraper_details` | Description, input fields, `sample_input` and main output fields for one method. |
| `run_scraper` | Run a method on a list of inputs shaped like `sample_input`. Waits up to 45 seconds; if still running, returns a `snapshot_id` with status `running`. |
| `get_scraper_progress` | Status of a run: starting, running, ready, failed or canceled. |
| `get_scraper_results` | Records of a finished run. |
| `refresh_scrapers` | Reload the scraper list now. |

Typical flow: `search_scrapers` → `get_scraper_details` → `run_scraper`.
- `collect_by_url` returns one record per input; `discover_by_*` methods return up to `limit_per_input` records per input (default 10). Every record is billed.
- Records with an `error` field explain inputs that failed, e.g. a URL of the wrong type.
- Call `search_scrapers` once per site and reuse the `dataset_id`.

### GEO

| Tool | Input | Description |
|------|-------|-------------|
| `chatgpt_ai_insights` | Prompt | ChatGPT's answer as Markdown |
| `perplexity_ai_insights` | Prompt | Perplexity's answer as Markdown |

### Browser Automation

Use these tools in sequence for interactive web automation.

| Tool | Description |
|------|-------------|
| `scraping_browser_navigate` | Open or reuse a session, navigate to URL. Resets tracked network requests. |
| `scraping_browser_go_back` | Navigate back to the previous page. |
| `scraping_browser_go_forward` | Navigate forward to the next page. |
| `scraping_browser_snapshot` | Capture ARIA snapshot listing interactive elements with refs. |
| `scraping_browser_click_ref` | Click an element by its ref from the ARIA snapshot. Requires ref + human-readable description. |
| `scraping_browser_type_ref` | Fill an input element by ref. Optionally press Enter after typing. |
| `scraping_browser_fill_form` | Fill several form fields by ref in one call. |
| `scraping_browser_screenshot` | Capture screenshot. Supports optional `full_page` mode. |
| `scraping_browser_network_requests` | List network requests since page load (method, URL, status). |
| `scraping_browser_wait_for_ref` | Wait until an element becomes visible (optional timeout in ms). |
| `scraping_browser_get_text` | Return the text content of the page body. |
| `scraping_browser_get_html` | Return page HTML. Avoid `full_page` unless head/script tags are needed. |
| `scraping_browser_scroll` | Scroll to the bottom of the page. |
| `scraping_browser_scroll_to_ref` | Scroll until a specific element (by ARIA ref) is in view. |

#### Browser Automation Best Practices

1. Always start with `scraping_browser_navigate` to open the target URL
2. Use `scraping_browser_snapshot` to discover interactive elements before clicking/typing
3. Use refs from the snapshot (not selectors) for all interactions
4. After interactions, take a new `scraping_browser_snapshot` to see updated state
5. Use `scraping_browser_screenshot` to visually verify state when debugging
6. Use `scraping_browser_wait_for_ref` before interacting with elements that load dynamically
7. Extract final content with `scraping_browser_get_text` or `scraping_browser_get_html`
