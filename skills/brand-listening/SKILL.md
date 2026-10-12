---
name: brand-listening
description: >
  Social listening and brand reputation research using Bright Data's web
  scraping infrastructure. Collects what real people are saying about a brand,
  product, or person across Reddit, X/Twitter, Instagram, TikTok, YouTube,
  news, and review sites — then classifies sentiment, clusters themes, and
  delivers a cited digest with actionable recommendations. Use this skill when
  the user wants to know what people are saying about their brand, monitor
  social media mentions, gauge public sentiment, track online reputation,
  find complaints or advocacy, measure buzz around a launch, or do social
  listening / brand monitoring / sentiment analysis. Also use when the user
  mentions brand mentions, brand health, reputation tracking, or "what's the
  internet saying about us".
---

# Brand Listening

Find out what people are *actually* saying about a brand across social platforms, news, and reviews — powered by live web data, not stale training knowledge. Combines the Bright Data CLI (`bdata`) for collection with a sentiment + theme analysis layer to deliver a cited, actionable digest.

**Never answer brand-sentiment questions from training knowledge alone.** Public sentiment changes daily. Always collect live mentions first, then classify and synthesize.

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

1. **Clarify scope** — Which brand/product/person? Which platforms? What time window (default: last 30 days)? What does the user want to *do* with it (general health check, launch monitoring, complaint triage, advocacy hunting)?
2. **Discover, then collect** — Use `bdata search` to find where the brand is being discussed, then `bdata pipelines` to pull structured mentions from each platform. Parallelize independent calls.
3. **Normalize** — Collapse every raw result into the single mention schema in [references/sentiment-and-output.md](references/sentiment-and-output.md) before any analysis.
4. **Classify & cluster** — Assign sentiment per mention (with a reason), then group mentions into themes. Follow the sentiment guardrails — never inflate either side.
5. **Deliver** — Produce the cited digest (Output A), optionally with the structured dataset (Output B). Every report ends with a "So what — recommendations" section.

## Data Collection Rules

- **Discovery first.** You rarely have the right URLs up front. Run `bdata search "<brand> site:reddit.com" --json` (and per-platform variants) to find threads, profiles, and articles, *then* feed those URLs to pipelines.
- **Prefer `bdata pipelines`** over `bdata scrape` whenever a pre-built scraper exists for the platform. Pipelines return clean structured JSON (author, date, engagement, text).
- **Look up scrapers, never guess them.** For each platform: `bdata pipelines search "<platform> <data type>"`, then `bdata pipelines info <dataset_id> <method>` to see the input fields, then `bdata pipelines run`. Never guess a `dataset_id` or field names. Full workflow: the `brightdata-cli` skill, [pipelines reference](../brightdata-cli/references/pipelines.md).
- **Always pass `--json`** when you need to parse or pipe output.
- **Be cost-efficient** — a standard sweep is ~6–12 `bdata` calls, not 50. Pull the highest-signal threads/profiles, not everything.
- **Parallelize** independent calls across multiple Bash tool calls in one response.
- **Every mention needs a source URL.** No unattributed quotes, ever.
- **Never fabricate sentiment or fill gaps.** If a platform returns nothing, report it in "Gaps & caveats".

## Platform Modules

Pick the platforms that fit the brand. Consumer/cultural brands skew TikTok/Instagram/Reddit; B2B/SaaS skews Reddit/X/review sites; local businesses skew Google Maps reviews.

Each `run` below uses the `dataset_id` you picked from the `search` line above it. Check `bdata pipelines info <dataset_id> <method>` first: extra inputs (comment count, days back) are `--<field> <value>` flags named there.

### Reddit — honest, unfiltered sentiment
```bash
# Discover relevant threads
bdata search "<brand> site:reddit.com" --json
bdata search "<brand> review reddit" --json

# Pull structured post + comment data from the threads found
bdata pipelines search "reddit posts"
bdata pipelines run <dataset_id> collect_by_url "<reddit-thread-url>" -o reddit.json
```
Reddit is the single best source for candid opinions brand channels hide. Prioritize it.

