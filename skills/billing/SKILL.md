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
| Which zones exist, including deleted ones | no CLI command, call it directly | `GET /zone/get_all_zones` |
| Which website ate the budget | no CLI command, call it directly | `GET /domains/req` and `GET /domains/bw`, dates required |
| How many records a snapshot delivered | no CLI command, call it directly | `GET /datasets/v3/snapshots`, read `dataset_size` |

Base host is `https://api.brightdata.com` and auth is the header `Authorization: Bearer <key>`. Read the key from the environment or the CLI's own store. The exact file path for each OS, and the safe way to read it without printing it, live in the `agent-onboarding` skill's auth reference. That reference also has the thing that trips agents here: after a CLI login, `BRIGHTDATA_API_KEY` is unset, and that is normal rather than a sign the machine is logged out, because login writes the key to the CLI's store and never to the environment. Never ask the user to paste a key into the conversation, and never print one.

`/zone/cost` only sees zone-backed products such as Web Unlocker, SERP, Browser API and the proxy networks. Web Scraper API and Scraper Studio spend is keyed by dataset id and collector rather than by zone name, so it never appears there. Those go to the cost export.

## Which key can read this

API keys carry one of five permission levels: Admin, Finance, Ops, User and Limit. Billing and cost data needs Finance or Admin, and Finance is the least-privileged one that works, so prefer it. Only account admins create or change keys, at brightdata.com/cp/setting/users. A 401 means the key is missing, revoked or wrong. A 403 means the key is real but under-privileged for billing, so name the missing access instead of retrying. A Finance key may not read product data such as snapshots or Studio jobs, and that split is fine: report the half you can read and say which access the other half needs. A 404 means a wrong or expired snapshot, job or dataset id, while a wrong zone name answers 422.

## Using the budget commands well

Three habits make the `bdata budget` output reliable. Always pass `--from` and `--to` to `budget zone` and `budget zones`, so the figure covers exactly the window you asked about. For the pending charge, read `pending_costs` from `GET /customer/balance` directly. And when you need machine-readable output, call the endpoint rather than the balance command.

Before writing any parsing code, read `references/cost-api.md` for the field lists and the live response samples, including how the date parameters behave (`to` is exclusive on these endpoints).

## What a job will cost before it runs

No endpoint returns a quote, so never present one as if it came from the API. Build the estimate in three steps and label it an estimate.

1. **Find the billing unit for the product.** Web Unlocker and SERP bill per successful request, and failed requests are not charged, with one exception: enabling custom headers or cookies bills every request. A SERP request that returns several result pages is still one request. Web Scraper API bills per delivered record, and attempts that fail because of incorrect inputs still bill. Scraper Studio bills per page load, with file downloads charged separately per GB. Browser API and the proxy networks bill per GB of traffic, and some proxy plans are a fixed charge per IP instead.
2. **Count the units, not the inputs.** One input is not one record. Five listing URLs that each hold twenty products produce a hundred records. A batch of ten URLs is ten separate billable requests. Pagination pages, detail pages and extra navigations each count as page loads in Scraper Studio.
3. **Use the account's own rate, not the public price list.** Accounts on custom pay-as-you-go or pre-commit plans have their own rates, so the public list may not apply. For Web Unlocker and SERP you can compute the real rate: ask `/zone/cost` for a period with `from` and `to`, then divide the `custom` bucket's `cost` by its request count. When the bucket carries both `reqs_unblocker` and `reqs_serp`, divide by their sum, because the cost is one combined figure for the zone (live). For Web Scraper API the record count is a read (`/datasets/v3/snapshots`, `dataset_size`) and the dollars are in the cost export, per dataset under `web_apis` (live) or per snapshot under `ws_api_snaps` where attributed, so compute the real per-record rate when the reads return data. When they do not, use the published price and say plainly that it is the list price, not this account's rate.

## Free credits

Every eligible account gets 5,000 free credits a month from one shared pool. They reset on the first of the month and unused credits are forfeited rather than carried over. Web Unlocker, SERP and Web Scraper API spend one credit per request or record, and Scraper Studio spends one per page load. The Browser API draws on the same pool at 5 credits per MB of traffic (in effect from 2026-09-01), so the full monthly allowance covers close to 1 GB of browser traffic. Accounts on custom pay-as-you-go plans and on pre-commit plans get no monthly free credits.

The proxy networks are not covered. New accounts instead get a one-time $2 trial credit for the proxy products, valid 7 days, and a further $5 for adding a payment method. All of these figures are from the docs and cannot be checked against any API.

**Free credits are not in any API.** No balance field counts them, and the `credit` field on `/customer/balance` is dollars, not a credit count. Free-tier and trial state live in the control panel at brightdata.com/cp/billing/overview under Free Tier Credits, which also shows the renewal date. Send the user there rather than guessing, and never read a money balance of zero as proof that the free credits are gone. They are separate pools.

## What an MCP tool call bills as

For "what did my agent's tool call cost". Pro mode changes which tools are exposed, never what anything costs. `search_engine` and its batch variant bill as one request per query, `scrape_as_markdown`, `scrape_as_html` and `scrape_batch` as one Web Unlocker request per URL, `web_data_*` as Web Scraper API records delivered, and `scraping_browser_*` as Browser API bandwidth.

## Read next

- **Before calling any of these endpoints:** [references/cost-api.md](references/cost-api.md) - exact paths, parameters, real response shapes, the eleven cost dimensions, and which facts are verified live against an account rather than only read in the docs.
- **When a read is refused:** the `agent-onboarding` skill. A missing or invalid key gives 401 with a short plain-text body on these endpoints, and `No API key found` from the CLI. Both mean log in.

## Red flags

- Adding a payment method, topping up, or changing a plan on the user's behalf
- Running a real job, or a single test request, to find out what something costs
- Reading `pending_balance` from a live balance response instead of `pending_costs`
- Treating every key of a cost export as a date, so `total` gets added to the days
- Reporting a zone cost without `--from` and `--to`
- Adding `back_m0` to `back_d0`, or assuming `bw` is present in every bucket
- Reporting an empty cost export as proof of no spend, without the `products` cross-check described in `references/cost-api.md`
- Quoting public list prices as though they were this account's rate
- Asking the user which plan or zone they use when `/zone/get_all_zones` and `/zone?zone=` answer it
- Presenting an estimate as if it were a quote from the API, which has no estimate endpoint
- Echoing a raw `/zone?zone=` response, which contains the zone password
- Printing an API key, or asking the user to paste one into the chat
