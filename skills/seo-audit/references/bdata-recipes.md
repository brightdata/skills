# bdata Recipes — SEO Audit

Concrete `bdata` commands for each audit step. Each recipe has the same four parts: Purpose, Command(s), Parsing, Evidence-to-cite. Parse-only recipes that re-use rendered HTML from R-04 (rather than making a fresh `bdata` call) omit the Command section — their input is whichever R-04 page output the analysis is being run against.

## Per-Audit Data Flow (Mode B)

```
1. Discover     → R-01 (robots.txt) + R-02 (sitemap.xml) → URL list, group by path prefix
2. Sample       → R-03 stratified pick of 10–15 URLs (homepage + per-section samples)
3. Fetch        → R-04 parallel: bdata scrape <each-url> -f html
                  (single Bash message, multiple tool calls)
4a. SERP (always)→ R-12 site: indexation proxy (one call, always run)
4b. SERP (cond.) → R-13/R-14 (only when user named a target keyword or asked a diagnostic prompt)
5. Analyze      → parse rendered HTML per page (R-05..R-11), aggregate site-wide signals
6. Report       → format per output-templates.md
```

## Cost Discipline (read first)

- **Default page budget**: 10–15 pages for site-wide audits. The user can ask for a larger budget in natural language (e.g., "audit 30 pages") — there is no `bdata` CLI flag for this; it's an audit-level parameter the skill applies when sampling URLs in R-03.
- **Always parallelize** the sampled-page fetches: single Bash message, multiple `bdata scrape` tool calls. Do not loop sequentially.
- **Always pass `--json`** when piping to `jq`.
- **For arbitrary websites, `bdata scrape` is correct** — there is no `bdata pipelines` scraper for generic-website SEO. Pre-built scrapers target specific platforms (Amazon, LinkedIn, etc.); skip them here.
- **Never re-fetch** the same URL twice in one audit.

## Failure Handling

- If `bdata scrape <url>` returns empty/error, note it as a finding (5xx, blocked, etc.) and continue. Don't abort.
- If `sitemap.xml` is 404, fall back to homepage + `<a href>` extraction (R-10) for URL discovery — degraded but functional.
- If `bdata` is missing or unauthenticated, stop immediately and point the user at the prerequisites section in SKILL.md and the `brightdata-cli` skill.

---

## Recipes

### R-01: Fetch robots.txt

**Purpose:** Detect `Disallow: /` on important paths and presence of `Sitemap:` reference.

**Command:**
```bash
bdata scrape https://example.com/robots.txt -f html
```

**Parsing:**
```bash
# Disallow lines
grep -E '^Disallow:' robots.txt
# Sitemap reference
grep -iE '^Sitemap:' robots.txt | awk '{print $2}'
```

**Evidence to cite:** Command + `Disallow:` lines verbatim.

---

### R-02: Fetch sitemap.xml

**Purpose:** Pull the URL inventory for stratified sampling.

**Command:**
```bash
bdata scrape https://example.com/sitemap.xml -f html
```

**Parsing:**
```bash
# Extract <loc> URLs
grep -oE '<loc>[^<]+</loc>' sitemap.xml | sed -E 's|</?loc>||g'
# If sitemap-index, recurse: each <loc> points to a sub-sitemap
# Hreflang entries (multilingual)
grep -oE '<xhtml:link[^/]+/>' sitemap.xml
```

If sitemap is a sitemap-index (top-level `<sitemapindex>`), fetch each child sitemap with R-02.

**Evidence to cite:** Command + total URL count + first 5 URLs as a sample.

---

### R-03: Stratified URL sampling

**Purpose:** Pick 10–15 representative URLs from sitemap output, grouped by path prefix.

**Parsing (no bdata call — pure local processing of R-02 output):**
```bash
# Extract first path segment from each URL
sed -E 's|^https?://[^/]+/||' urls.txt | awk -F/ '{print $1}' | sort | uniq -c | sort -rn
```

