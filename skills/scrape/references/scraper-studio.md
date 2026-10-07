# Scraper Studio - building a scraper when gate 2 fires

Answers the question "gate 2 said build it, so what does the agent actually run".

## What Studio is

Studio builds a scraper from two things: a target URL and a plain-language description of the fields wanted. No selectors are written by hand. The scraper it produces is a stored template with a `collector_id`, and that id is what every later command takes.

Studio's output is a dataset of fields, not an HTTP response. A user who wants the page itself - HTML, markdown or a screenshot - goes to `fetch`. (Studio functions can capture HTML or screenshots into a field, but that is a field in a dataset, not a page handed back.)

## The four CLI commands

These are the only `scraper` subcommands that exist. `bdata scraper --help` lists create, run, heal and approve.

```
brightdata scraper create <url> <description>          Build a scraper from a natural-language description using AI
brightdata scraper run <collector_id> [url]            Run a Bright Data scraper on one or more URLs and return the data
brightdata scraper heal <collector_id> <prompt>        Fix an existing scraper in place via AI self-healing
brightdata scraper approve <collector_id>              Approve (or --reject) a heal that is awaiting approval
```

The description is capped at 500 characters by the API - the CLI does not check it before sending. A heal prompt is capped at 1000 and the CLI rejects an over-long one locally.

## Create then run

Creating and running are two separate steps. Create once, then run it from the CLI, the SDK (`client.scraperStudio.run(collectorId, {input})`, which also has `trigger`, `status` and `fetch`), or the REST endpoints below. The SDK has no create method, so an agent creates with the CLI. Creation also exists in the control panel.

```
bdata scraper create https://news.ycombinator.com "Extract the top 30 stories: title, url, points, author, comment count." --name hn-top --pretty
bdata scraper run <collector_id> https://news.ycombinator.com --pretty
```

## The scraper is now an API

The end product of a Studio build is a private API endpoint for that site. The `collector_id` is the address, so the user's own backend can call it with no CLI installed. All calls below were verified live. Every one needs `Authorization: Bearer $BRIGHTDATA_API_KEY` and base `https://api.brightdata.com`. The POSTs take a JSON body, the two GETs take none.

| Call | What comes back |
|---|---|
| `POST /dca/crawl?collector=<collector_id>&timeout=50s` body `{"url":"..."}` | The records in one response. Single URL, server cap 25 to 50 seconds. A 202 means the job outran the window - use the async pair below instead. |
| `POST /dca/trigger_immediate?collector=<collector_id>` body `{"url":"..."}` | 202 with a `response_id`. One URL, async. |
| `GET /dca/get_result?response_id=<response_id>` | 202 `{"pending":true}` while running, then 200 with the records. |
| `POST /dca/trigger?collector=<collector_id>` body `[{"url":"..."}, ...]` | `{"collection_id":"j_...","start_eta":...}`. The batch door, one object per input. |
| `GET /dca/dataset?id=<collection_id>&format=json` | 202 with a status object while running (the status word varies: `collecting`, `building`), then 200 with the records. Branch on the 202, not on the word. |

A deleted or unknown collector answers 404 "Collector not found" on the three collector-addressed POSTs. The two GETs are addressed by job id, so a bad collector never reaches them. Do not retry or guess an id - the account's scrapers are listed at brightdata.com/cp/scrapers.

For code the user keeps, prefer the SDK over raw REST: `client.scraperStudio.run(collectorId, {input})` is one line where the REST loop above is a dozen.

## Flags worth knowing

Only flags the CLI actually prints are listed here. Run any subcommand with `--help` for the rest.