### X / Twitter — real-time reaction
```bash
bdata search "<brand>" --json                      # find recent discussion
bdata pipelines search "x posts"
bdata pipelines run <dataset_id> collect_by_url "<x-post-url>" -o x.json
```

### Instagram — brand aesthetics, comments, advocacy
```bash
bdata pipelines search "instagram posts"         # profile posts; pick a method with info
bdata pipelines search "instagram comments"
bdata pipelines run <dataset_id> collect_by_url "<instagram-post-url>" -o ig_comments.json
```

### TikTok — cultural relevance, viral sentiment
```bash
bdata pipelines search "tiktok posts"            # profile posts; pick a method with info
bdata pipelines search "tiktok comments"
bdata pipelines run <dataset_id> collect_by_url "<tiktok-video-url>" -o tt_comments.json
```

### YouTube — reviews, tutorials, long-form opinion (comments are gold)
```bash
bdata search "<brand> review youtube" --json
bdata pipelines search "youtube videos"
bdata pipelines search "youtube comments"
bdata pipelines run <dataset_id> collect_by_url "<video-url>" -o yt_comments.json
```

### Reviews — structured customer sentiment
```bash
# App-based products, local businesses, Facebook pages: find the review scraper
bdata pipelines search "google play"             # or "apple app store"
bdata pipelines search "google maps reviews"
bdata pipelines search "facebook reviews"
bdata pipelines run <dataset_id> collect_by_url "<listing-or-page-url>" -o reviews.json

# SaaS / software — discover then scrape (no pipeline)
bdata search "<brand> site:g2.com" --json
bdata search "<brand> site:capterra.com" --json
bdata scrape "<g2-or-capterra-url>"
```

### News & press — coverage and tone
```bash
bdata search "<brand>" --json                  # general SERP, scan for news
bdata scrape "<article-url>"                    # pull full article text for tone
```

> **Never hardcode a scraper.** The catalog changes, and two scrapers can share a name. Always pick the `dataset_id` from `bdata pipelines search` and the fields from `bdata pipelines info` in the same session.

## Choosing What to Collect

| User says... | Collect from |
|---|---|
| "What are people saying about us / my brand" | Reddit + X + reviews + news (broad sweep) |
| "How did our launch land" / "buzz around X" | TikTok + Instagram + X + YouTube (recency-focused) |
| "Find complaints / what people hate" | Reddit + reviews (G2/Capterra/app stores) + YouTube comments |
| "Who's advocating for us / fans" | Instagram + TikTok + X (high-engagement positive posts) |
| "Reputation / sentiment over time" | Same sources, two windows — compare prior vs current |
| Local business reputation | Google Maps reviews + Facebook reviews |

## Sentiment, Themes & Output

Read [references/sentiment-and-output.md](references/sentiment-and-output.md) for:
- The **normalized mention record** schema (use it as the row shape for both analysis and the dataset output).
- The **sentiment method + guardrails** (classify from text as written; sarcasm/ambiguous → `mixed`; always report counts *and* percentages with the denominator).
- **Theme clustering** — where the actionable insight lives.
- **Output templates** — A (digest report), B (structured dataset), C (both).

## Output Quality Standards

1. **Every mention has a source URL** — no unattributed claims.
2. **Facts separate from interpretation** — the quote is the fact; your sentiment label is interpretation. Keep them distinct.
3. **Percentages always carry N** — "61% positive of 142 classified mentions", never a bare percentage.
4. **Be honest about gaps** — list platforms that returned nothing this window. Note small samples that can't generalize.
5. **Date-stamp everything** — "Data collected on <date> · window: last <N> days".
6. **End with "So what"** — every report closes with 2–4 actionable recommendations, each grounded in a theme from the data. Raw mentions without interpretation are not a deliverable.
