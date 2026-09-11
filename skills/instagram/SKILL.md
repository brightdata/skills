---
name: instagram
description: Scrape Instagram profiles, posts, reels and comments as JSON through the Bright Data Scraper API. Use when the user asks for any Instagram data - an account's followers or bio, a post's likes and comments, the recent posts or reels of an account, the comments on a post - or says "instagram scraper", "instagram api", "instagram data". Routes between the CLI (`bdata pipelines instagram_*`, one URL each), the Python SDK (`client.search.instagram.posts`, the only route for recent posts by profile), and the MCP tools. Carries the credit costs, the reels timeout, the `post_type` values that work, and the error-row cases the API returns as success.
---

# Bright Data — Instagram

Four datasets: profiles, posts, reels, comments. Three routes into them. Pick by
what the user has and wants. Every line here was verified on 2026-09-11 against
`brightdata-sdk` 2.5.2 and `@brightdata/cli` 0.3.4.

## Pick your route

| You have | You want | Route |
|---|---|---|
| a profile URL or username | the account's recent posts | **Python SDK** `client.search.instagram.posts(url, num_of_posts=N)`. The CLI has no route: `instagram_posts` with a profile URL returns `It is not a post URL` |
| a profile URL | the account's recent reels | **Python SDK** `client.search.instagram.reels(url, num_of_posts=N, timeout=420)` |
| a profile URL | the profile | CLI `bdata pipelines instagram_profiles <url>` or SDK `client.scrape.instagram.profiles(url)` |
| a username, no URL | the profile | SDK `client.search.instagram.profiles("nasa")` |
| a post URL | that post | CLI `bdata pipelines instagram_posts <url>` or SDK `client.scrape.instagram.posts(url)` |
| a reel URL | that reel | CLI `bdata pipelines instagram_reels <url>` or SDK `client.scrape.instagram.reels(url)` |
| a post or reel URL | its comments | CLI `bdata pipelines instagram_comments <url>` or SDK `client.scrape.instagram.comments(url)`. One credit per comment |
| no terminal (hosted assistant) | any of the four, by URL | MCP tools `web_data_instagram_profiles`, `_posts`, `_reels`, `_comments` in the `social` group |

Every route is an asynchronous job on the API: trigger, poll, return. Expect
one to three minutes per call. One credit per record; 5,000 credits are free
each month.

## Setup gate (run first)

```bash
if ! command -v bdata >/dev/null 2>&1; then
    echo "bdata CLI not installed — see bright-data-best-practices/references/cli-setup.md"
elif ! bdata zones >/dev/null 2>&1; then
    echo "bdata not authenticated — run: bdata login  (or: bdata login --device for SSH)"
fi
```

For the SDK route: `pip install brightdata-sdk`. The SDK reads the token from
`BRIGHTDATA_API_TOKEN`, then from a `.env` file found by searching upward from
its own install folder, then from the CLI's stored login. After `bdata login`
nothing else is needed.

## CLI: one URL in, one record out

```bash
bdata pipelines instagram_profiles "https://www.instagram.com/nasa/" --pretty
bdata pipelines instagram_posts "https://www.instagram.com/p/Dc1W1uFj-CW/" --format csv -o posts.csv
bdata pipelines instagram_reels "https://www.instagram.com/reel/DcMXl1IPNtB/" --pretty
bdata pipelines instagram_comments "https://www.instagram.com/p/Dc1W1uFj-CW/" --pretty
```

`--format json|csv|ndjson|jsonl`, `-o FILE`, `--timeout SECONDS` (default 600).
Typical times: profile 50s, post 40s, reel 25s, comments 10s.

## SDK: recent posts of an account

```python
from brightdata import SyncBrightDataClient

with SyncBrightDataClient(auto_create_zones=False) as client:
    result = client.search.instagram.posts("https://www.instagram.com/nasa/", num_of_posts=5)
    for post in result.data:
        print(post["likes"], post["num_comments"], post["url"])
```

Rules that are not in the SDK docstrings:

- **Always pass `auto_create_zones=False`.** Left on, the client tries to create
  Web Unlocker and SERP zones on entry, which Instagram never uses and which
  fails with a 403 on accounts without a payment method (sdk-python#57).
- **Many URLs in one call is one job.** Pass a list rather than looping.
- **Shapes:** `search.*` calls always return a list in `result.data`.
  `scrape.*` calls with one URL return one record as a dict, several as a list.
- **Date window:** `start_date="08-01-2026", end_date="09-07-2026"`, format
  `MM-DD-YYYY`. `post_type="Post"` keeps posts only, `post_type="Reels"` keeps
  reels only. The docstring's `"Reel"` returns an error row and no reels
  (sdk-python#59).
- **Reels discovery needs `timeout=420`.** The 180-second default expires.
- **An empty window is a success with zero records:** it arrives as a row whose
  `error` contains `There are no public posts in the profile for the specified
  period`. Match the message; a dead account uses the same `error_code`.
- **A dead account is a row with an `error` key** and varying text, for example
  `Sorry, this page isn't available.` or `Crawler error: Cannot read properties
  of null`. The other rows in the same result are fine.
- **A timeout** is `result.success == False` with `result.status == "timeout"`.
- **Collaborative posts** carry the co-author's handle in `user_posted`, so a
  post fetched from `nasa` can say `nasajohnson`. `coauthor_producers` lists
  everyone.
- **`reels_all(url)` costs one credit per reel the account has ever posted.**
  Check `posts_count` on the profile first. Comments cost one per comment;
  check `num_comments` on the post first.
- **Never hardcode a field list.** The schema changes without notice. Read it
  with `client.datasets.instagram_posts.get_metadata().fields`, a dict keyed by
  field name. A post carries 34 to 36 of the 44 fields.
- **Big runs:** `posts_trigger`, `posts_status`, `posts_fetch`. Keep the
  snapshot id; snapshots stay downloadable for 30 days.

The other seven SDK calls, each with a complete snippet, are in
`references/sdk.md`.

## MCP: no terminal

The Bright Data MCP server has the same four datasets as tools, one URL each,
in the `social` group, which is off unless requested:

```text
https://mcp.brightdata.com/mcp?token=YOUR_API_TOKEN&groups=social
```

There is no MCP tool for recent posts by profile. For that, the SDK.

## Hand-offs

- Unsupported URL, or an Instagram page these datasets do not cover: `scrape`.
- Need to find the profile or post URL first: `search`.
- Other platforms: `data-feeds`.

## Docs

- Instagram Scraper API: https://docs.brightdata.com/products/scrapers/instagram/introduction
- Posts, discover by URL (the recent-posts call): https://docs.brightdata.com/api-reference/web-scraper-api/social-media-apis/instagram-posts-discover-by-url
- Free tier: https://docs.brightdata.com/general/account/billing-and-pricing/free-tier
