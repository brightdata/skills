---
name: scrape
description: 'Use when the user wants to scrape or extract structured data from any site: profiles, posts, products, reviews, prices, followers, job or property listings. Also for building a scraper, crawling a site for data, discovery by keyword or category, asks that say "data fields" or "recurring", or that name a dataset_id, snapshot_id, Web Scraper API, or Scraper Studio. Not the page itself (use fetch), not a search query (use search), not cost or credits (use billing).'
---

# Bright Data - Scrape

Run the gates below to pick the product yourself - never ask the user which. State the pick in one line, and one word from the user overrides it.

## The gates - run in order, first yes wins

| Check | If yes |
|---|---|
| **Gate 1 - library.** A ready scraper already returns these fields. Scrapers come first. Popular platforms resolve from the bundled top-25 table with zero API calls, and only an unlisted site goes to the live catalogue. The input is not always a URL - variants take usernames, hashtags, keywords, locations and more. One exception: a huge generic corpus needed once goes to the marketplace check first. | **Web Scraper API.** |
| **The marketplace check - already collected.** A huge generic corpus, needed once, and a few months old is fine. | Dataset Marketplace. Buy the download instead of scraping. |
| **Gate 2 - build it.** No ready scraper covers these fields, and any one of these: many pages share one layout, the job will run again, or the data only appears after browser actions (typing, scrolling, waiting, CAPTCHA) and the user has no Playwright, Puppeteer or Selenium setup. | **Scraper Studio.** |
| **Fall-through.** One-time job, no ready scraper, and the pages share no layout. | Back to `fetch` (Web Unlocker), and the user owns the parser. |

**Gate 1 in practice.** Open [references/web-scraper-api.md](references/web-scraper-api.md) and check its bundled top-25 table first, which costs zero API calls. Only when nothing matches, search the live library: `bdata pipelines list` for the pipelines the CLI ships, or `curl -H "Authorization: Bearer $BRIGHTDATA_API_KEY" https://api.brightdata.com/datasets/list` for the full catalogue, matching on the scraper name. Both are free reads that trigger no job. One call does the whole miss path: `node scripts/find-scraper.mjs <name or gd_ id>`, add `--schema` for required inputs and typed outputs. Run the check and pick the scraper yourself, rather than asking the user which one to use. A single URL is not a reason to skip it. Web Scraper API has no built-in scheduler, so "daily" means the agent writes a cron job or a GitHub Actions workflow in the user's project.

**When the user has no URLs.** Many ready scrapers take a discovery input instead: a keyword, a category URL, a best-sellers URL, a location. Check the scraper's metadata before assuming it needs a URL. Sites with no ready scraper go to Scraper Studio, which covers single-page, search-discovery and multi-page patterns.

**Gate 2 in practice.** Scraper Studio has a built-in scheduler (hourly, daily, weekly, or custom). It heals itself when the site changes, and a heal can wait for the user's approval (`scraper heal` and `scraper approve` in the CLI). It also handles multi-page crawl jobs, and it does the browser work for you. For an urgent ask on a collector that already exists, `bdata scraper run <collector_id> <url> --sync` returns data in one call - single URL, server-side cap of 25 to 50 seconds.

## The boundaries

Pages themselves belong to `fetch`: markdown, HTML, a screenshot, "for my RAG", or an explicit hurry word ("now", "quick", "ASAP") on a one-off pull. A single URL is not a hurry word, and a live chat is not a hurry word. Anything starting from a search query belongs to `search`. A user who already drives a browser with Playwright, Puppeteer, Selenium or a computer-use model belongs to the `browser` skill. A user with no such setup stays here, and Studio does the browser work.

## The two override words

- **fields** (or "records") - forces structured data fields. Run gate 1, then gate 2.
- **recurring** - puts the job on a schedule. It does not skip the gates. With a ready scraper the product stays Web Scraper API and the agent writes the cron. With no ready scraper, "runs again" is what sends the job to Studio.

Two separate words, because output and schedule are two separate choices.

## Web Scraper API is asynchronous

Trigger, poll, download. Never promise an instant answer. CLI pipelines do the polling, so the command looks synchronous, but the job underneath still takes its time.

## Example - one Instagram profile

The ask: *"get me the follower count and bio for instagram.com/nasa"*

1. Fields, not the page. Stay in this skill.
2. One specific input, not a generic corpus. No Marketplace.
3. The top-25 table has `instagram_profiles`. Gate 1 wins. One URL still gets the library check.

```
bdata pipelines instagram_profiles https://www.instagram.com/nasa/
```

Then state the choice in one line while the job runs:

> Using the maintained Instagram profiles scraper. It runs as a job, so this is not instant. Say `recurring` to put it on a schedule.

## Read next

- **Before the first Web Scraper API call:** [references/web-scraper-api.md](references/web-scraper-api.md) - the top-25 table, the name trap, and the free discovery moves.
- **Before scraping anything that sounds like a huge generic corpus:** [references/dataset-marketplace.md](references/dataset-marketplace.md) - the three-part gate, and why the agent checks and routes but never buys.
- **When gate 2 fires and you are about to build a scraper:** [references/scraper-studio.md](references/scraper-studio.md) - the four CLI commands that exist, the create-then-run split, the approval gate on a heal, and the browser work you no longer have to write.
- **When every gate has said no and the data job has to fetch raw pages itself:** [references/web-unlocker.md](references/web-unlocker.md) - the one-POST request shape, the four KYC error codes, and the signal that means go back to gate 2.
- **The moment a trigger hands back an id instead of data:** [references/snapshots-and-jobs.md](references/snapshots-and-jobs.md) - which endpoints match which id, and the delivery settings the agent never configures.
- **When a bundled id is rejected or the site is not in the table:** [scripts/find-scraper.mjs](scripts/find-scraper.mjs) - live search by name or id, `--schema` for inputs and outputs, junk rows filtered, key never printed.
- **When a job is running and you need the data without hand-writing a poll loop:** [scripts/poll.mjs](scripts/poll.mjs) - either id in, data out, key never printed.
- **When a call is refused for auth:** the `agent-onboarding` skill. The REST 401 wording varies ("Credentials are invalid", "Invalid credentials") while the CLI prints "No API key found". All mean log in. Send 407 and `kyc_required` there too, along with missing zones.

## Red flags - stop if you catch yourself doing one of these

- Skipping the library check because there is only one URL
- Hardcoding a guessed dataset_id instead of using the table or a live search
- Reaching for Web Unlocker while a ready scraper covers the fields