Decision rule:
1. Always include homepage (`/`).
2. For each path-prefix group with ≥3 URLs, sample 1 URL (or 2 if it's the dominant group, e.g., `/products/` on e-commerce).
3. Cap total at 10 pages by default. Document budget override.
4. If `<budget>` is exceeded by the per-group caps, drop smallest groups first.

**Evidence to cite:** "Sampled 12 URLs from sitemap of 847; groups: `/blog/` (3), `/products/` (5), `/category/` (2), `/` (1), `/about` (1)".

---

### R-04: Parallel page fetch

**Purpose:** Fetch all sampled URLs as rendered HTML in parallel.

**Command (issue all `bdata scrape` calls in a SINGLE Bash message via multiple tool calls — Claude must use multiple Bash invocations in one assistant turn):**
```bash
bdata scrape https://example.com/ -f html -o /tmp/seo/_home.html
bdata scrape https://example.com/products/widget -f html -o /tmp/seo/_p1.html
# ...one call per sampled URL
```

**Parsing:** Each output is rendered HTML for downstream recipes (R-05..R-11).

**Evidence to cite:** The specific `bdata scrape <url>` command per finding.

---

### R-05: Title + meta description + canonical extraction

**Purpose:** Per-page on-page basics.

**Command:** Parses output of R-04 (no extra `bdata` call).

**Parsing:**
```bash
# Title
grep -oE '<title>[^<]+</title>' page.html | sed -E 's|</?title>||g'
# Meta description
grep -oE '<meta[^>]+name="description"[^>]*>' page.html | grep -oE 'content="[^"]*"' | sed -E 's|content="(.*)"|\1|'
# Canonical
grep -oE '<link[^>]+rel="canonical"[^>]*>' page.html | grep -oE 'href="[^"]*"' | sed -E 's|href="(.*)"|\1|'
```

**Evidence to cite:** Command + the extracted title/description/canonical line verbatim.

---

### R-06: Heading structure extraction

**Purpose:** Count H1s and detect heading-level skips.

**Parsing:**
```bash
# Count each heading level (use grep -oE | wc -l, not grep -c — minified HTML is one line)
for h in 1 2 3 4 5 6; do
  count=$(grep -oE "<h$h[ >]" page.html | wc -l)
  echo "h$h: $count"
done
# Extract H1 text
grep -oE '<h1[^>]*>[^<]+</h1>' page.html | sed -E 's|</?h1[^>]*>||g'
```

Flag: if H1 count ≠ 1, or if any H3 appears before any H2, etc.

**Evidence to cite:** Command + the per-level counts and H1 text.

---

### R-07: Schema markup detection (JS-injected)

**Purpose:** The recipe that distinguishes this skill. Detect JSON-LD schema, including markup injected by client-side JS (Yoast, RankMath, AIOSEO, Next.js, etc.).

**Why it works:** `bdata scrape -f html` runs the page through Bright Data's rendering layer, so JS-injected `<script type="application/ld+json">` blocks are present in the output — unlike `web_fetch` or `curl`.

**Command:** Parses output of R-04.

**Parsing:** JSON-LD blocks are multi-line and may contain literal `<` characters in string values, so a simple `grep` will silently fail on either count. Use Python for reliable extraction:
```bash
python3 - <<'PY' page.html
import re, sys, json
html = open(sys.argv[1]).read()
# Find every <script type="application/ld+json">...</script> block (DOTALL so newlines are matched)
blocks = re.findall(
    r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    html, re.DOTALL | re.IGNORECASE,
)
for raw in blocks:
    try:
        obj = json.loads(raw.strip())
    except json.JSONDecodeError as e:
        print(f"[malformed JSON-LD] {e}")
        continue
    items = obj if isinstance(obj, list) else [obj]
    for item in items:
        t = item.get("@type", "(no @type)")
        print(t if isinstance(t, str) else ", ".join(t))
PY
```

Output is one `@type` per line (e.g., `Product`, `BreadcrumbList`, `Organization`). Empty output means no JSON-LD blocks were found in the rendered HTML.

**Evidence to cite:** Command + the extracted `@type` list (e.g., `["Product", "BreadcrumbList"]`).

---

### R-08: Hreflang cluster extraction

**Purpose:** Validate hreflang self-reference, reciprocity, and valid codes for multilingual sites.

**Parsing:**
```bash
# From each page's HTML head
grep -oE '<link[^>]+rel="alternate"[^>]+hreflang="[^"]*"[^>]*>' page.html
# Extract hreflang code + href into pairs:
# - hreflang="en-GB" href="https://example.com/en-gb/about"
```

Validation rules (apply across the cluster from all sampled pages):
- **Self-reference:** Each page must list itself with its own hreflang.
- **Reciprocity:** If page A points to page B with `hreflang=fr`, page B must point back to A.
- **Valid codes:** ISO 639-1 lang + optional ISO 3166-1 Alpha-2 region. `en-UK` is invalid (use `en-GB`).
- **x-default:** Must be declared somewhere in the cluster.

**Evidence to cite:** Command + the malformed entry, e.g., `<link rel="alternate" hreflang="en-UK" href="..."/>` plus the rule it violates.

---

### R-09: Image alt audit

**Purpose:** Count `<img>` without `alt`.

**Parsing:** (Use `grep -oE … | wc -l` instead of `grep -c` — `-c` counts matching lines, which underreports on minified single-line HTML.)
```bash
total=$(grep -oE '<img[^>]*>' page.html | wc -l)
with_alt=$(grep -oE '<img[^>]+alt=' page.html | wc -l)
without=$((total - with_alt))
echo "$without/$total images missing alt"
```

**Evidence to cite:** Command + the ratio (e.g., "14/22 images missing alt on /products/widget").

---

### R-10: Internal-link map

**Purpose:** Build internal-link graph across sampled pages; detect orphan candidates and generic anchor text.

**Parsing:**
```bash
# Extract hrefs
grep -oE '<a[^>]+href="[^"]*"' page.html | grep -oE 'href="[^"]*"' | sed -E 's|href="(.*)"|\1|'
# Extract anchor text per link
grep -oE '<a[^>]+href="[^"]*"[^>]*>[^<]+</a>' page.html
```

Internal vs. external classification: if hostname matches the audit domain (or no hostname, i.e., relative), it's internal.

Generic anchor list: `click here`, `read more`, `learn more`, `here`, `link`.

**Evidence to cite:** Command + count of internal links, generic-anchor count, and the orphan-candidate list (URLs in sitemap but not linked from any sampled page).

---

### R-11: CWV-proxy signals

**Purpose:** HTML-level proxies for Core Web Vitals — always paired with "confirm with PSI" caveat in the finding.

**Parsing:** (POSIX `grep -E` does not support negative lookahead, so render-blocking and CLS-risk are computed by subtraction. All counts use `grep -oE … | wc -l` instead of `grep -c` because `-c` counts matching *lines*, not occurrences — a single-line minified HTML file would otherwise return 1 for everything.)
```bash
# Page weight (rendered HTML bytes)
wc -c < page.html
# Render-blocking scripts (synchronous + in <head>) = (all script-with-src in <head>) − (those with async or defer)
head_html=$(sed -n '/<head>/,/<\/head>/p' page.html)
total_head_scripts=$(echo "$head_html" | grep -oE '<script[^>]+src=' | wc -l)
async_or_defer=$(echo "$head_html" | grep -oE '<script[^>]+(async|defer)[^>]*src=|<script[^>]+src=[^>]*(async|defer)' | wc -l)
echo $((total_head_scripts - async_or_defer))
# Render-blocking stylesheets (no media="print")
echo "$head_html" | grep -oE '<link[^>]+rel="stylesheet"[^>]*>' | grep -vE 'media="print"' | wc -l
# Images without dimensions (CLS risk) = total <img> − those with width or height
total_imgs=$(grep -oE '<img[^>]*>' page.html | wc -l)
imgs_with_dims=$(grep -oE '<img[^>]*(width|height)=[^>]*>' page.html | wc -l)
echo $((total_imgs - imgs_with_dims))
# Lazy-loading count
grep -oE '<img[^>]+loading="lazy"' page.html | wc -l
# Resource hints count
grep -oE '<link[^>]+rel="(preconnect|preload|dns-prefetch)"' page.html | wc -l
```

**Evidence to cite:** Command + the metric (e.g., "page weight 4.2MB", "8 sync scripts in <head>", "14 images without width/height").

**Always include in the finding:** "Confirm with PageSpeed Insights at https://pagespeed.web.dev/?url=<url> for field-data CWV measurements."

---

### R-12: Indexation proxy via SERP

**Purpose:** Approximate count of URLs Google has indexed.

**Command:**
```bash
bdata search "site:example.com" --json
```

**Parsing:**
```bash
bdata search "site:example.com" --json | jq '.organic | length'
# Or to get the actual URLs:
bdata search "site:example.com" --json | jq -r '.organic[].link'
```

**Note:** `site:` queries return a sample, not exact counts. Compare to sitemap URL count from R-02 — flag if "12 indexed vs. 847 in sitemap" levels of mismatch.

**Evidence to cite:** Command + the count and a few sample indexed URLs.

---

### R-13: Ranking position check (signal-driven)

**Purpose:** Find user's domain in SERP for a target keyword. Run only when the user named a keyword.

**Command:**
```bash
bdata search "project management software" --json
```

**Parsing:**
```bash
bdata search "project management software" --json \
  | jq '.organic | to_entries[] | select(.value.link | contains("example.com")) | {position: (.key + 1), url: .value.link}'
```

If no entry returned, the domain is not in the top results for that query.

**Evidence to cite:** Command + position (e.g., "ranks #18 with URL /pm-tool") or "not in top 100".

---

### R-14: Cannibalization check (signal-driven)

**Purpose:** Detect when multiple URLs from the user's domain rank for the same keyword.

**Command:**
```bash
bdata search "project management software site:example.com" --json
```

**Parsing:**
```bash
bdata search "project management software site:example.com" --json \
  | jq -r '.organic[].link'
```

If 2+ URLs returned, those are cannibalization candidates.

**Evidence to cite:** Command + the URL list.

---

### R-15: Site-type detection

**Purpose:** Classify the site so the right playbook from `site-type-playbooks.md` applies.

**Inputs:** Output of R-04 for the homepage + URL list from R-02.

**Heuristics:**
| Site type | Cue |
|---|---|
| SaaS / Product | `/pricing` URL exists; "free trial" / "sign up" CTAs in nav; description mentions software/platform/tool; JSON-LD `@type: SoftwareApplication` |
| E-commerce | `/products/` or `/shop/` paths in sitemap; `Schema.org Product` JSON-LD; "Add to cart" buttons; `?color=` / `?size=` parameter patterns |
| Content / Blog | `/blog/` or `/posts/` paths dominate sitemap; `<meta name="generator" content="WordPress">` (or similar); `<article>` with bylines |
| Local Business | NAP in homepage footer; `Schema.org LocalBusiness` JSON-LD; Google Maps embed; multiple `/locations/<city>` |
| Multilingual | 2+ `<link rel="alternate" hreflang>` in homepage `<head>`; locale prefixes in sitemap (`/en/`, `/de/`, `/ar/`); non-default `<html lang>` |

A site can match multiple types — apply all matching playbooks.

**Evidence to cite:** Per-type, the cue that matched (e.g., "SaaS — `/pricing` page exists, JSON-LD `@type: SoftwareApplication` detected on homepage").

---

### R-16: Faceted-nav parameter detection (e-commerce)

**Purpose:** Detect indexable faceted-navigation URLs that risk crawl-budget waste.

**Parsing:**
```bash
# From R-02 sitemap URL list
grep -E '\?' urls.txt | head -20
grep -cE '\?' urls.txt
```

If many `?` URLs exist in the sitemap, flag as crawl-budget risk.

**Evidence to cite:** Command + count + 3-5 example URLs.

---

### R-17: Out-of-stock product handling (e-commerce)

**Purpose:** Detect product pages that are out-of-stock but still return 200 with no canonical handling.

**Parsing (per sampled product page):**
```bash
# Look for "out of stock" / "sold out" / "unavailable" markers in rendered HTML
grep -iE 'out of stock|sold out|currently unavailable' page.html
# Check Schema.org availability (JS-rendered, parseable from R-04 output)
grep -oE '"availability"[^,}]*' page.html
# Check canonical destination — does it point to itself, or to a parent category?
grep -oE '<link[^>]+rel="canonical"[^>]+href="[^"]+"' page.html
```

Flag: page contains an out-of-stock signal, has `Schema.org availability: OutOfStock` (or no availability schema), and self-canonicals (rather than canonicaling to a parent category or returning 404). If we need to confirm the HTTP status code, use `curl -o /dev/null -s -w "%{http_code}\n" "<url>"` rather than relying on `bdata scrape -f json` shape — the JSON-mode output schema is not documented for this purpose.

**Evidence to cite:** Command + the out-of-stock text + missing canonical.

---

### R-18: Author-page reachability (blog)

**Purpose:** Find broken `/author/<x>` links from blog posts.

**Parsing:**
```bash
# From sampled blog posts
grep -oE '<a[^>]+href="[^"]*author[^"]*"' post.html | grep -oE 'href="[^"]*"' | sort -u
# For each unique author URL, fetch:
bdata scrape "https://example.com/author/jane" -f html
```

Flag if any author URL returns 404 or is blocked.

**Evidence to cite:** Command + the broken author URL.

---

### R-19: Publication-date / freshness extraction (blog)

**Purpose:** Identify outdated content (>18 months without update).

**Parsing:**
```bash
# datetime in <time> tags
grep -oE '<time[^>]+datetime="[^"]*"' post.html
# Modified date (Schema.org Article)
grep -oE '"dateModified"[^,}]*' post.html
# Updated date in visible text (fallback)
grep -iE 'last updated|updated on' post.html
```

Flag posts with `datetime` >18 months ago and no visible update marker.

**Evidence to cite:** Command + the date + how long ago it is.

---

### R-20: NAP extraction (local business)

**Purpose:** Extract Name / Address / Phone from each sampled page footer to detect inconsistency.

**Parsing:**
```bash
# Phone (US formats)
grep -oE '\(?\b[0-9]{3}\)?[-. ]?[0-9]{3}[-. ]?[0-9]{4}\b' page.html | sort -u
# Address (rough — match street suffixes)
grep -oE '[0-9]+ [A-Z][a-z]+( [A-Z][a-z]+)* (St|Ave|Blvd|Rd|Way|Dr|Ln)\b[^<]*' page.html | sort -u
# Or pull from LocalBusiness JSON-LD if present
echo "$JSONLD" | jq -r '.address, .telephone'
```

Normalize phone (digits only) before comparing across pages. Flag any mismatch as a finding.

**Evidence to cite:** Command + the conflicting values per page.

---

### R-21: Local SERP visibility (local business)

**Purpose:** Run `bdata search "<service> <city>"` per location to validate local SERP presence.

**Command:**
```bash
bdata search "plumber Austin" --country us --json
```

**Parsing:** Same as R-13 — find user's domain in `.organic[].link`.

**Evidence to cite:** Command + position per city.

---

### R-22: Outbound-link sampling (E-E-A-T)

**Purpose:** Quick check that content links to authoritative sources rather than orphan pages with no citations.

**Parsing:**
```bash
grep -oE '<a[^>]+href="https?://[^"]*"' page.html \
  | grep -oE 'href="[^"]*"' \
  | grep -vE 'href="https?://(www\.)?example\.com' \
  | sort -u | head
```

Flag: low outbound-link count + topic that demands citations (medical, legal, financial).

**Evidence to cite:** Command + outbound-link count.

---

### R-23: Author byline + bio detection (E-E-A-T)

**Purpose:** Detect missing or thin author bylines on blog content.

**Parsing:**
```bash
# Schema.org Article author
echo "$JSONLD" | jq -r '.author.name // .author[0].name'
# Visible byline (rough)
grep -iE 'by <[^>]+>|class="author"|rel="author"' post.html
```

Flag posts with no detectable author.

**Evidence to cite:** Command + presence/absence.

---

### R-24: Word-count + paragraph-count extraction

**Purpose:** Detect thin content.

**Parsing:**
```bash
# Strip HTML tags, count words
sed -E 's|<[^>]+>||g' page.html | wc -w
# Paragraph count
grep -oE '<p[ >]' page.html | wc -l
```

Thresholds (rough): <300 words is thin for a content page; <100 words is thin even for a product page.

**Evidence to cite:** Command + count.

---

### R-25: Generic anchor-text density

**Purpose:** Flag over-reliance on generic anchor text in internal links.

**Parsing:**
```bash
# From R-10 anchor extraction. Trim whitespace and use grep -oE | wc -l (not -c, to avoid line-counting on minified HTML).
generic=$(grep -oE '<a[^>]+href="[^"]*"[^>]*>[^<]+</a>' page.html \
  | sed -E 's|.*>([^<]+)</a>|\1|' \
  | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' \
  | grep -ciE '^(click here|read more|learn more|here|link|this|more)$')
total=$(grep -oE '<a[^>]+href="[^"]*"' page.html | wc -l)
echo "$generic/$total internal anchors are generic"
```

Flag if generic-anchor ratio is > 30% of internal-link count.

**Evidence to cite:** Command + ratio.
