# Dataset Marketplace - check before you scrape

Answers the question "is this data already collected and for sale, and what is the agent allowed to do about it".

## The gate

This check sits after gate 1 in the gate table, with one exception: a huge generic corpus needed once comes here first, before any scraper. It is a quick check. Three things must all be true.

| Condition | Example that passes | Example that fails |
|---|---|---|
| A huge generic corpus, not specific inputs | "every US company with more than 50 staff" | "the follower count for instagram.com/nasa" |
| Needed once, not again and again | a one-time training set | a nightly price feed |
| A few months old is fine | market research | live inventory |

Any one of them false and the answer is scrape. Need it once, buy the dataset. Need it repeatedly, scrape it.

## What the docs confirm

- The marketplace is "a one-stop platform for discovering, customizing and purchasing high-quality datasets from over 250 domains", with 350+ ready-to-use datasets.
- Browsing happens in the control panel at `https://brightdata.com/cp/datasets/browse`.
- Two purchase models: one-time or subscription.
- Two freshness options. Pre-collected is "data that was collected recently and is ready for use". Fresh is "up-to-date and fresh, available immediately after it's collected".
- Before buying, a person can preview a sample and review the field coverage. Those are the two checks worth reporting.
- Pricing is per record, plus a compute cost. The pricing page shows a per-record figure as low as `$0.0006`.

## The agent's job: check and route

The agent checks whether the marketplace covers the ask, then hands off. It does not buy.

Buying moves money. A person does it in the control panel, on their own account, after looking at a sample. There is no reason for an agent to be in that loop.

What the agent should actually say, in one line:

> Bright Data already sells a dataset that looks like this, priced per record, so buying the download may be cheaper and faster than scraping it. Browse it at brightdata.com/cp/datasets/browse. Say the word and I will scrape it instead.

Then stop and wait. Do not build a scraper in the background as a hedge, and do not ask the user for payment details.

## Not verified

The public docs do not say whether a purchase can be completed through an API. There is a marketplace dataset API for listing datasets and dataset views, and a filter-by-API endpoint, but nothing in the pages read here states that checkout itself is automatable. Treat purchase as manual until that is confirmed by someone with account access.

## Related

- A ready scraper instead of a purchase: [web-scraper-api.md](web-scraper-api.md)
- Building one when no scraper fits: [scraper-studio.md](scraper-studio.md)
- Where results get delivered, for a purchase or a scrape: [snapshots-and-jobs.md](snapshots-and-jobs.md)