| Command | Flag | What it does |
|---|---|---|
| `create` | `--name <name>` | Names the template. Default is `cli-scraper-<timestamp>`. |
| `create` | `--deliver-webhook <url>` | Sets the deliver stub. The default is a placeholder, so set this when wiring a real backend. |
| `create`, `heal` | `--max-retries <n>` | Retries on the AI-Flow concurrent-job cap 429. Default 4, backoff up to about 4 minutes. |
| `create`, `heal` | `--no-retry` | Fail immediately on the 429 instead of waiting through the cap. |
| `run` | `--urls <list>` | Comma-separated batch through `/dca/trigger`. |
| `run` | `--input-file <path>` | One URL per line, or a JSON array of strings, or a JSON array of `{"url": "..."}`. |
| `run` | `--sync` | The synchronous `/dca/crawl` endpoint. Single URL only, server-side cap of 25 to 50 seconds. |
| `run` | `--timeout <seconds>` | Async polling timeout. Default 600, batch mode 3600. |
| `heal` | `--auto-approve` | Approve the heal at the gate and poll through to done. Default is to stop for review. |
| `heal`, `approve` | `--auto-save` | Save the healed template once the job completes. On `heal` it pairs with `--auto-approve`. |
| `approve` | `--reject` | Reject the proposed fix instead of approving it. |

## Self-healing and the approval gate

When a site changes, the scraper does not get rewritten by hand. It gets a prompt.

```
bdata scraper heal <collector_id> "The comment_count field returns null. The selector moved into a span with a new class. Capture it again."
```

The heal stops at `awaiting_approval` by default. Nothing changes until someone approves it, and approval sends the fix to a draft - it reaches production only when the template is saved, which is what `--auto-save` does.

| Situation | Command |
|---|---|
| Review the fix first, then accept it | `bdata scraper approve <collector_id>` |
| The fix is wrong, start over with a sharper prompt | `bdata scraper approve <collector_id> --reject` |
| Trust it and run straight through | `bdata scraper heal ... --auto-approve --auto-save` |

## The scheduler

Studio has a built-in scheduler: hourly, daily, weekly, or custom. Of the scraping paths in this skill, it is the only one with one.

The CLI has no schedule subcommand - the schedule is set on the scraper in the control panel, so say that rather than inventing a flag.

## Scraper patterns

The docs name five scraper types:

| Scraper type | You provide | You get |
|---|---|---|
| PDP | A list of product URLs | Full per-product detail |
| Discovery | A category or listing URL | Listing-level rows (title, price, rank) |
| Discovery + PDP | A category or listing URL | Full detail for every item on it |
| Search | A keyword, optionally a country | Discovery or Discovery + PDP shape |
| Sitemap | A domain or a `sitemap.xml` URL | Full detail for every URL in the sitemap |

A crawl ask (walk a site, collect every matching page) is the Sitemap type. `load_sitemap()` is the function that reads the sitemap.

## The browser work Studio does for you

This is why gate 2 exists. Studio drives a real headless browser, so the user never writes Playwright. The functions reference names these:

| Group | Functions |
|---|---|
| Waiting | `wait`, `wait_any`, `wait_visible`, `wait_hidden`, `wait_for_text`, `wait_network_idle`, `wait_page_idle` |
| Clicking and pointing | `click`, `right_click`, `hover`, `mouse_to`, `bounding_box` |
| Typing | `type`, `press_key`, `select` |
| Scrolling and lazy content | `scroll_to`, `scroll_to_all`, `load_more` |
| Obstacles | `solve_captcha`, `close_popup`, `freeze_page` |
| Emulation | `emulate_device`, `emulate_geolocation`, `browser_size`, `font_exists` |
| Capturing network traffic | `tag_response`, `tag_all_responses`, `tag_script`, `tag_window_field`, `tag_image`, `tag_video`, `tag_screenshot`, `tag_download`, `tag_serp`, `capture_graphql` |

"Scraper Studio browser worker" is not an established product term. Do not build user-facing copy on that phrase.

## After a run

`scraper run` polls to completion and prints the records itself. It is the raw REST `POST /dca/trigger` that hands back a job id instead. See [snapshots-and-jobs.md](snapshots-and-jobs.md) for reading that job with `GET /dca/log/{job_id}` and for where results can be delivered.
