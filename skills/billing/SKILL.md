---
name: billing
description: 'Use when the question is about money on a Bright Data account: current balance, credit left, what was charged, spend or cost history, credits or free tier used, cost per zone, product or dataset, or what a job will cost before it runs. Read-only, and it never buys or changes anything. Not scraping or extraction (use scrape), not how to drive the CLI itself (use brightdata-cli), not a refused or failing call (use agent-onboarding).'
---

# Bright Data - Billing

Two questions come up: what has this account already spent, and what will this job cost? The first has an exact answer from the account's own numbers. The second is always an estimate, so say so.

## Read-only, no exceptions

Read the numbers, report them, stop. Never add or change a payment method, never top up a balance, never set auto-recharge, never change a plan, never buy a dataset, never cancel anything. Those actions belong to the person, not the agent, even when the user asks the agent to do them. Send them to brightdata.com/cp/billing/settings and let them click it themselves.

Never run a real job to find out what the account can do or what something costs. A Web Unlocker request, a scraper trigger and a browser session all spend money. Every read below is free and starts nothing.

## The reads

| The question | Command | Endpoint behind it |
|---|---|---|
| How much money is left | `bdata budget balance` | `GET /customer/balance` |
| What one zone cost | `bdata budget zone <name> --from <date> --to <date>` | `GET /zone/cost?zone=<name>` |
| What all active zones cost | `bdata budget zones --from <date> --to <date>` | `GET /zone/get_active_zones`, then one `/zone/cost` per zone |
| What each product, zone, dataset or domain cost | no CLI command, call it directly | `POST /costs/export/json` |
| What scraping cost | no CLI command, call it directly | `POST /costs/export/json` with `dimension` `web_apis` for Web Scraper API, `collectors` for Scraper Studio |

Base host is `https://api.brightdata.com` and auth is the header `Authorization: Bearer <key>`. Read the key from the environment or the CLI's own store. The exact file path for each OS, and the safe way to read it without printing it, live in the `agent-onboarding` skill's auth reference. That reference also has the thing that trips agents here: after a CLI login, `BRIGHTDATA_API_KEY` is unset, and that is normal rather than a sign the machine is logged out, because login writes the key to the CLI's store and never to the environment. Never ask the user to paste a key into the conversation, and never print one.

`/zone/cost` only sees zone-backed products such as Web Unlocker, SERP, Browser API and the proxy networks. Web Scraper API and Scraper Studio spend is keyed by dataset id and collector rather than by zone name, so it never appears there. Those go to the cost export.

## What the CLI gets wrong in v0.3.5

The `bdata budget` commands are convenient. Two of the numbers they print are wrong and one flag does nothing, so check before repeating any of it to a user.

- **`bdata budget balance` always prints `Pending charge $0.00`.** The CLI reads a field named `pending_balance`, the live API sends the same number as `pending_costs`, so the lookup misses and falls back to zero. Call `GET /customer/balance` yourself for the real figure.
- **`bdata budget zone` labels its number `Cost (this month)` and that is not what it is.** The CLI adds up every bucket the API returns, so the figure is this month, plus the two months before it, plus the last three days counted a second time. The same bug inflates the `TOTAL` row of `bdata budget zones`. Passing `--from` and `--to` fixes it, because the API then returns a single bucket and there is nothing to double count.
- **`--json` and `--pretty` produce no JSON on `budget balance`.** The flags appear in `--help` and do nothing. Call the endpoint directly when you need machine-readable output.

## The traps

Four things will silently give a wrong answer if read the obvious way. The field lists and the live response samples are in `references/cost-api.md`, which is the place to look before writing any parsing code.

- **Read `pending_costs` for money owed, never `pending_balance`.** The documented field is not on a live balance response at all, and a missing field means absent rather than zero.
- **Skip the `total` key in a cost export.** It sits alongside the day keys, so looping over every key as if it were a date counts the whole range twice.
- **Never add a `back_m` bucket to a `back_d` bucket on `/zone/cost`.** The day buckets sit inside this month, and not every bucket carries every field. Supplying `from` and `to` collapses all six into one bucket named `custom`, which is the safe way to ask for a period.
- **`to` is exclusive on `/zone/cost` and on the cost export.** For all of April ask `from=2026-04-01` and `to=2026-05-01`. Using `to=2026-04-30` quietly drops the last day. On the cost export the same date in both returns nothing at all, while `/zone/cost` instead expands equal dates to that whole day.

## What a job will cost before it runs

No endpoint returns a quote, so never present one as if it came from the API. Build the estimate in three steps and label it an estimate.

1. **Find the billing unit for the product.** Web Unlocker and SERP bill per successful request, and failed requests are not charged. Web Scraper API bills per delivered record. Scraper Studio bills per page load, with file downloads charged separately per GB. Browser API and the proxy networks bill per GB of traffic, and some proxy plans are a fixed charge per IP instead.
2. **Count the units, not the inputs.** One input is not one record. Five listing URLs that each hold twenty products produce a hundred records. A batch of ten URLs is ten separate billable requests. Pagination pages, detail pages and extra navigations each count as page loads in Scraper Studio.
3. **Use the account's own rate, not the public price list.** Accounts on custom or pre-commit pricing pay negotiated rates. For Web Unlocker and SERP you can compute the real rate: ask `/zone/cost` for a period with `from` and `to`, then divide the `custom` bucket's `cost` by its `reqs_unblocker` or `reqs_serp`. Web Scraper API has no record count in any read, so for per-record products use the published price and say plainly that it is the list price, not this account's rate.

## Free credits

Every eligible account gets 5,000 free credits a month from one shared pool. They reset on the first of the month and unused credits are forfeited rather than carried over. Web Unlocker, SERP and Web Scraper API spend one credit per request or record, and Scraper Studio spends one per page load. From 2026-09-01 the Browser API draws on the same pool at 5 credits per MB of traffic. Accounts on custom pay-as-you-go plans and on pre-commit plans get no monthly free credits.

The proxy networks are not covered. New accounts instead get a one-time $2 trial credit for the proxy products, valid 7 days, and a further $5 for adding a payment method. All of these figures are from the docs and cannot be checked against any API.

**Free credits are not in any API.** No balance field counts them. They live in the control panel at brightdata.com/cp/billing/overview under Free Tier Credits, which also shows the renewal date. Send the user there rather than guessing, and never read a money balance of zero as proof that the free credits are gone. They are separate pools.

## Read next

- **Before calling any of these endpoints:** [references/cost-api.md](references/cost-api.md) - exact paths, parameters, real response shapes, the nine cost dimensions, and which facts are verified live against an account rather than only read in the docs.
- **When a read is refused:** the `agent-onboarding` skill. A missing or invalid key gives 401 with a short plain-text body on these endpoints, and `No API key found` from the CLI. Both mean log in.

## Red flags

- Adding a payment method, topping up, or changing a plan on the user's behalf
- Running a real job, or a single test request, to find out what something costs
- Reading `pending_balance` from a live balance response, or repeating the CLI's `Pending charge` of zero
- Treating every key of a cost export as a date, so `total` gets added to the days
- Repeating `Cost (this month)` from `bdata budget zone` without `--from` and `--to`
- Adding `back_m0` to `back_d0`, or assuming `bw` is present in every bucket
- Reporting an empty cost export as proof of no spend, without first checking that the dimension name is one of the nine valid ones listed in `references/cost-api.md`
- Quoting public list prices as though they were this account's rate
- Printing an API key, or asking the user to paste one into the chat
