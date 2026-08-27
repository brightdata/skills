# Dataset Marketplace

Answers the question "is this data already collected and for sale, and what is the agent allowed to do about it".

## What the docs confirm

- The marketplace is a one-stop platform for discovering, customizing and purchasing ready-to-use datasets. Hundreds of them, across hundreds of domains.
- Browsing happens in the control panel at `https://brightdata.com/cp/datasets/browse`.
- Two purchase models: one-time or subscription.
- Two freshness options. Pre-collected is "data that was collected recently and is ready for use". Fresh is "up-to-date and fresh, available immediately after it's collected".
- Before buying, a person can preview a sample and review the field coverage. Those are the two checks worth reporting.
- Pricing is per record, plus a compute cost. The pricing page shows a per-record figure as low as `$0.0006`.

## The free membership check

Three calls, all free, all read-only. `<API_KEY>` is the account key from the environment or the CLI's stored credentials, never pasted into chat.

1. Search the catalogue. `GET https://api.brightdata.com/datasets/list` returns the same catalogue the ready scrapers live in, and it also lists purchasable rows. Filter the response by name for the topic.
2. See what a row contains. `GET https://api.brightdata.com/datasets/<dataset_id>/metadata` is a free read of the fields a dataset carries.
3. Tell a download from a scraper. An empty-body `POST https://api.brightdata.com/datasets/v3/trigger?dataset_id=<dataset_id>` is rejected before any work starts. A marketplace row answers with "does not support collection", which is the proof it is a download for sale, not a scraper to run. A real scraper answers with a validation error naming its required inputs instead.

If the `scrape` skill is installed, its `scripts/find-scraper.mjs` wraps all three: searching prints matches, and probing a match with `--schema` answers `marketplace dataset, not a scraper` for a purchasable row. That is a convenience, not a dependency.

A catalogue hit is proof the marketplace covers the ask. A miss proves nothing, because the marketplace's own inventory is browsed at the control panel link, and the list call does not carry all of it.

## What the agent must not do

- Do not buy, and do not ask for payment details. Purchase happens in the control panel, by a person, after the sample preview.
- Do not promise a price or a record count. Catalogue rows carry neither. The sample preview in the control panel is where the total becomes visible.
- Do not trigger a marketplace row. It cannot run. See the premise correction in `../SKILL.md`.

## Not verified

The public docs do not say whether a purchase can be completed through an API. There is a marketplace dataset API for listing datasets and dataset views, and a filter-by-API endpoint, but nothing in the pages read here states that checkout itself is automatable. Treat purchase as manual until someone with account access confirms otherwise.

## Related skills

- A ready scraper instead of a purchase, or building one when no scraper fits: the `scrape` skill.
- Anything that starts from a query instead of a corpus: the `search` skill.
