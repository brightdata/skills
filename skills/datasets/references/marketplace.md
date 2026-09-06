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

1. Search the catalogue. `GET https://api.brightdata.com/datasets/v3/scrapers` lists only real scrapers, each with its schema. Its only filters are `?dataset_id=<dataset_id>` and `?domain=<domain>`, the domain exact and case-sensitive, and any other parameter is a 400. `GET https://api.brightdata.com/datasets/list` still lists everything, purchasable rows included, so filter that one by name for the topic. A row in the list that the scrapers endpoint does not carry is a download for sale (749), one of the 56 live scrapers the endpoint omits, which the probe in step 3 finds, or a row that is not ready yet (2). Counts as of 2026-09-06.
2. See what a purchasable row contains. `GET https://api.brightdata.com/datasets/<dataset_id>/metadata` is a free read of the fields a dataset carries, but it answers for few purchasable rows (31 of 749 on 2026-09-06), so a 404 says nothing about a download. The field coverage of a download is reviewed at the control panel page above.
3. Tell a download from a scraper. An empty-body `POST https://api.brightdata.com/datasets/v3/trigger?dataset_id=<dataset_id>`, body `[{}]`, is rejected at validation. A marketplace row answers with "does not support collection", which is the proof it is a download for sale, not a scraper to run. A real scraper answers with a validation error naming its required inputs instead. One caution: validation rejects `[{}]` only because a required field is missing. A door with no required field passes it, and on an active account the probe can start a billed job. Six such doors exist in the scrapers endpoint on 2026-09-06, all of them discovery doors, so the probe is not universally free. Read the endpoint first and probe only a bare id the endpoint does not carry.

If the `scrape` skill is installed, its `scripts/find-scraper.mjs` wraps all three: `node find-scraper.mjs <gd_ id>` prints the schema, `<domain or name>` lists matches and `--schema` adds the schema when exactly one matches, and an id the endpoint does not carry gets one empty-body probe, which answers `marketplace dataset, not a scraper` for a purchasable row and exits 1. That is a convenience, not a dependency.

A list hit that step 3 confirms as a download is proof the marketplace covers the ask. A miss proves nothing, because the marketplace's own inventory is browsed at the control panel link, and the list call does not carry all of it.

## Related skills

- A ready scraper instead of a purchase, or building one when no scraper fits: the `scrape` skill.
- Anything that starts from a query instead of a corpus: the `search` skill.
