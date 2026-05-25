# Four scraper types — map from the brief to the CLI

The Scraper Studio product page (and the YouTube creator brief) describes **four scraper types**: **PDP**, **Discovery**, **Discovery + PDP**, and **Search**. The CLI has **two commands** (`bdata scraper create` and `bdata scraper run`). The "type" is not a flag — it is the shape of the description you pass to `create` and the URL pattern you pass to `run`.

This page is the bridge. Pick the row that matches the user's intent; use the exact prompt + run pattern from that row.

## At a glance

| Brief calls it | Input URL pattern | What gets returned | Same `create`+`run` commands |
|---|---|---|---|
| **PDP** | One product page URL (`/p/123` or `/dp/B0...`) | One object: fields of that product | `create` against one product, `run` against any product on same template |
| **Discovery** | A category / listing URL (`/c/baby` or `/companies?batch=W26`) | Array of cards (title, link, price, snippet) | `create` against the listing, `run` against any listing on same template |
| **Discovery + PDP** | Same as Discovery, then feed each link back into a PDP collector | Array of deep objects (one full PDP per link) | Two collectors chained: Discovery for the links, PDP for the depth |
| **Search** | A search-results URL with `?q=` or `?query=` | Array of result cards | `create` against the search URL, `run` with a different query |

## Type 1 — PDP (Product / Detail Page)

**When:** the user names a single canonical URL pattern (an Amazon `/dp/...`, a Y Combinator `/companies/<name>`, a Zillow listing) and wants its **fields**.

**Create prompt shape:**
```
"Extract the following fields from this product / detail page:
 - <field_1>: <one-sentence semantic, with disambiguator>
 - <field_2>: <one-sentence semantic, with disambiguator>
 - …"
```

**End-to-end:**
```bash
# Build (5–10 min)
bdata scraper create https://news.ycombinator.com/item?id=39000000 \
    "Extract from this Hacker News item: title, url, points, author,
     submission_time_iso, comment_count, top_comment_text."

# Run on any item using the same template
bdata scraper run c_xxx https://news.ycombinator.com/item?id=39001234 --pretty
```

**Common mistake:** asking for "everything on the page" — the AI will pick arbitrary fields that change between runs. Always enumerate.

## Type 2 — Discovery (listing / index)

**When:** the user has a category, batch, leaderboard, or directory URL and wants the **list of cards**, not the deep object behind each card.

**Create prompt shape:**
```
"For each item card on this listing page, extract:
 - <field_1>: <semantic>
 - link: the URL the card points to
 - …
Return one array element per card."
```

**End-to-end:**
```bash
bdata scraper create https://www.ycombinator.com/companies?batch=W26 \
    "For each company card on this page, extract name, vertical, one-line
     tagline, batch (e.g. W26), and link to the company profile.
     Return one array element per card."

bdata scraper run c_yyy https://www.ycombinator.com/companies?batch=S25 \
    --pretty -o s25.json
```

**Common mistake:** writing a single-object description against a listing URL. The AI may scrape one random card or smash all cards into one row. Always say "for each card" + "return one element per card".

## Type 3 — Discovery + PDP (combo, the production workflow)

**When:** the user wants every item on a listing, **deeply scraped** — the listing only gives summaries; you need full PDP fields for each. This is the canonical real-world pattern, and what Scraper Studio's batch endpoint is built for.

**Two-step pattern (one Discovery collector + one PDP collector):**
```bash
# 1. Run the Discovery collector to get the links (Type 2)
bdata scraper run c_yyy https://www.ycombinator.com/companies?industry=ai \
    --json | jq -r '.[].link' > ai-companies.txt
# → ai-companies.txt has one URL per line

# 2. Batch-run the PDP collector against the link list (Type 1 template)
bdata scraper run c_xxx --input-file ai-companies.txt -o ai-deep.json
```

**Why two collectors, not one:** keep concerns separate. The Discovery collector handles list-page DOM; the PDP collector handles detail-page DOM. They evolve independently when either page redesigns.

**Common mistake:** trying to teach one collector both shapes ("scrape the listing AND each item"). The AI Flow generates better, more stable templates when each collector has one job.

## Type 4 — Search (keyword-driven)

**When:** the user starts with a **keyword**, not a URL. The pattern is: a real site that exposes search results via a URL query parameter (`?q=`, `?query=`, `?s=`).

**The trick:** Scraper Studio expects a URL. Build the URL by templating the keyword into the site's search query string. Treat the search results page as Type 2 (Discovery) — for each result card, extract fields.

**Create prompt shape:**
```
"This is a search results page. For each result card, extract <fields>.
Treat the page as paginated; only scrape what is rendered on this page."
```

**End-to-end:**
```bash
# Build against ONE search URL — the template generalizes to any keyword
bdata scraper create "https://www.ycombinator.com/companies?query=agents" \
    "For each company card returned by this search, extract name, vertical,
     tagline, batch, profile link. Treat as paginated search results."

# Run with any other keyword by swapping the query string
bdata scraper run c_zzz "https://www.ycombinator.com/companies?query=robotics" \
    --pretty -o robotics-search.json
```

**Not to be confused with `bdata search`:** that command is a separate product (SERP API) that searches the *whole web* via Google / Bing / Yandex. The "Search" scraper type here is **site-scoped** search, scraped from the target site's own search-results page.

## Why the "type" is a prompt shape, not a flag

The CLI only has `create` and `run` because the Scraper Studio AI Flow infers the page shape from the URL + description. A single-URL description against `/companies/<name>` produces a PDP template; an "for each card" description against `/companies?batch=W26` produces a Discovery template. The same `run` command works for both — it just returns different shapes (object vs array).

If you find yourself wanting a `--type discovery` flag, the answer is: be explicit in the description. "For each card on this page, extract …" is the Discovery signal. "Extract these fields from this page" is the PDP signal.

## Cross-references

- Prompt patterns per type (more examples): [`prompts.md`](prompts.md)
- Recipes for each end-to-end flow: [`recipes.md`](recipes.md)
- The raw API endpoints behind each type: [`api-flow.md`](api-flow.md)
- Pre-built scrapers for Amazon, LinkedIn, etc. (use **instead** of Discovery+PDP when available): [`../../data-feeds/SKILL.md`](../../data-feeds/SKILL.md)
