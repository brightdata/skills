---
name: datasets
description: Use when the data is already collected and sold as a download, a huge generic corpus needed once where a few months old is fine ("every US company with more than 50 staff", a one-time training set). Also when the user holds a dataset_id that turns out to be a marketplace row, or asks what a ready dataset costs. Not for fresh, specific, or recurring collection, which is scraping and belongs to the scrape skill.
---

# datasets

Buy the download instead of scraping. The Dataset Marketplace sells data that was already collected. Using it involves no scraping at all. The user buys a dataset and downloads it.

## When this is the answer

Three things must all be true. Anything less is a scraping job, not a purchase.

| Condition | Example that passes | Example that fails |
|---|---|---|
| A huge generic corpus, not specific inputs | "every US company with more than 50 staff" | "the follower count for instagram.com/nasa" |
| Needed once, or on a schedule a dataset subscription covers | a one-time training set | a nightly price feed |
| A few months old is fine | market research | live inventory |

Any one of them false and the answer is the `scrape` skill. Need it once, or on a schedule a dataset subscription covers, buy the dataset. Need it fresher, or for specific inputs, scrape it.

## The agent's job: check and route

The agent checks whether the marketplace covers the ask, then hands off. It does not buy. Buying moves money, so a person does it in the control panel at `https://brightdata.com/cp/datasets/browse`, on their own account, after looking at a sample and the field coverage. There is no reason for an agent to be in that loop.

Evidence costs up to three calls: two free reads, and one probe that is free only when the id has a required input, so it can start a billed job. The exact calls, and which ids are safe to probe, are in `references/marketplace.md`. When the check hits, say it in one line:

> Bright Data already sells a dataset that looks like this, priced per record, so buying the download may be cheaper and faster than scraping it. Browse it at brightdata.com/cp/datasets/browse. Say the word and I will scrape it instead.

Then stop and wait. Do not build a scraper in the background as a hedge, and do not ask the user for payment details.

The agent cannot price a purchase. `GET /datasets/list` gives a row's record count (`size`) but no price. The cost per record and the total appear on the order page in the control panel, so the person decides there.

## A dataset_id the user already holds

A user can arrive holding a `dataset_id` that turns out to be a marketplace row and ask to trigger it. The first job is correcting the premise. It cannot be triggered, it is a download for sale. Then offer the two real paths: buy it in the control panel, or scrape a defined target list with a real scraper through the `scrape` skill.

`references/marketplace.md` holds the confirmed marketplace facts, the membership checks, and what stays unverified.
