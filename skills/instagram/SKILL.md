---
name: instagram
description: Scrape Instagram profiles, posts, reels and comments as JSON through the Bright Data Scraper API. Use when the user asks for any Instagram data - an account's followers or bio, a post's likes and comments, the recent posts or reels of an account, the comments on a post - or says "instagram scraper", "instagram api", "instagram data". Routes between the CLI (`bdata pipelines run` with the Instagram dataset ids), the Python SDK (`client.search.instagram.*` and `client.scrape.instagram.*`), and the MCP scraper tools. Carries the credit costs, the reels timeout, the `post_type` values that work, and the error-row cases the API returns as success.
---

# Bright Data - Instagram

Four datasets: profiles, posts, reels, comments. Three routes into them. Pick by
what the user has and wants. The SDK lines were verified on 2026-09-11 against
`brightdata-sdk` 2.5.2; the CLI and MCP lines follow `@brightdata/cli` 0.4.1 and
`@brightdata/mcp` 4.1.0.

| Dataset | dataset_id | Methods |
|---|---|---|
| Profiles | `gd_l1vikfch901nx3by4` | `collect_by_url`, `discover_by_user_name` |
| Posts | `gd_lk5ns7kz21pck8jpis` | `collect_by_url`, `discover_by_url` (a profile URL: its recent posts) |
| Reels | `gd_lyclm20il4r5helnj` | `collect_by_url`, `discover_by_url`, `discover_by_url_all_reels` |
| Comments | `gd_ltppn085pokosxh13` | `collect_by_url` |

## Pick your route

| You have | You want | Route |
|---|---|---|
| a profile URL | the account's recent posts | CLI `bdata pipelines run gd_lk5ns7kz21pck8jpis discover_by_url <url> --num_of_posts N` or SDK `client.search.instagram.posts(url, num_of_posts=N)`. `collect_by_url` with a profile URL returns `It is not a post URL` |
| a profile URL | the account's recent reels | CLI `bdata pipelines run gd_lyclm20il4r5helnj discover_by_url <url> --num_of_posts N` or SDK `client.search.instagram.reels(url, num_of_posts=N, timeout=420)` |
| a profile URL | the profile | CLI `bdata pipelines run gd_l1vikfch901nx3by4 collect_by_url <url>` or SDK `client.scrape.instagram.profiles(url)` |
| a username, no URL | the profile | CLI `bdata pipelines run gd_l1vikfch901nx3by4 discover_by_user_name --user_name nasa` or SDK `client.search.instagram.profiles("nasa")` |
| a post URL | that post | CLI `bdata pipelines run gd_lk5ns7kz21pck8jpis collect_by_url <url>` or SDK `client.scrape.instagram.posts(url)` |
| a reel URL | that reel | CLI `bdata pipelines run gd_lyclm20il4r5helnj collect_by_url <url>` or SDK `client.scrape.instagram.reels(url)` |
| a post or reel URL | its comments | CLI `bdata pipelines run gd_ltppn085pokosxh13 collect_by_url <url>` or SDK `client.scrape.instagram.comments(url)`. One credit per comment |
| no terminal (hosted assistant) | any of the above | MCP `run_scraper` with the dataset id and method above (see MCP below) |

Every route is an asynchronous job on the API: trigger, poll, return. Expect
one to three minutes per call. One credit per record; 5,000 credits are free
each month. Always pass `num_of_posts` on a discovery call: without it the
number of posts collected, and billed, has no limit.

## Setup gate (run first)

Run `node <agent-onboarding skill folder>/scripts/check-auth.mjs --for instagram`.
Exit `0` means ready. Any other exit, a missing CLI, or a missing login is the
`agent-onboarding` skill's job. These datasets need no zone, only the key.

For the SDK route: `pip install brightdata-sdk`. The SDK reads the token from
`BRIGHTDATA_API_TOKEN` or `BRIGHTDATA_API_KEY`, then from a `.env` file found by searching upward from
its own install folder, then from the CLI's stored login. After `bdata login`
nothing else is needed.

## CLI: run a dataset by id

```bash
bdata pipelines run gd_l1vikfch901nx3by4 collect_by_url "https://www.instagram.com/nasa/" --pretty
bdata pipelines run gd_lk5ns7kz21pck8jpis collect_by_url "https://www.instagram.com/p/Dc1W1uFj-CW/" --format csv -o posts.csv
bdata pipelines run gd_lyclm20il4r5helnj collect_by_url "https://www.instagram.com/reel/DcMXl1IPNtB/" --pretty
bdata pipelines run gd_ltppn085pokosxh13 collect_by_url "https://www.instagram.com/p/Dc1W1uFj-CW/" --pretty
bdata pipelines run gd_lk5ns7kz21pck8jpis discover_by_url "https://www.instagram.com/nasa/" --num_of_posts 5 --pretty
```

`bdata pipelines info <dataset_id> <method>` lists a method's input fields; each
one is a `--<field> <value>` flag. `--format json|csv|ndjson|jsonl`, `-o FILE`,
`--timeout SECONDS` (default 600). Typical times: profile 50s, post 40s, reel
25s, comments 10s.

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

The Bright Data MCP server reaches the same datasets through its scraper tools,
which are on by default: `run_scraper` with a dataset id and method from the
table at the top, and an input such as `[{"url": "https://www.instagram.com/nasa/"}]`.
`discover_by_url` on the posts dataset gives an account's recent posts; pass
`num_of_posts` in the input and `limit_per_input`. `search_scrapers` and
`get_scraper_details` look the ids and fields up. The `brightdata-mcp` skill
covers setup.

## Hand-offs

- Unsupported URL, or an Instagram page these datasets do not cover: `scrape`.
- Need to find the profile or post URL first: `search`.
- Other platforms: `scrape`.

## Docs

- Instagram Scraper API: https://docs.brightdata.com/products/scrapers/instagram/introduction
- Posts, discover by URL (the recent-posts call): https://docs.brightdata.com/api-reference/web-scraper-api/social-media-apis/instagram-posts-discover-by-url
- Free tier: https://docs.brightdata.com/general/account/billing-and-pricing/free-tier
